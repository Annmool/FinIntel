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
import PortfolioStress from './PortfolioStress';
import MetalsPanel from './MetalsPanel';
import PaperTradeHistory from './PaperTradeHistory';
import HoldingCostEditor from './HoldingCostEditor';
import { calculateRSI } from './utils/indicators';
import {
  DEFAULT_FX_RATES,
  inferCurrencyFromSymbol,
  getCurrencyCode,
  getCurrencySymbol,
  formatPrice,
  convertPrice,
  formatLargeCap
} from './utils/currency';
import { portfolioCsvRows, toCsv } from './utils/exportCsv';
import { auth, provider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import { API_URL } from './apiConfig';

function App() {
  const pendingPaperOrder = useRef(null);
  const submittingOrder = useRef(false);
  const balanceRequest = useRef(0);
  const stockRequest = useRef(0);
  const stockController = useRef(null);
  const [user, setUser] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [paperPortfolio, setPaperPortfolio] = useState([]);
  const [paperHistoryRefresh, setPaperHistoryRefresh] = useState(0);
  const [editingHolding, setEditingHolding] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [accountStatus, setAccountStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [apiStatus, setApiStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('finintel_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [briefing, setBriefing] = useState([]);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [appError, setAppError] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [virtualBalance, setVirtualBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
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
        setApiStatus('online');
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
        setApiStatus('offline');
        setPortfolioFxRates({});
        if (force) {
          showToast('Using local exchange rates (backend connecting...)', 'error');
        }
      })
      .finally(() => {
        setIsFxLoading(false);
      });
  }, []);

  const fetchVirtualBalance = useCallback(async (uid) => {
    const requestId = ++balanceRequest.current;
    const isCurrent = () => auth.currentUser?.uid === uid && requestId === balanceRequest.current;
    setBalanceLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/virtual-account/${uid}`);
      if (isCurrent()) {
        const balance = res.data?.balance;
        setVirtualBalance(Number.isFinite(balance) && balance >= 0 ? balance : null);
      }
    } catch (_) {
      if (isCurrent()) setVirtualBalance(null);
    } finally {
      if (isCurrent()) setBalanceLoading(false);
    }
  }, []);

  const fetchPaperPortfolio = useCallback(async (uid) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/paper-portfolio/${uid}`);
      if (auth.currentUser?.uid !== uid) return true;
      setPaperPortfolio(data);
      return true;
    } catch (e) { return false; }
  }, []);

  const fetchWatchlist = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/watchlist/${uid}`);
      if (auth.currentUser?.uid === uid) setWatchlist(res.data);
      return true;
    } catch (e) { return false; }
  };

  const fetchPortfolio = useCallback(async (uid) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/portfolio/${uid}`);
      if (auth.currentUser?.uid !== uid) return true;
      setPortfolio(data);
      return true;
    } catch (e) { return false; }
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    const symbols = new Set([...portfolio, ...paperPortfolio].map(holding => holding.symbol));
    if (!uid || symbols.size === 0) return;
    const controller = new AbortController();
    const config = { signal: controller.signal, timeout: 25000 };
    async function loadMark(symbol) {
      const url = `${API_URL}/api/stock/${encodeURIComponent(symbol)}`;
      let mark;
      try {
        ({ data: mark } = await axios.get(`${url}/mark`, config));
      } catch (error) {
        // The frontend and backend can deploy independently.
        if (error.response?.status === 404 && !controller.signal.aborted) {
          try {
            const { data } = await axios.get(url, config);
            const candle = data?.values?.[0];
            const age = Date.now() - Date.parse(candle?.datetime);
            if (age >= 0 && age <= 7 * 86400000) {
              mark = {
                price: Number(candle.close), date: candle.datetime, currency: data.meta?.currency,
                source: data.meta?.source, status: age <= 4 * 86400000 ? 'recent-close' : 'last-known'
              };
            }
          } catch (_) { /* The previous mark may still be usable. */ }
        }
      }
      if (controller.signal.aborted || auth.currentUser?.uid !== uid) return;
      setPortfolioPrices(previous => {
        const oldMark = previous[symbol];
        const valid = Number.isFinite(mark?.price) && mark.price > 0 && mark.currency && mark.date;
        if (valid && (!oldMark?.date || mark.date >= oldMark.date)) return { ...previous, [symbol]: mark };
        if (oldMark?.date && Date.now() - Date.parse(oldMark.date) <= 7 * 86400000) {
          return { ...previous, [symbol]: { ...oldMark, status: 'last-known' } };
        }
        return { ...previous, [symbol]: { status: 'unavailable' } };
      });
    }
    const refresh = () => symbols.forEach(loadMark);
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [paperPortfolio, portfolio, user?.uid]);

  const fetchAlerts = async (uid) => {
    try {
      const res = await axios.get(`${API_URL}/api/alerts/${uid}`);
      if (auth.currentUser?.uid === uid) setAlerts(res.data);
      return true;
    } catch (e) { return false; }
  };

  // An empty list after a failed request looks like an account with nothing in
  // it, so the first load reports whether every account request succeeded.
  const loadAccount = async (uid) => {
    setAccountStatus('loading');
    fetchVirtualBalance(uid);
    const results = await Promise.all([fetchWatchlist(uid), fetchPortfolio(uid), fetchPaperPortfolio(uid), fetchAlerts(uid)]);
    if (auth.currentUser?.uid === uid) setAccountStatus(results.every(Boolean) ? 'ready' : 'error');
  };
  // The sign-in listener is registered once; it reaches the current loader through this ref.
  const loadAccountRef = useRef(loadAccount);
  loadAccountRef.current = loadAccount;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('finintel_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      balanceRequest.current += 1;
      setUser(u);
      setEditingHolding(null);
      setWatchlist([]);
      setPortfolio([]);
      setPaperPortfolio([]);
      setAlerts([]);
      setPortfolioPrices({});
      setVirtualBalance(null);
      setBalanceLoading(false);
      setAccountStatus('idle');
      if (u) loadAccountRef.current(u.uid);
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
        .catch(() => {})
        .finally(() => setBriefingLoading(false));
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
  }, [fetchFxRate, fetchPaperPortfolio, fetchPortfolio, fetchVirtualBalance]);

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

  useEffect(() => () => stockController.current?.abort(), []);

  useEffect(() => {
    if (activeTab !== 'markets') {
      stockController.current?.abort();
      stockRequest.current += 1;
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStockData = async (input) => {
    const requested = (input || symbol)?.trim().toUpperCase();
    if (!requested) return;
    const requestId = ++stockRequest.current;
    stockController.current?.abort();
    const controller = new AbortController();
    stockController.current = controller;
    const config = { signal: controller.signal, timeout: 25000 };
    setShowSuggestions(false);
    setSuggestions([]);
    setSymbol(requested);
    setLoading(true);
    setAppError('');
    setAiAnalysis('');
    setAiLoading(false);
    setData(null);
    setNews([]);
    setNewsLoading(true);
    setActiveTab('markets');
    try {
      let target = requested;
      let stock;
      try {
        stock = await axios.get(`${API_URL}/api/stock/${encodeURIComponent(target)}`, config);
      } catch (error) {
        if (controller.signal.aborted) return;
        const { data: matches } = await axios.get(`${API_URL}/api/search/${encodeURIComponent(target)}`, config);
        if (!matches?.[0]?.symbol || matches[0].symbol.toUpperCase() === target) throw error;
        target = matches[0].symbol.toUpperCase();
        stock = await axios.get(`${API_URL}/api/stock/${encodeURIComponent(target)}`, config);
      }
      if (requestId !== stockRequest.current || controller.signal.aborted) return;
      if (!stock.data?.values?.length) throw new Error('No closing prices available');
      const values = [...stock.data.values].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
      setSymbol(target);
      setData({ ...stock.data, values, fundamentals: {} });
      // Optional panels populate independently so news cannot delay a usable chart.
      axios.get(`${API_URL}/api/news/${encodeURIComponent(target)}`, config).then(({ data }) => {
        if (!controller.signal.aborted && requestId === stockRequest.current) setNews(Array.isArray(data) ? data : []);
      }).catch(() => {}).finally(() => {
        if (!controller.signal.aborted && requestId === stockRequest.current) setNewsLoading(false);
      });
      axios.get(`${API_URL}/api/fundamentals/${encodeURIComponent(target)}`, config).then(({ data }) => {
        if (!controller.signal.aborted && requestId === stockRequest.current) {
          setData(previous => previous ? { ...previous, fundamentals: data || {} } : previous);
        }
      }).catch(() => {});
    } catch (error) {
      if (!controller.signal.aborted && requestId === stockRequest.current) {
        setAppError(error.response?.data?.error || 'The market feed is unavailable. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted && requestId === stockRequest.current) setLoading(false);
    }
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
          await axios.delete(`${API_URL}/api/watchlist/${currUser.uid}/${encodeURIComponent(currentSymbol)}`);
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
        costPrice: '',
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

  const closeOrderModal = useCallback(() => {
    if (submittingOrder.current) return;
    pendingPaperOrder.current = null;
    setOrderModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    if (!orderModal.isOpen) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') closeOrderModal(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orderModal.isOpen, closeOrderModal]);

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
          setPaperHistoryRefresh(value => value + 1);
        }
        setOrderModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
        const verb = side === 'buy' ? 'Bought' : 'Sold';
        showToast(`${verb} ${qty} ${orderModal.symbol} @ ${getCurrencySymbol(fill.currency)}${formatPrice(fill.executedPrice, fill.currency)} (${fill.quoteSource})`);
      } else if (orderModal.type === 'PORTFOLIO') {
        const qty = Number(orderModal.qty);
        const price = Number(orderModal.costPrice);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Please enter a valid share quantity.');
        if (!Number.isFinite(price) || price <= 0) throw new Error('Please enter a positive purchase price per share.');
        await axios.post(`${API_URL}/api/portfolio`, {
          userId: currUser.uid,
          symbol: orderModal.symbol,
          qty,
          price,
          currency: getCurrencyCode(orderModal.currency)
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
          condition: orderModal.alertCondition,
          currency: getCurrencyCode(orderModal.currency)
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
    const requestId = stockRequest.current;
    setAiLoading(true);
    try {
      const stockCur = data?.meta?.currency || inferCurrencyFromSymbol(data?.meta?.symbol);
      const res = await axios.post(`${API_URL}/api/ai-analysis`, {
        symbol: data?.meta?.symbol,
        price: data?.values[0].close,
        currency: stockCur,
        rsi: calculateRSI(data.values),
        sentiment: headlineSentiment || 'Unavailable',
        news: news
      });
      if (requestId === stockRequest.current) {
        setAiAnalysis((res.data.source === 'indicator' ? 'Indicator summary · ' : 'AI-generated summary · ') + res.data.analysis);
      }
    } catch (e) {
      if (requestId === stockRequest.current) setAiAnalysis('Analysis generation failed. Check API connectivity.');
    } finally {
      if (requestId === stockRequest.current) setAiLoading(false);
    }
  };

  const rsiScore = data ? calculateRSI(data.values) : null;
  const headlineScores = news.map(article => article.sentimentScore).filter(Number.isFinite);
  const headlineScore = headlineScores.reduce((total, score) => total + score, 0);
  const headlineSentiment = headlineScores.length ? (headlineScore === 0 ? 'Neutral' : headlineScore > 0 ? 'Bullish' : 'Bearish') : null;
  const getVerdict = (rsi) => {
    const v = parseFloat(rsi);
    if (v < 35) return { label: 'OVERSOLD', color: 'var(--success)' };
    if (v > 65) return { label: 'OVERBOUGHT', color: 'var(--danger)' };
    return { label: 'NEUTRAL', color: 'var(--warning)' };
  };
  const verdict = rsiScore ? getVerdict(rsiScore) : { label: 'Unavailable', color: 'var(--text-tertiary)' };

  // Calculate Real Portfolio Metrics with Multi-Currency FX Engine
  const portfolioHoldingsWithPnL = portfolio.map((p) => {
    const mark = portfolioPrices[p.symbol];
    const markCurrency = mark?.currency ? getCurrencyCode(mark.currency) : null;
    const nativeCurrency = p.currency || (markCurrency === 'GBX' ? 'GBX' : inferCurrencyFromSymbol(p.symbol));
    const nativeSymbol = getCurrencySymbol(nativeCurrency);

    const matchingQuote = markCurrency === nativeCurrency ||
      (markCurrency === 'GBP' && nativeCurrency === 'GBX') ||
      (markCurrency === 'GBX' && nativeCurrency === 'GBP');
    const currPrice = matchingQuote ? convertPrice(mark.price, markCurrency, nativeCurrency, fxRates) : NaN;
    const entryPrice = parseFloat(p.price || 0);

    const costBasisNative = p.qty * entryPrice;
    const currentValNative = p.qty * currPrice;
    const pnlNative = currentValNative - costBasisNative;
    const pnlPercent = costBasisNative > 0 ? (pnlNative / costBasisNative) * 100 : NaN;

    const fxCurrency = nativeCurrency === 'GBX' ? 'GBP' : nativeCurrency;
    const toDisplayCurrency = (amount, currency) => {
      if (!Number.isFinite(amount)) return NaN;
      if (nativeCurrency === currency) return amount;
      if (!(fxRates[fxCurrency] > 0) || !(fxRates[currency] > 0)) return NaN;
      return convertPrice(amount, nativeCurrency, currency, fxRates);
    };
    const currentValUSD = toDisplayCurrency(currentValNative, 'USD');
    const currentValINR = toDisplayCurrency(currentValNative, 'INR');
    const costBasisUSD = toDisplayCurrency(costBasisNative, 'USD');
    const costBasisINR = toDisplayCurrency(costBasisNative, 'INR');
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
  const balanceUnavailable = balanceLoading || virtualBalance === null;
  const balanceStatus = balanceLoading ? 'Loading…' : user ? 'Unavailable' : 'Sign in to view';
  const virtualBalanceBase = balanceUnavailable ? null : convertPrice(virtualBalance, 'USD', baseCurrency, fxRates);

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
        const blob = new Blob([String.fromCharCode(0xFEFF) + toCsv(portfolioCsvRows(portfolioHoldingsWithPnL, baseCurrency))], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `FinIntel_Portfolio_${baseCurrency}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
                stockController.current?.abort();
                stockRequest.current += 1;
                setLoading(false);
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
                    try {
                      await axios.delete(`${API_URL}/api/watchlist/${user.uid}/${encodeURIComponent(item.symbol)}`);
                    } catch (error) {
                      showToast(`Could not remove ${item.symbol}. Try again.`, 'error');
                    }
                    fetchWatchlist(user.uid);
                  }}
                  title="Remove from Watchlist"
                  aria-label={`Remove ${item.symbol} from watchlist`}
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
                    {a.condition} {getCurrencySymbol(a.currency || a.receipt?.currency || inferCurrencyFromSymbol(a.symbol))}
                    {formatPrice(a.targetPrice, a.currency || a.receipt?.currency || inferCurrencyFromSymbol(a.symbol))} · {a.triggered ? 'Triggered' : 'Watching'}
                  </span>
                  {a.triggered && a.receipt && (
                    <details className="trigger-receipt">
                      <summary>Trigger details</summary>
                      <small className="receipt-detail">
                        Observed {getCurrencySymbol(a.receipt.currency)}{formatPrice(a.receipt.price, a.receipt.currency)} · {a.receipt.source}
                      </small>
                      <small className="receipt-detail">Quote time · {new Date(a.receipt.quoteTime).toLocaleString()}</small>
                      <small className="receipt-detail">Recorded · {new Date(a.receipt.triggeredAt).toLocaleString()}</small>
                    </details>
                  )}
                </div>
                <button
                  className="sidebar-item-del"
                  aria-label={`Delete ${a.symbol} price trigger`}
                  onClick={async () => {
                    try {
                      await axios.delete(`${API_URL}/api/alerts/${a._id}`);
                    } catch (error) {
                      showToast(`Could not delete the ${a.symbol} trigger. Try again.`, 'error');
                    }
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

            <div className="uptime-strip" role="status" title="Based on the dashboard's most recent request to the FinIntel API">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  className="status-dot"
                  style={apiStatus === 'online' ? undefined : { background: apiStatus === 'offline' ? 'var(--danger)' : 'var(--warning)', boxShadow: 'none', animation: 'none' }}
                ></span>
                <span>
                  {apiStatus === 'online' ? 'API connected' : apiStatus === 'offline' ? 'API unreachable' : 'Connecting to API…'}
                </span>
              </div>
            </div>
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
                  aria-label="Clear search"
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
              <div className="paper-capital-badge font-mono">
                {balanceUnavailable ? `Sim Cash · ${balanceStatus}` : `${getCurrencySymbol('USD')}${formatPrice(virtualBalance, 'USD')} Sim Cash`}
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
          {activeTab === 'markets' && appError && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem' }}>
              <AlertCircle size={16} />
              <span>{appError}</span>
            </div>
          )}

          {/* SCREEN ROUTING */}
          {activeTab === 'markets' && loading ? (
            <section className="terminal-panel market-loading" aria-busy="true" aria-label="Loading stock data">
              <p role="status">Loading closing prices…</p>
              <div className="market-loading-line" />
              <div className="market-loading-chart" />
            </section>
          ) : activeTab === 'screener' ? (
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
                    {briefing.length} Headlines
                  </span>
                </div>
              </div>


              {!briefing.length && <p role="status">{briefingLoading ? 'Loading market headlines…' : 'Market headlines unavailable.'}</p>}
              {/* News Articles Grid */}
              <div className="news-feed-grid">
                {briefing.map((n, i) => (
                  <div
                    key={i}
                    className="news-article-card"
                    onClick={() => window.open(n.url, '_blank', 'noopener,noreferrer')}
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
                <button onClick={() => { stockController.current?.abort(); stockRequest.current += 1; setData(null); setActiveTab('overview'); }} className="btn btn-ghost" style={{ padding: '4px 0' }}>
                  <ArrowLeft size={16} />
                  <span>Back to Overview</span>
                </button>
                <span className="term-badge neutral">
                  {data?.meta?.source || 'Market feed'} · {data?.meta?.symbol || symbol}
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
                      {stockCurrency !== baseCurrency && Number.isFinite(convertPrice(1, stockCurrency, baseCurrency, fxRates)) && (
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
                    <span className="stock-stat-val font-mono">{rsiScore || 'Unavailable'}</span>
                  </div>
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">News Sentiment</span>
                    <span className={`stock-stat-val font-mono ${headlineScore > 0 ? 'pos' : headlineScore < 0 ? 'neg' : ''}`}>
                      {newsLoading ? 'Loading…' : headlineSentiment || 'Unavailable'}
                    </span>
                  </div>
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">RSI Signal</span>
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
                        onClick={() => window.open(n.url, '_blank', 'noopener,noreferrer')}
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
                    {newsLoading ? 'Loading headlines…' : 'No recent headlines available.'}
                  </span>
                )}
              </div>
            </div>
          ) : activeTab === 'markets' ? (
            <section className="terminal-panel">
              <h2 className="panel-title">Markets &amp; Charts</h2>
              <p className="panel-subtitle">Search by company name or ticker to open a price chart.</p>
              {appError && (
                <button className="btn btn-secondary btn-sm" onClick={() => fetchStockData(symbol)}>
                  Retry lookup
                </button>
              )}
            </section>
          ) : (
            /* ==========================================================================
               OVERVIEW DASHBOARD: The 5 Core Investor Questions Answered
               ========================================================================== */
            <div className="dashboard-grid">
              <div className="dashboard-span-12 dashboard-currency-toolbar">
                    <span className="dashboard-currency-label" id="dashboard-currency-label">Dashboard currency</span>
                    <div className="currency-toggle-group" role="group" aria-labelledby="dashboard-currency-label">
                      <button
                        type="button"
                        className={`currency-toggle-btn ${baseCurrency === 'USD' ? 'active' : ''}`}
                        aria-pressed={baseCurrency === 'USD'}
                        onClick={() => toggleBaseCurrency('USD')}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        className={`currency-toggle-btn ${baseCurrency === 'INR' ? 'active' : ''}`}
                        aria-pressed={baseCurrency === 'INR'}
                        onClick={() => toggleBaseCurrency('INR')}
                      >
                        INR (₹)
                      </button>
                    </div>

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


              </div>
              {user && accountStatus === 'error' && (
                <div className="dashboard-span-12 order-validation-msg neg" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Some of your account data could not be loaded, so lists below may look empty. The server can take up to a minute to wake after a quiet period.</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadAccount(user.uid)}>Retry</button>
                </div>
              )}
              {apiStatus === 'checking' && (
                <p className="dashboard-span-12 panel-subtitle" role="status" style={{ margin: 0 }}>
                  Connecting to the FinIntel API. The first request after a quiet period can take up to a minute.
                </p>
              )}
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
                      {Number.isFinite(totalCostBasis) ? `${baseCurSymbol}${formatPrice(totalCostBasis, baseCurrency)}` : 'Unavailable'}
                    </span>
                    <span className="summary-metric-sub neutral">
                      {portfolio.length} Active Positions
                    </span>
                  </div>

                  <div className="summary-metric-card">
                    <span className="summary-metric-label">Virtual Buying Power</span>
                    <span className="summary-metric-value" style={{ color: 'var(--accent)' }}>
                      {balanceUnavailable ? '—' : `${baseCurSymbol}${formatPrice(virtualBalanceBase, baseCurrency)}`}
                    </span>
                    <span className="summary-metric-sub neutral">
                      {balanceUnavailable ? balanceStatus : baseCurrency === 'INR' ? `$${virtualBalance.toFixed(2)} USD Paper Capital` : 'Paper Simulator Capital'}
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

              <MetalsPanel currency={baseCurrency} fxRates={portfolioFxRates} />

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
                          const mark = portfolioPrices[p.symbol];
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
                              <td className="num-col font-mono">
                                {Number.isFinite(p.currPrice) ? (
                                  <>
                                    {p.nativeSymbol}{formatPrice(p.currPrice, p.nativeCurrency)}
                                    <small className="receipt-detail">
                                      {mark.status === 'last-known' ? 'Last-known close' : 'Recent close'} · {mark.date}
                                      {mark.source && ` · ${mark.source}`}
                                    </small>
                                  </>
                                ) : <small className="receipt-detail">{mark ? 'Quote unavailable' : 'Checking close…'}</small>}
                              </td>
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
                                <div className="holding-actions">
                                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingHolding(p)}>
                                    Edit cost
                                  </button>
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
                                      if (!window.confirm(`Remove ${p.qty} ${p.symbol} from your portfolio? Its purchase price history is deleted too.`)) return;
                                      try {
                                        await axios.delete(`${API_URL}/api/portfolio/${p._id}`);
                                        showToast(`Removed ${p.symbol} from portfolio`);
                                      } catch (e) {
                                        showToast(`Could not remove ${p.symbol}. Try again.`, 'error');
                                      }
                                      fetchPortfolio(user.uid);
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
                ) : user && accountStatus === 'loading' ? (
                  <p role="status" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                    Loading your holdings…
                  </p>
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

              {user && (
                <PortfolioStress holdings={portfolio} marks={portfolioPrices}
                  fxRates={portfolioFxRates} currency={baseCurrency} />
              )}

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
                        onClick={() => window.open(n.url, '_blank', 'noopener,noreferrer')}
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
                    {briefingLoading ? 'Loading market headlines…' : 'Market headlines unavailable.'}
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
                    {balanceUnavailable ? balanceStatus : `$${virtualBalance.toFixed(2)} USD Cash`}
                    {!balanceUnavailable && baseCurrency === 'INR' ? ` (≈ ₹${(virtualBalance * fxRate).toLocaleString(undefined, { maximumFractionDigits: 0 })})` : ''}
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
                {user && <PaperTradeHistory key={user.uid} refresh={paperHistoryRefresh} />}
              </div>
            </div>
          )}
        </main>
      </div>

      {editingHolding && user && (
        <HoldingCostEditor holding={editingHolding}
          onClose={() => setEditingHolding(null)}
          onConflict={() => fetchPortfolio(user.uid)}
          onSaved={updated => {
            if (auth.currentUser?.uid !== user.uid) return;
            setPortfolio(previous => previous.map(holding => holding._id === updated._id ? updated : holding));
            setEditingHolding(null);
            showToast(`Updated ${updated.symbol} purchase price`);
          }}
        />
      )}

      {/* Institutional Paper Order & Action Modal */}
      {orderModal.isOpen && (
        <div
          className="order-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeOrderModal();
          }}
        >
          <div className="order-modal-card" role="dialog" aria-modal="true" aria-label={`${orderModal.type === 'BUY' ? 'Paper buy' : orderModal.type === 'SELL' ? 'Paper sell' : orderModal.type === 'PORTFOLIO' ? 'Add holding' : 'Price alert'} ${orderModal.symbol}`}>
            <div className="order-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`term-badge font-mono ${orderModal.type === 'BUY' ? 'pos' : orderModal.type === 'SELL' ? 'neg' : 'neutral'}`}>
                  {orderModal.type === 'BUY' ? 'PAPER BUY' : orderModal.type === 'SELL' ? 'PAPER SELL' : orderModal.type === 'PORTFOLIO' ? 'ADD HOLDING' : 'PRICE ALERT'}
                </span>
                <span className="order-modal-sym font-mono">{orderModal.symbol}</span>
              </div>
              <button
                className="order-modal-close"
                onClick={closeOrderModal}
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
                        {Number.isFinite(convertPrice(orderModal.price, orderModal.currency, 'USD', fxRates))
                          ? `≈ $${convertPrice(orderModal.price, orderModal.currency, 'USD', fxRates).toFixed(2)} USD`
                          : 'USD estimate unavailable'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {['BUY', 'SELL'].includes(orderModal.type) && (
                    <>
                      <span className="order-info-label">Available Sim Cash</span>
                      <span className="order-balance-val font-mono">
                        {balanceUnavailable ? balanceStatus : `$${formatPrice(virtualBalance, 'USD')}`}
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
              {orderModal.type === 'PORTFOLIO' && (
                <div className="order-input-group">
                  <label className="order-input-label" htmlFor="holding-cost-price">
                    Purchase Price per Share ({orderModal.currency})
                  </label>
                  <div className="order-qty-row">
                    <input
                      id="holding-cost-price"
                      type="number"
                      step="any"
                      className="order-number-input font-mono"
                      value={orderModal.costPrice}
                      onChange={(e) => setOrderModal(prev => ({ ...prev, costPrice: e.target.value, error: '' }))}
                      placeholder="Enter what you paid"
                      required
                    />
                  </div>
                </div>
              )}
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

                  <label className="order-input-label" style={{ marginTop: '14px' }} htmlFor="alert-target-price">
                    Target Trigger Price ({orderModal.currency})
                  </label>
                  <div className="order-qty-row">
                    <input
                      id="alert-target-price"
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
                  <label className="order-input-label" htmlFor="order-quantity">
                    {orderModal.type === 'PORTFOLIO' ? 'Shares to Record' : 'Order Quantity (Shares)'}
                  </label>
                  <div className="order-qty-row">
                    <button
                      type="button"
                      className="order-qty-step-btn"
                      aria-label="Decrease quantity by 1"
                      onClick={() => setOrderModal(prev => ({ ...prev, qty: Math.max(1, (parseFloat(prev.qty) || 1) - 1), error: '' }))}
                    >
                      -
                    </button>
                    <input
                      id="order-quantity"
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
                      aria-label="Increase quantity by 1"
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
                        aria-label={`Set quantity to ${n}`}
                        onClick={() => setOrderModal(prev => ({ ...prev, qty: n, error: '' }))}
                      >
                        {n}
                      </button>
                    ))}
                    {orderModal.type === 'BUY' && (
                      <button
                        type="button"
                        className="order-preset-pill max-btn"
                        disabled={balanceUnavailable || !Number.isFinite(convertPrice(orderModal.price, orderModal.currency, 'USD', fxRates))}
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
                const isInsufficient = !balanceUnavailable && orderModal.type === 'BUY' && totalUsd > virtualBalance;
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
                        <span className="order-calc-val font-mono">
                          {Number.isFinite(totalUsd) ? `≈ $${totalUsd.toFixed(2)} USD` : `Unavailable · no ${orderModal.currency} exchange rate`}
                        </span>
                      </div>
                    )}
                    <div className="order-calc-row">
                      <span className="order-calc-label">Estimated Cash Balance</span>
                      <span className={`order-calc-val font-mono ${isInsufficient ? 'neg' : ''}`}>
                        {balanceUnavailable ? balanceStatus
                          : Number.isFinite(remainingCash) ? `$${formatPrice(Math.max(0, remainingCash), 'USD')} USD` : 'Unavailable'}
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
                onClick={closeOrderModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${orderModal.type === 'BUY' ? 'btn-primary' : orderModal.type === 'SELL' ? 'btn-danger' : 'btn-primary'}`}
                disabled={
                  orderModal.isSubmitting ||
                  (orderModal.type === 'PORTFOLIO' && (!Number.isFinite(Number(orderModal.costPrice)) || Number(orderModal.costPrice) <= 0)) ||
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
