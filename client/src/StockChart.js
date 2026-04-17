import React, { useLayoutEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const StockChart = ({ data, theme }) => {
    const chartContainerRef = useRef();

    useLayoutEffect(() => {
        if (!data || data.length === 0 || !chartContainerRef.current) return;

        // 1. Define colors based on the current theme (matching our CSS variables)
        const isDark = theme === 'dark';
        const colors = {
            backgroundColor: isDark ? '#111827' : '#ffffff', // matches --bg-surface
            textColor: isDark ? '#94a3b8' : '#5a6a82',       // matches --text-secondary
            gridColor: isDark ? '#1e293b' : '#f0f2f5',       // matches --border-primary/subtle
            maLineColor: isDark ? '#60a5fa' : '#2563eb',     // matches --accent
            upColor: isDark ? '#10b981' : '#059669',         // matches --success
            downColor: isDark ? '#ef4444' : '#dc2626',       // matches --danger
        };

        // 2. Clear container
        chartContainerRef.current.innerHTML = '';

        // 3. Create Chart with Dynamic Theme colors
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: colors.backgroundColor },
                textColor: colors.textColor,
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: colors.gridColor },
                horzLines: { color: colors.gridColor },
            },
            width: chartContainerRef.current.clientWidth,
            height: 450, // Increased height for premium feel
            timeScale: {
                borderColor: colors.gridColor,
                timeVisible: true,
            },
            rightPriceScale: {
                borderColor: colors.gridColor,
            }
        });

        // 4. Candlestick Series (The "Price Action")
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: colors.upColor,
            downColor: colors.downColor,
            borderVisible: false,
            wickUpColor: colors.upColor,
            wickDownColor: colors.downColor,
        });

        const formattedData = [...data]
            .map(item => ({
                time: item.datetime.split(" ")[0],
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close)
            }))
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        candlestickSeries.setData(formattedData);

        // 5. Moving Average (MA) Series (The "Smooth Line")
        const maSeries = chart.addLineSeries({
            color: colors.maLineColor,
            lineWidth: 2,
            title: 'MA (20)',
        });

        const maData = formattedData
            .map((val, index, arr) => {
                if (index < 20) return null;
                const slice = arr.slice(index - 20, index);
                const avg = slice.reduce((sum, item) => sum + item.close, 0) / 20;
                return { time: val.time, value: avg };
            })
            .filter(item => item !== null);

        maSeries.setData(maData);

        // 6. Final Adjustments
        chart.timeScale().fitContent();

        // Handle window resizing automatically
        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, theme]); // Re-renders chart when data OR theme changes

    return (
        <div 
            ref={chartContainerRef} 
            style={{ 
                width: '100%', 
                height: '450px', 
                marginTop: '32px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid var(--border-primary)'
            }} 
        />
    );
};

export default StockChart;