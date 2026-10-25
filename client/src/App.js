import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search,
  Moon,
  Sun,
  LogOut,
  Star,
  ArrowLeft,
  TrendingUp,
  BarChart3,
  Brain,
  Plus,
  Bell,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  Download,
  BookOpen,
  Activity,
  Cpu,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  PieChart,
  Newspaper
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Academy from './Academy';
import Screener from './Screener';
import StockChart from './StockChart';
import TickerTape from './TickerTape';
import QuantLab from './QuantLab';
import { calculateRSI } from './utils/indicators';
import { auth, provider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import { API_URL } from './apiConfig';
const UPTIMEROBOT_STATUS_URL = 'https://dashboard.uptimerobot.com/monitors/803125214';

function App() {
  const [user, setUser] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [paperPortfolio, setPaperPortfolio] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [briefing, setBriefing] = useState([]);
  const [briefingPredictions, setBriefingPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [appError, setAppError] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [virtualBalance, setVirtualBalance] = useState(100000);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isQuantLabOpen, setIsQuantLabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'markets' | 'portfolio' | 'screener' | 'academy'
  const [portfolioPrices, setPortfolioPrices] = useState({});

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  const getCurrency = (sym) => (sym?.endsWith('.NS') || sym?.endsWith('.BO') ? '₹' : '$');
  const currencySymbol = getCurrency(data?.meta?.symbol);

  // Global Ctrl+K / Cmd+K Search Hotkey
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dismiss suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  const fetchVirtualBalance = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/virtual-account/${uid}`);
      setVirtualBalance(res.data.balance);
    } catch (e) {
      console.error('Error fetching balance');
    }
  };

  const fetchPaperPortfolio = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/paper-portfolio/${uid}`);
      setPaperPortfolio(res.data);
      if (res.data && res.data.length > 0) {
        const uniqueSymbols = [...new Set(res.data.map(p => p.symbol))];
        uniqueSymbols.forEach(async (s) => {
          try {
            const pRes = await axios.get(`${API_URL}/api/stock/${s}`);
            if (pRes.data && pRes.data.values && pRes.data.values.length > 0) {
              setPortfolioPrices(prev => ({ ...prev, [s]: parseFloat(pRes.data.values[0].close) }));
            }
          } catch (_) {}
        });
      }
    } catch (e) {}
  };

  const fetchWatchlist = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/watchlist/${uid}`);
      setWatchlist(res.data);
    } catch (e) {}
  };

  const fetchPortfolio = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/portfolio/${uid}`);
      setPortfolio(res.data);
      // Fetch prices for holdings to calculate real-time portfolio metrics
      if (res.data && res.data.length > 0) {
        const uniqueSymbols = [...new Set(res.data.map(p => p.symbol))];
        uniqueSymbols.forEach(async (s) => {
          try {
            const pRes = await axios.get(`${API_URL}/api/stock/${s}`);
            if (pRes.data && pRes.data.values && pRes.data.values.length > 0) {
              setPortfolioPrices(prev => ({ ...prev, [s]: parseFloat(pRes.data.values[0].close) }));
            }
          } catch (_) {}
        });
      }
    } catch (e) {}
  };

  const fetchAlerts = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/alerts/${uid}`);
      setAlerts(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchWatchlist(u.uid);
        fetchPortfolio(u.uid);
        fetchPaperPortfolio(u.uid);
        fetchAlerts(u.uid);
        fetchVirtualBalance(u.uid);
      } else {
        setWatchlist([]);
        setPortfolio([]);
        setPaperPortfolio([]);
        setAlerts([]);
      }
    });

    const fetchBriefing = () => {
      axios.get(`${API_URL}/api/market-briefing`)
        .then(res => {
          if (Array.isArray(res.data)) {
            setBriefing(res.data);
          } else if (res.data && res.data.news) {
            setBriefing(res.data.news);
            setBriefingPredictions(res.data.predictions);
          }
        })
        .catch(() => {});
    };

    fetchBriefing();
    const briefingInterval = setInterval(fetchBriefing, 5 * 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(briefingInterval);
    };
  }, [theme]);

  // Autocomplete Logic
  useEffect(() => {
    const query = symbol?.trim();
    if (!query || query.length < 2 || !showSuggestions) {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      return;
    }

    const timer = setTimeout(() => {
      axios.get(`${API_URL}/api/search/${encodeURIComponent(query)}`)
        .then(res => {
          if (Array.isArray(res.data)) {
            setSuggestions(res.data);
            setSelectedSuggestionIndex(-1);
          }
        })
        .catch(() => {
          setSuggestions([]);
        });
    }, 220);

    return () => clearTimeout(timer);
  }, [symbol, showSuggestions]);

  const fetchStockData = async (s) => {
    const sym = (s || symbol)?.trim();
    if (!sym) return;
    setShowSuggestions(false);
    setSuggestions([]);
    setSymbol(sym.toUpperCase());
    setLoading(true);
    setAppError('');
    setAiAnalysis('');
    setActiveTab('markets');

    try {
      const [stockRes, newsRes, fundRes] = await Promise.all([
        axios.get(`${API_URL}/api/stock/${encodeURIComponent(sym)}`),
        axios.get(`${API_URL}/api/news/${encodeURIComponent(sym)}`),
        axios.get(`${API_URL}/api/fundamentals/${encodeURIComponent(sym)}`)
      ]);

      if (
        !stockRes.data ||
        stockRes.data.status === 'error' ||
        !stockRes.data.values ||
        stockRes.data.values.length === 0
      ) {
        setAppError(`Unable to load market feed for ${sym.toUpperCase()}. Please check ticker or try again.`);
        setData(null);
      } else {
        const symbolVal = stockRes.data.meta?.symbol || sym.toUpperCase();
        const sortedValues = [...stockRes.data.values].sort((a, b) => {
          if (a.datetime && b.datetime) {
            return new Date(b.datetime) - new Date(a.datetime);
          }
          return 0;
        });
        setData({
          ...stockRes.data,
          values: sortedValues,
          meta: { ...(stockRes.data.meta || {}), symbol: symbolVal },
          fundamentals: fundRes.data || {}
        });
      }
      setNews(Array.isArray(newsRes.data) ? newsRes.data : []);
    } catch (e) {
      setAppError(`Market data service error for ${sym.toUpperCase()}. Reverting to overview.`);
      setData(null);
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
      } catch (error) {
        return;
      }
    }
    if (!currUser) return;

    if (type === 'WATCH') {
      const existingItem = watchlist.find(item => item.symbol === data?.meta?.symbol);
      if (existingItem) {
        try {
          await axios.delete(`${API_URL}/api/watchlist/${currUser.uid}/${data?.meta?.symbol}`);
          fetchWatchlist(currUser.uid);
          showToast(`Removed ${data?.meta?.symbol} from watchlist`);
        } catch (e) {
          showToast('Error removing from watchlist', 'error');
        }
      } else {
        try {
          await axios.post(`${API_URL}/api/watchlist`, { symbol: data?.meta?.symbol, userId: currUser.uid });
          fetchWatchlist(currUser.uid);
          showToast(`Added ${data?.meta?.symbol} to watchlist`);
        } catch (e) {
          showToast('Error adding to watchlist', 'error');
        }
      }
    } else if (type === 'PORTFOLIO') {
      const qty = prompt(`Number of shares of ${data?.meta?.symbol} to add to Real Portfolio:`);
      if (qty && !isNaN(qty) && parseFloat(qty) > 0) {
        await axios.post(`${API_URL}/api/portfolio`, {
          userId: currUser.uid,
          symbol: data?.meta?.symbol,
          qty: parseFloat(qty),
          price: data?.values[0].close
        });
        fetchPortfolio(currUser.uid);
        showToast(`Recorded ${qty} shares in Portfolio`);
      }
    } else if (type === 'BUY') {
      const qtyStr = prompt(
        `Paper Order: Buy ${data?.meta?.symbol}\nLast Price: ${currencySymbol}${parseFloat(data?.values[0].close).toFixed(2)}\nAvailable Virtual Cash: $${virtualBalance.toFixed(2)}\nShares to BUY:`
      );
      if (qtyStr && !isNaN(qtyStr) && parseFloat(qtyStr) > 0) {
        const qty = parseFloat(qtyStr);
        try {
          const res = await axios.post(`${API_URL}/api/paper-portfolio/buy`, {
            userId: currUser.uid,
            symbol: data?.meta?.symbol,
            qty,
            price: data?.values[0].close
          });
          setVirtualBalance(res.data.balance);
          fetchPaperPortfolio(currUser.uid);
          showToast(`Executed: Bought ${qty} paper shares of ${data?.meta?.symbol}`);
        } catch (err) {
          showToast(err.response?.data?.error || 'Order rejected', 'error');
        }
      }
    } else if (type === 'SELL') {
      const qtyStr = prompt(
        `Paper Order: Sell ${data?.meta?.symbol}\nLast Price: ${currencySymbol}${parseFloat(data?.values[0].close).toFixed(2)}\nEnter shares to SELL:`
      );
      if (qtyStr && !isNaN(qtyStr) && parseFloat(qtyStr) > 0) {
        const qty = parseFloat(qtyStr);
        try {
          const res = await axios.post(`${API_URL}/api/paper-portfolio/sell`, {
            userId: currUser.uid,
            symbol: data?.meta?.symbol,
            qty,
            price: data?.values[0].close
          });
          setVirtualBalance(res.data.balance);
          fetchPaperPortfolio(currUser.uid);
          showToast(`Executed: Sold ${qty} paper shares of ${data?.meta?.symbol}`);
        } catch (err) {
          showToast(err.response?.data?.error || 'Order rejected', 'error');
        }
      }
    } else if (type === 'ALERT') {
      const targetPriceStr = prompt(
        `Set Alert for ${data?.meta?.symbol}\nCurrent Price: ${currencySymbol}${parseFloat(data?.values[0].close).toFixed(2)}\nTarget Price trigger:`
      );
      if (targetPriceStr && !isNaN(targetPriceStr) && parseFloat(targetPriceStr) > 0) {
        const targetPrice = parseFloat(targetPriceStr);
        const currentPrice = parseFloat(data?.values[0].close);
        const condition = targetPrice > currentPrice ? 'ABOVE' : 'BELOW';
        await axios.post(`${API_URL}/api/alerts`, {
          userId: currUser.uid,
          symbol: data?.meta?.symbol,
          targetPrice,
          condition
        });
        fetchAlerts(currUser.uid);
        showToast(`Alert registered: ${data?.meta?.symbol} ${condition} ${currencySymbol}${targetPrice}`);
      }
    }
  };

  const getAIInsight = async () => {
    setAiLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai-analysis`, {
        symbol: data?.meta?.symbol,
        price: data?.values[0].close,
        rsi: calculateRSI(data.values),
        sentiment: avgSent > 0 ? 'Bullish' : 'Bearish',
        news: news
      });
      setAiAnalysis(res.data.analysis);
    } catch (e) {
      setAiAnalysis('Analysis generation failed. Check API connectivity.');
    }
    setAiLoading(false);
  };

  const rsiScore = data ? calculateRSI(data.values) : null;
  const avgSent = news.length > 0 ? news.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / news.length : 0;
  const getVerdict = (rsi) => {
    const v = parseFloat(rsi);
    if (v < 35) return { label: 'OVERSOLD', color: 'var(--success)' };
    if (v > 65) return { label: 'OVERBOUGHT', color: 'var(--danger)' };
    return { label: 'NEUTRAL', color: 'var(--warning)' };
  };
  const verdict = rsiScore ? getVerdict(rsiScore) : { label: 'NEUTRAL', color: 'var(--text-tertiary)' };

  // Calculate Real Portfolio Metrics
  const portfolioHoldingsWithPnL = portfolio.map((p) => {
    const currPrice = portfolioPrices[p.symbol] || parseFloat(p.price || 0);
    const entryPrice = parseFloat(p.price || 0);
    const costBasis = p.qty * entryPrice;
    const currentVal = p.qty * currPrice;
    const pnlDollar = currentVal - costBasis;
    const pnlPercent = costBasis > 0 ? (pnlDollar / costBasis) * 100 : 0;
    return {
      ...p,
      currPrice,
      entryPrice,
      costBasis,
      currentVal,
      pnlDollar,
      pnlPercent
    };
  });

  const totalPortfolioValue = portfolioHoldingsWithPnL.reduce((acc, p) => acc + p.currentVal, 0);
  const totalCostBasis = portfolioHoldingsWithPnL.reduce((acc, p) => acc + p.costBasis, 0);
  const totalUnrealizedPnL = totalPortfolioValue - totalCostBasis;
  const totalUnrealizedPnLPercent = totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;

  // Export Portfolio
  const exportPortfolio = async (type) => {
    if (portfolio.length === 0) {
      showToast('No active holdings to export', 'error');
      return;
    }
    showToast('Compiling export data...', 'success');

    try {
      const headers = ['Symbol', 'Quantity', 'Entry Price', 'Market Price', 'Cost Basis', 'Current Value', 'Unrealized P/L'];
      const rows = portfolioHoldingsWithPnL.map((p) => [
        p.symbol,
        p.qty.toString(),
        `$${p.entryPrice.toFixed(2)}`,
        `$${p.currPrice.toFixed(2)}`,
        `$${p.costBasis.toFixed(2)}`,
        `$${p.currentVal.toFixed(2)}`,
        `${p.pnlDollar >= 0 ? '+' : ''}$${p.pnlDollar.toFixed(2)} (${p.pnlPercent.toFixed(1)}%)`
      ]);

      if (type === 'csv') {
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `FinIntel_Portfolio_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exported CSV report');
      } else if (type === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text('FinIntel — Institutional Portfolio Statement', 14, 15);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toUTCString()} | Valuation: $${totalPortfolioValue.toFixed(2)}`, 14, 22);
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 28,
          theme: 'grid',
          headStyles: { fillColor: [25, 35, 29] }
        });
        doc.save(`FinIntel_Statement_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Exported PDF statement');
      }
    } catch (e) {
      showToast('Export failed', 'error');
    }
  };

  return (
    <div className="app-viewport">
      {/* 1. Global High-Frequency Ticker Tape */}
      <TickerTape />

      {/* Mobile Top Header - Displayed only on responsive viewports <= 1024px */}
      <header className="mobile-header">
        <div
          className="brand-link"
          onClick={() => {
            setData(null);
            setSymbol('');
            setActiveTab('overview');
            setIsMobileMenuOpen(false);
          }}
        >
          <span>FinIntel</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn btn-ghost"
            style={{ padding: '6px' }}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="btn btn-ghost"
            style={{ padding: '6px' }}
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main 2-Column Desktop Terminal Layout: 240px Fixed Sidebar + 1fr Flexible Main */}
      <div className="terminal-layout">
        {/* 2. Structured Financial Sidebar Navigation */}
        <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-brand-block">
            <div
              className="brand-link"
              onClick={() => {
                setData(null);
                setSymbol('');
                setActiveTab('overview');
                setIsMobileMenuOpen(false);
              }}
            >
              <span>FinIntel</span>
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="btn btn-ghost"
              style={{ padding: '6px' }}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          <div className="sidebar-nav-section">
            <button
              className={`nav-item ${activeTab === 'overview' && !data ? 'active' : ''}`}
              onClick={() => {
                setData(null);
                setActiveTab('overview');
                setIsMobileMenuOpen(false);
              }}
            >
              <BarChart3 size={16} className="nav-icon" />
              <span>Overview</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'markets' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('markets');
                setIsMobileMenuOpen(false);
                if (!data && symbol) fetchStockData(symbol);
              }}
            >
              <TrendingUp size={16} className="nav-icon" />
              <span>Markets & Charts</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'screener' ? 'active' : ''}`}
              onClick={() => {
                setData(null);
                setActiveTab('screener');
                setIsMobileMenuOpen(false);
              }}
            >
              <Activity size={16} className="nav-icon" />
              <span>Stock Screener</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'news' ? 'active' : ''}`}
              onClick={() => {
                setData(null);
                setActiveTab('news');
                setIsMobileMenuOpen(false);
              }}
            >
              <Newspaper size={16} className="nav-icon" />
              <span>News & Market Wire</span>
            </button>

            <button
              className={`nav-item ${isQuantLabOpen ? 'active' : ''}`}
              onClick={() => {
                setIsQuantLabOpen(true);
                setIsMobileMenuOpen(false);
              }}
            >
              <Cpu size={16} className="nav-icon" />
              <span>Quant Lab (C++ Engine)</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'academy' ? 'active' : ''}`}
              onClick={() => {
                setData(null);
                setActiveTab('academy');
                setIsMobileMenuOpen(false);
              }}
            >
              <BookOpen size={16} className="nav-icon" />
              <span>Methodology & Reference</span>
            </button>
          </div>

          <div className="sidebar-divider"></div>

          {/* Watchlist Section */}
          <div className="sidebar-heading">
            <span>Watchlist</span>
            <span className="font-mono">{watchlist.length}</span>
          </div>
          <div className="sidebar-list-container">
            {watchlist.map((item) => (
              <div
                key={item._id}
                className="sidebar-item-row"
                onClick={() => {
                  fetchStockData(item.symbol);
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className="sidebar-item-sym">{item.symbol}</span>
                <button
                  className="sidebar-item-del"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await axios.delete(`${API_URL}/api/watchlist/${user.uid}/${item.symbol}`);
                    fetchWatchlist(user.uid);
                  }}
                  title="Remove from Watchlist"
                >
                  ✕
                </button>
              </div>
            ))}
            {watchlist.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '6px 10px' }}>
                No active watch items
              </span>
            )}
          </div>

          <div className="sidebar-divider"></div>

          {/* Active Alerts */}
          <div className="sidebar-heading">
            <span>Price Triggers</span>
            <span className="font-mono">{alerts.length}</span>
          </div>
          <div className="sidebar-list-container">
            {alerts.map((a) => (
              <div key={a._id} className="sidebar-item-row" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="sidebar-item-sym" style={{ fontSize: '0.78rem' }}>{a.symbol}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    {a.condition} {getCurrency(a.symbol)}{a.targetPrice}
                  </span>
                </div>
                <button
                  className="sidebar-item-del"
                  onClick={async () => {
                    await axios.delete(`${API_URL}/api/alerts/${a._id}`);
                    fetchAlerts(user.uid);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {alerts.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '6px 10px' }}>
                No active price triggers
              </span>
            )}
          </div>

          {/* Sidebar Footer with Auth & Uptime Status */}
          <div className="sidebar-footer">
            {user ? (
              <div className="user-status-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img src={user.photoURL} alt="User" className="user-avatar-img" />
                  <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{user.displayName?.split(' ')[0]}</span>
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="btn btn-ghost btn-sm"
                  title="Sign Out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleProtectedAction()}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
              >
                Sign In with Firebase
              </button>
            )}

            <a
              href={UPTIMEROBOT_STATUS_URL}
              target="_blank"
              rel="noreferrer"
              className="uptime-strip"
              title="Monitor Uptime"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="status-dot"></span>
                <span>System Operational</span>
              </div>
              <span>100%</span>
            </a>
            <div className="creator-credit">
              Made by Anmol · <a href="https://heyanmol.netlify.app" target="_blank" rel="noreferrer">Portfolio</a>
            </div>
          </div>
        </aside>

        {/* 3. Main Operational Workspace */}
        <main className="main-content">
          {/* Top Global Search & Context Bar */}
          <div className="terminal-topbar">
            <div ref={searchContainerRef} className="global-search-container">
              <Search size={15} className="search-input-icon" />
              <input
                ref={searchInputRef}
                className="search-input-field font-mono"
                placeholder="Search global symbol (e.g. AAPL, NVDA, TCS.NS)..."
                value={symbol}
                onFocus={() => { if (symbol?.trim().length >= 2) setShowSuggestions(true); }}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setShowSuggestions(true);
                  setAppError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    if (suggestions.length > 0) {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => (prev + 1) % suggestions.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    if (suggestions.length > 0) {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                      const selected = suggestions[selectedSuggestionIndex].symbol;
                      setSymbol(selected);
                      fetchStockData(selected);
                    } else {
                      fetchStockData();
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
              />
              {symbol ? (
                <button
                  className="search-clear-btn"
                  onClick={() => { setSymbol(''); setSuggestions([]); setShowSuggestions(false); }}
                >
                  <X size={14} />
                </button>
              ) : (
                <span className="search-kbd-hint">Ctrl+K</span>
              )}

              {/* Autocomplete Popover */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-popover">
                  {suggestions.map((s, i) => (
                    <div
                      key={s.symbol || i}
                      className={`suggestion-row ${selectedSuggestionIndex === i ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedSuggestionIndex(i)}
                      onClick={() => {
                        setShowSuggestions(false);
                        setSymbol(s.symbol);
                        fetchStockData(s.symbol);
                      }}
                    >
                      <span className="font-mono" style={{ fontWeight: '700', color: 'var(--accent)' }}>
                        {s.symbol}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.instrument_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="topbar-status-group">
              <div className="market-live-badge">
                <span className="status-dot"></span>
                <span>Feed Live</span>
              </div>
              <div className="paper-capital-badge font-mono">
                ${virtualBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Sim Cash
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIsQuantLabOpen(true)}
                title="Launch C++ Quant Lab"
              >
                <Cpu size={14} color="var(--accent)" />
                <span>Quant Lab</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {appError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem' }}>
              <AlertCircle size={16} />
              <span>{appError}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="terminal-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
              <span className="dot-pulse"></span>
              <span className="font-mono" style={{ fontSize: '0.84rem' }}>Fetching market telemetry and quantitative models...</span>
            </div>
          )}

          {/* SCREEN ROUTING */}
          {activeTab === 'screener' ? (
            <Screener onClose={() => setActiveTab('overview')} onSelectSymbol={(sym) => fetchStockData(sym)} />
          ) : activeTab === 'academy' ? (
            <Academy onClose={() => setActiveTab('overview')} />
          ) : activeTab === 'news' ? (
            /* ==========================================================================
               NEWS & MARKET INTELLIGENCE WIRE
               ========================================================================== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Newspaper size={20} color="var(--accent)" />
                    Global Financial News & Intelligence Wire
                  </h1>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Real-time market journalism, CNBC briefings, and macro event telemetry
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="term-badge neutral">
                    <span className="status-dot"></span> Live Wire ({briefing.length} Feeds)
                  </span>
                </div>
              </div>

              {/* Structured Directional Catalyst Synthesis Box */}
              {(() => {
                if (!briefingPredictions) return null;
                const higher = Array.isArray(briefingPredictions.higher) ? briefingPredictions.higher.filter(h => h && h.symbol) : [];
                const lower = Array.isArray(briefingPredictions.lower) ? briefingPredictions.lower.filter(l => l && l.symbol) : [];
                if (higher.length === 0 && lower.length === 0) return null;

                return (
                  <div className="quant-synthesis-box">
                    <div className="quant-synthesis-header">
                      <Cpu size={14} color="var(--accent)" />
                      <span>Quantitative Directional Catalysts (Extracted from Live Wire)</span>
                    </div>
                    <div className="quant-catalyst-grid">
                      {higher.length > 0 && (
                        <div className="catalyst-col">
                          <span className="catalyst-col-title pos">▲ Bullish Biases & Catalysts</span>
                          <div className="catalyst-items">
                            {higher.map((h, idx) => (
                              <div key={idx} className="catalyst-item" onClick={() => fetchStockData(h.symbol)}>
                                <span className="font-mono catalyst-sym pos">{h.symbol}</span>
                                <span className="catalyst-reason">{h.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {lower.length > 0 && (
                        <div className="catalyst-col">
                          <span className="catalyst-col-title neg">▼ Bearish Headwinds & Risks</span>
                          <div className="catalyst-items">
                            {lower.map((l, idx) => (
                              <div key={idx} className="catalyst-item" onClick={() => fetchStockData(l.symbol)}>
                                <span className="font-mono catalyst-sym neg">{l.symbol}</span>
                                <span className="catalyst-reason">{l.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* News Articles Grid */}
              <div className="news-feed-grid">
                {briefing.map((n, i) => (
                  <div
                    key={i}
                    className="news-article-card"
                    onClick={() => window.open(n.url, '_blank')}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="news-source-badge">{n.source?.name || 'CNBC Wire'}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : 'Today'}
                        </span>
                      </div>
                      <h4 className="news-article-title">{n.title}</h4>
                    </div>
                    <div className="news-article-footer">
                      <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>Read full article ↗</span>
                      <span className="term-badge neutral font-mono">Macro</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (data && data.values && data.values.length > 0) ? (
            /* ==========================================================================
               MARKETS: Stock Analysis & Candlestick Workspace
               ========================================================================== */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button onClick={() => setData(null)} className="btn btn-ghost" style={{ padding: '4px 0' }}>
                  <ArrowLeft size={16} />
                  <span>Back to Overview</span>
                </button>
                <span className="term-badge neutral">
                  Market Feed: {data?.meta?.symbol || symbol}
                </span>
              </div>

              <div className="terminal-panel">
                {/* Header Information & Action Toolbar */}
                <div className="stock-view-header">
                  <div>
                    <div className="stock-symbol-large">
                      <span>{data?.meta?.symbol || symbol}</span>
                      <span className="stock-price-large font-mono">
                        {currencySymbol}{parseFloat(data?.values?.[0]?.close || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      Last Updated: {data?.values?.[0]?.datetime || 'Live'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(() => {
                      const curSym = data?.meta?.symbol || symbol;
                      const isWatching = watchlist.some(item => item.symbol === curSym);
                      return (
                        <button
                          onClick={() => handleProtectedAction('WATCH')}
                          className={`btn ${isWatching ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          <Star size={14} fill={isWatching ? 'currentColor' : 'none'} />
                          <span>{isWatching ? 'Watching' : 'Watch'}</span>
                        </button>
                      );
                    })()}
                    <button onClick={() => handleProtectedAction('ALERT')} className="btn btn-secondary">
                      <Bell size={14} />
                      <span>Set Alert</span>
                    </button>
                    <button onClick={() => handleProtectedAction('PORTFOLIO')} className="btn btn-secondary">
                      <Plus size={14} />
                      <span>Holdings</span>
                    </button>
                    <button onClick={() => handleProtectedAction('BUY')} className="btn btn-primary">
                      <span>Paper Buy</span>
                    </button>
                    {paperPortfolio.some(p => p.symbol === (data?.meta?.symbol || symbol)) && (
                      <button onClick={() => handleProtectedAction('SELL')} className="btn btn-danger">
                        <span>Paper Sell</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Key Financial Statistics Grid */}
                <div className="stock-stats-grid">
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">RSI (14)</span>
                    <span className="stock-stat-val font-mono">{rsiScore || '--'}</span>
                  </div>
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">News Sentiment</span>
                    <span className={`stock-stat-val font-mono ${avgSent >= 0 ? 'pos' : 'neg'}`}>
                      {avgSent >= 0 ? 'Bullish' : 'Bearish'}
                    </span>
                  </div>
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">Model Signal</span>
                    <span className="stock-stat-val font-mono" style={{ color: verdict.color }}>
                      {verdict.label}
                    </span>
                  </div>
                  {data?.fundamentals?.profile?.marketCapitalization && (
                    <div className="stock-stat-box">
                      <span className="stock-stat-label">Market Cap</span>
                      <span className="stock-stat-val font-mono">
                        {currencySymbol}{(data.fundamentals.profile.marketCapitalization / 1000).toFixed(2)}B
                      </span>
                    </div>
                  )}
                  {data?.fundamentals?.metrics?.['peBasicExclExtraTTM'] && (
                    <div className="stock-stat-box">
                      <span className="stock-stat-label">P/E Ratio</span>
                      <span className="stock-stat-val font-mono">
                        {data.fundamentals.metrics['peBasicExclExtraTTM'].toFixed(2)}
                      </span>
                    </div>
                  )}
                  {data?.fundamentals?.metrics?.['52WeekHigh'] && (
                    <div className="stock-stat-box">
                      <span className="stock-stat-label">52W Range</span>
                      <span className="stock-stat-val font-mono" style={{ fontSize: '0.85rem' }}>
                        {currencySymbol}{data.fundamentals.metrics['52WeekLow']?.toFixed(1)} - {currencySymbol}{data.fundamentals.metrics['52WeekHigh']?.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Contextual LLaMA AI Research Analyst */}
                <div className="analyst-insight-panel">
                  <div className="analyst-header">
                    <span className="analyst-title">
                      <Brain size={16} color="var(--accent)" />
                      Algorithmic Analyst Synthesis (Groq / LLaMA)
                    </span>
                    <button
                      onClick={getAIInsight}
                      className="btn btn-secondary btn-sm"
                      disabled={aiLoading}
                    >
                      {aiLoading ? 'Synthesizing...' : 'Generate Synthesis'}
                    </button>
                  </div>
                  <p className="analyst-body">
                    {aiAnalysis || 'Execute synthesis to generate a 3-point technical and sentiment verdict for ' + (data?.meta?.symbol || symbol) + ' based on live order momentum and news filings.'}
                  </p>
                </div>

                {/* Candlestick Financial Chart */}
                <StockChart data={data.values} theme={theme} />
              </div>

              {/* Intelligence Feed */}
              <div className="terminal-panel" style={{ marginTop: '16px' }}>
                <div className="panel-header">
                  <h3 className="panel-title">
                    News Intelligence & Filings: {data?.meta?.symbol || symbol}
                  </h3>
                  <span className="term-badge neutral">{news.length} Reports</span>
                </div>

                {news.length > 0 ? (
                  <div className="news-feed-grid">
                    {news.map((n, i) => (
                      <div
                        key={i}
                        className="news-article-card"
                        onClick={() => window.open(n.url, '_blank')}
                      >
                        <div>
                          <span className="news-source-badge">{n.source?.name || 'Filing'}</span>
                          <h4 className="news-article-title">{n.title}</h4>
                        </div>
                        <div className="news-article-footer">
                          <span>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : 'Recent'}</span>
                          <span className={`term-badge ${n.sentimentScore > 0 ? 'pos' : n.sentimentScore < 0 ? 'neg' : 'neutral'}`}>
                            {n.sentimentScore > 0 ? 'Positive' : n.sentimentScore < 0 ? 'Negative' : 'Neutral'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                    No recent filings found for this instrument.
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* ==========================================================================
               OVERVIEW DASHBOARD: The 5 Core Investor Questions Answered
               ========================================================================== */
            <div className="dashboard-grid">
              {/* Question 1 & 2: Valuation, Cost Basis, Buying Power & Risk Node */}
              <div className="dashboard-span-12">
                <div className="portfolio-summary-bar">
                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Portfolio Valuation</span>
                    <span className="summary-metric-value">
                      ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`summary-metric-sub ${totalUnrealizedPnL >= 0 ? 'pos' : 'neg'}`}>
                      {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)} ({totalUnrealizedPnLPercent.toFixed(1)}% All-Time)
                    </span>
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Cost Basis</span>
                    <span className="summary-metric-value">
                      ${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="summary-metric-sub neutral">
                      {portfolio.length} Active Positions
                    </span>
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Virtual Buying Power</span>
                    <span className="summary-metric-value" style={{ color: 'var(--accent)' }}>
                      ${virtualBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="summary-metric-sub neutral">
                      Paper Simulator Capital
                    </span>
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Quantitative Node</span>
                    <span className="summary-metric-value" style={{ fontSize: '1.15rem' }}>
                      C++20 OpenMP
                    </span>
                    <span className="summary-metric-sub font-mono" style={{ color: 'var(--accent)' }}>
                      {navigator.hardwareConcurrency || 8} Threads Detected
                    </span>
                  </div>
                </div>
              </div>

              {/* Question 3 & 4: Concise Holdings Table with Numeric Alignment (Span 8) */}
              <div className="terminal-panel dashboard-span-8">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">
                      <PieChart size={18} color="var(--accent)" />
                      Real Portfolio Holdings
                    </h2>
                    <span className="panel-subtitle">
                      Live positions, cost basis, mark-to-market valuations, and net unrealized returns
                    </span>
                  </div>

                  {portfolio.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => exportPortfolio('csv')} className="btn btn-secondary btn-sm">
                        <Download size={13} />
                        <span>CSV</span>
                      </button>
                      <button onClick={() => exportPortfolio('pdf')} className="btn btn-secondary btn-sm">
                        <Download size={13} />
                        <span>PDF</span>
                      </button>
                    </div>
                  )}
                </div>

                {portfolioHoldingsWithPnL.length > 0 ? (
                  <div className="terminal-table-container">
                    <table className="terminal-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num-col">Position (Qty)</th>
                          <th className="num-col">Cost Price</th>
                          <th className="num-col">Market Price</th>
                          <th className="num-col">Market Value</th>
                          <th className="num-col">Unrealized P/L</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolioHoldingsWithPnL.map((p) => {
                          const isPos = p.pnlDollar >= 0;
                          return (
                            <tr key={p._id}>
                              <td>
                                <span
                                  className="font-mono"
                                  style={{ fontWeight: '700', color: 'var(--accent)', cursor: 'pointer' }}
                                  onClick={() => fetchStockData(p.symbol)}
                                  title="Inspect Stock Chart"
                                >
                                  {p.symbol}
                                </span>
                              </td>
                              <td className="num-col font-mono">{p.qty} shrs</td>
                              <td className="num-col font-mono">${p.entryPrice.toFixed(2)}</td>
                              <td className="num-col font-mono">${p.currPrice.toFixed(2)}</td>
                              <td className="num-col font-mono" style={{ fontWeight: '600' }}>
                                ${p.currentVal.toFixed(2)}
                              </td>
                              <td className="num-col font-mono">
                                <span className={`term-badge ${isPos ? 'pos' : 'neg'}`}>
                                  {isPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                  {isPos ? '+' : ''}${p.pnlDollar.toFixed(2)} ({p.pnlPercent.toFixed(1)}%)
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '4px' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => fetchStockData(p.symbol)}
                                    title="View Chart"
                                  >
                                    Chart
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={async () => {
                                      await axios.delete(`${API_URL}/api/portfolio/${p._id}`);
                                      fetchPortfolio(user.uid);
                                      showToast(`Removed ${p.symbol} from portfolio`);
                                    }}
                                    title="Delete holding"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="holdings-empty-state">
                    <div className="empty-icon-wrap">
                      <PieChart size={24} color="var(--text-tertiary)" />
                    </div>
                    <div>
                      <span className="empty-title">No Portfolio Positions Tracked</span>
                      <p className="empty-desc">
                        Search any global ticker above (e.g., <button type="button" className="inline-symbol-btn" onClick={() => fetchStockData('AAPL')}>AAPL</button>, <button type="button" className="inline-symbol-btn" onClick={() => fetchStockData('NVDA')}>NVDA</button>, or <button type="button" className="inline-symbol-btn" onClick={() => fetchStockData('MSFT')}>MSFT</button>) and click <strong>"Holdings"</strong> to record trade positions.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dedicated Risk Analytics & Quant Lab Launcher (Span 4) */}
              <div className="terminal-panel dashboard-span-4" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">
                      <ShieldCheck size={18} color="var(--accent)" />
                      Risk Analytics
                    </h2>
                    <span className="panel-subtitle">Risk metrics for your holdings</span>
                  </div>
                  <span className="term-badge neutral">Simulation required</span>
                </div>

                <div className="risk-metrics-stack">
                  <div className="risk-metric-row">
                    <span className="risk-metric-title">Portfolio positions</span>
                    <span className="risk-metric-data font-mono">{portfolio.length}</span>
                  </div>
                  <div className="risk-metric-row">
                    <span className="risk-metric-title">Value at Risk (VaR)</span>
                    <span className="risk-metric-data">Available after simulation</span>
                  </div>
                  <div className="risk-metric-row">
                    <span className="risk-metric-title">Expected Shortfall (CVaR)</span>
                    <span className="risk-metric-data">Available after simulation</span>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                    {portfolio.length > 0
                      ? 'Run a Quant Lab simulation to estimate risk for your current holdings.'
                      : 'Add holdings to your portfolio before running an account-specific risk simulation.'}
                  </p>
                  <button
                    onClick={() => setIsQuantLabOpen(true)}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Cpu size={15} />
                    <span>Launch Quant Simulation Lab</span>
                  </button>
                </div>
              </div>

              {/* Macro Intelligence Briefing & Structured Catalysts (Span 7) */}
              <div className="terminal-panel dashboard-span-7">
                <div className="panel-header">
                  <h3 className="panel-title">
                    <Activity size={17} color="var(--accent)" />
                    Macro Intelligence Briefing
                  </h3>
                  <span className="term-badge neutral">CNBC Wire</span>
                </div>

                {/* Structured Directional Catalyst Synthesis (Groq LLaMA) */}
                {(() => {
                  if (!briefingPredictions) return null;
                  const higher = Array.isArray(briefingPredictions.higher) ? briefingPredictions.higher.filter(h => h && h.symbol) : [];
                  const lower = Array.isArray(briefingPredictions.lower) ? briefingPredictions.lower.filter(l => l && l.symbol) : [];
                  if (higher.length === 0 && lower.length === 0) return null;

                  return (
                    <div className="quant-synthesis-box">
                      <div className="quant-synthesis-header">
                        <Cpu size={13} color="var(--accent)" />
                        <span>Directional Catalyst Synthesis (Groq LLaMA)</span>
                      </div>
                      <div className="quant-catalyst-grid">
                        {higher.length > 0 && (
                          <div className="catalyst-col">
                            <span className="catalyst-col-title pos">▲ Bullish Biases</span>
                            <div className="catalyst-items">
                              {higher.map((h, idx) => (
                                <div key={idx} className="catalyst-item" onClick={() => fetchStockData(h.symbol)}>
                                  <span className="font-mono catalyst-sym pos">{h.symbol}</span>
                                  <span className="catalyst-reason">{h.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {lower.length > 0 && (
                          <div className="catalyst-col">
                            <span className="catalyst-col-title neg">▼ Bearish Headwinds</span>
                            <div className="catalyst-items">
                              {lower.map((l, idx) => (
                                <div key={idx} className="catalyst-item" onClick={() => fetchStockData(l.symbol)}>
                                  <span className="font-mono catalyst-sym neg">{l.symbol}</span>
                                  <span className="catalyst-reason">{l.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {briefing.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {briefing.slice(0, 5).map((n, i) => (
                      <div
                        key={i}
                        onClick={() => window.open(n.url, '_blank')}
                        style={{
                          padding: '10px 12px',
                          background: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-xs)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          border: '1px solid var(--border-subtle)',
                          transition: 'border-color 0.15s'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: '500', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {n.source?.name} · {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : 'Today'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                    Connecting to institutional market news stream...
                  </div>
                )}
              </div>

              {/* Paper Trading Holdings Snapshot (Span 5) */}
              <div className="terminal-panel dashboard-span-5">
                <div className="panel-header">
                  <h3 className="panel-title">
                    <Layers size={17} color="var(--info)" />
                    Simulated Paper Positions
                  </h3>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ${virtualBalance.toFixed(2)} Cash
                  </span>
                </div>

                {paperPortfolio.length > 0 ? (
                  <div className="terminal-table-container">
                    <table className="terminal-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num-col">Shares</th>
                          <th className="num-col">Entry</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paperPortfolio.map((p) => (
                          <tr key={p._id}>
                            <td>
                              <span className="font-mono" style={{ fontWeight: '600', color: 'var(--accent)' }}>
                                {p.symbol}
                              </span>
                            </td>
                            <td className="num-col font-mono">{p.qty}</td>
                            <td className="num-col font-mono">${parseFloat(p.price).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>
                                <button
                                className="btn btn-danger btn-sm"
                                onClick={async () => {
                                  const closePrice = portfolioPrices[p.symbol] || parseFloat(p.price);
                                  await axios.post(`${API_URL}/api/paper-portfolio/sell`, {
                                    userId: user.uid,
                                    symbol: p.symbol,
                                    qty: p.qty,
                                    price: closePrice
                                  });
                                  fetchPaperPortfolio(user.uid);
                                  fetchVirtualBalance(user.uid);
                                  showToast(`Closed ${p.symbol} position at $${closePrice.toFixed(2)}`);
                                }}
                              >
                                Close
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                    <p style={{ margin: '0 0 6px 0' }}>No active simulated trades.</p>
                    <span style={{ fontSize: '0.76rem' }}>
                      Search any ticker above to place paper buy/sell orders risk-free.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Quant Lab Modal */}
      {isQuantLabOpen && (
        <QuantLab
          onClose={() => setIsQuantLabOpen(false)}
          userPortfolio={portfolio}
          paperPortfolio={paperPortfolio}
        />
      )}

      {/* Global Notification Toast */}
      {toast.show && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} color="var(--success)" /> : <AlertCircle size={16} color="var(--danger)" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
