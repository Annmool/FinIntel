import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from './apiClient';
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
  Newspaper,
  Globe,
  RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Academy from './Academy';
import Screener from './Screener';
import StockChart from './StockChart';
import TickerTape from './TickerTape';
import QuantLab from './QuantLab';
import { calculateRSI } from './utils/indicators';
import {
  DEFAULT_FX_RATES,
  inferCurrencyFromSymbol,
  getCurrencySymbol,
  formatPrice,
  convertPrice,
  formatLargeCap
} from './utils/currency';
import { auth, provider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import { API_URL } from './apiConfig';
const UPTIMEROBOT_STATUS_URL = 'https://dashboard.uptimerobot.com/monitors/803125214';

function App() {
  const pendingPaperOrder = useRef(null);
  const submittingOrder = useRef(false);
  const stockRequest = useRef(0);
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
  const [orderModal, setOrderModal] = useState({
    isOpen: false,
    type: 'BUY', // 'BUY' | 'SELL' | 'PORTFOLIO' | 'ALERT'
    symbol: '',
    price: 0,
    currency: 'USD',
    sharesHeld: 0,
    qty: 1,
    alertCondition: 'ABOVE',
    targetPrice: '',
    isSubmitting: false,
    error: ''
  });
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'markets' | 'portfolio' | 'screener' | 'academy'
  const [portfolioPrices, setPortfolioPrices] = useState({});
  const [portfolioFxRates, setPortfolioFxRates] = useState({});
  const [fxRate, setFxRate] = useState(() => {
    try {
      const cached = localStorage.getItem('finintel_fx_rate');
      const val = parseFloat(cached);
      if (Number.isFinite(val) && val > 0) return val;
    } catch (e) {}
    return DEFAULT_FX_RATES.INR || 94.94;
  });
  const [fxRates, setFxRates] = useState(() => {
    try {
      const cached = localStorage.getItem('finintel_fx_rates');
      if (cached) {
        return { ...DEFAULT_FX_RATES, ...JSON.parse(cached) };
      }
    } catch (e) {}
    return DEFAULT_FX_RATES;
  });
  const [isFxLoading, setIsFxLoading] = useState(false);
  const [fxLastUpdated, setFxLastUpdated] = useState(() => {
    try {
      const cached = localStorage.getItem('finintel_fx_provider_time');
      return cached ? new Date(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [fxRateSource, setFxRateSource] = useState(() => {
    try { return localStorage.getItem('finintel_fx_provider') || 'Waiting for quote'; } catch (e) { return 'Waiting for quote'; }
  });
  const [fxWasCached, setFxWasCached] = useState(() => {
    try { return localStorage.getItem('finintel_fx_cached') === 'true'; } catch (e) { return false; }
  });
  const [baseCurrency, setBaseCurrency] = useState(() => {
    try {
      return localStorage.getItem('finintel_base_currency') || 'USD';
    } catch {
      return 'USD';
    }
  });

  const toggleBaseCurrency = (curr) => {
    setBaseCurrency(curr);
    try {
      localStorage.setItem('finintel_base_currency', curr);
    } catch {}
  };

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  const getCurrency = (symOrCode) => getCurrencySymbol(symOrCode);
  const stockCurrency = data?.meta?.currency || inferCurrencyFromSymbol(data?.meta?.symbol || symbol);
  const currencySymbol = getCurrencySymbol(stockCurrency);
  const baseCurSymbol = getCurrencySymbol(baseCurrency);
  const altCurrency = baseCurrency === 'USD' ? 'INR' : 'USD';
  const altCurSymbol = getCurrencySymbol(altCurrency);

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

  const fetchFxRate = useCallback((force = false) => {
    setIsFxLoading(true);
    const url = `${API_URL}/api/forex/rate?force=${force ? 'true' : 'false'}&_t=${Date.now()}`;
    axios.get(url)
      .then(res => {
        const rateVal = parseFloat(res.data?.rate);
        if (Number.isFinite(rateVal) && rateVal > 0) {
          setFxRate(rateVal);
          try { localStorage.setItem('finintel_fx_rate', String(rateVal)); } catch (e) {}
        }
        if (res.data?.rates) {
          setFxRates(prev => {
            const merged = { ...prev, ...res.data.rates };
            try { localStorage.setItem('finintel_fx_rates', JSON.stringify(merged)); } catch (e) {}
            return merged;
          });
        }
        setPortfolioFxRates(res.data?.providerRates || {});
        const sourceTimestamp = res.data?.sourceUpdatedAt;
        const providerTime = sourceTimestamp ? new Date(sourceTimestamp) : null;
        setFxLastUpdated(providerTime && Number.isFinite(providerTime.getTime()) ? providerTime : null);
        const source = res.data?.source || 'Unknown source';
        const cached = Boolean(res.data?.cached);
        setFxRateSource(source);
        setFxWasCached(cached);
        try {
          if (providerTime && Number.isFinite(providerTime.getTime())) {
            localStorage.setItem('finintel_fx_provider_time', providerTime.toISOString());
          }
          localStorage.setItem('finintel_fx_provider', source);
          localStorage.setItem('finintel_fx_cached', String(cached));
        } catch (e) {}
        if (force && Number.isFinite(rateVal) && rateVal > 0) {
          showToast(`Forex synchronized: 1 USD = ₹${rateVal.toFixed(2)}`);
        }
      })
      .catch(() => {
        setPortfolioFxRates({});
        if (force) {
          showToast('Using local exchange rates (backend connecting...)', 'error');
        }
      })
      .finally(() => {
        setIsFxLoading(false);
      });
  }, []);

  const fetchVirtualBalance = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/virtual-account/${uid}`);
      if (auth.currentUser?.uid === uid) setVirtualBalance(res.data.balance);
    } catch (e) {
      console.error('Error fetching balance');
    }
  };

  const fetchPortfolioMarks = useCallback((holdings, uid) => {
    for (const symbol of new Set(holdings.map(holding => holding.symbol))) {
      axios.get(`${API_URL}/api/stock/${encodeURIComponent(symbol)}`).then(({ data }) => {
        if (auth.currentUser?.uid !== uid) return;
        const candle = data?.values?.[0];
        const price = Number(candle?.close);
        const currency = data?.meta?.currency;
        if (!Number.isFinite(price) || price <= 0 || !currency) return;
        setPortfolioPrices(previous => ({ ...previous, [symbol]: { price, currency, date: candle.datetime } }));
      }).catch(() => {});
    }
  }, []);

  const fetchPaperPortfolio = useCallback(async (uid) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/paper-portfolio/${uid}`);
      if (auth.currentUser?.uid !== uid) return;
      setPaperPortfolio(data);
      fetchPortfolioMarks(data, uid);
    } catch (e) {}
  }, [fetchPortfolioMarks]);

  const fetchWatchlist = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/watchlist/${uid}`);
      if (auth.currentUser?.uid === uid) setWatchlist(res.data);
    } catch (e) {}
  };

  const fetchPortfolio = useCallback(async (uid) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/portfolio/${uid}`);
      if (auth.currentUser?.uid !== uid) return;
      setPortfolio(data);
      fetchPortfolioMarks(data, uid);
    } catch (e) {}
  }, [fetchPortfolioMarks]);

  const fetchAlerts = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/alerts/${uid}`);
      if (auth.currentUser?.uid === uid) setAlerts(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setWatchlist([]);
      setPortfolio([]);
      setPaperPortfolio([]);
      setAlerts([]);
      setPortfolioPrices({});
      setVirtualBalance(100000);
      if (u) {
        fetchWatchlist(u.uid);
        fetchPortfolio(u.uid);
        fetchPaperPortfolio(u.uid);
        fetchAlerts(u.uid);
        fetchVirtualBalance(u.uid);
      }
    });

    const fetchBriefing = () => {
      axios.get(`${API_URL}/api/market-briefing`)
        .then(res => {
          if (Array.isArray(res.data)) {
            setBriefing(res.data);
          } else if (res.data && res.data.news) {
            setBriefing(res.data.news);
          }
        })
        .catch(() => {});
    };

    fetchFxRate(false);
    const fxInterval = setInterval(() => fetchFxRate(false), 60 * 1000); // Live FX auto-refresh every 60s

    fetchBriefing();
    const briefingInterval = setInterval(fetchBriefing, 5 * 60 * 1000);
    const alertsInterval = setInterval(() => {
      if (auth.currentUser) fetchAlerts(auth.currentUser.uid);
    }, 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(briefingInterval);
      clearInterval(alertsInterval);
      clearInterval(fxInterval);
    };
  }, [fetchFxRate, fetchPaperPortfolio, fetchPortfolio]);

  // Autocomplete Logic
  useEffect(() => {
    const query = symbol?.trim();
    if (!query || query.length < 2 || !showSuggestions) {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      axios.get(`${API_URL}/api/search/${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(res => {
          if (!controller.signal.aborted && Array.isArray(res.data)) {
            setSuggestions(res.data);
            setSelectedSuggestionIndex(-1);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        });
    }, 220);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [symbol, showSuggestions]);

  const fetchStockData = async (s) => {
    let sym = (s || symbol)?.trim();
    if (!sym) return;
    const requestId = ++stockRequest.current;
    setShowSuggestions(false);
    setSuggestions([]);
    setLoading(true);
    setAppError('');
    setAiAnalysis('');
    setActiveTab('markets');

    try {
      let targetSym = sym.toUpperCase();
      let stockRes, newsRes, fundRes;

      try {
        [stockRes, newsRes, fundRes] = await Promise.all([
          axios.get(`${API_URL}/api/stock/${encodeURIComponent(targetSym)}`),
          axios.get(`${API_URL}/api/news/${encodeURIComponent(targetSym)}`),
          axios.get(`${API_URL}/api/fundamentals/${encodeURIComponent(targetSym)}`)
        ]);

        if (
          !stockRes.data ||
          stockRes.data.status === 'error' ||
          !stockRes.data.values ||
          stockRes.data.values.length === 0
        ) {
          throw new Error("Invalid or empty stock data");
        }
      } catch (directErr) {
        if (requestId !== stockRequest.current) return;
        // If symbol lookup fails (e.g. user entered "APPLE" instead of "AAPL"), try smart-resolving symbol via search
        try {
          const searchRes = await axios.get(`${API_URL}/api/search/${encodeURIComponent(targetSym)}`);
          if (searchRes.data && Array.isArray(searchRes.data) && searchRes.data.length > 0 && searchRes.data[0].symbol) {
            targetSym = searchRes.data[0].symbol.toUpperCase();
            [stockRes, newsRes, fundRes] = await Promise.all([
              axios.get(`${API_URL}/api/stock/${encodeURIComponent(targetSym)}`),
              axios.get(`${API_URL}/api/news/${encodeURIComponent(targetSym)}`),
              axios.get(`${API_URL}/api/fundamentals/${encodeURIComponent(targetSym)}`)
            ]);
          } else {
            throw directErr;
          }
        } catch {
          throw directErr;
        }
      }

      if (requestId !== stockRequest.current) return;
      setSymbol(targetSym);

      if (
        !stockRes.data ||
        stockRes.data.status === 'error' ||
        !stockRes.data.values ||
        stockRes.data.values.length === 0
      ) {
        setAppError(`Unable to load market feed for ${targetSym}. Please check ticker or try again.`);
        setData(null);
      } else {
        const symbolVal = stockRes.data.meta?.symbol || targetSym;
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
      if (requestId !== stockRequest.current) return;
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

    const currentSymbol = data?.meta?.symbol || symbol;
    const stockCur = data?.meta?.currency || inferCurrencyFromSymbol(currentSymbol);
    const priceNative = parseFloat(data?.values?.[0]?.close || 0);

    if (type === 'WATCH') {
      const existingItem = watchlist.find(item => item.symbol === currentSymbol);
      if (existingItem) {
        try {
          await axios.delete(`${API_URL}/api/watchlist/${currUser.uid}/${currentSymbol}`);
          fetchWatchlist(currUser.uid);
          showToast(`Removed ${currentSymbol} from watchlist`);
        } catch (e) {
          showToast('Error removing from watchlist', 'error');
        }
      } else {
        try {
          await axios.post(`${API_URL}/api/watchlist`, { symbol: currentSymbol, userId: currUser.uid });
          fetchWatchlist(currUser.uid);
          showToast(`Added ${currentSymbol} to watchlist`);
        } catch (e) {
          showToast('Error adding to watchlist', 'error');
        }
      }
    } else if (type === 'BUY') {
      const held = paperPortfolio.find(p => p.symbol === currentSymbol)?.qty || 0;
      setOrderModal({
        isOpen: true,
        type: 'BUY',
        symbol: currentSymbol,
        price: priceNative,
        currency: stockCur,
        sharesHeld: held,
        qty: 1,
        alertCondition: 'ABOVE',
        targetPrice: '',
        isSubmitting: false,
        error: ''
      });
    } else if (type === 'SELL') {
      const held = paperPortfolio.find(p => p.symbol === currentSymbol)?.qty || 0;
      setOrderModal({
        isOpen: true,
        type: 'SELL',
        symbol: currentSymbol,
        price: priceNative,
        currency: stockCur,
        sharesHeld: held,
        qty: held > 0 ? held : 1,
        alertCondition: 'ABOVE',
        targetPrice: '',
        isSubmitting: false,
        error: ''
      });
    } else if (type === 'PORTFOLIO') {
      setOrderModal({
        isOpen: true,
        type: 'PORTFOLIO',
        symbol: currentSymbol,
        price: priceNative,
        currency: stockCur,
        sharesHeld: 0,
        qty: 1,
        alertCondition: 'ABOVE',
        targetPrice: '',
        isSubmitting: false,
        error: ''
      });
    } else if (type === 'ALERT') {
      setOrderModal({
        isOpen: true,
        type: 'ALERT',
        symbol: currentSymbol,
        price: priceNative,
        currency: stockCur,
        sharesHeld: 0,
        qty: 1,
        alertCondition: 'ABOVE',
        targetPrice: priceNative ? (priceNative * 1.05).toFixed(2) : '',
        isSubmitting: false,
        error: ''
      });
    }
  };

  const executeModalOrder = async () => {
    if (submittingOrder.current) return;
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

    if (submittingOrder.current) return;
    submittingOrder.current = true;
    setOrderModal(prev => ({ ...prev, isSubmitting: true, error: '' }));

    try {
      if (orderModal.type === 'BUY' || orderModal.type === 'SELL') {
        const qty = Number(orderModal.qty);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Please enter a valid share quantity.');

        const side = orderModal.type.toLowerCase();
        const signature = JSON.stringify([currUser.uid, side, orderModal.symbol, qty]);
        if (pendingPaperOrder.current?.signature !== signature) {
          pendingPaperOrder.current = { signature, id: crypto.randomUUID() };
        }
        const { data: fill } = await axios.post(`${API_URL}/api/paper-portfolio/${side}`, {
          symbol: orderModal.symbol,
          qty,
          orderId: pendingPaperOrder.current.id
        });
        pendingPaperOrder.current = null;
        if (auth.currentUser?.uid === currUser.uid) {
          fetchVirtualBalance(currUser.uid);
          fetchPaperPortfolio(currUser.uid);
        }
        setOrderModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
        const verb = side === 'buy' ? 'Bought' : 'Sold';
        showToast(`${verb} ${qty} ${orderModal.symbol} @ ${getCurrencySymbol(fill.currency)}${formatPrice(fill.executedPrice, fill.currency)} (${fill.quoteSource})`);
      } else if (orderModal.type === 'PORTFOLIO') {
        const qty = parseFloat(orderModal.qty);
        if (!qty || qty <= 0) {
          setOrderModal(prev => ({ ...prev, isSubmitting: false, error: 'Please enter a valid share quantity.' }));
          return;
        }
        await axios.post(`${API_URL}/api/portfolio`, {
          userId: currUser.uid,
          symbol: orderModal.symbol,
          qty,
          price: orderModal.price
        });
        fetchPortfolio(currUser.uid);
        setOrderModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
        showToast(`Recorded ${qty} shares of ${orderModal.symbol} in Portfolio`);
      } else if (orderModal.type === 'ALERT') {
        const parsedTarget = parseFloat(orderModal.targetPrice);
        if (!parsedTarget || parsedTarget <= 0) {
          setOrderModal(prev => ({ ...prev, isSubmitting: false, error: 'Please enter a valid target trigger price.' }));
          return;
        }
        await axios.post(`${API_URL}/api/alerts`, {
          userId: currUser.uid,
          symbol: orderModal.symbol,
          targetPrice: parsedTarget,
          condition: orderModal.alertCondition
        });
        fetchAlerts(currUser.uid);
        setOrderModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
        showToast(`Alert registered: ${orderModal.symbol} ${orderModal.alertCondition} ${getCurrencySymbol(orderModal.currency)}${formatPrice(parsedTarget, orderModal.currency)}`);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Order execution failed.';
      setOrderModal(prev => ({ ...prev, isSubmitting: false, error: errorMsg }));
    } finally {
      submittingOrder.current = false;
    }
  };

  const getAIInsight = async () => {
    setAiLoading(true);
    try {
      const stockCur = data?.meta?.currency || inferCurrencyFromSymbol(data?.meta?.symbol);
      const res = await axios.post(`${API_URL}/api/ai-analysis`, {
        symbol: data?.meta?.symbol,
        price: data?.values[0].close,
        currency: stockCur,
        rsi: calculateRSI(data.values),
        sentiment: !news.length ? 'Unavailable' : avgSent === 0 ? 'Neutral' : avgSent > 0 ? 'Bullish' : 'Bearish',
        news: news
      });
      setAiAnalysis((res.data.source === 'indicator' ? 'Indicator summary · ' : 'AI-generated summary · ') + res.data.analysis);
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

  // Calculate Real Portfolio Metrics with Multi-Currency FX Engine
  const portfolioHoldingsWithPnL = portfolio.map((p) => {
    const nativeCurrency = p.currency || inferCurrencyFromSymbol(p.symbol);
    const nativeSymbol = getCurrencySymbol(nativeCurrency);

    const currPrice = portfolioPrices[p.symbol]?.price ?? NaN;
    const entryPrice = parseFloat(p.price || 0);

    const costBasisNative = p.qty * entryPrice;
    const currentValNative = p.qty * currPrice;
    const pnlNative = currentValNative - costBasisNative;
    const pnlPercent = costBasisNative > 0 ? (pnlNative / costBasisNative) * 100 : NaN;

    // Convert values to both USD and INR using the global FX engine
    const currentValUSD = Number.isFinite(currPrice) ? convertPrice(currentValNative, nativeCurrency, 'USD', fxRates) : NaN;
    const currentValINR = Number.isFinite(currPrice) ? convertPrice(currentValNative, nativeCurrency, 'INR', fxRates) : NaN;
    const costBasisUSD = convertPrice(costBasisNative, nativeCurrency, 'USD', fxRates);
    const costBasisINR = convertPrice(costBasisNative, nativeCurrency, 'INR', fxRates);
    const pnlUSD = currentValUSD - costBasisUSD;
    const pnlINR = currentValINR - costBasisINR;

    // Converted to active baseCurrency
    const isBaseUSD = baseCurrency === 'USD';
    const currentValBase = isBaseUSD ? currentValUSD : currentValINR;
    const costBasisBase = isBaseUSD ? costBasisUSD : costBasisINR;
    const pnlBase = isBaseUSD ? pnlUSD : pnlINR;

    return {
      ...p,
      isIndian: nativeCurrency === 'INR',
      nativeCurrency,
      nativeSymbol,
      currPrice,
      entryPrice,
      costBasisNative,
      currentValNative,
      pnlNative,
      pnlPercent,
      currentValUSD,
      currentValINR,
      costBasisUSD,
      costBasisINR,
      pnlUSD,
      pnlINR,
      currentValBase,
      costBasisBase,
      pnlBase
    };
  });

  const totalPortfolioValue = portfolioHoldingsWithPnL.reduce((acc, p) => acc + p.currentValBase, 0);
  const totalCostBasis = portfolioHoldingsWithPnL.reduce((acc, p) => acc + p.costBasisBase, 0);
  const totalUnrealizedPnL = totalPortfolioValue - totalCostBasis;
  const totalUnrealizedPnLPercent = totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;

  // Secondary alternative currency representation
  const totalPortfolioValueAlt = Number.isFinite(totalPortfolioValue) ? convertPrice(totalPortfolioValue, baseCurrency, altCurrency, fxRates) : NaN;
  const virtualBalanceBase = convertPrice(virtualBalance, 'USD', baseCurrency, fxRates);

  // Export Portfolio
  const exportPortfolio = async (type) => {
    if (portfolio.length === 0) {
      showToast('No active holdings to export', 'error');
      return;
    }
    showToast('Compiling export data...', 'success');

    try {
      const headers = ['Symbol', 'Quantity', 'Entry Price', 'Market Price', 'Native Value', `Value (${baseCurrency})`, 'Unrealized P/L'];
      const rows = portfolioHoldingsWithPnL.map((p) => [
        p.symbol,
        p.qty.toString(),
        `${p.nativeSymbol}${formatPrice(p.entryPrice, p.nativeCurrency)}`,
        `${p.nativeSymbol}${formatPrice(p.currPrice, p.nativeCurrency)}`,
        `${p.nativeSymbol}${formatPrice(p.currentValNative, p.nativeCurrency)}`,
        `${baseCurSymbol}${formatPrice(p.currentValBase, baseCurrency)}`,
        `${p.pnlNative >= 0 ? '+' : ''}${p.nativeSymbol}${formatPrice(p.pnlNative, p.nativeCurrency)} (${formatPrice(p.pnlPercent, p.nativeCurrency, { minDecimals: 1, maxDecimals: 1 })}%)`
      ]);

      if (type === 'csv') {
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `FinIntel_Portfolio_${baseCurrency}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exported CSV report');
      } else if (type === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`FinIntel — Institutional Portfolio Statement (${baseCurrency})`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toUTCString()} | Valuation: ${baseCurSymbol}${formatPrice(totalPortfolioValue, baseCurrency)} | FX: 1 USD = ₹${fxRate.toFixed(2)}`, 14, 22);
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 28,
          theme: 'grid',
          headStyles: { fillColor: [25, 35, 29] }
        });
        doc.save(`FinIntel_Statement_${baseCurrency}_${new Date().toISOString().split('T')[0]}.pdf`);
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
              <span className="term-badge neutral font-mono desktop-tag" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>Desktop</span>
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
                    {a.condition} {getCurrency(a.symbol)}{formatPrice(a.targetPrice, a.symbol)} · {a.triggered ? 'Triggered' : 'Watching'}
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
                    } else if (suggestions.length > 0 && suggestions[0]?.symbol) {
                      const selected = suggestions[0].symbol;
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
                className="btn btn-secondary btn-sm topbar-quant-btn"
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
                    <div className="stock-symbol-large" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <span>{data?.meta?.symbol || symbol}</span>
                      <span className="stock-price-large font-mono">
                        {currencySymbol}{formatPrice(data?.values?.[0]?.close || 0, stockCurrency)}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginLeft: '6px', fontWeight: '500' }}>
                          {stockCurrency}
                        </span>
                      </span>
                      {stockCurrency !== baseCurrency && (
                        <span className="term-badge neutral font-mono" style={{ fontSize: '0.8rem', padding: '2px 8px' }}>
                          ≈ {baseCurSymbol}{formatPrice(convertPrice(data?.values?.[0]?.close || 0, stockCurrency, baseCurrency, fxRates), baseCurrency)} {baseCurrency}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      Last Updated: {data?.values?.[0]?.datetime || 'Live'}
                    </span>
                  </div>

                  <div className="stock-header-actions">
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
                        {formatLargeCap(data.fundamentals.profile.marketCapitalization * 1000000, stockCurrency)}
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
                        {currencySymbol}{formatPrice(data.fundamentals.metrics['52WeekLow'], stockCurrency, { maxDecimals: 1 })} - {currencySymbol}{formatPrice(data.fundamentals.metrics['52WeekHigh'], stockCurrency, { maxDecimals: 1 })}
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
                    {aiAnalysis || 'Summarize the displayed indicators and recent headlines.'}
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
              {/* Question 1 & 2: Multi-Currency Valuation, Cost Basis, Buying Power & Risk Node */}
              <div className="dashboard-span-12">
                <div className="portfolio-summary-bar">
                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Portfolio Valuation ({baseCurrency})</span>
                    <span className="summary-metric-value">
                      {baseCurSymbol}{formatPrice(totalPortfolioValue, baseCurrency)}
                    </span>
                    {Number.isFinite(totalUnrealizedPnL) ? (
                      <span className={`summary-metric-sub ${totalUnrealizedPnL >= 0 ? 'pos' : 'neg'}`}>
                        {totalUnrealizedPnL >= 0 ? '+' : ''}{baseCurSymbol}{formatPrice(totalUnrealizedPnL, baseCurrency)} ({totalUnrealizedPnLPercent.toFixed(1)}% unrealized)
                      </span>
                    ) : <span className="summary-metric-sub">Waiting for one or more quotes</span>}
                    {portfolio.length > 0 && Number.isFinite(totalPortfolioValueAlt) && (
                      <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        ≈ {altCurSymbol}{formatPrice(totalPortfolioValueAlt, altCurrency)} {altCurrency}
                      </span>
                    )}
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Cost Basis ({baseCurrency})</span>
                    <span className="summary-metric-value">
                      {baseCurSymbol}{totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="summary-metric-sub neutral">
                      {portfolio.length} Active Positions
                    </span>
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Virtual Buying Power</span>
                    <span className="summary-metric-value" style={{ color: 'var(--accent)' }}>
                      {baseCurSymbol}{virtualBalanceBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="summary-metric-sub neutral">
                      {baseCurrency === 'INR' ? `$${virtualBalance.toFixed(2)} USD Paper Capital` : 'Paper Simulator Capital'}
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

              {/* Question 3 & 4: Multi-Currency Holdings Table with Dynamic Currency Alignment (Span 8) */}
              <div className="terminal-panel dashboard-span-8">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">
                      <PieChart size={18} color="var(--accent)" />
                      Real Portfolio Holdings
                    </h2>
                    <span className="panel-subtitle">
                      Live positions, cost basis, mark-to-market valuations, and multi-currency FX normalization
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* FX quote shows the provider and its own quote time. */}
                    <div 
                      className="fx-rate-pill" 
                      title={`USD/INR source: ${fxRateSource}. Provider quote time: ${fxLastUpdated ? fxLastUpdated.toLocaleString() : 'unavailable'}. ${fxWasCached ? 'Served from backend cache.' : 'Fetched from provider.'} Rates from different providers may vary.`}
                    >
                      <Globe size={12} color="var(--accent)" />
                      <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        1 USD = ₹{fxRate.toFixed(2)}
                      </span>
                      <span className="font-mono" style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)' }}>
                        {fxRateSource === 'ExchangeRate-API' ? 'ExchangeRate' : fxRateSource === 'Yahoo Finance' ? 'Yahoo' : fxRateSource === 'Open Exchange Rates' ? 'Open ER' : 'Fallback'}
                        {' · '}{fxLastUpdated ? fxLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                      <button
                        type="button"
                        className="fx-refresh-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchFxRate(true);
                        }}
                        disabled={isFxLoading}
                        title="Invalidate cache & force refresh exchange rates"
                        aria-label="Refresh exchange rates"
                      >
                        <RefreshCw size={11} className={isFxLoading ? 'spin' : ''} />
                      </button>
                    </div>

                    {/* Currency Toggle */}
                    <div className="currency-toggle-group" title="Select Portfolio Base Currency">
                      <button
                        type="button"
                        className={`currency-toggle-btn ${baseCurrency === 'USD' ? 'active' : ''}`}
                        onClick={() => toggleBaseCurrency('USD')}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        className={`currency-toggle-btn ${baseCurrency === 'INR' ? 'active' : ''}`}
                        onClick={() => toggleBaseCurrency('INR')}
                      >
                        INR (₹)
                      </button>
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
                          const isPos = p.pnlNative >= 0;
                          return (
                            <tr key={p._id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span
                                    className="font-mono"
                                    style={{ fontWeight: '700', color: 'var(--accent)', cursor: 'pointer' }}
                                    onClick={() => fetchStockData(p.symbol)}
                                    title="Inspect Stock Chart"
                                  >
                                    {p.symbol}
                                  </span>
                                  <span className="term-badge neutral" style={{ fontSize: '0.62rem', padding: '1px 4px' }}>
                                    {p.nativeCurrency}
                                  </span>
                                </div>
                              </td>
                              <td className="num-col font-mono">{p.qty} shrs</td>
                              <td className="num-col font-mono">{p.nativeSymbol}{formatPrice(p.entryPrice, p.nativeCurrency)}</td>
                              <td className="num-col font-mono">{p.nativeSymbol}{formatPrice(p.currPrice, p.nativeCurrency)}</td>
                              <td className="num-col font-mono" style={{ fontWeight: '600' }}>
                                <div>{p.nativeSymbol}{formatPrice(p.currentValNative, p.nativeCurrency)}</div>
                                {p.nativeCurrency !== baseCurrency && (
                                  <div style={{ fontSize: '0.68rem', fontWeight: '400', color: 'var(--text-tertiary)' }}>
                                    ≈ {baseCurSymbol}{formatPrice(p.currentValBase, baseCurrency)}
                                  </div>
                                )}
                              </td>
                              <td className="num-col font-mono">
                                {Number.isFinite(p.pnlNative) ? (
                                  <span className={`term-badge ${isPos ? 'pos' : 'neg'}`}>
                                    {isPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {isPos ? '+' : ''}{p.nativeSymbol}{formatPrice(Math.abs(p.pnlNative), p.nativeCurrency)} ({formatPrice(p.pnlPercent, p.nativeCurrency, { minDecimals: 1, maxDecimals: 1 })}%)
                                  </span>
                                ) : '—'}
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
                          transition: 'border-color 0.15s',
                          minWidth: 0,
                          maxWidth: '100%',
                          boxSizing: 'border-box'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: '500', color: 'var(--text-primary)', lineHeight: '1.4', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
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
                    ${virtualBalance.toFixed(2)} USD Cash{baseCurrency === 'INR' ? ` (≈ ₹${(virtualBalance * fxRate).toLocaleString(undefined, { maximumFractionDigits: 0 })})` : ''}
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
                            <td className="num-col font-mono">{getCurrencySymbol(p.currency || p.symbol)}{formatPrice(p.price, p.currency || p.symbol)}</td>
                            <td style={{ textAlign: 'right' }}>
                                <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setOrderModal({
                                  isOpen: true,
                                  type: 'SELL',
                                  symbol: p.symbol,
                                  price: portfolioPrices[p.symbol]?.price ?? p.price,
                                  currency: p.currency || inferCurrencyFromSymbol(p.symbol),
                                  sharesHeld: p.qty,
                                  qty: p.qty,
                                  isSubmitting: false,
                                  error: ''
                                })}
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

      {/* Institutional Paper Order & Action Modal */}
      {orderModal.isOpen && (
        <div
          className="order-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !orderModal.isSubmitting) {
              setOrderModal(prev => ({ ...prev, isOpen: false }));
            }
          }}
        >
          <div className="order-modal-card">
            <div className="order-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`term-badge font-mono ${orderModal.type === 'BUY' ? 'pos' : orderModal.type === 'SELL' ? 'neg' : 'neutral'}`}>
                  {orderModal.type === 'BUY' ? 'PAPER BUY' : orderModal.type === 'SELL' ? 'PAPER SELL' : orderModal.type === 'PORTFOLIO' ? 'ADD HOLDING' : 'PRICE ALERT'}
                </span>
                <span className="order-modal-sym font-mono">{orderModal.symbol}</span>
              </div>
              <button
                className="order-modal-close"
                onClick={() => !orderModal.isSubmitting && setOrderModal(prev => ({ ...prev, isOpen: false }))}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="order-modal-body">
              {/* Market Telemetry Row */}
              <div className="order-price-bar">
                <div>
                  <span className="order-info-label">Indicative Market Price</span>
                  <div className="order-price-display font-mono">
                    <span className="status-dot"></span>
                    {getCurrencySymbol(orderModal.currency)}{formatPrice(orderModal.price, orderModal.currency)}
                    {orderModal.currency !== 'USD' && (
                      <span className="order-price-converted">
                        ≈ ${convertPrice(orderModal.price, orderModal.currency, 'USD', fxRates).toFixed(2)} USD
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {['BUY', 'SELL'].includes(orderModal.type) && (
                    <>
                      <span className="order-info-label">Available Sim Cash</span>
                      <span className="order-balance-val font-mono">
                        ${virtualBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </>
                  )}
                  {orderModal.type === 'SELL' && (
                    <span className="order-shares-held font-mono">
                      Held: {orderModal.sharesHeld} shares
                    </span>
                  )}
                </div>
              </div>

              {/* Input fields based on orderModal.type */}
              {orderModal.type === 'ALERT' ? (
                <div className="order-input-group">
                  <label className="order-input-label">Alert Trigger Condition</label>
                  <div className="order-condition-selector">
                    <button
                      type="button"
                      className={`order-condition-btn ${orderModal.alertCondition === 'ABOVE' ? 'active pos' : ''}`}
                      onClick={() => setOrderModal(prev => ({ ...prev, alertCondition: 'ABOVE' }))}
                    >
                      Price Rises Above (▲)
                    </button>
                    <button
                      type="button"
                      className={`order-condition-btn ${orderModal.alertCondition === 'BELOW' ? 'active neg' : ''}`}
                      onClick={() => setOrderModal(prev => ({ ...prev, alertCondition: 'BELOW' }))}
                    >
                      Price Drops Below (▼)
                    </button>
                  </div>

                  <label className="order-input-label" style={{ marginTop: '14px' }}>
                    Target Trigger Price ({orderModal.currency})
                  </label>
                  <div className="order-qty-row">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      className="order-number-input font-mono"
                      value={orderModal.targetPrice}
                      onChange={(e) => setOrderModal(prev => ({ ...prev, targetPrice: e.target.value, error: '' }))}
                      placeholder="Enter target price"
                    />
                  </div>
                </div>
              ) : (
                <div className="order-input-group">
                  <label className="order-input-label">
                    {orderModal.type === 'PORTFOLIO' ? 'Shares to Record' : 'Order Quantity (Shares)'}
                  </label>
                  <div className="order-qty-row">
                    <button
                      type="button"
                      className="order-qty-step-btn"
                      onClick={() => setOrderModal(prev => ({ ...prev, qty: Math.max(1, (parseFloat(prev.qty) || 1) - 1), error: '' }))}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      className="order-number-input font-mono"
                      value={orderModal.qty}
                      onChange={(e) => setOrderModal(prev => ({ ...prev, qty: e.target.value, error: '' }))}
                      placeholder="Shares"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="order-qty-step-btn"
                      onClick={() => setOrderModal(prev => ({ ...prev, qty: (parseFloat(prev.qty) || 0) + 1, error: '' }))}
                    >
                      +
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div className="order-presets-row">
                    {[1, 5, 10, 25, 50, 100].map(n => (
                      <button
                        key={n}
                        type="button"
                        className="order-preset-pill"
                        onClick={() => setOrderModal(prev => ({ ...prev, qty: n, error: '' }))}
                      >
                        +{n}
                      </button>
                    ))}
                    {orderModal.type === 'BUY' && (
                      <button
                        type="button"
                        className="order-preset-pill max-btn"
                        onClick={() => {
                          const priceUsd = convertPrice(orderModal.price, orderModal.currency, 'USD', fxRates);
                          const maxShares = priceUsd > 0 ? Math.floor(virtualBalance / priceUsd) : 0;
                          setOrderModal(prev => ({ ...prev, qty: Math.max(1, maxShares), error: '' }));
                        }}
                      >
                        Max Buy
                      </button>
                    )}
                    {orderModal.type === 'SELL' && orderModal.sharesHeld > 0 && (
                      <button
                        type="button"
                        className="order-preset-pill max-btn"
                        onClick={() => setOrderModal(prev => ({ ...prev, qty: orderModal.sharesHeld, error: '' }))}
                      >
                        All ({orderModal.sharesHeld})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Order Calculations Breakdown (for BUY/SELL) */}
              {['BUY', 'SELL'].includes(orderModal.type) && (() => {
                const parsedQty = parseFloat(orderModal.qty) || 0;
                const totalNative = parsedQty * orderModal.price;
                const totalUsd = convertPrice(totalNative, orderModal.currency, 'USD', fxRates);
                const isInsufficient = orderModal.type === 'BUY' && totalUsd > virtualBalance;
                const isOverSelling = orderModal.type === 'SELL' && parsedQty > orderModal.sharesHeld;
                const remainingCash = orderModal.type === 'BUY' ? virtualBalance - totalUsd : virtualBalance + totalUsd;

                return (
                  <div className="order-calculation-card">
                    <div className="order-calc-row">
                      <span className="order-calc-label">Estimated Total ({orderModal.currency})</span>
                      <span className="order-calc-val font-mono">
                        {getCurrencySymbol(orderModal.currency)}{formatPrice(totalNative, orderModal.currency)}
                      </span>
                    </div>
                    {orderModal.currency !== 'USD' && (
                      <div className="order-calc-row">
                        <span className="order-calc-label">Normalized Total (USD)</span>
                        <span className="order-calc-val font-mono">≈ ${totalUsd.toFixed(2)} USD</span>
                      </div>
                    )}
                    <div className="order-calc-row">
                      <span className="order-calc-label">Estimated Cash Balance</span>
                      <span className={`order-calc-val font-mono ${isInsufficient ? 'neg' : ''}`}>
                        ${Math.max(0, remainingCash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                      </span>
                    </div>
                    <p className="order-calc-label">The fill uses a recent server-verified quote.</p>
                    {isInsufficient && (
                      <div className="order-validation-msg neg">
                        ⚠️ Estimated cost exceeds available cash. Estimated total: ${totalUsd.toFixed(2)} USD.
                      </div>
                    )}
                    {isOverSelling && (
                      <div className="order-validation-msg neg">
                        ⚠️ Cannot sell more than currently held ({orderModal.sharesHeld} shares).
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Error message from backend */}
              {orderModal.error && (
                <div className="order-validation-msg neg">
                  {orderModal.error}
                </div>
              )}
            </div>

            <div className="order-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={orderModal.isSubmitting}
                onClick={() => setOrderModal(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${orderModal.type === 'BUY' ? 'btn-primary' : orderModal.type === 'SELL' ? 'btn-danger' : 'btn-primary'}`}
                disabled={
                  orderModal.isSubmitting ||
                  (orderModal.type === 'ALERT' && (!parseFloat(orderModal.targetPrice) || parseFloat(orderModal.targetPrice) <= 0)) ||
                  (orderModal.type !== 'ALERT' && (!parseFloat(orderModal.qty) || parseFloat(orderModal.qty) <= 0)) ||
                  (orderModal.type === 'SELL' && (parseFloat(orderModal.qty) || 0) > orderModal.sharesHeld)
                }
                onClick={executeModalOrder}
              >
                {orderModal.isSubmitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={14} className="spin" /> Executing...
                  </span>
                ) : (
                  <span>
                    {orderModal.type === 'BUY'
                      ? 'Execute Paper Buy'
                      : orderModal.type === 'SELL'
                      ? 'Execute Paper Sell'
                      : orderModal.type === 'PORTFOLIO'
                      ? 'Add to Portfolio'
                      : 'Create Price Alert'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quant Lab Modal */}
      {isQuantLabOpen && (
        <QuantLab
          onClose={() => setIsQuantLabOpen(false)}
          userPortfolio={portfolio}
          paperPortfolio={paperPortfolio}
          portfolioPrices={portfolioPrices}
          fxRates={portfolioFxRates}
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
