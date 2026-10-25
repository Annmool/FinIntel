import React, { useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from './apiConfig';

const TickerTape = () => {
    const [stocks, setStocks] = useState(() => {
        const cached = localStorage.getItem('finintel_ticker');
        try { return cached ? JSON.parse(cached) : []; } catch(e) { return []; }
    });

    useEffect(() => {
        const fetchTicker = () => {
            axios.get(`${API_URL}/api/ticker-tape`)
                .then(res => { 
                    if (res.data && res.data.length > 0) {
                        setStocks(res.data);
                        localStorage.setItem('finintel_ticker', JSON.stringify(res.data));
                    }
                })
                .catch(() => {});
        };
        fetchTicker();
        const interval = setInterval(fetchTicker, 60000); 
        return () => clearInterval(interval);
    }, []);

    const renderStockItems = (copy) => stocks.map((s, i) => {
        const price = s.close ? parseFloat(s.close).toFixed(2) : "0.00";
        const change = s.percent_change ? parseFloat(s.percent_change).toFixed(2) : "0.00";
        const isPositive = parseFloat(change) >= 0;

        const isIndian = s.symbol?.endsWith('.NS') || s.symbol?.endsWith('.BO');
        const cur = isIndian ? '₹' : '$';

        return (
            <div className="ticker-item" key={`${copy}-${s.symbol}-${i}`}>
                <span className="ticker-symbol">{s.symbol}</span>
                <span className="ticker-price">{cur}{price}</span>
                <span className={`ticker-change ${isPositive ? 'up' : 'down'}`}>
                    {isPositive ? '▲' : '▼'} {Math.abs(change)}%
                </span>
            </div>
        );
    });

    return (
        <div className="ticker-container">
            <div className="ticker-wrap">
                <div className="ticker-move">
                    <div className="ticker-group" aria-hidden="true">
                        {[0, 1, 2, 3].map(copy => renderStockItems(`first-${copy}`))}
                    </div>
                    <div className="ticker-group" aria-hidden="true">
                        {[0, 1, 2, 3].map(copy => renderStockItems(`second-${copy}`))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TickerTape;
