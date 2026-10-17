import React, { useLayoutEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const StockChart = ({ data, theme }) => {
    const chartContainerRef = useRef();

    useLayoutEffect(() => {
        if (!data || data.length === 0 || !chartContainerRef.current) return;

        // 1. Define colors based on the current theme (matching our terminal design system)
        const isDark = theme === 'dark';
        const colors = {
            backgroundColor: isDark ? '#19231D' : '#ffffff', // matches --bg-panel
            textColor: isDark ? '#9BA99F' : '#57685D',       // matches --text-secondary
            gridColor: isDark ? '#242F27' : '#E2E8E4',       // matches --border-subtle
            maLineColor: isDark ? '#69D39A' : '#1B8751',     // matches --accent
            upColor: isDark ? '#4ADE80' : '#15803D',         // matches --success
            downColor: isDark ? '#F87171' : '#DC2626',       // matches --danger
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

        const seenDates = new Set();
        const formattedData = [...data]
            .map(item => {
                const timeStr = item.datetime ? String(item.datetime).split(" ")[0] : null;
                return {
                    time: timeStr,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close)
                };
            })
            .filter(item => item.time && !isNaN(item.open) && !isNaN(item.high) && !isNaN(item.low) && !isNaN(item.close))
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .filter(item => {
                if (seenDates.has(item.time)) return false;
                seenDates.add(item.time);
                return true;
            });

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
                height: '420px', 
                marginTop: '16px',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--border-primary)'
            }} 
        />
    );
};

export default StockChart;