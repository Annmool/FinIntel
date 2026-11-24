const { normalizePaperQuote } = require('./paperTrading');

function apiKeys(...values) {
  return [...new Set(values.flatMap(value => String(value || '').split(',')).map(value => value.trim()).filter(Boolean))];
}

function normalizeCandles(payload, symbol, source) {
  const seen = new Set();
  const values = (payload?.values || []).filter(bar => {
    const prices = ['open', 'high', 'low', 'close'].map(key => Number(bar[key]));
    return /^\d{4}-\d{2}-\d{2}$/.test(bar.datetime) && prices.every(price => Number.isFinite(price) && price > 0) &&
      prices[1] >= Math.max(prices[0], prices[2], prices[3]) && prices[2] <= Math.min(prices[0], prices[3]);
  }).sort((a, b) => b.datetime.localeCompare(a.datetime)).filter(bar => {
    if (seen.has(bar.datetime)) return false;
    seen.add(bar.datetime);
    return true;
  });
  const currency = payload?.meta?.currency;
  if (!values.length || typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) {
    throw new Error('Incomplete candle data');
  }
  return { meta: { ...payload.meta, symbol, source }, values };
}

function createPriceFeeds({ http, fetchYahooHistory, fetchYahooQuote, twelveKeys = [], alphaKeys = [], now = Date.now }) {
  const cooldowns = new Map();

  async function withKeys(provider, keys, load) {
    for (const key of keys) {
      const id = provider + key;
      if ((cooldowns.get(id) || 0) > now()) continue;
      try {
        return await load(key);
      } catch (error) {
        const status = error.response?.status || error.status;
        if ([401, 403, 429].includes(status)) {
          const retryAfter = Number(error.response?.headers?.['retry-after']);
          const delay = status === 429 ? (retryAfter > 0 ? Math.min(retryAfter, 3600) : 60) : 900;
          cooldowns.set(id, now() + delay * 1000);
        }
      }
    }
    throw new Error('Provider unavailable');
  }

  function twelveSymbol(symbol) {
    const exchange = symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : undefined;
    if (symbol.includes(':')) {
      const [ticker, market] = symbol.split(':');
      return { symbol: ticker, exchange: market };
    }
    return { symbol: exchange ? symbol.slice(0, -3) : symbol, exchange };
  }

  async function twelveHistory(symbol) {
    return withKeys('twelve', twelveKeys, async key => {
      const { data } = await http.get('https://api.twelvedata.com/time_series', {
        params: { ...twelveSymbol(symbol), interval: '1day', outputsize: 100 },
        headers: { Authorization: `apikey ${key}` }, timeout: 4500
      });
      if (data?.status === 'error' || data?.code) {
        throw Object.assign(new Error('Twelve Data rejected the request'), { status: Number(data.code) });
      }
      const mapping = twelveSymbol(symbol);
      if (data?.meta?.symbol?.toUpperCase() !== mapping.symbol.toUpperCase() ||
          (mapping.exchange && data.meta.exchange !== mapping.exchange)) {
        throw new Error('Candle listing mismatch');
      }
      return normalizeCandles(data, symbol, 'Twelve Data');
    });
  }

  async function alphaHistory(symbol) {
    // Alpha Vantage uses different suffixes for foreign listings. Only plain US tickers are mapped here.
    if (!/^[A-Z]{1,6}$/.test(symbol)) throw new Error('Unsupported Alpha Vantage listing');
    return withKeys('alpha', alphaKeys, async key => {
      const { data } = await http.get('https://www.alphavantage.co/query', {
        params: { function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact', apikey: key }, timeout: 4500
      });
      if (data?.Note || data?.Information) throw Object.assign(new Error('Alpha Vantage limit reached'), { status: 429 });
      if (data?.['Meta Data']?.['2. Symbol'] !== symbol) throw new Error('Unexpected listing');
      return normalizeCandles({
        meta: { currency: 'USD' },
        values: Object.entries(data['Time Series (Daily)'] || {}).map(([datetime, bar]) => ({
          datetime, open: bar['1. open'], high: bar['2. high'], low: bar['3. low'], close: bar['4. close'], volume: bar['5. volume']
        }))
      }, symbol, 'Alpha Vantage');
    });
  }

  async function getHistory(symbol) {
    const yahoo = async () => normalizeCandles(await fetchYahooHistory(symbol), symbol, 'Yahoo Finance');
    const providers = symbol.includes('.') ? [yahoo, () => twelveHistory(symbol), () => alphaHistory(symbol)]
      : [() => twelveHistory(symbol), yahoo, () => alphaHistory(symbol)];
    for (const load of providers) {
      try { return await load(); } catch (_) { /* Try the next independent feed. */ }
    }
    throw Object.assign(new Error('Price feeds are temporarily unavailable for this listing. Try again shortly.'), { status: 503 });
  }

  async function getQuote(symbol, accept = () => true) {
    try {
      const quote = await fetchYahooQuote(symbol);
      if (quote && accept(quote)) return quote;
    } catch (_) { /* A verified Twelve Data quote can fill the request. */ }
    const mapping = twelveSymbol(symbol);
    if (/^[A-Z][A-Z0-9-]{0,23}$/.test(mapping.symbol)) {
      try {
        return await withKeys('twelve', twelveKeys, async key => {
          const { data } = await http.get('https://api.twelvedata.com/quote', {
            params: mapping, headers: { Authorization: `apikey ${key}` }, timeout: 4500
          });
          if (data?.status === 'error' || data?.code) {
            throw Object.assign(new Error('Quote request rejected'), { status: Number(data.code) });
          }
          const currency = mapping.exchange === 'NSE' || mapping.exchange === 'BSE' ? 'INR' : 'USD';
          if (data?.currency !== currency || (mapping.exchange && data.exchange !== mapping.exchange)) {
            throw new Error('Quote listing mismatch');
          }
          const quote = normalizePaperQuote(mapping.symbol, {
            symbol: data.symbol, currency: data.currency, regularMarketPrice: data.close, regularMarketTime: data.timestamp
          }, 'Twelve Data');
          if (!quote || !accept(quote)) throw new Error('Quote is incomplete or stale');
          return quote;
        });
      } catch (_) { /* Never accept a client-supplied execution price. */ }
    }
    throw Object.assign(new Error(`No recent verified market quote for ${symbol}. Try again later.`), { status: 503 });
  }

  return { getHistory, getQuote };
}

module.exports = { apiKeys, normalizeCandles, createPriceFeeds };
