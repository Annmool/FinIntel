import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Activity } from 'lucide-react';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://finintel-qj46.onrender.com' : 'http://localhost:5000';

function Screener({ onClose, onSelectSymbol }) {
    const [filterType, setFilterType] = useState('day_gainers');
    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchScreener(filterType);
    }, [filterType]);

    const fetchScreener = async (type) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/screener/${type}`);
            setStocks(res.data);
        } catch (e) {
            console.error("Screener Error", e);
        }
        setLoading(false);
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <button onClick={onClose} className="btn-outline" style={{ border: 'none', padding: '0', marginBottom: '24px', color: 'var(--text-secondary)' }}>
                <ArrowLeft size={16} /> Back to Dashboard
            </button>
            <div className="card">
                <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={24} color="var(--accent)" /> Stock Screener & Discovery
                </h2>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <button onClick={() => setFilterType('day_gainers')} className={filterType === 'day_gainers' ? 'btn-primary' : 'btn-outline'}>Top Gainers</button>
                    <button onClick={() => setFilterType('day_losers')} className={filterType === 'day_losers' ? 'btn-primary' : 'btn-outline'}>Top Losers</button>
                    <button onClick={() => setFilterType('most_actives')} className={filterType === 'most_actives' ? 'btn-primary' : 'btn-outline'}>Most Active</button>
                    <button onClick={() => setFilterType('undervalued_large_caps')} className={filterType === 'undervalued_large_caps' ? 'btn-primary' : 'btn-outline'}>Undervalued Large Caps</button>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div className="loader"></div></div>
                ) : (
                    <div className="metrics-grid">
                        {stocks.map((s, i) => (
                            <div key={i} className="metric-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column' }} onClick={() => onSelectSymbol(s.symbol)} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{s.symbol}</span>
                                    <span style={{ fontWeight: '600', color: s.regularMarketChangePercent > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                        {s.regularMarketChangePercent > 0 ? '+' : ''}{s.regularMarketChangePercent?.toFixed(2)}%
                                    </span>
                                </div>
                                <span className="text-muted text-small" style={{ display: 'block', margin: '4px 0 12px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.shortName}</span>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 'auto' }}>
                                    <span className="font-mono" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>${s.regularMarketPrice?.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                        {stocks.length === 0 && !loading && (
                            <span className="text-muted" style={{ gridColumn: '1 / -1' }}>No stocks found for this filter.</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Screener;
