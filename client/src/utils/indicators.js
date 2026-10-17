// client/src/utils/indicators.js

export const calculateRSI = (data) => {
    if (!data || !Array.isArray(data) || data.length < 15) return null;
    let gains = 0, losses = 0;

    for (let i = 0; i < 14; i++) {
        const c1 = parseFloat(data[i]?.close);
        const c2 = parseFloat(data[i + 1]?.close);
        if (!Number.isFinite(c1) || !Number.isFinite(c2)) continue;
        const diff = c1 - c2;
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }

    if (losses === 0 && gains === 0) return "50.00"; // Perfectly flat price momentum
    if (losses === 0) return "100.00"; // Maximum upward momentum (no losses in 14 periods)
    if (gains === 0) return "0.00"; // Maximum downward momentum (no gains in 14 periods)

    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return Number.isFinite(rsi) ? rsi.toFixed(2) : "50.00";
};

export const getRecommendation = (rsi) => {
    if (!rsi) return { action: "WAIT", Color: "gray", msg: "Loading data..." };
    const val = parseFloat(rsi);
    if (!Number.isFinite(val)) return { action: "WAIT", Color: "gray", msg: "Calculating..." };
    if (val > 70) return { action: "SELL", Color: "#ef5350", msg: "Overbought (RSI > 70)" };
    if (val < 30) return { action: "BUY", Color: "#26a69a", msg: "Oversold (RSI < 30)" };
    return { action: "HOLD", Color: "#ffa726", msg: "Neutral Momentum" };
};

export const calculateMA = (data, period = 20) => {
    if (!data || !Array.isArray(data) || data.length < period) return [];
    let maData = [];
    for (let i = 0; i <= data.length - period; i++) {
        const slice = data.slice(i, i + period);
        const validValues = slice.map(val => parseFloat(val?.close)).filter(Number.isFinite);
        if (validValues.length < period) continue;
        const sum = validValues.reduce((acc, val) => acc + val, 0);
        const rawDate = data[i]?.datetime;
        const timeStr = rawDate ? String(rawDate).split(" ")[0] : null;
        if (timeStr) {
            maData.push({
                time: timeStr,
                value: sum / period
            });
        }
    }
    return maData.reverse(); // Match chart order
};