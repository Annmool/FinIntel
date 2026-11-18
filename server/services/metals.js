function createMetalsFeed({ http, yahoo, now = Date.now }) {
  const lastKnown = new Map();
  async function load(symbol, name, future) {
    try {
      const { data } = await http.get(`https://api.gold-api.com/price/${symbol}`, { timeout: 4000 });
      const time = Date.parse(data?.updatedAt);
      const age = now() - time;
      if (data?.symbol !== symbol || !Number.isFinite(data.price) || data.price <= 0 ||
          !Number.isFinite(age) || age < -60000 || age > 7 * 86400000) throw new Error('Invalid metal quote');
      const quote = { symbol, name, price: data.price, currency: 'USD', unit: 'troy oz',
        kind: 'Spot reference', source: 'Gold API', updatedAt: new Date(time).toISOString(), cached: false };
      lastKnown.set(symbol, quote);
      return quote;
    } catch (_) { /* Use an explicitly labeled futures reference if spot is unavailable. */ }
    try {
      const quote = await yahoo.quote(future, {}, { validateResult: false, fetchOptions: { signal: AbortSignal.timeout(4500) } });
      const time = quote?.regularMarketTime instanceof Date ? quote.regularMarketTime.getTime() : quote?.regularMarketTime * 1000;
      if (quote?.symbol !== future || quote.currency !== 'USD' || !Number.isFinite(quote.regularMarketPrice) ||
          quote.regularMarketPrice <= 0 || !Number.isFinite(time) || now() - time < -60000 ||
          now() - time > 7 * 86400000) throw new Error('Invalid futures quote');
      const result = { symbol, name, price: quote.regularMarketPrice, currency: 'USD', unit: 'troy oz',
        kind: `Futures reference (${future})`, source: 'Yahoo Finance', updatedAt: new Date(time).toISOString(), cached: false };
      lastKnown.set(symbol, result);
      return result;
    } catch (_) {
      const previous = lastKnown.get(symbol);
      return previous ? { ...previous, cached: true } : { symbol, name, price: null, updatedAt: null, cached: false };
    }
  }
  return () => Promise.all([load('XAU', 'Gold', 'GC=F'), load('XAG', 'Silver', 'SI=F')]);
}

module.exports = { createMetalsFeed };
