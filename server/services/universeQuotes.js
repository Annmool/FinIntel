// Screener rows built from daily chart data. The hosted API can reach Yahoo's
// chart endpoint when its quote and screener endpoints refuse the request, so
// this keeps the tracked list on real prices instead of sample rows.

const DAY = 86400000;
const MAX_QUOTE_AGE = 7 * DAY;

function timeMs(value) {
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(value) ? value * 1000 : NaN;
}

// The change is measured against the previous session's close. Chart metadata
// carries a "previous close" too, but that is the close before the requested
// range, not before the latest session.
function quoteFromChart(symbol, chart, { now = Date.now(), fallbackName } = {}) {
  const meta = chart?.meta;
  const price = meta?.regularMarketPrice;
  const time = timeMs(meta?.regularMarketTime);
  if (!meta || meta.symbol?.toUpperCase() !== symbol || !Number.isFinite(price) || price <= 0 ||
      typeof meta.currency !== 'string' || !Number.isFinite(time) || time > now + 60000 || now - time > MAX_QUOTE_AGE) {
    return null;
  }

  const sessionDay = new Date(time).toISOString().slice(0, 10);
  const earlier = (Array.isArray(chart.quotes) ? chart.quotes : [])
    .filter(bar => bar?.date instanceof Date && Number.isFinite(bar.close) && bar.close > 0 &&
      bar.date.toISOString().slice(0, 10) < sessionDay)
    .sort((a, b) => a.date - b.date);
  const previous = earlier.at(-1);
  // A gap of more than a week means a suspended or newly listed stock, where a
  // day change against that bar would mislead.
  const previousClose = previous && time - previous.date.getTime() <= MAX_QUOTE_AGE ? previous.close : null;
  const finite = value => Number.isFinite(value) && value > 0 ? value : null;

  return {
    symbol,
    shortName: meta.shortName || meta.longName || fallbackName || symbol,
    longName: meta.longName || meta.shortName || fallbackName || symbol,
    regularMarketPrice: price,
    quoteSource: 'Yahoo Finance chart',
    quoteTimestamp: new Date(time).toISOString(),
    regularMarketChangePercent: previousClose ? (price - previousClose) / previousClose * 100 : null,
    regularMarketDayHigh: finite(meta.regularMarketDayHigh),
    regularMarketDayLow: finite(meta.regularMarketDayLow),
    regularMarketVolume: finite(meta.regularMarketVolume),
    marketCap: null,
    trailingPE: null,
    currency: meta.currency === 'GBp' ? 'GBX' : meta.currency
  };
}

// Runs a few requests at a time so one screener load does not look like a burst.
async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index]);
      } catch (_) {
        results[index] = null;
      }
    }
  }));
  return results;
}

async function loadChartUniverse(symbols, fetchChart, { concurrency = 6, names = {}, now = Date.now } = {}) {
  const rows = await mapLimited(symbols, concurrency, async symbol =>
    quoteFromChart(symbol, await fetchChart(symbol), { now: now(), fallbackName: names[symbol] }));
  return rows.filter(Boolean);
}

// Finnhub reports market capitalisation in millions of the listing currency.
function valuationFromMetric(requested, response) {
  if (response?.symbol !== requested || !response.metric) return null;
  const cap = response.metric.marketCapitalization;
  const pe = response.metric.peTTM ?? response.metric.peBasicExclExtraTTM;
  return {
    marketCap: Number.isFinite(cap) && cap > 0 ? cap * 1e6 : null,
    trailingPE: Number.isFinite(pe) && pe > 0 ? pe : null
  };
}

function withValuations(rows, valuations) {
  return rows.map(row => {
    const valuation = valuations?.[row.symbol];
    return valuation ? { ...row, marketCap: row.marketCap ?? valuation.marketCap, trailingPE: row.trailingPE ?? valuation.trailingPE } : row;
  });
}

module.exports = { quoteFromChart, mapLimited, loadChartUniverse, valuationFromMetric, withValuations };
