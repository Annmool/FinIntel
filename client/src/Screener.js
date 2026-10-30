import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Activity, ArrowUpRight, ArrowDownRight, Search, RefreshCw } from 'lucide-react';

import { API_URL } from './apiConfig';
import { getCurrencySymbol, formatPrice, formatLargeCap } from './utils/currency';

function Screener({ onClose, onSelectSymbol }) {
    const [filterType, setFilterType] = useState('day_gainers');
    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        fetchScreener(filterType);
    }, [filterType]);

    const fetchScreener = async (type) => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`${API_URL}/api/screener/${type}`);
            if (!Array.isArray(res.data)) throw new Error('The market data service returned an unexpected response.');
            setStocks(res.data);
        } catch (e) {
            console.error("Screener Error", e);
            setStocks([]);
            setError(e.response?.data?.error || e.message || 'Unable to load market data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getSymbolCurrency = (s) => {
        if (!s) return '$';
        return getCurrencySymbol(s.currency || s.symbol);
    };

    const formatVolume = (vol) => {
        if (!Number.isFinite(vol) || vol <= 0) return '--';
        if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
        if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
        if (vol >= 1e3) return (vol / 1e3).toFixed(0) + 'K';
        return vol.toString();
    };

    const formatCap = (cap, cur) => {
        return formatLargeCap(cap, cur);
    };

    const filteredStocks = stocks.filter(s => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (s.symbol && s.symbol.toLowerCase().includes(q)) || 
               (s.shortName && s.shortName.toLowerCase().includes(q)) ||
               (s.longName && s.longName.toLowerCase().includes(q));
    });

    return (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px 0' }}>
                    <ArrowLeft size={16} />
                    <span>Back to Overview</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="term-badge neutral">Live Market Screener</span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {stocks.length} instruments loaded
                    </span>
                    <button
                        onClick={() => fetchScreener(filterType)}
                        className="btn btn-ghost btn-sm"
                        title="Refresh Screener Feed"
                        style={{ padding: '4px' }}
                    >
                        <RefreshCw size={13} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="terminal-panel">
                <div className="panel-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 className="panel-title">
                            <Activity size={18} color="var(--accent)" />
                            Institutional Market Screener & Global Discovery
                        </h2>
                        <span className="panel-subtitle">
                            Real-time momentum, volume surges, institutional valuation multiples, and cross-border equities
                        </span>
                    </div>

                    <div style={{ position: 'relative', width: '240px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Filter by symbol or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 30px',
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-xs)',
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem'
                            }}
                        />
                    </div>
                </div>

                {/* Filter Selector Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setFilterType('day_gainers')}
                        className={`btn ${filterType === 'day_gainers' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Top Gainers
                    </button>
                    <button
                        onClick={() => setFilterType('day_losers')}
                        className={`btn ${filterType === 'day_losers' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Top Losers
                    </button>
                    <button
                        onClick={() => setFilterType('most_actives')}
                        className={`btn ${filterType === 'most_actives' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Most Active (Volume)
                    </button>
                    <button
                        onClick={() => setFilterType('undervalued_large_caps')}
                        className={`btn ${filterType === 'undervalued_large_caps' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Undervalued Large Caps
                    </button>
                    <button
                        onClick={() => setFilterType('tech_titans')}
                        className={`btn ${filterType === 'tech_titans' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Tech Titans & AI
                    </button>
                    <button
                        onClick={() => setFilterType('indian_market')}
                        className={`btn ${filterType === 'indian_market' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Indian Equities (NSE)
                    </button>
                </div>

                {error && !loading && (
                    <div className="screener-error" role="alert" style={{ marginBottom: '16px' }}>
                        <div>
                            <strong>Market data notice</strong>
                            <span>{error}</span>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => fetchScreener(filterType)}>Retry</button>
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 0', gap: '10px' }}>
                        <RefreshCw size={24} className="spin" color="var(--accent)" />
                        <span className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>Querying high-frequency market quote feed...</span>
                    </div>
                ) : (
                    <div className="terminal-table-container">
                        <table className="terminal-table">
                            <thead>
                                <tr>
                                    <th>Security / Ticker</th>
                                    <th>Instrument Name</th>
                                    <th className="num-col">Last Price</th>
                                    <th className="num-col">Day Change</th>
                                    <th className="num-col">Day Range</th>
                                    <th className="num-col">Volume</th>
                                    <th className="num-col">Market Cap</th>
                                    <th className="num-col">P/E</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStocks.map((s, i) => {
                                    const change = Number.isFinite(s.regularMarketChangePercent) ? s.regularMarketChangePercent : 0;
                                    const isPos = change >= 0;
                                    const cur = getSymbolCurrency(s);
                                    const curCode = s.currency || s.symbol;
                                    const price = Number.isFinite(s.regularMarketPrice) ? `${cur}${formatPrice(s.regularMarketPrice, curCode)}` : '--';
                                    const high = Number.isFinite(s.regularMarketDayHigh) ? `${cur}${formatPrice(s.regularMarketDayHigh, curCode)}` : null;
                                    const low = Number.isFinite(s.regularMarketDayLow) ? `${cur}${formatPrice(s.regularMarketDayLow, curCode)}` : null;
                                    const mktCap = formatCap(s.marketCap, curCode);
                                    const volume = formatVolume(s.regularMarketVolume);
                                    const pe = Number.isFinite(s.trailingPE) && s.trailingPE > 0 ? s.trailingPE.toFixed(1) : '--';

                                    return (
                                        <tr key={s.symbol || i} onClick={() => onSelectSymbol(s.symbol)} style={{ cursor: 'pointer' }}>
                                            <td>
                                                <span className="font-mono" style={{ fontWeight: '700', color: 'var(--accent)' }}>
                                                    {s.symbol}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                                                {s.shortName || s.longName || s.symbol}
                                            </td>
                                            <td className="num-col font-mono" style={{ fontWeight: '600' }}>
                                                {price}
                                            </td>
                                            <td className="num-col font-mono">
                                                <span className={`term-badge ${isPos ? 'pos' : 'neg'}`}>
                                                    {isPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                                    {isPos ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`}
                                                </span>
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                                                {low && high ? `${low} - ${high}` : '--'}
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                {volume}
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                {mktCap}
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                                {pe}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectSymbol(s.symbol);
                                                    }}
                                                >
                                                    Inspect Chart
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filteredStocks.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-tertiary)' }}>
                                            {searchTerm ? 'No securities matched your search term.' : 'No securities returned for this category. Click Retry to reload.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Screener;
