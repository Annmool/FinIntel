require('dotenv').config(); // MUST BE LINE 1
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const Sentiment = require('sentiment');
const cron = require('node-cron');
const Groq = require("groq-sdk");
const NodeCache = require('node-cache');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
try { yahooFinance._setOpts({ validation: { logErrors: false } }); } catch (e) {}

// --- Models ---
const Watchlist = require('./models/WatchList');
const Alert = require('./models/Alert');
const Portfolio = require('./models/Portfolio');
const VirtualAccount = require('./models/VirtualAccount');
const PaperPortfolio = require('./models/PaperPortfolio');

// --- Initialization ---
const app = express();
const sentiment = new Sentiment();
const myCache = new NodeCache({ stdTTL: 60 });
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

const TWELVE_DATA_URL = "https://api.twelvedata.com";
const FINNHUB_URL = "https://finnhub.io/api/v1";

app.use(cors({
    origin: ["http://localhost:3000", "https://finintel.pages.dev"], 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());

// --- 1. Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

// --- 2. Stability Helper (Cache Engine) ---
const fetchWithCache = async (url, cacheKey, ttl = 60) => {
    const cachedData = myCache.get(cacheKey);
    if (cachedData) return cachedData;

    try {
        const response = await axios.get(url);
        if (response.data.status === "error" || response.data.error) {
            throw new Error("Rate Limit reached");
        }
        myCache.set(cacheKey, response.data, ttl);
        return response.data;
    } catch (error) {
        throw error;
    }
};

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
    return {
        meta: { symbol: sym },
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
    } else if (rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO')) {
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

        let data;
        if (preferYahoo) {
            data = await fetchFromYahoo(rawSymbol);
        } else {
            try {
                const url = `${TWELVE_DATA_URL}/time_series?symbol=${symbol}${exchangeParam}&interval=1day&apikey=${process.env.STOCK_API_KEY}`;
                data = await fetchWithCache(url, `td_raw_${rawSymbol}`, 300);
                if (!isValidCandleData(data)) {
                    throw new Error("Twelve Data returned error or incomplete quotes");
                }
                if (data && data.meta) data.meta.symbol = rawSymbol;
            } catch (err) {
                // Fallback to Yahoo Finance if Twelve Data hits rate limit or errors
                console.log(`Twelve Data unavailable for ${symbol} (${err.message}). Falling back to Yahoo Finance.`);
                data = await fetchFromYahoo(symbol); 
                if (data && data.meta) data.meta.symbol = rawSymbol;
            }
        }

        if (isValidCandleData(data)) {
            myCache.set(cacheKey, data, 300);
        }
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
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
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
        
        if (formatted.length > 0) {
            myCache.set(cacheKey, formatted, 3600);
        }
        return res.json(formatted);
    } catch (error) {
        console.error("Search Error:", error.message);
        res.json([]);
    }
});

// High-Frequency Ticker Tape (Yahoo Finance with Finnhub Fallback)
app.get('/api/ticker-tape', async (req, res) => {
    const cacheKey = "global_ticker_tape";
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);
    try {
        const symbols = ["AAPL", "TSLA", "RELIANCE.NS", "TCS.NS", "MSFT", "AMZN", "GOOGL"];
        let data = [];
        try {
            const yQuotes = await yahooFinance.quote(symbols, {}, { validateResult: false });
            if (Array.isArray(yQuotes) && yQuotes.length > 0) {
                data = yQuotes.map(q => ({
                    symbol: q.symbol,
                    close: q.regularMarketPrice || 0,
                    percent_change: q.regularMarketChangePercent || 0
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

        if (data.length > 0) {
            myCache.set(cacheKey, data, 60);
        }
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
        const cached = myCache.get(cacheKey);
        if (cached) return res.json(cached);

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

        const headlines = newsList.map(n => n.title).join(". ");
        let aiPredictions = { higher: [], lower: [] };
        
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ 
                    role: "user", 
                    content: `Based on these news headlines: "${headlines}", predict 3 stocks that will go higher and 3 stocks that will go lower. Return ONLY a JSON object in this exact format: {"higher": [{"symbol": "TICKER", "reason": "short reason"}], "lower": [{"symbol": "TICKER", "reason": "short reason"}]}`
                }],
                model: "llama-3.1-8b-instant",
                response_format: { type: "json_object" }
            });
            aiPredictions = JSON.parse(chatCompletion.choices[0].message.content);
        } catch (err) {
            console.error("Groq Briefing Error:", err.message);
        }

        const finalData = {
            news: newsList.slice(0, 10),
            predictions: aiPredictions
        };

        myCache.set(cacheKey, finalData, 300);
        res.json(finalData);
    } catch (e) { 
        res.json({ news: [], predictions: { higher: [], lower: [] } }); 
    }
});

// News + Sentiment
app.get('/api/news/:symbol', async (req, res) => {
    try {
        let cleanSymbol = req.params.symbol.split(':')[0].replace('.NS', '').replace('.BO', '');
        const ySearch = await yahooFinance.search(cleanSymbol, {}, { validateResult: false });
        const articles = (ySearch.news || []).slice(0, 5).map(item => ({
            title: item.title,
            url: item.link,
            urlToImage: item.thumbnail?.resolutions?.[0]?.url || null,
            source: { name: item.publisher },
            publishedAt: item.providerPublishTime,
            sentimentScore: sentiment.analyze(item.title || "").score
        }));
        res.json(articles);
    } catch (e) { res.json([]); }
});

// Fundamentals
app.get('/api/fundamentals/:symbol', async (req, res) => {
    let rawSymbol = req.params.symbol.toUpperCase();
    let cleanSymbol = rawSymbol.split(':')[0].replace('.NS', '').replace('.BO', '');
    const isIndianStock = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO');
    
    const cacheKey = `fund_${rawSymbol}`;
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        let data = {};
        if (isIndianStock) {
            const summary = await yahooFinance.quoteSummary(rawSymbol, { modules: ['summaryDetail', 'defaultKeyStatistics'] }, { validateResult: false });
            data = {
                profile: { 
                    marketCapitalization: summary.summaryDetail?.marketCap ? summary.summaryDetail.marketCap / 1000000 : null 
                },
                metrics: { 
                    peBasicExclExtraTTM: summary.summaryDetail?.trailingPE || null,
                    '52WeekHigh': summary.summaryDetail?.fiftyTwoWeekHigh || null,
                    '52WeekLow': summary.summaryDetail?.fiftyTwoWeekLow || null
                }
            };
        } else {
            const [profileRes, metricRes] = await Promise.all([
                axios.get(`${FINNHUB_URL}/stock/profile2?symbol=${cleanSymbol}&token=${process.env.FINNHUB_API_KEY}`),
                axios.get(`${FINNHUB_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${process.env.FINNHUB_API_KEY}`)
            ]);
            data = { profile: profileRes.data, metrics: metricRes.data.metric };
        }
        myCache.set(cacheKey, data, 3600);
        res.json(data);
    } catch (e) { 
        console.error("Fundamentals Error:", e.message);
        res.json({}); 
    }
});

// --- 5. User-Specific Logic (Watchlist & Portfolio) ---
app.get('/api/watchlist/:userId', async (req, res) => {
    if (!req.params.userId) return res.json([]);
    const list = await Watchlist.find({ userId: req.params.userId });
    res.json(list);
});

app.post('/api/watchlist', async (req, res) => {
    const { symbol, userId } = req.body;
    if (!symbol || typeof symbol !== 'string' || !userId) {
        return res.status(400).json({ error: "Invalid symbol or userId" });
    }
    const cleanSym = symbol.trim().toUpperCase();
    const exists = await Watchlist.findOne({ symbol: cleanSym, userId });
    if (exists) return res.status(400).send("Exists");
    const newItem = new Watchlist({ symbol: cleanSym, userId });
    await newItem.save();
    res.json(newItem);
});

app.delete('/api/watchlist/:userId/:symbol', async (req, res) => {
    if (!req.params.symbol || !req.params.userId) return res.send("Deleted");
    await Watchlist.findOneAndDelete({ symbol: req.params.symbol.trim().toUpperCase(), userId: req.params.userId });
    res.send("Deleted");
});

app.get('/api/portfolio/:userId', async (req, res) => {
    if (!req.params.userId) return res.json([]);
    const holdings = await Portfolio.find({ userId: req.params.userId });
    res.json(holdings);
});

app.post('/api/portfolio', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    const parsedQty = parseFloat(qty);
    const parsedPrice = parseFloat(price);
    if (!userId || !symbol || typeof symbol !== 'string' || !Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: "Invalid portfolio parameters. Quantity and price must be positive numbers." });
    }
    const newHolding = new Portfolio({ userId, symbol: symbol.trim().toUpperCase(), qty: parsedQty, price: parsedPrice });
    await newHolding.save();
    res.json(newHolding);
});

app.delete('/api/portfolio/:id', async (req, res) => {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.send("Deleted");
});

// --- Forex FX Rate Engine (Yahoo Finance USDINR=X with Cache & Fallback) ---
async function getUsdInrRate() {
    const cached = myCache.get('USD_INR_RATE');
    if (cached && typeof cached === 'number' && cached > 0) return cached;

    try {
        const quote = await yahooFinance.quote('USDINR=X');
        const rate = quote?.regularMarketPrice;
        if (Number.isFinite(rate) && rate > 50 && rate < 150) {
            myCache.set('USD_INR_RATE', rate, 300); // Cache for 5 minutes
            return rate;
        }
    } catch (e) {
        console.warn("Could not fetch USDINR=X quote from Yahoo Finance:", e.message);
    }
    return 86.80; // High-precision current market baseline
}

// Forex Rate Endpoint
app.get('/api/forex/rate', async (req, res) => {
    try {
        const rate = await getUsdInrRate();
        res.json({ base: 'USD', target: 'INR', rate, timestamp: new Date().toISOString() });
    } catch (e) {
        res.json({ base: 'USD', target: 'INR', rate: 86.80, timestamp: new Date().toISOString() });
    }
});

// Paper Trading: Get Holdings
app.get('/api/paper-portfolio/:userId', async (req, res) => {
    const holdings = await PaperPortfolio.find({ userId: req.params.userId });
    res.json(holdings);
});

// Paper Trading: Get Balance
app.get('/api/virtual-account/:userId', async (req, res) => {
    let account = await VirtualAccount.findOne({ userId: req.params.userId });
    if (!account) {
        account = new VirtualAccount({ userId: req.params.userId, balance: 100000 });
        await account.save();
    }
    res.json(account);
});

// Paper Trading: Buy (Handles multi-currency normalized against USD balance)
app.post('/api/paper-portfolio/buy', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    const parsedQty = parseFloat(qty);
    const parsedPrice = parseFloat(price);

    if (!userId || !symbol || typeof symbol !== 'string' || !Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: "Invalid order parameters. Quantity and price must be positive numbers." });
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    const isIndian = cleanSymbol.endsWith('.NS') || cleanSymbol.endsWith('.BO');
    const fxRate = await getUsdInrRate();
    const totalCostNative = Number((parsedQty * parsedPrice).toFixed(2));
    // Normalize into USD virtual account balance
    const totalCostUsd = isIndian ? Number((totalCostNative / fxRate).toFixed(2)) : totalCostNative;

    let account = await VirtualAccount.findOne({ userId });
    if (!account) {
        account = new VirtualAccount({ userId, balance: 100000 });
        await account.save();
    }

    if (account.balance < totalCostUsd) {
        return res.status(400).json({ 
            error: `Insufficient virtual funds. Cost: $${totalCostUsd.toFixed(2)} USD${isIndian ? ` (₹${totalCostNative.toFixed(2)} at ₹${fxRate.toFixed(2)}/$)` : ''}, Available: $${account.balance.toFixed(2)}` 
        });
    }

    account.balance = Number((account.balance - totalCostUsd).toFixed(2));
    await account.save();

    let holding = await PaperPortfolio.findOne({ userId, symbol: cleanSymbol });
    if (holding) {
        const oldTotal = holding.qty * holding.price;
        holding.qty += parsedQty;
        holding.price = (oldTotal + totalCostNative) / holding.qty;
        await holding.save();
    } else {
        holding = new PaperPortfolio({ userId, symbol: cleanSymbol, qty: parsedQty, price: parsedPrice });
        await holding.save();
    }
    
    res.json({ holding, balance: account.balance, fxRate });
});

// Paper Trading: Sell (Handles multi-currency normalized against USD balance)
app.post('/api/paper-portfolio/sell', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    const parsedQty = parseFloat(qty);
    const parsedPrice = parseFloat(price);

    if (!userId || !symbol || typeof symbol !== 'string' || !Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: "Invalid order parameters. Quantity and price must be positive numbers." });
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    let holding = await PaperPortfolio.findOne({ userId, symbol: cleanSymbol });
    if (!holding || holding.qty < parsedQty) {
        return res.status(400).json({ error: "Not enough shares to sell" });
    }

    const isIndian = cleanSymbol.endsWith('.NS') || cleanSymbol.endsWith('.BO');
    const fxRate = await getUsdInrRate();
    const totalRevenueNative = Number((parsedQty * parsedPrice).toFixed(2));
    const totalRevenueUsd = isIndian ? Number((totalRevenueNative / fxRate).toFixed(2)) : totalRevenueNative;

    let account = await VirtualAccount.findOne({ userId });
    if (!account) {
        account = new VirtualAccount({ userId, balance: 100000 });
    }
    account.balance = Number((account.balance + totalRevenueUsd).toFixed(2));
    await account.save();

    holding.qty = Number((holding.qty - parsedQty).toFixed(4));
    if (holding.qty <= 0.0001) {
        await PaperPortfolio.findByIdAndDelete(holding._id);
        holding = null;
    } else {
        await holding.save();
    }

    res.json({ holding, balance: account.balance, fxRate });
});

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

function normalizeScreenerQuote(q) {
    const isIndian = q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO');
    return {
        symbol: q.symbol,
        shortName: q.shortName || q.longName || q.symbol,
        longName: q.longName || q.shortName || q.symbol,
        regularMarketPrice: Number.isFinite(q.regularMarketPrice) ? q.regularMarketPrice : null,
        regularMarketChangePercent: Number.isFinite(q.regularMarketChangePercent) ? q.regularMarketChangePercent : 0,
        regularMarketDayHigh: Number.isFinite(q.regularMarketDayHigh) ? q.regularMarketDayHigh : null,
        regularMarketDayLow: Number.isFinite(q.regularMarketDayLow) ? q.regularMarketDayLow : null,
        regularMarketVolume: Number.isFinite(q.regularMarketVolume) ? q.regularMarketVolume : 0,
        marketCap: Number.isFinite(q.marketCap) ? q.marketCap : null,
        trailingPE: Number.isFinite(q.trailingPE) ? q.trailingPE : null,
        currency: q.currency || (isIndian ? 'INR' : 'USD')
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
        const cached = myCache.get(cacheKey);
        if (cached && cached.length > 0) return res.json(cached);

        let quotes = [];

        // For standard types, attempt Yahoo's predefined screener first during live market hours
        if (['day_gainers', 'day_losers', 'most_actives', 'undervalued_large_caps'].includes(type)) {
            try {
                const yfResult = await yahooFinance.screener(type, { count: 20 }, { validateResult: false });
                if (Array.isArray(yfResult?.quotes) && yfResult.quotes.length > 0) {
                    quotes = yfResult.quotes.map(normalizeScreenerQuote);
                }
            } catch (yfErr) {
                console.log(`Predefined screener unavailable for ${type} (${yfErr.message}). Using universe engine.`);
            }
        }

        // Resilient Fallback Engine: If predefined screener returned empty (e.g. weekend, off-hours, or custom filter)
        if (quotes.length === 0) {
            try {
                const rawQuotes = await yahooFinance.quote(SCREENER_UNIVERSE, {}, { validateResult: false });
                const validQuotes = (Array.isArray(rawQuotes) ? rawQuotes : [])
                    .filter(q => q && q.symbol && Number.isFinite(q.regularMarketPrice))
                    .map(normalizeScreenerQuote);

                if (type === 'day_gainers') {
                    quotes = [...validQuotes]
                        .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
                        .slice(0, 15);
                } else if (type === 'day_losers') {
                    quotes = [...validQuotes]
                        .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
                        .slice(0, 15);
                } else if (type === 'most_actives') {
                    quotes = [...validQuotes]
                        .sort((a, b) => b.regularMarketVolume - a.regularMarketVolume)
                        .slice(0, 15);
                } else if (type === 'undervalued_large_caps') {
                    quotes = [...validQuotes]
                        .filter(q => (q.marketCap || 0) >= 40e9)
                        .sort((a, b) => (a.trailingPE || 999) - (b.trailingPE || 999))
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
            } catch (universeErr) {
                console.error("Universe screener calculation error:", universeErr.message);
            }
        }

        if (quotes.length > 0) {
            myCache.set(cacheKey, quotes, 120);
        }
        res.json(quotes);
    } catch (e) {
        console.error(`Screener provider error (${req.params.type}):`, e.message);
        res.status(500).json({ error: e.message || 'Market data feed temporarily unavailable.' });
    }
});

app.get('/api/alerts/:userId', async (req, res) => {
    if (!req.params.userId) return res.json([]);
    const alerts = await Alert.find({ userId: req.params.userId });
    res.json(alerts);
});

app.post('/api/alerts', async (req, res) => {
    const { userId, symbol, targetPrice, condition } = req.body;
    const parsedTarget = parseFloat(targetPrice);
    if (!userId || !symbol || typeof symbol !== 'string' || !Number.isFinite(parsedTarget) || parsedTarget <= 0 || !['ABOVE', 'BELOW'].includes(condition)) {
        return res.status(400).json({ error: "Invalid alert parameters. Provide a valid symbol, target price, and condition (ABOVE/BELOW)." });
    }
    const cleanSym = symbol.trim().toUpperCase();
    const newAlert = new Alert({ userId, symbol: cleanSym, targetPrice: parsedTarget, condition, triggered: false });
    await newAlert.save();
    res.json(newAlert);
});

app.delete('/api/alerts/:id', async (req, res) => {
    if (req.params.id) {
        await Alert.findByIdAndDelete(req.params.id);
    }
    res.send("Deleted");
});

// --- 6. AI Analyst ---
app.post('/api/ai-analysis', async (req, res) => {
    try {
        const { symbol, price, rsi, sentiment, news } = req.body;
        const newsItems = Array.isArray(news) ? news : [];
        const newsSummary = newsItems.slice(0, 2).map(n => n?.title || '').filter(Boolean).join(". ");
        
        let analysisText = "";
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: `Analyze ${symbol}. Price: $${price}, RSI: ${rsi}, Sentiment: ${sentiment}. News: ${newsSummary}. 3 sentences technical and market verdict.` }],
                model: "llama-3.1-8b-instant",
            });
            analysisText = chatCompletion.choices[0].message.content;
        } catch (groqErr) {
            console.error("Groq API error:", groqErr.message);
            const rsiNum = parseFloat(rsi) || 50;
            const rsiVerdict = rsiNum > 65 ? "overbought momentum, signaling potential consolidation" : rsiNum < 35 ? "oversold conditions, indicating potential mean-reversion buying interest" : "balanced neutral momentum";
            analysisText = `${symbol} is trading at $${price} within ${rsiVerdict} (RSI: ${rsi || '50.0'}). Current market sentiment stands at ${sentiment || 'Neutral'}. Quantitative risk models recommend confirming directional breakout with volume before placing order execution.`;
        }
        res.json({ analysis: analysisText });
    } catch (error) { 
        res.status(500).json({ error: "AI Error", analysis: "Technical indicators show neutral price consolidation. Monitor moving average alignment." }); 
    }
});

// --- 7. C++ High-Performance Quantitative Computing Core ---
const { PRESETS, runCppQuantEngine, computeAssetParameters } = require('./quant_service');

app.get('/api/quant/presets', (req, res) => {
    res.json(PRESETS);
});

app.post('/api/quant/simulate', async (req, res) => {
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
            correlationMatrix
        } = req.body;

        if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 50 || symbols.some(s => typeof s !== 'string' || !/^[A-Z0-9.^=_-]{1,24}$/i.test(s.trim()))) {
            return res.status(400).json({ error: 'Provide between 1 and 50 valid ticker symbols.' });
        }
        if (!Array.isArray(weights) || weights.length !== symbols.length || weights.some(w => !Number.isFinite(Number(w)) || Number(w) < 0 || Number(w) > 1)) {
            return res.status(400).json({ error: 'Weights must contain one value from 0 to 1 for each symbol.' });
        }
        const weightTotal = weights.reduce((sum, weight) => sum + Number(weight), 0);
        if (Math.abs(weightTotal - 1) > 0.02) {
            return res.status(400).json({ error: `Portfolio weights must total 100%; received ${(weightTotal * 100).toFixed(2)}%.` });
        }
        const normalizedWeights = weights.map(w => Number((Number(w) / weightTotal).toFixed(6)));

        if (!Number.isFinite(Number(initialPortfolioValue)) || Number(initialPortfolioValue) <= 0) {
            return res.status(400).json({ error: 'Initial portfolio value must be a positive number.' });
        }
        if (!Number.isFinite(Number(riskFreeRate)) || Number(riskFreeRate) < 0 || Number(riskFreeRate) > 1) {
            return res.status(400).json({ error: 'Risk-free rate must be between 0 and 1.' });
        }
        if (expectedReturns !== undefined && (!Array.isArray(expectedReturns) || expectedReturns.length !== symbols.length || expectedReturns.some(value => !Number.isFinite(Number(value)) || Number(value) < -2 || Number(value) > 2))) {
            return res.status(400).json({ error: 'Expected returns must contain one finite annual value between -2 and 2 for each symbol.' });
        }
        if (volatilities !== undefined && (!Array.isArray(volatilities) || volatilities.length !== symbols.length || volatilities.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 3))) {
            return res.status(400).json({ error: 'Volatilities must contain one positive annual value no greater than 3 for each symbol.' });
        }
        if (correlationMatrix !== undefined && (!Array.isArray(correlationMatrix) || correlationMatrix.length !== symbols.length || correlationMatrix.some((row, i) => !Array.isArray(row) || row.length !== symbols.length || row.some((value, j) => !Number.isFinite(Number(value)) || Number(value) < -1 || Number(value) > 1 || (i === j && Math.abs(Number(value) - 1) > 0.0001))))) {
            return res.status(400).json({ error: 'Correlation matrix must be square, finite, bounded from -1 to 1, and have ones on its diagonal.' });
        }
        if (correlationMatrix !== undefined && correlationMatrix.some((row, i) => row.some((value, j) => Math.abs(Number(value) - Number(correlationMatrix[j][i])) > 0.0001))) {
            return res.status(400).json({ error: 'Correlation matrix must be symmetric.' });
        }

        let finalReturns = expectedReturns;
        let finalVols = volatilities;
        let finalCorr = correlationMatrix;

        // If returns/vols are not provided, check known presets or fetch historical data in parallel
        if (!finalReturns || !finalVols || !finalCorr) {
            // Check if matches an institutional preset first (instant 0ms resolution)
            const matchedPreset = Object.values(PRESETS).find(p => 
                p.symbols.length === symbols.length && 
                p.symbols.every((s, i) => s.toUpperCase() === symbols[i].toUpperCase())
            );

            if (matchedPreset && (!finalReturns || !finalVols)) {
                finalReturns = finalReturns || matchedPreset.expectedReturns;
                finalVols = finalVols || matchedPreset.volatilities;
            }

            const historyMap = {};
            await Promise.all(symbols.map(async (sym) => {
                try {
                    const cleanSym = sym.toUpperCase();
                    const quantCacheKey = `quant_hist_${cleanSym}`;
                    let cachedPrices = myCache.get(quantCacheKey);

                    if (!cachedPrices) {
                        const mainStock = myCache.get(`stock_${cleanSym}`);
                        if (isValidCandleData(mainStock)) {
                            cachedPrices = mainStock.values;
                        } else {
                            try {
                                const yfData = await fetchFromYahoo(cleanSym);
                                if (isValidCandleData(yfData)) {
                                    myCache.set(`stock_${cleanSym}`, yfData, 300);
                                    cachedPrices = yfData.values;
                                }
                            } catch (_) {}
                        }

                        if (cachedPrices) {
                            myCache.set(quantCacheKey, cachedPrices, 3600);
                        }
                    }

                    if (cachedPrices) {
                        historyMap[sym] = cachedPrices;
                    }
                } catch (err) {
                    // Fall back gracefully
                }
            }));

            const computed = computeAssetParameters(historyMap, symbols);
            finalReturns = finalReturns || computed.expectedReturns;
            finalVols = finalVols || computed.volatilities;
            finalCorr = finalCorr || computed.correlationMatrix;
        }

        const inputPayload = {
            symbols,
            weights: normalizedWeights,
            numSimulations: Math.min(200000, Math.max(1000, parseInt(numSimulations) || 50000)),
            timeHorizonDays: Math.min(365, Math.max(10, parseInt(timeHorizonDays) || 90)),
            initialPortfolioValue: parseFloat(initialPortfolioValue) || 100000,
            riskFreeRate: parseFloat(riskFreeRate) || 0.045,
            expectedReturns: finalReturns,
            volatilities: finalVols,
            correlationMatrix: finalCorr
        };

        // Run C++ Engine
        const cppResult = await runCppQuantEngine(inputPayload);

        res.json({
            success: true,
            engineMode: 'cloud',
            cpp: cppResult,
        });
    } catch (error) {
        console.error("Quant Simulation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
