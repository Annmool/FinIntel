require('dotenv').config(); // MUST BE LINE 1
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const Sentiment = require('sentiment');
const cron = require('node-cron');
const Groq = require("groq-sdk");
const NodeCache = require('node-cache');

// --- Models ---
const Watchlist = require('./models/WatchList');
const Alert = require('./models/Alert');
const Portfolio = require('./models/Portfolio');

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

// Stock Data (Twelve Data) with Cache
app.get('/api/stock/:symbol', async (req, res) => {
    let rawSymbol = req.params.symbol.toUpperCase();
    let symbol = rawSymbol;
    let exchangeParam = '';

    if (rawSymbol.includes(':')) {
        const parts = rawSymbol.split(':');
        symbol = parts[0];
        exchangeParam = `&exchange=${parts[1]}`;
    } else if (rawSymbol.endsWith('.NS')) {
        symbol = rawSymbol.replace('.NS', '');
        exchangeParam = '&exchange=NSE';
    } else if (rawSymbol.endsWith('.BO')) {
        symbol = rawSymbol.replace('.BO', '');
        exchangeParam = '&exchange=BSE';
    }

    try {
        const url = `${TWELVE_DATA_URL}/time_series?symbol=${symbol}${exchangeParam}&interval=1day&apikey=${process.env.STOCK_API_KEY}`;
        const data = await fetchWithCache(url, `stock_${rawSymbol}`, 300);

        if (data && data.meta) {
            data.meta.symbol = rawSymbol; // Keep full symbol in response
        }
        res.json(data);
    } catch (e) {
        res.status(429).json({ error: "Twelve Data Limit (8/min) hit." });
    }
});

// Dual-API Search (Twelve Data with Finnhub Fallback)
app.get('/api/search/:query', async (req, res) => {
    const { query } = req.params;
    const cacheKey = `search_${query.toLowerCase()}`;
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const tdataRes = await axios.get(`${TWELVE_DATA_URL}/symbol_search?symbol=${query}&apikey=${process.env.STOCK_API_KEY}`);
        if (tdataRes.data.data && tdataRes.data.data.length > 0) {
            const formatted = tdataRes.data.data.slice(0, 5).map(s => ({
                symbol: `${s.symbol}:${s.exchange}`,
                instrument_name: `${s.instrument_name} (${s.country})`
            }));
            myCache.set(cacheKey, formatted, 3600);
            return res.json(formatted);
        }
        throw new Error("Limit");
    } catch (error) {
        try {
            const fhubRes = await axios.get(`${FINNHUB_URL}/search?q=${query}&token=${process.env.FINNHUB_API_KEY}`);
            const formatted = fhubRes.data.result.slice(0, 5).map(s => ({ symbol: s.symbol, instrument_name: s.description }));
            myCache.set(cacheKey, formatted, 3600);
            res.json(formatted);
        } catch (e) { res.json([]); }
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
        const url = `https://newsapi.org/v2/everything?q=stock+market+premarket+today&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWS_API_KEY}`;
        const data = await fetchWithCache(url, "market_briefing", 600);
        res.json(data.articles || []);
    } catch (e) { res.json([]); }
});

// News + Sentiment
app.get('/api/news/:symbol', async (req, res) => {
    try {
        let cleanSymbol = req.params.symbol.split(':')[0].replace('.NS', '').replace('.BO', '');
        const response = await axios.get(`https://newsapi.org/v2/everything?q=${cleanSymbol}+stock&language=en&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`);
        const articles = response.data.articles.map(a => ({ ...a, sentimentScore: sentiment.analyze(a.title || "").score }));
        res.json(articles);
    } catch (e) { res.json([]); }
});

// Fundamentals
app.get('/api/fundamentals/:symbol', async (req, res) => {
    let cleanSymbol = req.params.symbol.split(':')[0].replace('.NS', '').replace('.BO', '');
    const cacheKey = `fund_${cleanSymbol}`;
    const cached = myCache.get(cacheKey);
    if (cached) return res.json(cached);
    try {
        const [profileRes, metricRes] = await Promise.all([
            axios.get(`${FINNHUB_URL}/stock/profile2?symbol=${cleanSymbol}&token=${process.env.FINNHUB_API_KEY}`),
            axios.get(`${FINNHUB_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${process.env.FINNHUB_API_KEY}`)
        ]);
        const data = { profile: profileRes.data, metrics: metricRes.data.metric };
        myCache.set(cacheKey, data, 3600);
        res.json(data);
    } catch (e) { res.json({}); }
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