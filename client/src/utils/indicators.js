// client/src/utils/indicators.js

export const calculateRSI = (data) => {
    if (!data || data.length < 15) return null;
    let gains = 0, losses = 0;

    for (let i = 0; i < 14; i++) {
        const diff = parseFloat(data[i].close) - parseFloat(data[i + 1].close);
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const rs = (gains / 14) / (losses / 14);
    return (100 - (100 / (1 + rs))).toFixed(2);
};


export const getRecommendation = (rsi) => {
    if (!rsi) return { action: "WAIT", Color: "gray", msg: "Loading data..." };
    const val = parseFloat(rsi);
    if (val > 70) return { action: "SELL", Color: "#ef5350", msg: "Overbought (RSI > 70)" };
    if (val < 30) return { action: "BUY", Color: "#26a69a", msg: "Oversold (RSI < 30)" };
    return { action: "HOLD", Color: "#ffa726", msg: "Neutral Momentum" };
};

export const calculateMA = (data, period = 20) => {
    let maData = [];
    for (let i = 0; i < data.length - period; i++) {
        const slice = data.slice(i, i + period);
        const sum = slice.reduce((acc, val) => acc + parseFloat(val.close), 0);
        maData.push({
            time: data[i].datetime.split(" ")[0],
            value: sum / period
        });
    }
    return maData.reverse(); // Match chart order
};