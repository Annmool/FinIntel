require('dotenv').config(); // MUST BE LINE 1
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const Sentiment = require('sentiment');
const cron = require('node-cron');
const Groq = require("groq-sdk");
const NodeCache = require('node-cache');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const { createRequireAuth } = require('./middleware/requireAuth');
const {
    validatePaperOrder, toShareUnits, calculatePaperOrderTotals, calculateWeightedAveragePrice,
    normalizePaperQuote, marketTimeMs, isRecentMarketTime
} = require('./services/paperTrading');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    validation: {
        logErrors: false,
        logOptionsErrors: false,
        allowAdditionalProps: true
    },
    fetchOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    }
});
try {
    yahooFinance._setOpts({
        validation: {
            logErrors: false,
            logOptionsErrors: false,
            allowAdditionalProps: true
        }
    });
} catch (e) {}

// --- Models ---
const Watchlist = require('./models/WatchList');
const Alert = require('./models/Alert');
const Portfolio = require('./models/Portfolio');
const VirtualAccount = require('./models/VirtualAccount');
const PaperPortfolio = require('./models/PaperPortfolio');
const PaperOrder = require('./models/PaperOrder');

// --- Initialization ---
const app = express();
const sentiment = new Sentiment();
const myCache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false });
const inFlightRequests = new Map();
axios.defaults.timeout = 10000;
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'finintel-a64ec' });

const requireAuth = createRequireAuth(token => admin.auth().verifyIdToken(token));
let activeQuantJobs = 0;

const aiAnalysisLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'AI analysis limit reached. Try again in a minute.' }
});
const quantSimulationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 4,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Simulation limit reached. Try again in a minute.' }
});
const quantConcurrencyLimit = (req, res, next) => {
    if (activeQuantJobs >= 2) {
        res.set('Retry-After', '10');
        return res.status(503).json({ error: 'Quant engine is busy. Retry shortly.' });
    }
    activeQuantJobs += 1;
    let released = false;
    const releaseSlot = () => {
        if (released) return;
        released = true;
        activeQuantJobs = Math.max(0, activeQuantJobs - 1);
    };
    res.locals.releaseQuantSlot = releaseSlot;
    return next();
};

const TWELVE_DATA_URL = "https://api.twelvedata.com";
const FINNHUB_URL = "https://finnhub.io/api/v1";

// --- Currency & FX Rate Dictionaries ---
const CURRENCY_SYMBOLS = {
    USD: '$',
    INR: '₹',
    KRW: '₩',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AED: 'AED ',
    SAR: 'SAR ',
    QAR: 'QAR ',
    KWD: 'KWD ',
    BHD: 'BHD ',
    OMR: 'OMR ',
    ILS: '₪',
    TRY: '₺',
    ZAR: 'R',
    CAD: 'CA$',
    AUD: 'A$',
    NZD: 'NZ$',
    HKD: 'HK$',
    CNY: '¥',
    CHF: 'CHF ',
    SGD: 'S$',
    TWD: 'NT$',
    BRL: 'R$',
    MXN: 'Mex$',
    SEK: 'kr ',
    NOK: 'kr ',
    DKK: 'kr ',
    PLN: 'zł ',
    IDR: 'Rp ',
    MYR: 'RM ',
    THB: '฿',
    PHP: '₱',
    VND: '₫'
};

const DEFAULT_FX_RATES = {
    USD: 1.0,
    AED: 3.6725,
    SAR: 3.75,
    QAR: 3.64,
    KWD: 0.31,
    INR: 94.94,
    KRW: 1334.0,
    EUR: 0.893,
    GBP: 0.745,
    JPY: 157.0,
    CAD: 1.395,
    AUD: 1.52,
    HKD: 7.85,
    CNY: 7.20,
    CHF: 0.88,
    SGD: 1.32,
    TWD: 32.0,
    BRL: 5.60
};

function inferCurrencyFromSymbol(sym) {
    if (!sym || typeof sym !== 'string') return 'USD';
    const s = sym.trim().toUpperCase();
    // Middle East & GCC
    if (s.endsWith('.AE') || s.endsWith('.DU') || s.endsWith('.AD')) return 'AED';
    if (s.endsWith('.SR') || s.endsWith('.SAU')) return 'SAR';
    if (s.endsWith('.QA')) return 'QAR';
    if (s.endsWith('.KW')) return 'KWD';
    if (s.endsWith('.BH')) return 'BHD';
    if (s.endsWith('.OM')) return 'OMR';
    if (s.endsWith('.TA')) return 'ILS';
    if (s.endsWith('.IS')) return 'TRY';
    if (s.endsWith('.CA')) return 'EGP';
    // Asia
    if (s.endsWith('.KS') || s.endsWith('.KQ')) return 'KRW';
    if (s.endsWith('.NS') || s.endsWith('.BO')) return 'INR';
    if (s.endsWith('.T')) return 'JPY';
    if (s.endsWith('.HK')) return 'HKD';
    if (s.endsWith('.SS') || s.endsWith('.SZ')) return 'CNY';
    if (s.endsWith('.TW') || s.endsWith('.TWO')) return 'TWD';
    if (s.endsWith('.SI')) return 'SGD';
    if (s.endsWith('.JK')) return 'IDR';
    if (s.endsWith('.KL')) return 'MYR';
    if (s.endsWith('.BK')) return 'THB';
    if (s.endsWith('.PS')) return 'PHP';
    if (s.endsWith('.VN')) return 'VND';
    // Europe & UK
    if (s.endsWith('.L') || s.endsWith('.IL')) return 'GBP';
    if (s.endsWith('.DE') || s.endsWith('.PA') || s.endsWith('.AS') || s.endsWith('.MI') || s.endsWith('.MC') || s.endsWith('.BR') || s.endsWith('.HE') || s.endsWith('.VI') || s.endsWith('.F') || s.endsWith('.AT')) return 'EUR';
    if (s.endsWith('.SW')) return 'CHF';
    if (s.endsWith('.ST')) return 'SEK';
    if (s.endsWith('.OL')) return 'NOK';
    if (s.endsWith('.CO')) return 'DKK';
    if (s.endsWith('.WA')) return 'PLN';
    // Americas & Oceania
    if (s.endsWith('.TO') || s.endsWith('.V') || s.endsWith('.CN')) return 'CAD';
    if (s.endsWith('.AX')) return 'AUD';
    if (s.endsWith('.NZ')) return 'NZD';
    if (s.endsWith('.SA')) return 'BRL';
    if (s.endsWith('.MX')) return 'MXN';
    if (s.endsWith('.JO')) return 'ZAR';
    return 'USD';
}

function getCurrencySymbol(codeOrSym) {
    if (!codeOrSym) return '$';
    const upper = codeOrSym.toString().trim().toUpperCase();
    if (CURRENCY_SYMBOLS[upper]) return CURRENCY_SYMBOLS[upper];
    if (/^[A-Z]{3}$/.test(upper) && !upper.includes('.')) return `${upper} `;
    const inferred = inferCurrencyFromSymbol(upper);
    return CURRENCY_SYMBOLS[inferred] || `${inferred} `;
}

app.use(cors({
    origin: ["http://localhost:3000", "https://finintel.pages.dev"], 
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json());
const configuredTrustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
app.set(
    'trust proxy',
    Number.isInteger(configuredTrustProxyHops) && configuredTrustProxyHops >= 0
        ? configuredTrustProxyHops
        : 1
);

// --- 1. Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

// --- 2. Stability Helper (Cache Engine) ---
// Share cache misses across concurrent requests so a popular key only hits a
// provider once. Do not cache failures or empty responses.
const getOrLoad = async (cacheKey, ttl, loader, { shouldCache = value => value != null } = {}) => {
    const cachedData = myCache.get(cacheKey);
    if (cachedData !== undefined) return cachedData;

    if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

    const request = (async () => {
        const value = await loader();
        if (shouldCache(value)) myCache.set(cacheKey, value, ttl);
        return value;
    })();
    inFlightRequests.set(cacheKey, request);
    try {
        return await request;
    } finally {
        if (inFlightRequests.get(cacheKey) === request) inFlightRequests.delete(cacheKey);
    }
};

const fetchWithCache = (url, cacheKey, ttl = 60) => getOrLoad(cacheKey, ttl, async () => {
    const response = await axios.get(url, { timeout: 10000 });
    if (response.data?.status === "error" || response.data?.error) {
        throw new Error(response.data?.message || "Market data provider returned an error");
    }
    return response.data;
});

const isValidCandleData = (d) => {
    return Boolean(
        d &&
        Array.isArray(d.values) &&
        d.values.length > 0 &&
        d.values[0] &&
        d.values[0].datetime &&
        d.values[0].open !== undefined &&
        d.values[0].close !== undefined
    );
};

const fetchFromYahoo = async (sym) => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const queryOptions = { period1: oneYearAgo.toISOString().split('T')[0], interval: '1d' };
    const result = await yahooFinance.chart(sym, queryOptions, { validateResult: false });
    if (!result || !result.quotes || result.quotes.length === 0) throw new Error("No data found on Yahoo Finance");
    const currency = result.meta?.currency || inferCurrencyFromSymbol(sym);
    return {
        meta: { 
            symbol: sym,
            currency: currency,
            exchangeName: result.meta?.exchangeName || result.meta?.fullExchangeName,
            regularMarketPrice: result.meta?.regularMarketPrice
        },
        values: result.quotes.filter(q => q.open && q.close).map(q => ({
            datetime: q.date.toISOString().split('T')[0],
            open: q.open.toString(),
            high: q.high.toString(),
            low: q.low.toString(),
            close: q.close.toString(),
            volume: q.volume ? q.volume.toString() : "0"
        })).reverse()
    };
};

// --- 3. Automated Cron Job for Price Alerts ---
cron.schedule('*/5 * * * *', async () => {
    try {
        const activeAlerts = await Alert.find({ triggered: false });
        if (!activeAlerts || activeAlerts.length === 0) return;

        const uniqueSymbols = [...new Set(activeAlerts.map(a => a.symbol))];
        const priceMap = {};

        // 1. Try batch fetch via Yahoo Finance for speed, no rate limit, and full global/NSE support
        try {
            const yQuotes = await yahooFinance.quote(uniqueSymbols, {}, { validateResult: false });
            if (Array.isArray(yQuotes)) {
                for (const q of yQuotes) {
                    if (q && q.symbol && Number.isFinite(q.regularMarketPrice)) {
                        priceMap[q.symbol] = q.regularMarketPrice;
                    }
                }
            }
        } catch (yErr) {
            console.log("Yahoo Alert price check fallback to Twelve Data:", yErr.message);
        }

        // 2. For any remaining symbols, query Twelve Data with safe delays
        for (const sym of uniqueSymbols) {
            if (priceMap[sym]) continue;
            try {
                let symbol = sym;
                let exchangeParam = '';
                if (symbol.includes(':')) {
                    const parts = symbol.split(':');
                    symbol = parts[0];
                    exchangeParam = `&exchange=${parts[1]}`;
                } else if (symbol.endsWith('.NS')) {
                    symbol = symbol.replace('.NS', '');
                    exchangeParam = '&exchange=NSE';
                }
                const res = await axios.get(`${TWELVE_DATA_URL}/price?symbol=${symbol}${exchangeParam}&apikey=${process.env.STOCK_API_KEY}`);
                const price = parseFloat(res.data?.price);
                if (Number.isFinite(price)) {
                    priceMap[sym] = price;
                }
            } catch (_) {}
        }

        // 3. Evaluate alerts against real-time prices
        for (const alert of activeAlerts) {
            const currentPrice = priceMap[alert.symbol];
            if (!Number.isFinite(currentPrice)) continue;

            const isHit = (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
                          (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice);
            if (isHit) {
                alert.triggered = true;
                await alert.save();
                console.log(`🔔 Alert Triggered: ${alert.symbol} at ${currentPrice} (${alert.condition} ${alert.targetPrice})`);
            }
        }
    } catch (e) { console.error("Alert Cron Error:", e.message); }
});

// --- 4. Main API Routes ---

// Health Check / Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({ status: "ok", message: "FinIntel Backend API is running", timestamp: new Date().toISOString() });
});

// Stock Data (Twelve Data with Yahoo Finance Fallback/NSE Support)
app.get('/api/stock/:symbol', async (req, res) => {
    let rawSymbol = req.params.symbol.toUpperCase();
    let symbol = rawSymbol;
    let exchangeParam = '';
    let preferYahoo = false;

    if (rawSymbol.includes(':')) {
        const parts = rawSymbol.split(':');
        symbol = parts[0];
        exchangeParam = `&exchange=${parts[1]}`;
    } else if (rawSymbol.includes('.') && !rawSymbol.endsWith('.US')) {
        preferYahoo = true;
    }

    try {
        const cacheKey = `stock_${rawSymbol}`;
        const cached = myCache.get(cacheKey);
        if (isValidCandleData(cached)) {
            return res.json(cached);
        } else if (cached) {
            myCache.del(cacheKey);
        }

        const data = await getOrLoad(cacheKey, 300, async () => {
            let result;
            if (preferYahoo) {
                result = await fetchFromYahoo(rawSymbol);
            } else {
                try {
                    const url = `${TWELVE_DATA_URL}/time_series?symbol=${symbol}${exchangeParam}&interval=1day&apikey=${process.env.STOCK_API_KEY}`;
                    result = await fetchWithCache(url, `td_raw_${rawSymbol}`, 300);
                    if (!isValidCandleData(result)) throw new Error("Twelve Data returned incomplete quotes");
                } catch (err) {
                    console.log(`Twelve Data unavailable for ${symbol} (${err.message}). Falling back to Yahoo Finance.`);
                    result = await fetchFromYahoo(symbol);
                }
            }
            if (!isValidCandleData(result)) throw new Error("No valid candle data returned");
            if (result.meta) {
                result.meta.symbol = rawSymbol;
                if (!result.meta.currency) result.meta.currency = inferCurrencyFromSymbol(rawSymbol);
            }
            return result;
        }, { shouldCache: isValidCandleData });

        res.json(data);
    } catch (e) {
        console.error("Stock Fetch Error:", e.message);
        res.status(429).json({ error: "API Limit reached or symbol not found." });
    }
});

// Smart Search using Yahoo Finance (Supports Global Stocks including NSE/BSE) with Finnhub Fallback
app.get('/api/search/:query', async (req, res) => {
    const { query } = req.params;
    if (!query || !query.trim()) return res.json([]);
    
    const cleanQuery = query.trim();
    const cacheKey = `search_${cleanQuery.toLowerCase()}`;

    try {
        const formatted = await getOrLoad(cacheKey, 3600, async () => {
        let formatted = [];
        try {
            const ySearch = await yahooFinance.search(cleanQuery, {}, { validateResult: false });
            if (ySearch && ySearch.quotes) {
                formatted = ySearch.quotes
                    .filter(q => q && q.symbol && (
                        q.quoteType === 'EQUITY' || 
                        q.quoteType === 'ETF' || 
                        q.quoteType === 'MUTUALFUND' || 
                        q.quoteType === 'INDEX' || 
                        !q.quoteType
                    ))
                    .slice(0, 8)
                    .map(s => ({
                        symbol: s.symbol,
                        instrument_name: `${s.shortname || s.longname || s.symbol}${s.exchange ? ` (${s.exchange})` : ''}`
                    }));
            }
        } catch (yfError) {
            console.error("Yahoo Search Error:", yfError.message);
        }

        // If Yahoo returned no results or failed, fallback to Finnhub
        if (formatted.length === 0 && process.env.FINNHUB_API_KEY) {
            try {
                const finnhubRes = await axios.get(`${FINNHUB_URL}/search?q=${encodeURIComponent(cleanQuery)}&token=${process.env.FINNHUB_API_KEY}`);
                if (finnhubRes.data && finnhubRes.data.result) {
                    formatted = finnhubRes.data.result
                        .filter(item => item && item.symbol)
                        .slice(0, 8)
                        .map(item => ({
                            symbol: item.symbol,
                            instrument_name: `${item.description || item.symbol} (${item.type || 'Stock'})`
                        }));
                }
            } catch (fhErr) {
                console.error("Finnhub search fallback error:", fhErr.message);
            }
        }
        
        return formatted;
        }, { shouldCache: value => Array.isArray(value) && value.length > 0 });
        return res.json(formatted);
    } catch (error) {
        console.error("Search Error:", error.message);
        res.json([]);
    }
});

// High-Frequency Ticker Tape (Yahoo Finance with Finnhub Fallback)
app.get('/api/ticker-tape', async (req, res) => {
    const cacheKey = "global_ticker_tape";
    try {
        const data = await getOrLoad(cacheKey, 60, async () => {
        const symbols = ["AAPL", "TSLA", "RELIANCE.NS", "TCS.NS", "MSFT", "AMZN", "GOOGL"];
        let data = [];
        try {
            const yQuotes = await yahooFinance.quote(symbols, {}, { validateResult: false });
            if (Array.isArray(yQuotes) && yQuotes.length > 0) {
                data = yQuotes.map(q => ({
                    symbol: q.symbol,
                    close: q.regularMarketPrice || 0,
                    percent_change: q.regularMarketChangePercent || 0,
                    currency: q.currency || inferCurrencyFromSymbol(q.symbol)
                })).filter(item => item.close > 0);
            }
        } catch (yErr) {
            console.error("Yahoo Ticker Tape Error:", yErr.message);
        }

        // Fallback to Finnhub if Yahoo returned nothing
        if (data.length === 0 && process.env.FINNHUB_API_KEY) {
            const usSymbols = ["AAPL", "TSLA", "MSFT", "AMZN", "GOOGL"];
            const requests = usSymbols.map(s => axios.get(`${FINNHUB_URL}/quote?symbol=${s}&token=${process.env.FINNHUB_API_KEY}`));
            const responses = await Promise.allSettled(requests);
            data = responses
                .map((r, i) => {
                    if (r.status === 'fulfilled' && r.value.data && r.value.data.c) {
                        return { symbol: usSymbols[i], close: r.value.data.c, percent_change: r.value.data.dp };
                    }
                    return null;
                })
                .filter(item => item !== null && item.close !== 0);
        }

        return data;
        }, { shouldCache: value => Array.isArray(value) && value.length > 0 });
        res.json(data);
    } catch (e) {
        console.error("Ticker Tape Error:", e.message);
        res.json([]);
    }
});

// Morning Briefing
app.get('/api/market-briefing', async (req, res) => {
    try {
        const cacheKey = "market_briefing_cnbc";
        const finalData = await getOrLoad(cacheKey, 300, async () => {

        const url = `https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_API_KEY}`;
        const responseData = await fetchWithCache(url, "market_briefing_raw", 300); // 5 minute cache
        
        const newsList = (responseData || []).filter(item => item.headline && item.source && item.source.toLowerCase().includes('cnbc')).slice(0, 15).map(item => {
            let image = item.image;
            // Filter out generic Reuters posters or placeholders
            if (image && (image.toLowerCase().includes('reuters') || image.toLowerCase().includes('default') || image.toLowerCase().includes('placeholder'))) {
                image = null;
            }
            return {
                title: item.headline,
                url: item.url,
                urlToImage: image,
                source: { name: item.source },
                publishedAt: new Date(item.datetime * 1000).toISOString()
            };
        });

        return { news: newsList.slice(0, 10) };
        }, { shouldCache: value => Boolean(value?.news?.length) });
        res.json(finalData);
    } catch (e) { 
        res.json({ news: [] });
    }
});

// News + Sentiment
app.get('/api/news/:symbol', async (req, res) => {
    try {
        const rawSymbol = req.params.symbol.trim().toUpperCase();
        const cleanSymbol = rawSymbol.split(':')[0].replace('.NS', '').replace('.BO', '');
        const articles = await getOrLoad(`news_${rawSymbol}`, 300, async () => {
            const ySearch = await yahooFinance.search(cleanSymbol, {}, { validateResult: false });
            return (ySearch.news || []).slice(0, 5).map(item => ({
                title: item.title,
                url: item.link,
                urlToImage: item.thumbnail?.resolutions?.[0]?.url || null,
                source: { name: item.publisher },
                publishedAt: item.providerPublishTime,
                sentimentScore: sentiment.analyze(item.title || "").score
            }));
        }, { shouldCache: value => Array.isArray(value) && value.length > 0 });
        res.json(articles);
    } catch (e) { res.json([]); }
});

// Fundamentals
app.get('/api/fundamentals/:symbol', async (req, res) => {
    let rawSymbol = req.params.symbol.toUpperCase();
    let cleanSymbol = rawSymbol.split(':')[0].replace('.NS', '').replace('.BO', '');
    const isUSStock = !rawSymbol.includes('.') && !rawSymbol.includes(':');
    
    const cacheKey = `fund_${rawSymbol}`;

    try {
        const data = await getOrLoad(cacheKey, 3600, async () => {
        let data = {};
        if (isUSStock && process.env.FINNHUB_API_KEY) {
            try {
                const [profileRes, metricRes] = await Promise.all([
                    axios.get(`${FINNHUB_URL}/stock/profile2?symbol=${cleanSymbol}&token=${process.env.FINNHUB_API_KEY}`),
                    axios.get(`${FINNHUB_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${process.env.FINNHUB_API_KEY}`)
                ]);
                if (profileRes.data && (profileRes.data.ticker || profileRes.data.currency)) {
                    data = { 
                        profile: { ...profileRes.data, currency: profileRes.data.currency || 'USD' }, 
                        metrics: metricRes.data?.metric || {} 
                    };
                }
            } catch (fhErr) {
                console.log(`Finnhub unavailable for ${cleanSymbol} (${fhErr.message}). Using Yahoo Finance.`);
            }
        }

        if (!data.profile || !data.profile.currency) {
            const summary = await yahooFinance.quoteSummary(rawSymbol, { 
                modules: ['summaryDetail', 'defaultKeyStatistics', 'price'] 
            }, { validateResult: false });
            
            const cur = summary.price?.currency || inferCurrencyFromSymbol(rawSymbol);
            data = {
                profile: { 
                    currency: cur,
                    name: summary.price?.shortName || summary.price?.longName,
                    marketCapitalization: summary.summaryDetail?.marketCap ? summary.summaryDetail.marketCap / 1000000 : null 
                },
                metrics: { 
                    peBasicExclExtraTTM: summary.summaryDetail?.trailingPE || null,
                    '52WeekHigh': summary.summaryDetail?.fiftyTwoWeekHigh || null,
                    '52WeekLow': summary.summaryDetail?.fiftyTwoWeekLow || null
                }
            };
        }
        return data;
        }, { shouldCache: value => Boolean(value?.profile || value?.metrics) });
        res.json(data);
    } catch (e) { 
        console.error("Fundamentals Error:", e.message);
        res.json({}); 
    }
});

// --- 5. User-Specific Logic (Watchlist & Portfolio) ---
app.use('/api/watchlist', requireAuth);
app.use('/api/portfolio', requireAuth);
app.use('/api/paper-portfolio', requireAuth);
app.use('/api/virtual-account', requireAuth);
app.use('/api/alerts', requireAuth);

app.get('/api/watchlist/:userId', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    const list = await Watchlist.find({ userId: req.user.uid });
    res.json(list);
});

app.post('/api/watchlist', async (req, res) => {
    const { symbol } = req.body;
    if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: "Invalid symbol or userId" });
    }
    const cleanSym = symbol.trim().toUpperCase();
    const exists = await Watchlist.findOne({ symbol: cleanSym, userId: req.user.uid });
    if (exists) return res.status(400).send("Exists");
    const newItem = new Watchlist({ symbol: cleanSym, userId: req.user.uid });
    await newItem.save();
    res.json(newItem);
});

app.delete('/api/watchlist/:userId/:symbol', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    if (!req.params.symbol) return res.send("Deleted");
    await Watchlist.findOneAndDelete({ symbol: req.params.symbol.trim().toUpperCase(), userId: req.user.uid });
    res.send("Deleted");
});

app.get('/api/portfolio/:userId', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    const holdings = await Portfolio.find({ userId: req.user.uid });
    res.json(holdings);
});

app.post('/api/portfolio', async (req, res) => {
    const { symbol, qty, price } = req.body;
    const parsedQty = parseFloat(qty);
    const parsedPrice = parseFloat(price);
    if (!symbol || typeof symbol !== 'string' || !Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: "Invalid portfolio parameters. Quantity and price must be positive numbers." });
    }
    const newHolding = new Portfolio({ userId: req.user.uid, symbol: symbol.trim().toUpperCase(), qty: parsedQty, price: parsedPrice });
    await newHolding.save();
    res.json(newHolding);
});

app.delete('/api/portfolio/:id', async (req, res) => {
    const deleted = await Portfolio.findOneAndDelete({ _id: req.params.id, userId: req.user.uid });
    if (!deleted) return res.status(404).json({ error: 'Holding not found.' });
    res.send("Deleted");
});

// --- Forex FX Rate Engine (ExchangeRate-API Primary with Yahoo & OpenER Fallbacks) ---
async function loadGlobalFxRates() {
    const rates = {};
    const marketTimes = {};
    let fetched = false;
    let source = 'Static fallback';
    let sourceUpdatedAt = null;

    // 1. Primary: Dedicated ExchangeRate-API v6 Live Feed (using user API Key)
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    if (apiKey) {
        try {
            const fxRes = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`, { timeout: 4000 });
            if (fxRes.data?.result === 'success' && fxRes.data?.conversion_rates) {
                for (const [code, rateVal] of Object.entries(fxRes.data.conversion_rates)) {
                    if (Number.isFinite(rateVal) && rateVal > 0) {
                        rates[code] = Number(rateVal.toFixed(4));
                    }
                }
                fetched = true;
                source = 'ExchangeRate-API';
                sourceUpdatedAt = fxRes.data.time_last_update_utc ||
                    (fxRes.data.time_last_update_unix ? new Date(fxRes.data.time_last_update_unix * 1000).toISOString() : null);
            }
        } catch (e) {
            console.warn("ExchangeRate-API provider notice:", e.message);
        }
    }

    // 2. Secondary Failover: Yahoo Finance Live Real-Time Quotes
    if (!fetched) {
        try {
            const pairs = ['KRW=X', 'USDINR=X', 'JPY=X', 'CAD=X', 'HKD=X', 'EURUSD=X', 'GBPUSD=X', 'AUDUSD=X', 'AED=X', 'SAR=X'];
            const quotes = await yahooFinance.quote(pairs, {}, { validateResult: false });
            if (Array.isArray(quotes)) {
                let usdInrQuoteFound = false;
                for (const q of quotes) {
                    const val = q?.regularMarketPrice;
                    if (!Number.isFinite(val) || val <= 0) continue;
                    const currency = q.symbol === 'USDINR=X' ? 'INR' : q.symbol.slice(0, 3);
                    marketTimes[currency] = marketTimeMs(q.regularMarketTime);
                    if (q.symbol === 'KRW=X') rates.KRW = val;
                    else if (q.symbol === 'USDINR=X') {
                        rates.INR = val;
                        usdInrQuoteFound = true;
                        sourceUpdatedAt = Number.isFinite(marketTimes.INR) ? new Date(marketTimes.INR).toISOString() : null;
                    }
                    else if (q.symbol === 'JPY=X') rates.JPY = val;
                    else if (q.symbol === 'CAD=X') rates.CAD = val;
                    else if (q.symbol === 'HKD=X') rates.HKD = val;
                    else if (q.symbol === 'AED=X') rates.AED = val;
                    else if (q.symbol === 'SAR=X') rates.SAR = val;
                    else if (q.symbol === 'EURUSD=X') rates.EUR = 1 / val;
                    else if (q.symbol === 'GBPUSD=X') rates.GBP = 1 / val;
                    else if (q.symbol === 'AUDUSD=X') rates.AUD = 1 / val;
                }
                if (usdInrQuoteFound || Object.keys(rates).length > 0) {
                    fetched = true;
                    source = 'Yahoo Finance';
                }
            }
        } catch (e) {
            console.warn("Yahoo FX failover notice:", e.message);
        }
    }

    // 3. Tertiary Failover: Open Exchange Rates Live API
    if (!fetched || !rates.INR) {
        try {
            const fallbackRes = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 3500 });
            if (Number.isFinite(fallbackRes.data?.rates?.INR) && fallbackRes.data.rates.INR > 0) {
                for (const code of Object.keys(rates)) delete rates[code];
                for (const [code, rateVal] of Object.entries(fallbackRes.data.rates)) {
                    if (Number.isFinite(rateVal) && rateVal > 0) {
                        rates[code] = rateVal;
                    }
                }
                fetched = true;
                source = 'Open Exchange Rates';
                sourceUpdatedAt = fallbackRes.data.time_last_update_utc ||
                    (fallbackRes.data.time_last_update_unix ? new Date(fallbackRes.data.time_last_update_unix * 1000).toISOString() : null);
            }
        } catch (e) {
            console.warn("Tertiary OpenER failover notice:", e.message);
        }
    }

    const providerRates = Object.fromEntries(Object.entries(rates).filter(([currency]) => {
        const time = source === 'Yahoo Finance' ? marketTimes[currency] : Date.parse(sourceUpdatedAt);
        return isRecentMarketTime(time);
    }));
    return {
        rates: { ...DEFAULT_FX_RATES, ...rates },
        providerRates,
        source,
        sourceUpdatedAt,
        fetchedAt: new Date().toISOString(),
        fallback: !fetched
    };
}

async function getGlobalFxQuote(forceRefresh = false) {
    if (forceRefresh) myCache.del('GLOBAL_FX_RATES');
    const servedFromCache = !forceRefresh && myCache.get('GLOBAL_FX_RATES') !== undefined;
    const quote = await getOrLoad('GLOBAL_FX_RATES', 60, loadGlobalFxRates);
    return { ...quote, cached: servedFromCache };
}

// Forex Rate Endpoint (Multi-Currency Support with Instant Cache Invalidation & Auto-Refresh)
app.get('/api/forex/rate', async (req, res) => {
    const force = req.query.force === 'true' || req.query.refresh === 'true';
    if (force) {
        myCache.del('GLOBAL_FX_RATES');
    }
    try {
        const quote = await getGlobalFxQuote(force);
        const { rates } = quote;
        res.json({
            base: 'USD',
            target: 'INR',
            rate: rates.INR || DEFAULT_FX_RATES.INR,
            rates,
            providerRates: quote.providerRates,
            cached: quote.cached,
            source: quote.source,
            sourceUpdatedAt: quote.sourceUpdatedAt,
            fetchedAt: quote.fetchedAt,
            fallback: quote.fallback,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.json({
            base: 'USD',
            target: 'INR',
            rate: DEFAULT_FX_RATES.INR,
            rates: DEFAULT_FX_RATES,
            cached: false,
            source: 'Static fallback',
            sourceUpdatedAt: null,
            fetchedAt: new Date().toISOString(),
            fallback: true,
            timestamp: new Date().toISOString()
        });
    }
});

// Explicit Cache Flush Endpoint
app.post('/api/forex/refresh', async (req, res) => {
    myCache.del('GLOBAL_FX_RATES');
    const quote = await getGlobalFxQuote(true);
    const { rates } = quote;
    res.json({
        success: true,
        message: 'Forex cache invalidated and rates re-synchronized',
        rate: rates.INR || DEFAULT_FX_RATES.INR,
        rates,
        source: quote.source,
        sourceUpdatedAt: quote.sourceUpdatedAt,
        fetchedAt: quote.fetchedAt,
        fallback: quote.fallback,
        timestamp: new Date().toISOString()
    });
});

// Paper Trading: Get Holdings
app.get('/api/paper-portfolio/:userId', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    const holdings = await PaperPortfolio.find({ userId: req.user.uid });
    res.json(holdings);
});

// Paper Trading: Get Balance
app.get('/api/virtual-account/:userId', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    res.json(await getOrCreateVirtualAccount(req.user.uid));
});

function getOrCreateVirtualAccount(userId, session) {
    return VirtualAccount.findOneAndUpdate(
        { userId },
        { $setOnInsert: { balance: 100000 } },
        { new: true, upsert: true, session }
    );
}

async function getPaperMarketQuote(symbol) {
    return getOrLoad(`paper_quote_${symbol}`, 10, async () => {
        try {
            const result = await yahooFinance.quote(symbol, {}, { validateResult: false });
            const quote = normalizePaperQuote(symbol, Array.isArray(result) ? result[0] : result, 'Yahoo Finance');
            if (quote) return quote;
        } catch (error) {
            console.warn(`Yahoo quote unavailable for ${symbol}: ${error.message}`);
        }

        try {
            const start = new Date(Date.now() - 7 * 86400000);
            const chart = await yahooFinance.chart(symbol, { period1: start, interval: '1d' }, { validateResult: false });
            const quote = normalizePaperQuote(symbol, chart?.meta, 'Yahoo Finance chart');
            if (quote) return quote;
        } catch (error) {
            console.warn(`Yahoo chart quote unavailable for ${symbol}: ${error.message}`);
        }

        const exchange = symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : undefined;
        const ticker = exchange ? symbol.slice(0, -3) : symbol;
        if (process.env.STOCK_API_KEY && /^[A-Z][A-Z0-9-]{0,23}$/.test(ticker)) {
            try {
                const { data } = await axios.get(`${TWELVE_DATA_URL}/quote`, {
                    params: { symbol: ticker, exchange },
                    headers: { Authorization: `apikey ${process.env.STOCK_API_KEY}` },
                    timeout: 4000
                });
                const expectedCurrency = exchange ? 'INR' : 'USD';
                if (data?.currency === expectedCurrency && (!exchange || data.exchange === exchange)) {
                    const quote = normalizePaperQuote(ticker, {
                        symbol: data.symbol,
                        currency: data.currency,
                        regularMarketPrice: data.close,
                        regularMarketTime: data.timestamp
                    }, 'Twelve Data');
                    if (quote) return quote;
                }
            } catch (error) {
                console.warn(`Twelve Data quote unavailable for ${symbol}: ${error.message}`);
            }
        }

        throw Object.assign(new Error(`No recent verified market quote for ${symbol}. Try again later.`), { status: 503 });
    });
}

function paperOrderError(status, message) {
    return Object.assign(new Error(message), { status });
}

function submitPaperOrder(side) {
    return async (req, res) => {
        let order;
        let shareUnits;
        const { symbol, qty, orderId } = req.body ?? {};
        try {
            order = validatePaperOrder(symbol, qty);
            if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(orderId)) {
                throw new Error('Provide a valid order ID for safe retries.');
            }
            // A full sale may close a legacy position with more than four decimals.
            if (side === 'buy') shareUnits = toShareUnits(order.quantity);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const userId = req.user.uid;
        const { symbol: cleanSymbol, quantity } = order;
        const key = JSON.stringify([userId, orderId]);
        const readReceipt = receipt => {
            if (receipt.side !== side || receipt.symbol !== cleanSymbol || receipt.quantity !== quantity) {
                throw paperOrderError(409, 'This order ID was used for a different order.');
            }
            return receipt.response;
        };
        try {
            const existingReceipt = await PaperOrder.findById(key).lean();
            if (existingReceipt) return res.json(readReceipt(existingReceipt));

            const quote = await getPaperMarketQuote(cleanSymbol);
            const fx = quote.currency === 'USD' ? null : await getGlobalFxQuote();
            if (fx && !fx.providerRates[quote.currency]) {
                throw paperOrderError(503, `No verified USD exchange rate for ${quote.currency}. Try again later.`);
            }
            const fxRates = fx?.rates ?? DEFAULT_FX_RATES;
            let totals;
            try {
                totals = calculatePaperOrderTotals(quantity, quote.price, quote.currency, fx?.providerRates);
            } catch (error) {
                throw paperOrderError(400, error.message);
            }

            const session = await mongoose.startSession();
            try {
                const response = await session.withTransaction(async () => {
                    const receipt = await PaperOrder.findById(key).session(session).lean();
                    if (receipt) return readReceipt(receipt);

                    const account = await getOrCreateVirtualAccount(userId, session);
                    let holding = await PaperPortfolio.findOne({ userId, symbol: cleanSymbol }).session(session);
                    const cashCents = Math.round(account.balance * 100);
                    const orderCents = Math.round(totals.usdAmount * 100);
                    const nextCashCents = side === 'buy' ? cashCents - orderCents : cashCents + orderCents;
                    if (nextCashCents < 0) throw paperOrderError(400, 'Insufficient virtual funds.');
                    if (!Number.isSafeInteger(nextCashCents)) throw paperOrderError(400, 'Virtual balance is outside the supported range.');

                    if (side === 'buy') {
                        if (holding) {
                            const holdingUnits = Math.round(holding.qty * 10000);
                            if (!Number.isSafeInteger(holdingUnits + shareUnits) || holdingUnits / 10000 !== holding.qty) {
                                throw paperOrderError(409, 'Close this legacy fractional position before adding shares.');
                            }
                            if (holding.currency && holding.currency !== quote.currency) {
                                throw paperOrderError(409, 'The quote currency differs from the stored position. Close the position before adding shares.');
                            }
                            holding.price = calculateWeightedAveragePrice(holding.qty, holding.price, quantity, quote.price);
                            holding.qty = (holdingUnits + shareUnits) / 10000;
                            holding.currency = quote.currency;
                        } else {
                            holding = new PaperPortfolio({ userId, symbol: cleanSymbol, currency: quote.currency, qty: quantity, price: quote.price });
                        }
                        await holding.save({ session });
                    } else {
                        if (!holding || holding.qty < quantity) throw paperOrderError(400, 'Not enough shares to sell.');
                        if (holding.qty === quantity) {
                            await holding.deleteOne({ session });
                            holding = null;
                        } else {
                            try {
                                const holdingUnits = toShareUnits(holding.qty);
                                holding.qty = (holdingUnits - toShareUnits(quantity)) / 10000;
                            } catch (error) {
                                throw paperOrderError(400, 'Partial sales require four-decimal share quantities. Close the full position to sell legacy fractions.');
                            }
                            await holding.save({ session });
                        }
                    }

                    account.balance = nextCashCents / 100;
                    await account.save({ session });
                    const result = {
                        holding: holding?.toObject() ?? null,
                        balance: account.balance,
                        fxRates,
                        rate: fxRates.INR,
                        executedPrice: quote.price,
                        currency: quote.currency,
                        quoteSource: quote.source,
                        quoteTimestamp: quote.sourceUpdatedAt,
                        usdAmount: totals.usdAmount,
                        fxRate: fx?.providerRates[quote.currency] ?? 1,
                        fxSource: fx?.source ?? null
                    };
                    await PaperOrder.create([{ _id: key, side, symbol: cleanSymbol, quantity, response: result }], { session });
                    return result;
                });
                res.json(response);
            } finally {
                await session.endSession();
            }
        } catch (error) {
            if (error.code === 11000) {
                try {
                    const receipt = await PaperOrder.findById(key).lean();
                    if (receipt) return res.json(readReceipt(receipt));
                } catch (receiptError) {
                    if (receiptError.status) return res.status(receiptError.status).json({ error: receiptError.message });
                    throw receiptError;
                }
                return res.status(503).json({ error: 'Concurrent order update. Retry with the same order ID.' });
            }
            if (error.status) return res.status(error.status).json({ error: error.message });
            console.error('Paper order failed:', error.message);
            res.status(503).json({ error: 'Paper order settlement is unavailable. Retry with the same order ID.' });
        }
    };
}

app.post('/api/paper-portfolio/buy', submitPaperOrder('buy'));
app.post('/api/paper-portfolio/sell', submitPaperOrder('sell'));

// Curated Multi-Market Screener Universe (US Tech, Mega-Caps, Indian NSE Bluechips)
const SCREENER_UNIVERSE = [
    // Mega-Cap US Tech & AI Growth
    'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'NFLX', 'PLTR', 
    'COIN', 'SMCI', 'AVGO', 'CRM', 'ORCL', 'UBER', 'INTC', 'IBM',
    // Large Cap Value & Institutional Bluechips
    'JPM', 'BAC', 'BRK-B', 'DIS', 'V', 'MA', 'WMT', 'PG', 'KO', 'JNJ', 'LLY', 'BA', 'COST',
    // Broad Market Benchmark ETFs
    'SPY', 'QQQ',
    // Indian Market Leaders (NSE)
    'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS', 
    'ITC.NS', 'SBIN.NS', 'TATAMOTORS.NS', 'LT.NS'
];

const TECH_SYMBOLS = new Set([
    'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'NFLX', 'PLTR',
    'COIN', 'SMCI', 'AVGO', 'CRM', 'ORCL', 'UBER', 'INTC', 'IBM'
]);

const SEED_INSTRUMENT_META = {
    'AAPL': { shortName: 'Apple Inc.', marketCap: 5.03e12, trailingPE: 39.0 },
    'NVDA': { shortName: 'NVIDIA Corporation', marketCap: 3.39e12, trailingPE: 58.2 },
    'MSFT': { shortName: 'Microsoft Corporation', marketCap: 3.18e12, trailingPE: 35.6 },
    'GOOGL': { shortName: 'Alphabet Inc.', marketCap: 2.21e12, trailingPE: 24.2 },
    'AMZN': { shortName: 'Amazon.com Inc.', marketCap: 2.08e12, trailingPE: 43.8 },
    'META': { shortName: 'Meta Platforms Inc.', marketCap: 1.50e12, trailingPE: 28.4 },
    'TSLA': { shortName: 'Tesla Inc.', marketCap: 7.94e11, trailingPE: 64.2 },
    'AVGO': { shortName: 'Broadcom Inc.', marketCap: 8.35e11, trailingPE: 62.4 },
    'AMD': { shortName: 'Advanced Micro Devices', marketCap: 2.57e11, trailingPE: 72.1 },
    'PLTR': { shortName: 'Palantir Technologies', marketCap: 1.21e11, trailingPE: 92.4 },
    'COIN': { shortName: 'Coinbase Global', marketCap: 7.15e10, trailingPE: 46.8 },
    'SMCI': { shortName: 'Super Micro Computer', marketCap: 2.26e10, trailingPE: 18.5 },
    'UBER': { shortName: 'Uber Technologies', marketCap: 1.60e11, trailingPE: 38.6 },
    'CRM': { shortName: 'Salesforce Inc.', marketCap: 3.02e11, trailingPE: 48.6 },
    'ORCL': { shortName: 'Oracle Corporation', marketCap: 5.12e11, trailingPE: 41.2 },
    'INTC': { shortName: 'Intel Corporation', marketCap: 9.62e10, trailingPE: 32.1 },
    'IBM': { shortName: 'IBM Common Stock', marketCap: 1.95e11, trailingPE: 22.4 },
    'NFLX': { shortName: 'Netflix Inc.', marketCap: 3.54e11, trailingPE: 46.2 },
    'JPM': { shortName: 'JPMorgan Chase & Co.', marketCap: 6.82e11, trailingPE: 12.8 },
    'BAC': { shortName: 'Bank of America', marketCap: 3.48e11, trailingPE: 14.6 },
    'BRK-B': { shortName: 'Berkshire Hathaway', marketCap: 9.85e11, trailingPE: 19.5 },
    'DIS': { shortName: 'Walt Disney Company', marketCap: 1.76e11, trailingPE: 36.4 },
    'V': { shortName: 'Visa Inc.', marketCap: 6.32e11, trailingPE: 31.2 },
    'MA': { shortName: 'Mastercard Inc.', marketCap: 4.82e11, trailingPE: 37.4 },
    'WMT': { shortName: 'Walmart Inc.', marketCap: 6.92e11, trailingPE: 29.4 },
    'PG': { shortName: 'Procter & Gamble', marketCap: 4.04e11, trailingPE: 26.8 },
    'KO': { shortName: 'Coca-Cola Company', marketCap: 2.82e11, trailingPE: 24.8 },
    'JNJ': { shortName: 'Johnson & Johnson', marketCap: 3.92e11, trailingPE: 18.2 },
    'LLY': { shortName: 'Eli Lilly and Company', marketCap: 7.62e11, trailingPE: 52.4 },
    'BA': { shortName: 'Boeing Company', marketCap: 9.38e10, trailingPE: null },
    'COST': { shortName: 'Costco Wholesale', marketCap: 4.05e11, trailingPE: 54.2 },
    'RELIANCE.NS': { shortName: 'Reliance Industries', marketCap: 1.78e13, trailingPE: 24.8 },
    'TCS.NS': { shortName: 'Tata Consultancy Services', marketCap: 1.51e13, trailingPE: 30.2 },
    'INFY.NS': { shortName: 'Infosys Limited', marketCap: 7.64e12, trailingPE: 28.5 },
    'HDFCBANK.NS': { shortName: 'HDFC Bank Limited', marketCap: 1.34e13, trailingPE: 19.2 },
    'ICICIBANK.NS': { shortName: 'ICICI Bank Limited', marketCap: 9.02e12, trailingPE: 18.4 },
    'BHARTIARTL.NS': { shortName: 'Bharti Airtel Limited', marketCap: 9.75e12, trailingPE: 42.8 },
    'ITC.NS': { shortName: 'ITC Limited', marketCap: 6.15e12, trailingPE: 28.1 },
    'SBIN.NS': { shortName: 'State Bank of India', marketCap: 7.35e12, trailingPE: 10.8 },
    'TATAMOTORS.NS': { shortName: 'Tata Motors Limited', marketCap: 3.62e12, trailingPE: 11.2 },
    'LT.NS': { shortName: 'Larsen & Toubro Limited', marketCap: 5.01e12, trailingPE: 35.4 }
};

const SEED_SCREENER_CACHE = {
    day_gainers: [
        { symbol: 'NVDA', shortName: 'NVIDIA Corporation', regularMarketPrice: 138.25, regularMarketChangePercent: 4.85, regularMarketDayHigh: 140.50, regularMarketDayLow: 132.80, regularMarketVolume: 64200000, marketCap: 3.39e12, trailingPE: 58.2, currency: 'USD' },
        { symbol: 'PLTR', shortName: 'Palantir Technologies', regularMarketPrice: 54.10, regularMarketChangePercent: 6.30, regularMarketDayHigh: 55.40, regularMarketDayLow: 51.20, regularMarketVolume: 48900000, marketCap: 1.21e11, trailingPE: 92.4, currency: 'USD' },
        { symbol: 'COIN', shortName: 'Coinbase Global', regularMarketPrice: 288.50, regularMarketChangePercent: 7.15, regularMarketDayHigh: 295.00, regularMarketDayLow: 272.10, regularMarketVolume: 14200000, marketCap: 7.15e10, trailingPE: 46.8, currency: 'USD' },
        { symbol: 'SMCI', shortName: 'Super Micro Computer', regularMarketPrice: 38.60, regularMarketChangePercent: 5.72, regularMarketDayHigh: 40.20, regularMarketDayLow: 36.80, regularMarketVolume: 28500000, marketCap: 2.26e10, trailingPE: 18.5, currency: 'USD' },
        { symbol: 'AMD', shortName: 'Advanced Micro Devices', regularMarketPrice: 158.70, regularMarketChangePercent: 3.65, regularMarketDayHigh: 161.40, regularMarketDayLow: 154.20, regularMarketVolume: 36500000, marketCap: 2.57e11, trailingPE: 72.1, currency: 'USD' },
        { symbol: 'UBER', shortName: 'Uber Technologies', regularMarketPrice: 76.90, regularMarketChangePercent: 3.42, regularMarketDayHigh: 78.10, regularMarketDayLow: 74.80, regularMarketVolume: 18900000, marketCap: 1.60e11, trailingPE: 38.6, currency: 'USD' },
        { symbol: 'AVGO', shortName: 'Broadcom Inc.', regularMarketPrice: 178.40, regularMarketChangePercent: 3.28, regularMarketDayHigh: 181.20, regularMarketDayLow: 174.50, regularMarketVolume: 16400000, marketCap: 8.35e11, trailingPE: 62.4, currency: 'USD' },
        { symbol: 'TATAMOTORS.NS', shortName: 'Tata Motors Limited', regularMarketPrice: 985.40, regularMarketChangePercent: 2.85, regularMarketDayHigh: 998.00, regularMarketDayLow: 962.00, regularMarketVolume: 12400000, marketCap: 3.62e12, trailingPE: 11.2, currency: 'INR' },
        { symbol: 'BHARTIARTL.NS', shortName: 'Bharti Airtel Limited', regularMarketPrice: 1620.50, regularMarketChangePercent: 2.15, regularMarketDayHigh: 1640.00, regularMarketDayLow: 1595.00, regularMarketVolume: 8600000, marketCap: 9.75e12, trailingPE: 42.8, currency: 'INR' },
        { symbol: 'TSLA', shortName: 'Tesla Inc.', regularMarketPrice: 248.80, regularMarketChangePercent: 2.15, regularMarketDayHigh: 254.50, regularMarketDayLow: 242.10, regularMarketVolume: 98400000, marketCap: 7.94e11, trailingPE: 64.2, currency: 'USD' }
    ],
    day_losers: [
        { symbol: 'INTC', shortName: 'Intel Corporation', regularMarketPrice: 22.40, regularMarketChangePercent: -4.85, regularMarketDayHigh: 23.60, regularMarketDayLow: 22.10, regularMarketVolume: 54100000, marketCap: 9.62e10, trailingPE: 32.1, currency: 'USD' },
        { symbol: 'BA', shortName: 'Boeing Company', regularMarketPrice: 152.30, regularMarketChangePercent: -3.95, regularMarketDayHigh: 158.80, regularMarketDayLow: 151.00, regularMarketVolume: 14800000, marketCap: 9.38e10, trailingPE: null, currency: 'USD' },
        { symbol: 'DIS', shortName: 'Walt Disney Company', regularMarketPrice: 96.40, regularMarketChangePercent: -2.85, regularMarketDayHigh: 99.20, regularMarketDayLow: 95.80, regularMarketVolume: 15800000, marketCap: 1.76e11, trailingPE: 36.4, currency: 'USD' },
        { symbol: 'INFY.NS', shortName: 'Infosys Limited', regularMarketPrice: 1840.00, regularMarketChangePercent: -1.85, regularMarketDayHigh: 1875.00, regularMarketDayLow: 1832.00, regularMarketVolume: 6800000, marketCap: 7.64e12, trailingPE: 28.5, currency: 'INR' },
        { symbol: 'HDFCBANK.NS', shortName: 'HDFC Bank Limited', regularMarketPrice: 1765.00, regularMarketChangePercent: -1.45, regularMarketDayHigh: 1792.00, regularMarketDayLow: 1758.00, regularMarketVolume: 9400000, marketCap: 1.34e13, trailingPE: 19.2, currency: 'INR' },
        { symbol: 'AAPL', shortName: 'Apple Inc.', regularMarketPrice: 344.63, regularMarketChangePercent: -1.23, regularMarketDayHigh: 349.19, regularMarketDayLow: 334.35, regularMarketVolume: 58200000, marketCap: 5.03e12, trailingPE: 39.0, currency: 'USD' },
        { symbol: 'IBM', shortName: 'IBM Common Stock', regularMarketPrice: 208.50, regularMarketChangePercent: -0.95, regularMarketDayHigh: 211.20, regularMarketDayLow: 207.80, regularMarketVolume: 4200000, marketCap: 1.95e11, trailingPE: 22.4, currency: 'USD' },
        { symbol: 'KO', shortName: 'Coca-Cola Company', regularMarketPrice: 65.40, regularMarketChangePercent: -0.65, regularMarketDayHigh: 66.10, regularMarketDayLow: 64.95, regularMarketVolume: 11800000, marketCap: 2.82e11, trailingPE: 24.8, currency: 'USD' },
        { symbol: 'PG', shortName: 'Procter & Gamble', regularMarketPrice: 171.50, regularMarketChangePercent: -0.55, regularMarketDayHigh: 172.80, regularMarketDayLow: 170.40, regularMarketVolume: 6800000, marketCap: 4.04e11, trailingPE: 26.8, currency: 'USD' },
        { symbol: 'JNJ', shortName: 'Johnson & Johnson', regularMarketPrice: 162.80, regularMarketChangePercent: -0.45, regularMarketDayHigh: 164.20, regularMarketDayLow: 161.90, regularMarketVolume: 7200000, marketCap: 3.92e11, trailingPE: 18.2, currency: 'USD' }
    ],
    most_actives: [
        { symbol: 'TSLA', shortName: 'Tesla Inc.', regularMarketPrice: 248.80, regularMarketChangePercent: 2.15, regularMarketDayHigh: 254.50, regularMarketDayLow: 242.10, regularMarketVolume: 98400000, marketCap: 7.94e11, trailingPE: 64.2, currency: 'USD' },
        { symbol: 'NVDA', shortName: 'NVIDIA Corporation', regularMarketPrice: 138.25, regularMarketChangePercent: 4.85, regularMarketDayHigh: 140.50, regularMarketDayLow: 132.80, regularMarketVolume: 64200000, marketCap: 3.39e12, trailingPE: 58.2, currency: 'USD' },
        { symbol: 'AAPL', shortName: 'Apple Inc.', regularMarketPrice: 344.63, regularMarketChangePercent: -1.23, regularMarketDayHigh: 349.19, regularMarketDayLow: 334.35, regularMarketVolume: 58200000, marketCap: 5.03e12, trailingPE: 39.0, currency: 'USD' },
        { symbol: 'INTC', shortName: 'Intel Corporation', regularMarketPrice: 22.40, regularMarketChangePercent: -4.85, regularMarketDayHigh: 23.60, regularMarketDayLow: 22.10, regularMarketVolume: 54100000, marketCap: 9.62e10, trailingPE: 32.1, currency: 'USD' },
        { symbol: 'AMD', shortName: 'Advanced Micro Devices', regularMarketPrice: 158.70, regularMarketChangePercent: 3.65, regularMarketDayHigh: 161.40, regularMarketDayLow: 154.20, regularMarketVolume: 51200000, marketCap: 2.57e11, trailingPE: 72.1, currency: 'USD' },
        { symbol: 'PLTR', shortName: 'Palantir Technologies', regularMarketPrice: 54.10, regularMarketChangePercent: 6.30, regularMarketDayHigh: 55.40, regularMarketDayLow: 51.20, regularMarketVolume: 48900000, marketCap: 1.21e11, trailingPE: 92.4, currency: 'USD' },
        { symbol: 'AMZN', shortName: 'Amazon.com Inc.', regularMarketPrice: 198.50, regularMarketChangePercent: 1.45, regularMarketDayHigh: 201.20, regularMarketDayLow: 196.40, regularMarketVolume: 47600000, marketCap: 2.08e12, trailingPE: 43.8, currency: 'USD' },
        { symbol: 'GOOGL', shortName: 'Alphabet Inc.', regularMarketPrice: 178.60, regularMarketChangePercent: 1.12, regularMarketDayHigh: 180.40, regularMarketDayLow: 176.80, regularMarketVolume: 26400000, marketCap: 2.21e12, trailingPE: 24.2, currency: 'USD' },
        { symbol: 'MSFT', shortName: 'Microsoft Corporation', regularMarketPrice: 428.20, regularMarketChangePercent: 0.85, regularMarketDayHigh: 431.50, regularMarketDayLow: 425.10, regularMarketVolume: 24800000, marketCap: 3.18e12, trailingPE: 35.6, currency: 'USD' },
        { symbol: 'META', shortName: 'Meta Platforms Inc.', regularMarketPrice: 592.40, regularMarketChangePercent: 1.95, regularMarketDayHigh: 598.00, regularMarketDayLow: 585.20, regularMarketVolume: 18200000, marketCap: 1.50e12, trailingPE: 28.4, currency: 'USD' }
    ],
    undervalued_large_caps: [
        { symbol: 'BRK-B', shortName: 'Berkshire Hathaway', regularMarketPrice: 542.49, regularMarketChangePercent: 0.42, regularMarketDayHigh: 544.80, regularMarketDayLow: 539.50, regularMarketVolume: 3200000, marketCap: 9.85e11, trailingPE: 19.5, currency: 'USD' },
        { symbol: 'JPM', shortName: 'JPMorgan Chase & Co.', regularMarketPrice: 238.40, regularMarketChangePercent: 1.15, regularMarketDayHigh: 240.20, regularMarketDayLow: 236.10, regularMarketVolume: 8900000, marketCap: 6.82e11, trailingPE: 12.8, currency: 'USD' },
        { symbol: 'BAC', shortName: 'Bank of America', regularMarketPrice: 44.60, regularMarketChangePercent: 0.95, regularMarketDayHigh: 45.10, regularMarketDayLow: 44.15, regularMarketVolume: 28400000, marketCap: 3.48e11, trailingPE: 14.6, currency: 'USD' },
        { symbol: 'WMT', shortName: 'Walmart Inc.', regularMarketPrice: 86.20, regularMarketChangePercent: 0.65, regularMarketDayHigh: 87.00, regularMarketDayLow: 85.60, regularMarketVolume: 14200000, marketCap: 6.92e11, trailingPE: 29.4, currency: 'USD' },
        { symbol: 'PG', shortName: 'Procter & Gamble', regularMarketPrice: 171.50, regularMarketChangePercent: 0.35, regularMarketDayHigh: 172.80, regularMarketDayLow: 170.40, regularMarketVolume: 6800000, marketCap: 4.04e11, trailingPE: 26.8, currency: 'USD' },
        { symbol: 'JNJ', shortName: 'Johnson & Johnson', regularMarketPrice: 162.80, regularMarketChangePercent: 0.25, regularMarketDayHigh: 164.20, regularMarketDayLow: 161.90, regularMarketVolume: 7200000, marketCap: 3.92e11, trailingPE: 18.2, currency: 'USD' },
        { symbol: 'V', shortName: 'Visa Inc.', regularMarketPrice: 308.50, regularMarketChangePercent: 0.82, regularMarketDayHigh: 310.40, regularMarketDayLow: 306.20, regularMarketVolume: 5400000, marketCap: 6.32e11, trailingPE: 31.2, currency: 'USD' },
        { symbol: 'MA', shortName: 'Mastercard Inc.', regularMarketPrice: 518.20, regularMarketChangePercent: 0.76, regularMarketDayHigh: 521.80, regularMarketDayLow: 514.50, regularMarketVolume: 2400000, marketCap: 4.82e11, trailingPE: 37.4, currency: 'USD' },
        { symbol: 'KO', shortName: 'Coca-Cola Company', regularMarketPrice: 65.40, regularMarketChangePercent: 0.45, regularMarketDayHigh: 66.10, regularMarketDayLow: 64.95, regularMarketVolume: 11800000, marketCap: 2.82e11, trailingPE: 24.8, currency: 'USD' },
        { symbol: 'COST', shortName: 'Costco Wholesale', regularMarketPrice: 912.40, regularMarketChangePercent: 0.92, regularMarketDayHigh: 918.50, regularMarketDayLow: 906.00, regularMarketVolume: 1800000, marketCap: 4.05e11, trailingPE: 54.2, currency: 'USD' }
    ],
    tech_titans: [
        { symbol: 'AAPL', shortName: 'Apple Inc.', regularMarketPrice: 344.63, regularMarketChangePercent: -1.23, regularMarketDayHigh: 349.19, regularMarketDayLow: 334.35, regularMarketVolume: 58200000, marketCap: 5.03e12, trailingPE: 39.0, currency: 'USD' },
        { symbol: 'NVDA', shortName: 'NVIDIA Corporation', regularMarketPrice: 138.25, regularMarketChangePercent: 4.85, regularMarketDayHigh: 140.50, regularMarketDayLow: 132.80, regularMarketVolume: 64200000, marketCap: 3.39e12, trailingPE: 58.2, currency: 'USD' },
        { symbol: 'MSFT', shortName: 'Microsoft Corporation', regularMarketPrice: 428.20, regularMarketChangePercent: 0.85, regularMarketDayHigh: 431.50, regularMarketDayLow: 425.10, regularMarketVolume: 24800000, marketCap: 3.18e12, trailingPE: 35.6, currency: 'USD' },
        { symbol: 'GOOGL', shortName: 'Alphabet Inc.', regularMarketPrice: 178.60, regularMarketChangePercent: 1.12, regularMarketDayHigh: 180.40, regularMarketDayLow: 176.80, regularMarketVolume: 26400000, marketCap: 2.21e12, trailingPE: 24.2, currency: 'USD' },
        { symbol: 'AMZN', shortName: 'Amazon.com Inc.', regularMarketPrice: 198.50, regularMarketChangePercent: 1.45, regularMarketDayHigh: 201.20, regularMarketDayLow: 196.40, regularMarketVolume: 47600000, marketCap: 2.08e12, trailingPE: 43.8, currency: 'USD' },
        { symbol: 'META', shortName: 'Meta Platforms Inc.', regularMarketPrice: 592.40, regularMarketChangePercent: 1.95, regularMarketDayHigh: 598.00, regularMarketDayLow: 585.20, regularMarketVolume: 18200000, marketCap: 1.50e12, trailingPE: 28.4, currency: 'USD' },
        { symbol: 'TSLA', shortName: 'Tesla Inc.', regularMarketPrice: 248.80, regularMarketChangePercent: 2.15, regularMarketDayHigh: 254.50, regularMarketDayLow: 242.10, regularMarketVolume: 98400000, marketCap: 7.94e11, trailingPE: 64.2, currency: 'USD' },
        { symbol: 'AVGO', shortName: 'Broadcom Inc.', regularMarketPrice: 178.40, regularMarketChangePercent: 3.28, regularMarketDayHigh: 181.20, regularMarketDayLow: 174.50, regularMarketVolume: 16400000, marketCap: 8.35e11, trailingPE: 62.4, currency: 'USD' },
        { symbol: 'ORCL', shortName: 'Oracle Corporation', regularMarketPrice: 186.20, regularMarketChangePercent: 1.35, regularMarketDayHigh: 188.40, regularMarketDayLow: 184.20, regularMarketVolume: 11200000, marketCap: 5.12e11, trailingPE: 41.2, currency: 'USD' },
        { symbol: 'CRM', shortName: 'Salesforce Inc.', regularMarketPrice: 312.40, regularMarketChangePercent: 1.65, regularMarketDayHigh: 316.00, regularMarketDayLow: 308.80, regularMarketVolume: 6400000, marketCap: 3.02e11, trailingPE: 48.6, currency: 'USD' },
        { symbol: 'AMD', shortName: 'Advanced Micro Devices', regularMarketPrice: 158.70, regularMarketChangePercent: 3.65, regularMarketDayHigh: 161.40, regularMarketDayLow: 154.20, regularMarketVolume: 51200000, marketCap: 2.57e11, trailingPE: 72.1, currency: 'USD' },
        { symbol: 'NFLX', shortName: 'Netflix Inc.', regularMarketPrice: 824.50, regularMarketChangePercent: 2.10, regularMarketDayHigh: 832.00, regularMarketDayLow: 815.40, regularMarketVolume: 4200000, marketCap: 3.54e11, trailingPE: 46.2, currency: 'USD' }
    ],
    indian_market: [
        { symbol: 'RELIANCE.NS', shortName: 'Reliance Industries', regularMarketPrice: 1320.40, regularMarketChangePercent: 1.45, regularMarketDayHigh: 1335.00, regularMarketDayLow: 1308.00, regularMarketVolume: 14200000, marketCap: 1.78e13, trailingPE: 24.8, currency: 'INR' },
        { symbol: 'TCS.NS', shortName: 'Tata Consultancy Services', regularMarketPrice: 4185.00, regularMarketChangePercent: 0.85, regularMarketDayHigh: 4220.00, regularMarketDayLow: 4150.00, regularMarketVolume: 2400000, marketCap: 1.51e13, trailingPE: 30.2, currency: 'INR' },
        { symbol: 'HDFCBANK.NS', shortName: 'HDFC Bank Limited', regularMarketPrice: 1765.00, regularMarketChangePercent: -1.45, regularMarketDayHigh: 1792.00, regularMarketDayLow: 1758.00, regularMarketVolume: 9400000, marketCap: 1.34e13, trailingPE: 19.2, currency: 'INR' },
        { symbol: 'ICICIBANK.NS', shortName: 'ICICI Bank Limited', regularMarketPrice: 1285.50, regularMarketChangePercent: 1.65, regularMarketDayHigh: 1298.00, regularMarketDayLow: 1268.00, regularMarketVolume: 11800000, marketCap: 9.02e12, trailingPE: 18.4, currency: 'INR' },
        { symbol: 'BHARTIARTL.NS', shortName: 'Bharti Airtel Limited', regularMarketPrice: 1620.50, regularMarketChangePercent: 2.15, regularMarketDayHigh: 1640.00, regularMarketDayLow: 1595.00, regularMarketVolume: 8600000, marketCap: 9.75e12, trailingPE: 42.8, currency: 'INR' },
        { symbol: 'INFY.NS', shortName: 'Infosys Limited', regularMarketPrice: 1840.00, regularMarketChangePercent: -1.85, regularMarketDayHigh: 1875.00, regularMarketDayLow: 1832.00, regularMarketVolume: 6800000, marketCap: 7.64e12, trailingPE: 28.5, currency: 'INR' },
        { symbol: 'ITC.NS', shortName: 'ITC Limited', regularMarketPrice: 492.80, regularMarketChangePercent: 0.65, regularMarketDayHigh: 497.00, regularMarketDayLow: 489.50, regularMarketVolume: 16200000, marketCap: 6.15e12, trailingPE: 28.1, currency: 'INR' },
        { symbol: 'SBIN.NS', shortName: 'State Bank of India', regularMarketPrice: 824.60, regularMarketChangePercent: 1.20, regularMarketDayHigh: 832.00, regularMarketDayLow: 818.00, regularMarketVolume: 18500000, marketCap: 7.35e12, trailingPE: 10.8, currency: 'INR' },
        { symbol: 'TATAMOTORS.NS', shortName: 'Tata Motors Limited', regularMarketPrice: 985.40, regularMarketChangePercent: 2.85, regularMarketDayHigh: 998.00, regularMarketDayLow: 962.00, regularMarketVolume: 12400000, marketCap: 3.62e12, trailingPE: 11.2, currency: 'INR' },
        { symbol: 'LT.NS', shortName: 'Larsen & Toubro Limited', regularMarketPrice: 3650.00, regularMarketChangePercent: 1.10, regularMarketDayHigh: 3685.00, regularMarketDayLow: 3620.00, regularMarketVolume: 3200000, marketCap: 5.01e12, trailingPE: 35.4, currency: 'INR' }
    ]
};

const lastKnownScreenerCache = {};

function screenerFallback(type) {
    const cached = lastKnownScreenerCache[type];
    if (cached) return cached.map(quote => ({ ...quote, dataStatus: 'cached' }));
    return (SEED_SCREENER_CACHE[type] || []).map(quote => ({ ...quote, dataStatus: 'sample' }));
}

function normalizeScreenerQuote(q) {
    if (!q?.symbol || !Number.isFinite(q.regularMarketPrice) || q.regularMarketPrice <= 0) return null;
    const time = marketTimeMs(q.regularMarketTime);
    const meta = SEED_INSTRUMENT_META[q.symbol] || {};
    const price = Number.isFinite(q.regularMarketPrice) ? q.regularMarketPrice : null;
    return {
        symbol: q.symbol,
        shortName: q.shortName || q.longName || meta.shortName || q.symbol,
        longName: q.longName || q.shortName || meta.shortName || q.symbol,
        regularMarketPrice: price,
        quoteSource: 'Yahoo Finance',
        quoteTimestamp: Number.isFinite(time) ? new Date(time).toISOString() : null,
        regularMarketChangePercent: Number.isFinite(q.regularMarketChangePercent) 
            ? q.regularMarketChangePercent 
            : (Number.isFinite(q.regularMarketChange) && price > q.regularMarketChange ? q.regularMarketChange / (price - q.regularMarketChange) * 100 : null),
        regularMarketDayHigh: Number.isFinite(q.regularMarketDayHigh) ? q.regularMarketDayHigh : null,
        regularMarketDayLow: Number.isFinite(q.regularMarketDayLow) ? q.regularMarketDayLow : null,
        regularMarketVolume: Number.isFinite(q.regularMarketVolume) ? q.regularMarketVolume : null,
        marketCap: Number.isFinite(q.marketCap) ? q.marketCap : null,
        trailingPE: Number.isFinite(q.trailingPE) ? q.trailingPE : null,
        currency: q.currency || inferCurrencyFromSymbol(q.symbol)
    };
}

// Screener Endpoint
app.get('/api/screener/:type', async (req, res) => {
    try {
        const allowedTypes = new Set([
            'day_gainers', 
            'day_losers', 
            'most_actives', 
            'undervalued_large_caps',
            'tech_titans',
            'indian_market'
        ]);
        const type = req.params.type;
        if (!allowedTypes.has(type)) {
            return res.status(400).json({ error: 'Unknown screener. Choose a supported market filter.' });
        }

        const cacheKey = `screener_${type}`;
        const quotes = await getOrLoad(cacheKey, 120, async () => {

            let quotes = [];

            // 1. For standard types, attempt Yahoo's predefined screener first during live market hours
            if (['day_gainers', 'day_losers', 'most_actives', 'undervalued_large_caps'].includes(type)) {
                try {
                    const yfResult = await yahooFinance.screener(type, { count: 20 }, { validateResult: false });
                    if (Array.isArray(yfResult?.quotes) && yfResult.quotes.length > 0) {
                        quotes = yfResult.quotes.map(normalizeScreenerQuote).filter(Boolean);
                    }
                } catch (yfErr) {
                    // If yahoo-finance2 schema validator failed, quotes are still present in yfErr.result
                    if (Array.isArray(yfErr?.result?.quotes) && yfErr.result.quotes.length > 0) {
                        quotes = yfErr.result.quotes.map(normalizeScreenerQuote).filter(Boolean);
                    } else {
                        console.log(`Predefined screener unavailable for ${type} (${yfErr.message}). Using universe engine.`);
                    }
                }
            }

            // 2. Universe Engine: If predefined screener returned empty or custom filter requested
            if (quotes.length === 0) {
                let validQuotes = [];
                try {
                    const rawQuotes = await yahooFinance.quote(SCREENER_UNIVERSE, {}, { validateResult: false });
                    const list = Array.isArray(rawQuotes) ? rawQuotes : [];
                    validQuotes = list
                        .filter(q => q && q.symbol && Number.isFinite(q.regularMarketPrice))
                        .map(normalizeScreenerQuote)
                        .filter(Boolean);
                } catch (universeErr) {
                    // If batch schema check threw, recover from universeErr.result
                    if (Array.isArray(universeErr?.result)) {
                        validQuotes = universeErr.result
                            .filter(q => q && q.symbol && Number.isFinite(q.regularMarketPrice))
                            .map(normalizeScreenerQuote)
                            .filter(Boolean);
                    } else {
                        console.warn("Yahoo universe screener error:", universeErr.message);
                    }
                }

                // 3. Finnhub Resilience Fallback: If Yahoo failed (e.g. 429 crumb limit), query Finnhub quotes
                if (validQuotes.length === 0 && process.env.FINNHUB_API_KEY) {
                    try {
                        const usSymbols = SCREENER_UNIVERSE.filter(s => !s.endsWith('.NS') && !s.endsWith('.BO'));
                        const fhResults = await Promise.allSettled(
                            usSymbols.map(sym => 
                                axios.get(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${process.env.FINNHUB_API_KEY}`, { timeout: 3500 })
                            )
                        );
                        for (let i = 0; i < usSymbols.length; i++) {
                            const sym = usSymbols[i];
                            const r = fhResults[i];
                            if (r.status === 'fulfilled' && r.value?.data?.c > 0) {
                                const d = r.value.data;
                                const meta = SEED_INSTRUMENT_META[sym] || {};
                                validQuotes.push({
                                    symbol: sym,
                                    shortName: meta.shortName || sym,
                                    longName: meta.shortName || sym,
                                    regularMarketPrice: d.c,
                                    regularMarketChangePercent: Number.isFinite(d.dp) ? d.dp : null,
                                    quoteSource: 'Finnhub',
                                    quoteTimestamp: Number.isFinite(d.t) && d.t > 0 ? new Date(d.t * 1000).toISOString() : null,
                                    regularMarketDayHigh: d.h || null,
                                    regularMarketDayLow: d.l || null,
                                    regularMarketVolume: null,
                                    marketCap: null,
                                    trailingPE: null,
                                    currency: 'USD'
                                });
                            }
                        }
                    } catch (fhErr) {
                        console.warn("Finnhub screener fallback error:", fhErr.message);
                    }
                }

                if (validQuotes.length > 0) {
                    if (type === 'day_gainers') {
                        quotes = validQuotes.filter(q => Number.isFinite(q.regularMarketChangePercent))
                            .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
                            .slice(0, 15);
                    } else if (type === 'day_losers') {
                        quotes = validQuotes.filter(q => Number.isFinite(q.regularMarketChangePercent))
                            .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
                            .slice(0, 15);
                    } else if (type === 'most_actives') {
                        quotes = validQuotes.filter(q => q.regularMarketVolume > 0)
                            .sort((a, b) => b.regularMarketVolume - a.regularMarketVolume)
                            .slice(0, 15);
                    } else if (type === 'undervalued_large_caps') {
                        quotes = [...validQuotes]
                            .filter(q => q.currency === 'USD' && q.marketCap >= 40e9 && q.trailingPE > 0)
                            .sort((a, b) => a.trailingPE - b.trailingPE)
                            .slice(0, 15);
                    } else if (type === 'tech_titans') {
                        quotes = [...validQuotes]
                            .filter(q => TECH_SYMBOLS.has(q.symbol))
                            .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
                            .slice(0, 15);
                    } else if (type === 'indian_market') {
                        quotes = [...validQuotes]
                            .filter(q => q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))
                            .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
                            .slice(0, 15);
                    }
                }
            }

            if (quotes.length > 0) lastKnownScreenerCache[type] = quotes;
            return quotes;
        }, { shouldCache: value => value.length > 0 });

        res.json(quotes.length > 0 ? quotes : screenerFallback(type));
    } catch (e) {
        console.error(`Screener provider error (${req.params.type}):`, e.message);
        // Fallback to seeded baseline cache even if an unexpected error occurs so UI never blanks out
        const fallback = screenerFallback(req.params.type);
        if (fallback.length > 0) {
            return res.json(fallback);
        }
        res.status(500).json({ error: e.message || 'Market data feed temporarily unavailable.' });
    }
});

app.get('/api/alerts/:userId', async (req, res) => {
    if (req.params.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
    const alerts = await Alert.find({ userId: req.user.uid });
    res.json(alerts);
});

app.post('/api/alerts', async (req, res) => {
    const { symbol, targetPrice, condition } = req.body;
    const parsedTarget = parseFloat(targetPrice);
    if (!symbol || typeof symbol !== 'string' || !Number.isFinite(parsedTarget) || parsedTarget <= 0 || !['ABOVE', 'BELOW'].includes(condition)) {
        return res.status(400).json({ error: "Invalid alert parameters. Provide a valid symbol, target price, and condition (ABOVE/BELOW)." });
    }
    const cleanSym = symbol.trim().toUpperCase();
    const newAlert = new Alert({ userId: req.user.uid, symbol: cleanSym, targetPrice: parsedTarget, condition, triggered: false });
    await newAlert.save();
    res.json(newAlert);
});

app.delete('/api/alerts/:id', async (req, res) => {
    if (req.params.id) await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user.uid });
    res.send("Deleted");
});

// --- 6. AI Analyst ---
app.post('/api/ai-analysis', aiAnalysisLimiter, async (req, res) => {
    try {
        const { symbol, price, rsi, sentiment, news, currency } = req.body;
        const curCode = currency ? currency.toUpperCase() : inferCurrencyFromSymbol(symbol);
        const curSym = getCurrencySymbol(curCode);
        const newsItems = Array.isArray(news) ? news : [];
        const newsSummary = newsItems.slice(0, 2).map(n => n?.title || '').filter(Boolean).join(". ");
        
        let analysisText = "";
        let source = "model";
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: `Analyze ${symbol}. Price: ${curSym}${price} (${curCode}), RSI: ${rsi}, Sentiment: ${sentiment}. News: ${newsSummary}. Summarize the supplied indicators and headlines in three sentences. Keep observations tied to the supplied data and avoid price predictions or trading instructions.` }],
                model: "llama-3.1-8b-instant",
            });
            analysisText = chatCompletion.choices[0].message.content;
        } catch (groqErr) {
            console.error("Groq API error:", groqErr.message);
            source = "indicator";
            const rsiNum = Number.parseFloat(rsi);
            const rsiVerdict = rsiNum > 65 ? "overbought momentum, signaling potential consolidation" : rsiNum < 35 ? "oversold conditions, indicating potential mean-reversion buying interest" : "balanced neutral momentum";
            analysisText = Number.isFinite(rsiNum)
                ? `RSI is ${rsiNum.toFixed(1)}. The indicator suggests ${rsiVerdict}. Headline sentiment: ${sentiment || 'unavailable'}.`
                : 'RSI is unavailable. Load more price history to calculate momentum.';
        }
        res.json({ analysis: analysisText, source });
    } catch (error) { 
        res.status(500).json({ error: "AI Error", analysis: "Technical indicators show neutral price consolidation. Monitor moving average alignment." }); 
    }
});

// --- 7. C++ High-Performance Quantitative Computing Core ---
const { PRESETS, runCppQuantEngine, computeAssetParameters, isPositiveSemidefinite } = require('./quant_service');

const USD_QUOTED_FX = new Set(['EUR', 'GBP', 'AUD', 'NZD']);

function loadQuantChart(symbol) {
    return getOrLoad(`quant_chart_${symbol}`, 3600, async () => {
        const start = new Date();
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        const chart = await yahooFinance.chart(symbol, { period1: start, interval: '1d' }, { validateResult: false });
        if (!chart?.quotes?.length) throw new Error('No historical prices available.');
        return chart;
    });
}

async function loadQuantUsdHistory(symbol) {
    const chart = await loadQuantChart(symbol);
    const currency = chart.meta?.currency;
    const pence = currency === 'GBp' || currency === 'GBX';
    const code = pence ? 'GBP' : currency;
    if (!/^[A-Z]{3}$/.test(code)) throw new Error('Historical quote currency is unavailable.');

    let fxByDate;
    const usdQuoted = USD_QUOTED_FX.has(code);
    if (code !== 'USD') {
        const pair = usdQuoted ? `${code}USD=X` : `USD${code}=X`;
        const fx = await loadQuantChart(pair);
        fxByDate = new Map(fx.quotes.filter(bar => bar.date instanceof Date && Number.isFinite(bar.close) && bar.close > 0)
            .map(bar => [bar.date.toISOString().slice(0, 10), usdQuoted ? bar.close : 1 / bar.close]));
    }

    return chart.quotes
        .filter(bar => bar.date instanceof Date && Number.isFinite(bar.adjclose) && bar.adjclose > 0)
        .map(bar => {
            const datetime = bar.date.toISOString().slice(0, 10);
            const usdRate = fxByDate ? fxByDate.get(datetime) : 1;
            return { datetime, close: bar.adjclose * usdRate / (pence ? 100 : 1) };
        });
}

app.get('/api/quant/presets', (req, res) => {
    res.json(PRESETS);
});

app.post('/api/quant/simulate', quantSimulationLimiter, quantConcurrencyLimit, async (req, res) => {
    try {
        const {
            symbols = ['AAPL', 'MSFT', 'NVDA'],
            weights = [0.34, 0.33, 0.33],
            numSimulations = 50000,
            timeHorizonDays = 90,
            initialPortfolioValue = 100000,
            riskFreeRate = 0.045,
            expectedReturns,
            volatilities,
            correlationMatrix,
            assumptionMode
        } = req.body ?? {};

        if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 50 || symbols.some(s => typeof s !== 'string' || !/^[A-Z0-9.^=_-]{1,24}$/i.test(s.trim()))) {
            return res.status(400).json({ error: 'Provide between 1 and 50 valid ticker symbols.' });
        }
        if (!Array.isArray(weights) || weights.length !== symbols.length || weights.some(w => !Number.isFinite(w) || Number(w) < 0 || Number(w) > 1)) {
            return res.status(400).json({ error: 'Weights must contain one value from 0 to 1 for each symbol.' });
        }
        const weightTotal = weights.reduce((sum, weight) => sum + Number(weight), 0);
        if (Math.abs(weightTotal - 1) > 0.02) {
            return res.status(400).json({ error: `Portfolio weights must total 100%; received ${(weightTotal * 100).toFixed(2)}%.` });
        }
        const normalizedWeights = weights.map(weight => weight / weightTotal);

        if (!Number.isFinite(initialPortfolioValue) || initialPortfolioValue <= 0 || initialPortfolioValue > 1e12) {
            return res.status(400).json({ error: 'Initial portfolio value must be positive and at most 1 trillion USD.' });
        }
        if (!Number.isFinite(riskFreeRate) || Number(riskFreeRate) < 0 || Number(riskFreeRate) > 1) {
            return res.status(400).json({ error: 'Risk-free rate must be between 0 and 1.' });
        }
        if (expectedReturns !== undefined && (!Array.isArray(expectedReturns) || expectedReturns.length !== symbols.length || expectedReturns.some(value => !Number.isFinite(value) || Number(value) < -2 || Number(value) > 2))) {
            return res.status(400).json({ error: 'Expected returns must contain one finite annual value between -2 and 2 for each symbol.' });
        }
        if (volatilities !== undefined && (!Array.isArray(volatilities) || volatilities.length !== symbols.length || volatilities.some(value => !Number.isFinite(value) || Number(value) <= 0 || Number(value) > 3))) {
            return res.status(400).json({ error: 'Volatilities must contain one positive annual value no greater than 3 for each symbol.' });
        }
        if (correlationMatrix !== undefined && (!Array.isArray(correlationMatrix) || correlationMatrix.length !== symbols.length || correlationMatrix.some((row, i) => !Array.isArray(row) || row.length !== symbols.length || row.some((value, j) => !Number.isFinite(value) || Number(value) < -1 || Number(value) > 1 || (i === j && Math.abs(Number(value) - 1) > 1e-10))))) {
            return res.status(400).json({ error: 'Correlation matrix must be square, finite, bounded from -1 to 1, and have ones on its diagonal.' });
        }
        if (correlationMatrix !== undefined && correlationMatrix.some((row, i) => row.some((value, j) => Math.abs(Number(value) - Number(correlationMatrix[j][i])) > 0.0001))) {
            return res.status(400).json({ error: 'Correlation matrix must be symmetric.' });
        }

        const cleanSymbols = symbols.map(symbol => symbol.trim().toUpperCase());
        if (new Set(cleanSymbols).size !== cleanSymbols.length) {
            return res.status(400).json({ error: 'Provide each ticker once and combine its weights.' });
        }
        const pathCount = Math.min(200000, Math.max(1000, parseInt(numSimulations, 10) || 50000));
        const horizon = Math.min(365, Math.max(10, parseInt(timeHorizonDays, 10) || 90));
        if (pathCount * horizon * cleanSymbols.length * (cleanSymbols.length + 1) / 2 > 1_100_000_000) {
            return res.status(400).json({ error: 'Reduce the path count, horizon, or number of assets to run this simulation.' });
        }

        const preset = assumptionMode !== 'historical' && Object.values(PRESETS).find(item =>
            item.symbols.length === cleanSymbols.length && item.symbols.every((symbol, i) => symbol === cleanSymbols[i])
        );
        const scenario = preset && {
            ...preset,
            correlationMatrix: cleanSymbols.map((_, i) => cleanSymbols.map((_, j) => i === j ? 1 : 0.45))
        };
        const hasAllInputs = expectedReturns && volatilities && correlationMatrix;
        let history;
        if (!hasAllInputs && !scenario) {
            const series = await Promise.all(cleanSymbols.map(symbol => loadQuantUsdHistory(symbol).catch(() => [])));
            history = computeAssetParameters(Object.fromEntries(cleanSymbols.map((symbol, i) => [symbol, series[i]])), cleanSymbols);
            if (!history) {
                return res.status(422).json({ error: 'At least 15 common trading dates with adjusted prices and USD exchange rates are required.' });
            }
        }

        const assumptions = scenario || history;
        const finalReturns = expectedReturns ?? assumptions?.expectedReturns;
        const finalVols = volatilities ?? assumptions?.volatilities;
        const finalCorr = correlationMatrix ?? assumptions?.correlationMatrix;
        if (!isPositiveSemidefinite(finalCorr)) {
            return res.status(422).json({ error: 'The correlation matrix must be positive semidefinite.' });
        }

        const inputPayload = {
            symbols: cleanSymbols,
            weights: normalizedWeights,
            numSimulations: pathCount,
            timeHorizonDays: horizon,
            initialPortfolioValue: Number(initialPortfolioValue),
            riskFreeRate: Number(riskFreeRate),
            expectedReturns: finalReturns,
            volatilities: finalVols,
            correlationMatrix: finalCorr
        };

        const cppResult = await runCppQuantEngine(inputPayload);

        res.json({
            success: true,
            engineMode: 'cloud',
            cpp: cppResult,
            assumptions: {
                currency: 'USD',
                symbols: cleanSymbols,
                weights: normalizedWeights,
                expectedReturns: finalReturns,
                volatilities: finalVols,
                correlationMatrix: finalCorr,
                riskFreeRate: inputPayload.riskFreeRate,
                sources: {
                    expectedReturns: expectedReturns ? 'supplied' : preset ? 'preset' : 'history',
                    volatilities: volatilities ? 'supplied' : preset ? 'preset' : 'history',
                    correlationMatrix: correlationMatrix ? 'supplied' : preset ? 'preset' : 'history'
                },
                history: history && { source: 'Yahoo Finance', observations: history.sampleCount, from: history.from, to: history.to }
            }
        });
    } catch (error) {
        console.error("Quant Simulation Error:", error);
        res.status(500).json({ error: "The simulation engine could not complete this request." });
    } finally {
        res.locals.releaseQuantSlot();
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
