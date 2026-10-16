import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Activity, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://finintel-qj46.onrender.com' : 'http://localhost:5000';

function Screener({ onClose, onSelectSymbol }) {
    const [filterType, setFilterType] = useState('day_gainers');
    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchScreener(filterType);
    }, [filterType]);

    const fetchScreener = async (type) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/screener/${type}`);
            setStocks(res.data || []);
        } catch (e) {
            console.error("Screener Error", e);
            setStocks([]);
        }
        setLoading(false);
    };

    const filteredStocks = stocks.filter(s => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (s.symbol && s.symbol.toLowerCase().includes(q)) || 
               (s.shortName && s.shortName.toLowerCase().includes(q));
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
                        {stocks.length} instruments
                    </span>
                </div>
            </div>

            <div className="terminal-panel">
                <div className="panel-header">
                    <div>
                        <h2 className="panel-title">
                            <Activity size={18} color="var(--accent)" />
                            Market Screener & Sector Discovery
                        </h2>
                        <span className="panel-subtitle">
                            Filter securities by momentum, volume surges, and institutional valuation multiples
                        </span>
                    </div>

                    <div style={{ position: 'relative', width: '220px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Filter results..."
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
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' }}>
                        <span className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>Querying market quote feed...</span>
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
                                    <th className="num-col">Market Cap</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStocks.map((s, i) => {
                                    const change = s.regularMarketChangePercent || 0;
                                    const isPos = change >= 0;
                                    const price = s.regularMarketPrice ? s.regularMarketPrice.toFixed(2) : '--';
                                    const high = s.regularMarketDayHigh ? s.regularMarketDayHigh.toFixed(2) : null;
                                    const low = s.regularMarketDayLow ? s.regularMarketDayLow.toFixed(2) : null;
                                    const mktCap = s.marketCap ? (s.marketCap / 1e9).toFixed(1) + 'B' : '--';

                                    return (
                                        <tr key={s.symbol || i} onClick={() => onSelectSymbol(s.symbol)} style={{ cursor: 'pointer' }}>
                                            <td>
                                                <span className="font-mono" style={{ fontWeight: '700', color: 'var(--accent)' }}>
                                                    {s.symbol}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                                                {s.shortName || s.longName || s.symbol}
                                            </td>
                                            <td className="num-col font-mono" style={{ fontWeight: '600' }}>
                                                ${price}
                                            </td>
                                            <td className="num-col font-mono">
                                                <span className={`term-badge ${isPos ? 'pos' : 'neg'}`}>
                                                    {isPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                                    {isPos ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`}
                                                </span>
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                                                {low && high ? `$${low} - $${high}` : '--'}
                                            </td>
                                            <td className="num-col font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                {mktCap}
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
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                                            No securities matched the current screener criteria or search query.
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
