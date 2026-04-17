import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Moon, Sun, LogOut, Star, ArrowLeft, TrendingUp, BarChart3, Brain, Plus, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import StockChart from './StockChart';
import TickerTape from './TickerTape';
import { calculateRSI } from './utils/indicators';
import { auth, provider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged } from "firebase/auth";

function App() {
  const [user, setUser] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [briefing, setBriefing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [appError, setAppError] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchWatchlist(u.uid);
        fetchPortfolio(u.uid);
        fetchAlerts(u.uid);
      } else {
        setWatchlist([]);
        setPortfolio([]);
        setAlerts([]);
      }
    });
    axios.get('https://finintel-qj46.onrender.com/api/market-briefing').then(res => setBriefing(res.data));
    return () => unsubscribe();
  }, [theme]);

  // Autocomplete Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      if (symbol.length > 1 && !data) {
        axios.get(`https://finintel-qj46.onrender.com/api/search/${symbol}`).then(res => setSuggestions(res.data));
      } else { setSuggestions([]); }
    }, 500);
    return () => clearTimeout(timer);
  }, [symbol, data]);

  const fetchWatchlist = async (uid) => {
    const res = await axios.get(`https://finintel-qj46.onrender.com/api/watchlist/${uid}`);
    setWatchlist(res.data);
  };

  const fetchPortfolio = async (uid) => {
    const res = await axios.get(`https://finintel-qj46.onrender.com/api/portfolio/${uid}`);
    setPortfolio(res.data);
  };

  const fetchAlerts = async (uid) => {
    const res = await axios.get(`https://finintel-qj46.onrender.com/api/alerts/${uid}`);
    setAlerts(res.data);
  };

  const fetchStockData = async (s) => {
    const sym = s || symbol;
    if (!sym) return;
    setSuggestions([]);
    setSymbol(sym);
    setLoading(true);
    setData(null);
    setAppError('');
    setAiAnalysis("");
    try {
      const [stockRes, newsRes, fundRes] = await Promise.all([
        axios.get(`https://finintel-qj46.onrender.com/api/stock/${sym}`),
        axios.get(`https://finintel-qj46.onrender.com/api/news/${sym}`),
        axios.get(`https://finintel-qj46.onrender.com/api/fundamentals/${sym}`)
      ]);
      
      if (stockRes.data.status === 'error' || !stockRes.data.values || stockRes.data.values.length === 0) {
        setAppError("Invalid symbol or API rate limit reached. Please wait a minute or try another ticker.");
      } else {
        setData({ ...stockRes.data, fundamentals: fundRes.data });
      }
      setNews(newsRes.data || []);
    } catch (e) { 
      setAppError("Network error or API limit reached. Please try again later."); 
    }
    setLoading(false);
  };

  const handleProtectedAction = async (type) => {
    let currUser = user;
    if (!currUser) {
        try {
            const result = await signInWithPopup(auth, provider);
            currUser = result.user;
            setUser(currUser);
        } catch (error) { return; }
    }
    if (!currUser) return;

    if (type === 'WATCH') {
        const existingItem = watchlist.find(item => item.symbol === data?.meta?.symbol);
        if (existingItem) {
            try {
                await axios.delete(`https://finintel-qj46.onrender.com/api/watchlist/${currUser.uid}/${data?.meta?.symbol}`);
                fetchWatchlist(currUser.uid);
                showToast("Removed from Watchlist");
            } catch (e) { showToast("Error removing from Watchlist", "error"); }
        } else {
            try {
                await axios.post('https://finintel-qj46.onrender.com/api/watchlist', { symbol: data?.meta?.symbol, userId: currUser.uid });
                fetchWatchlist(currUser.uid);
                showToast("Added to Watchlist");
            } catch (e) { showToast("Error adding to Watchlist", "error"); }
        }
    } else if (type === 'PORTFOLIO') {
        const qty = prompt(`Shares of ${data?.meta?.symbol}?`);
        if (qty && !isNaN(qty)) {
            await axios.post('https://finintel-qj46.onrender.com/api/portfolio', { userId: currUser.uid, symbol: data?.meta?.symbol, qty: parseFloat(qty), price: data?.values[0].close });
            fetchPortfolio(currUser.uid);
            showToast("Added to Portfolio");
        }
    } else if (type === 'ALERT') {
        const targetPriceStr = prompt(`Current price of ${data?.meta?.symbol} is $${parseFloat(data?.values[0].close).toFixed(2)}.\nEnter target price to trigger alert:`);
        if (targetPriceStr && !isNaN(targetPriceStr)) {
            const targetPrice = parseFloat(targetPriceStr);
            const currentPrice = parseFloat(data?.values[0].close);
            const condition = targetPrice > currentPrice ? 'ABOVE' : 'BELOW';
            await axios.post('https://finintel-qj46.onrender.com/api/alerts', { userId: currUser.uid, symbol: data?.meta?.symbol, targetPrice, condition });
            fetchAlerts(currUser.uid);
            showToast(`Alert set for $${targetPrice}`);
        }
    }
  };

  const getAIInsight = async () => {
    setAiLoading(true);
    try {
      const res = await axios.post('https://finintel-qj46.onrender.com/api/ai-analysis', {
        symbol: data?.meta?.symbol, price: data?.values[0].close,
        rsi: calculateRSI(data.values), sentiment: avgSent > 0 ? "Bullish" : "Bearish", news: news
      });
      setAiAnalysis(res.data.analysis);
    } catch (e) { setAiAnalysis("AI Error."); }
    setAiLoading(false);
  };

  const rsiScore = data ? calculateRSI(data.values) : null;
  const avgSent = news.length > 0 ? news.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / news.length : 0;
  const getVerdict = (rsi) => {
    const v = parseFloat(rsi);
    if (v < 35) return { label: "STRONG BUY", color: "var(--success)" };
    if (v > 65) return { label: "STRONG SELL", color: "var(--danger)" };
    return { label: "HOLD", color: "var(--warning)" };
  };
  const verdict = rsiScore ? getVerdict(rsiScore) : { label: "HOLD", color: "var(--text-tertiary)" };

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <TickerTape />
      <div className="dashboard-container">
        <aside className="sidebar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
            <h2 
              className="gradient-text" 
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.8rem', letterSpacing: '-0.02em', cursor: 'pointer' }}
              onClick={() => { setData(null); setSymbol(''); }}
              title="Return to Dashboard"
            >
              <img src="/favicon.svg" alt="FinIntel Logo" style={{ width: '28px', height: '28px' }} />
              FinIntel
            </h2>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              className="btn-outline" 
              style={{ padding: '8px', borderRadius: '50%' }}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={user.photoURL} alt="User avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-primary)' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>{user.displayName.split(' ')[0]}</span>
              </div>
              <button onClick={() => signOut(auth)} className="btn-outline" style={{ padding: '6px', border: 'none', color: 'var(--text-secondary)' }} title="Sign Out">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={() => handleProtectedAction()} className="btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
              Sign In to Save Data
            </button>
          )}
          
          <div className="sidebar-section-title">
            <span>Watchlist</span>
            <span className="badge neutral">{watchlist.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {watchlist.map((item) => (
              <div key={item._id} className="list-item" onClick={() => fetchStockData(item.symbol)}>
                <span style={{ fontWeight: '600', color: 'var(--warning)' }}>{item.symbol}</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Star size={14} color="var(--warning)" fill="var(--warning)" />
                  <button onClick={async (e) => { e.stopPropagation(); await axios.delete(`https://finintel-qj46.onrender.com/api/watchlist/${user.uid}/${item.symbol}`); fetchWatchlist(user.uid); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>X</button>
                </div>
              </div>
            ))}
            {watchlist.length === 0 && <span className="text-muted text-small">No items saved</span>}
          </div>

          <div className="sidebar-section-title">
            <span>Portfolio</span>
            <span className="badge neutral">{portfolio.length}</span>
          </div>
          {portfolio.length > 0 && (
            <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--accent-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Invested</span>
              <span style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--accent)' }}>
                ${portfolio.reduce((acc, p) => acc + (p.qty * p.price), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {portfolio.map((p) => (
              <div key={p._id} className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: '600', color: 'var(--accent)' }}>{p.symbol}</span>
                  <span className="font-mono">{p.qty} shrs</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '4px' }}>
                  <span className="text-muted text-small">Entry: ${p.price ? parseFloat(p.price).toFixed(2) : '--'}</span>
                  <button onClick={async () => { await axios.delete(`https://finintel-qj46.onrender.com/api/portfolio/${p._id}`); fetchPortfolio(user.uid); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>Delete</button>
                </div>
              </div>
            ))}
            {portfolio.length === 0 && <span className="text-muted text-small">No holdings</span>}
          </div>

          <div className="sidebar-section-title">
            <span>Price Alerts</span>
            <span className="badge neutral">{alerts.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {alerts.map((a) => (
              <div key={a._id} className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: '600', color: 'var(--accent)' }}>{a.symbol}</span>
                  <span className={`badge ${a.triggered ? 'positive' : 'neutral'}`}>{a.triggered ? 'Triggered' : 'Active'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '4px' }}>
                  <span className="text-muted text-small">{a.condition} ${a.targetPrice}</span>
                  <button onClick={async () => { await axios.delete(`https://finintel-qj46.onrender.com/api/alerts/${a._id}`); fetchAlerts(user.uid); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>Delete</button>
                </div>
              </div>
            ))}
            {alerts.length === 0 && <span className="text-muted text-small">No active alerts</span>}
          </div>
        </aside>

        <main className="main-content">
          <div style={{ position: 'relative', display: 'flex', gap: '12px', marginBottom: '32px', maxWidth: '600px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input 
                className="input-field" 
                placeholder="Search symbol (e.g., AAPL, TSLA)..." 
                value={symbol} 
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setData(null); setAppError(''); }} 
                onKeyPress={(e) => e.key === 'Enter' && fetchStockData()} 
              />
            </div>
            <button className="btn-primary" onClick={() => fetchStockData()} disabled={loading}>
              {loading ? <div className="mini-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}></div> : "Analyze"}
            </button>
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-dropdown">
                  {suggestions.map((s, i) => (
                    <div key={i} className="suggestion-item" onClick={() => { setSymbol(s.symbol); fetchStockData(s.symbol); }}>
                      <span style={{ fontWeight: '600' }}>{s.symbol}</span>
                      <span className="text-muted text-small" style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.instrument_name}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {appError && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', padding: '16px', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertCircle size={20} />
                {appError}
              </motion.div>
            )}
            {!data && !loading && !appError ? (
                <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Morning Market Briefing
                  </h3>
                  {briefing.length > 0 && (
                    <div className="hero-grid">
                      {briefing.slice(0, 2).map((n, i) => (
                        <div key={`hero-${i}`} style={{ position: 'relative', borderRadius: 'var(--radius-xl)', overflow: 'hidden', height: '300px', border: '1px solid var(--border-primary)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }} onClick={() => window.open(n.url, '_blank')}>
                          {n.urlToImage ? (
                            <img src={n.urlToImage} alt={n.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: 'var(--bg-surface-elevated)' }} />
                          )}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px', background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }}>
                            <span style={{ color: '#60a5fa', fontWeight: '700', fontSize: '0.85rem', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{n.source?.name || 'News'}</span>
                            <h4 style={{ color: '#ffffff', margin: 0, fontSize: '1.25rem', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{n.title}</h4>
                            <span style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: '12px', display: 'block' }}>{new Date(n.publishedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="news-grid">
                    {briefing.slice(2).map((n, i) => (
                      <div key={i} className="news-card">
                        <span className="text-muted text-small" style={{ display: 'block', marginBottom: '8px' }}>
                          {new Date(n.publishedAt).toLocaleDateString()}
                        </span>
                        <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                        <span className="text-muted text-small" style={{ display: 'block', marginTop: '12px' }}>{n.source?.name}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
            ) : loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <div className="loader"></div>
              </div>
            ) : data && (
              <motion.div key="data" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                <button onClick={() => setData(null)} className="btn-outline" style={{ border: 'none', padding: '0', marginBottom: '24px', color: 'var(--text-secondary)' }}>
                  <ArrowLeft size={16} /> Back to Dashboard
                </button>
                
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <h1 style={{ fontSize: '2.5rem', display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                        {data.meta.symbol}
                        <span className="font-mono" style={{ color: 'var(--text-primary)', fontSize: '2rem' }}>
                          ${parseFloat(data.values[0].close).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(() => {
                        const isWatching = data ? watchlist.some(item => item.symbol === data.meta.symbol) : false;
                        return (
                          <button 
                            onClick={() => handleProtectedAction('WATCH')} 
                            className="btn-outline"
                            style={isWatching ? { borderColor: 'var(--warning)', color: 'var(--warning)' } : {}}
                          >
                            <Star size={16} fill={isWatching ? "var(--warning)" : "none"} color={isWatching ? "var(--warning)" : "currentColor"} /> 
                            {isWatching ? "Watching" : "Watch"}
                          </button>
                        );
                      })()}
                      <button onClick={() => handleProtectedAction('ALERT')} className="btn-outline">
                        <Bell size={16} /> Alert
                      </button>
                      <button onClick={() => handleProtectedAction('PORTFOLIO')} className="btn-primary">
                        <Plus size={16} /> Portfolio
                      </button>
                    </div>
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span className="metric-label"><TrendingUp size={16} /> RSI (14)</span>
                      <span className="metric-value font-mono">{rsiScore}</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label"><BarChart3 size={16} /> Sentiment</span>
                      <span className="metric-value" style={{ color: avgSent >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {avgSent >= 0 ? "Bullish" : "Bearish"}
                      </span>
                    </div>
                    <div className="metric-card" style={{ borderColor: verdict.color }}>
                      <span className="metric-label"><Brain size={16} /> AI Signal</span>
                      <span className="metric-value" style={{ color: verdict.color }}>{verdict.label}</span>
                    </div>
                    {data.fundamentals?.profile?.marketCapitalization && (
                      <div className="metric-card">
                        <span className="metric-label">Market Cap</span>
                        <span className="metric-value">${(data.fundamentals.profile.marketCapitalization / 1000).toFixed(2)}B</span>
                      </div>
                    )}
                    {data.fundamentals?.metrics?.['peBasicExclExtraTTM'] && (
                      <div className="metric-card">
                        <span className="metric-label">P/E Ratio</span>
                        <span className="metric-value">{data.fundamentals.metrics['peBasicExclExtraTTM'].toFixed(2)}</span>
                      </div>
                    )}
                    {data.fundamentals?.metrics?.['52WeekHigh'] && (
                      <div className="metric-card">
                        <span className="metric-label">52W High/Low</span>
                        <span className="metric-value">${data.fundamentals.metrics['52WeekHigh'].toFixed(2)} / ${data.fundamentals.metrics['52WeekLow'].toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="card ai-insight">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
                        <Brain size={20} color="var(--purple)" /> 
                        AI Analyst Insight
                      </h4>
                      <button onClick={getAIInsight} className="btn-primary" style={{ background: 'var(--purple)', opacity: aiLoading ? 0.7 : 1 }} disabled={aiLoading}>
                        {aiLoading ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="mini-spinner"></div> Analyzing...
                          </span>
                        ) : "Generate Deep Dive"}
                      </button>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                      {aiAnalysis || "Click Generate Deep Dive to get an AI-powered summary of current technicals and sentiment."}
                    </p>
                  </div>

                  <StockChart data={data.values} theme={theme} />
                </div>

                <div className="card">
                  <h3 style={{ marginBottom: '20px' }}>Intelligence Feed: {data.meta.symbol}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {news.map((n, i) => (
                      <div key={i} style={{ paddingBottom: '16px', borderBottom: i === news.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                        <a href={n.url} target="_blank" rel="noreferrer" style={{ fontWeight: '600', fontSize: '1.05rem', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                          {n.title}
                        </a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="text-muted text-small">{n.source?.name || "News Source"}</span>
                          <span className={`badge ${n.sentimentScore > 0 ? 'positive' : n.sentimentScore < 0 ? 'negative' : 'neutral'}`}>
                            Sentiment: {n.sentimentScore > 0 ? "Positive" : n.sentimentScore < 0 ? "Negative" : "Neutral"}
                          </span>
                        </div>
                      </div>
                    ))}
                    {news.length === 0 && <span className="text-muted">No recent news found.</span>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <footer style={{ marginTop: 'auto', paddingTop: '32px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            <p style={{ margin: '0 0 8px 0' }}>&copy; {new Date().getFullYear()} FinIntel. All Rights Reserved.</p>
            <p style={{ margin: 0 }}>
              Designed & Developed by <span style={{ color: 'var(--accent)', fontWeight: '600', letterSpacing: '0.5px' }}>Anmol</span>
            </p>
          </footer>
        </main>
      </div>

      <AnimatePresence>
        {toast.show && (
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} color="var(--success)" /> : <AlertCircle size={20} color="var(--danger)" />}
            {toast.message}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
