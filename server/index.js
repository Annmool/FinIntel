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

// --- 3. Automated Cron Job for Price Alerts ---
cron.schedule('*/5 * * * *', async () => {
    try {
        const activeAlerts = await Alert.find({ triggered: false });
        for (const alert of activeAlerts) {
            let symbol = alert.symbol;
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
            const currentPrice = parseFloat(res.data.price);
            let isHit = (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
                (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice);
            if (isHit) {
                alert.triggered = true;
                await alert.save();
                console.log(`🔔 Alert Triggered: ${alert.symbol}`);
            }
        }
    } catch (e) { console.error("Alert Cron Error"); }
});

// --- 4. Main API Routes ---

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

    try {
        const cacheKey = `stock_${rawSymbol}`;
        const cached = myCache.get(cacheKey);
        if (cached) return res.json(cached);

        let data;
        if (preferYahoo) {
            data = await fetchFromYahoo(rawSymbol);
        } else {
            try {
                const url = `${TWELVE_DATA_URL}/time_series?symbol=${symbol}${exchangeParam}&interval=1day&apikey=${process.env.STOCK_API_KEY}`;
                data = await fetchWithCache(url, cacheKey, 300);
                if (data && data.meta) data.meta.symbol = rawSymbol;
            } catch (err) {
                // Fallback to Yahoo Finance if Twelve Data hits rate limit
                data = await fetchFromYahoo(symbol); 
                data.meta.symbol = rawSymbol;
            }
        }

        myCache.set(cacheKey, data, 300);
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

// High-Frequency Ticker Tape (Finnhub)
app.get('/api/ticker-tape', async (req, res) => {
    const cacheKey = "global_ticker_tape";
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);
    try {
        const symbols = ["AAPL", "TSLA", "RELIANCE.NS", "TCS.NS", "MSFT", "AMZN", "GOOGL"];
        const requests = symbols.map(s => axios.get(`${FINNHUB_URL}/quote?symbol=${s}&token=${process.env.FINNHUB_API_KEY}`));
        const responses = await Promise.allSettled(requests);
        const data = responses
            .map((r, i) => {
                if (r.status === 'fulfilled' && r.value.data && r.value.data.c) {
                    return { symbol: symbols[i], close: r.value.data.c, percent_change: r.value.data.dp };
                }
                return null;
            })
            .filter(item => item !== null && item.close !== 0);

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
                model: "llama-3.3-70b-versatile",
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
    const list = await Watchlist.find({ userId: req.params.userId });
    res.json(list);
});

app.post('/api/watchlist', async (req, res) => {
    const { symbol, userId } = req.body;
    const exists = await Watchlist.findOne({ symbol: symbol.toUpperCase(), userId });
    if (exists) return res.status(400).send("Exists");
    const newItem = new Watchlist({ symbol: symbol.toUpperCase(), userId });
    await newItem.save();
    res.json(newItem);
});

app.delete('/api/watchlist/:userId/:symbol', async (req, res) => {
    await Watchlist.findOneAndDelete({ symbol: req.params.symbol.toUpperCase(), userId: req.params.userId });
    res.send("Deleted");
});

app.get('/api/portfolio/:userId', async (req, res) => {
    const holdings = await Portfolio.find({ userId: req.params.userId });
    res.json(holdings);
});

app.post('/api/portfolio', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    const newHolding = new Portfolio({ userId, symbol: symbol.toUpperCase(), qty, price });
    await newHolding.save();
    res.json(newHolding);
});

app.delete('/api/portfolio/:id', async (req, res) => {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.send("Deleted");
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

// Paper Trading: Buy
app.post('/api/paper-portfolio/buy', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    const totalCost = qty * price;

    let account = await VirtualAccount.findOne({ userId });
    if (!account) {
        account = new VirtualAccount({ userId, balance: 100000 });
        await account.save();
    }

    if (account.balance < totalCost) {
        return res.status(400).json({ error: "Insufficient virtual funds" });
    }

    account.balance -= totalCost;
    await account.save();

    let holding = await PaperPortfolio.findOne({ userId, symbol: symbol.toUpperCase() });
    if (holding) {
        const oldTotal = holding.qty * holding.price;
        holding.qty += qty;
        holding.price = (oldTotal + totalCost) / holding.qty;
        await holding.save();
    } else {
        holding = new PaperPortfolio({ userId, symbol: symbol.toUpperCase(), qty, price });
        await holding.save();
    }
    
    res.json({ holding, balance: account.balance });
});

// Paper Trading: Sell
app.post('/api/paper-portfolio/sell', async (req, res) => {
    const { userId, symbol, qty, price } = req.body;
    
    let holding = await PaperPortfolio.findOne({ userId, symbol: symbol.toUpperCase() });
    if (!holding || holding.qty < qty) {
        return res.status(400).json({ error: "Not enough shares to sell" });
    }

    const totalRevenue = qty * price;
    let account = await VirtualAccount.findOne({ userId });
    account.balance += totalRevenue;
    await account.save();

    holding.qty -= qty;
    if (holding.qty === 0) {
        await PaperPortfolio.findByIdAndDelete(holding._id);
        holding = null;
    } else {
        await holding.save();
    }

    res.json({ holding, balance: account.balance });
});

app.delete('/api/portfolio/:id', async (req, res) => {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.send("Deleted");
});

// Screener Endpoint
app.get('/api/screener/:type', async (req, res) => {
    try {
        const type = req.params.type; 
        const result = await yahooFinance.screener({ scrIds: type, count: 15 }, undefined, { validateResult: false });
        res.json(result.quotes || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/alerts/:userId', async (req, res) => {
    const alerts = await Alert.find({ userId: req.params.userId });
    res.json(alerts);
});

app.post('/api/alerts', async (req, res) => {
    const { userId, symbol, targetPrice, condition } = req.body;
    const newAlert = new Alert({ userId, symbol: symbol.toUpperCase(), targetPrice, condition, triggered: false });
    await newAlert.save();
    res.json(newAlert);
});

app.delete('/api/alerts/:id', async (req, res) => {
    await Alert.findByIdAndDelete(req.params.id);
    res.send("Deleted");
});

// --- 6. AI Analyst ---
app.post('/api/ai-analysis', async (req, res) => {
    try {
        const { symbol, price, rsi, sentiment, news } = req.body;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: `Analyze ${symbol}. Price: $${price}, RSI: ${rsi}, Sentiment: ${sentiment}. News: ${news.map(n => n.title).slice(0, 2)}. 3 sentences verdict.` }],
            model: "llama-3.3-70b-versatile",
        });
        res.json({ analysis: chatCompletion.choices[0].message.content });
    } catch (error) { res.status(500).send("AI Error"); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));