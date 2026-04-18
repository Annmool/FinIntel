import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://finintel-qj46.onrender.com' : 'http://localhost:5000';

const TickerTape = () => {
    const [stocks, setStocks] = useState([]);

    useEffect(() => {
        const fetchTicker = () => {
            axios.get(`${API_URL}/api/ticker-tape`)
                .then(res => { if (res.data.length > 0) setStocks(res.data); })
                .catch(() => {});
        };
        fetchTicker();
        const interval = setInterval(fetchTicker, 60000); 
        return () => clearInterval(interval);
    }, []);

    const renderStockItems = () => stocks.map((s, i) => {
        const price = s.close ? parseFloat(s.close).toFixed(2) : "0.00";
        const change = s.percent_change ? parseFloat(s.percent_change).toFixed(2) : "0.00";
        const isPositive = parseFloat(change) >= 0;

        return (
            <div className="ticker-item" key={i}>
                <span className="ticker-symbol">{s.symbol}</span>
                <span className="ticker-price">${price}</span>
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
                    {renderStockItems()}
                    {/* Duplicate for seamless infinite loop */}
                    {renderStockItems()}
                </div>
            </div>
        </div>
    );
};

export default TickerTape;