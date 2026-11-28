const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quoteFromChart, loadChartUniverse, valuationFromMetric, withValuations } = require('../services/universeQuotes');
const { rankUniverse } = require('../services/screener');

const now = Date.parse('2026-11-28T12:00:00Z');
const bar = (day, close) => ({ date: new Date(`${day}T14:30:00Z`), close });
const chart = (symbol, price, bars, meta = {}) => ({
  meta: {
    symbol, currency: 'USD', regularMarketPrice: price, regularMarketTime: new Date('2026-11-27T18:00:01Z'),
    regularMarketDayHigh: price + 1, regularMarketDayLow: price - 3, regularMarketVolume: 22683910,
    chartPreviousClose: 352.45, shortName: `${symbol} Inc.`, ...meta
  },
  quotes: bars
});

test('measures the day change against the previous session, not the start of the chart range', () => {
  const row = quoteFromChart('AAPL', chart('AAPL', 358.54, [bar('2026-11-24', 354.07), bar('2026-11-25', 355.58), bar('2026-11-27', 358.54)]), { now });
  assert.equal(row.regularMarketPrice, 358.54);
  assert.equal(row.regularMarketChangePercent.toFixed(3), '0.832');
  assert.equal(row.quoteSource, 'Yahoo Finance chart');
  assert.equal(row.quoteTimestamp, '2026-11-27T18:00:01.000Z');
  assert.deepEqual([row.regularMarketDayHigh, row.regularMarketDayLow, row.regularMarketVolume], [359.54, 355.54, 22683910]);
  assert.deepEqual([row.marketCap, row.trailingPE], [null, null]);
});

test('accepts provider timestamps in seconds and keeps the listing currency', () => {
  const row = quoteFromChart('RELIANCE.NS', chart('RELIANCE.NS', 1382.6, [bar('2026-11-26', 1396.2), bar('2026-11-27', 1382.6)],
    { currency: 'INR', regularMarketTime: Date.parse('2026-11-27T09:59:10Z') / 1000 }), { now });
  assert.equal(row.currency, 'INR');
  assert.equal(row.regularMarketChangePercent.toFixed(3), '-0.974');
});

test('rejects stale, mismatched and unpriced charts, and withholds a change it cannot measure', () => {
  const bars = [bar('2026-11-25', 100), bar('2026-11-27', 101)];
  assert.equal(quoteFromChart('AAPL', chart('MSFT', 101, bars), { now }), null);
  assert.equal(quoteFromChart('AAPL', chart('AAPL', 0, bars), { now }), null);
  assert.equal(quoteFromChart('AAPL', chart('AAPL', 101, bars, { regularMarketTime: new Date('2026-11-10T18:00:00Z') }), { now }), null);
  assert.equal(quoteFromChart('AAPL', chart('AAPL', 101, bars, { currency: undefined }), { now }), null);
  assert.equal(quoteFromChart('AAPL', null, { now }), null);

  assert.equal(quoteFromChart('AAPL', chart('AAPL', 101, [bar('2026-11-27', 101)]), { now }).regularMarketChangePercent, null);
  assert.equal(quoteFromChart('AAPL', chart('AAPL', 101, [bar('2026-10-01', 80), bar('2026-11-27', 101)]), { now }).regularMarketChangePercent, null);
});

test('keeps the symbols that answered when part of the feed fails', async () => {
  const started = [];
  let running = 0;
  let peak = 0;
  const fetchChart = async symbol => {
    started.push(symbol);
    peak = Math.max(peak, ++running);
    await new Promise(resolve => setImmediate(resolve));
    running -= 1;
    if (symbol === 'DOWN') throw new Error('429');
    if (symbol === 'STALE') return chart(symbol, 10, [], { regularMarketTime: new Date('2026-01-01T00:00:00Z') });
    return chart(symbol, 100, [bar('2026-11-25', 98), bar('2026-11-27', 100)]);
  };
  const rows = await loadChartUniverse(['A', 'DOWN', 'B', 'STALE', 'C'], fetchChart, { concurrency: 2, now: () => now });
  assert.deepEqual(rows.map(row => row.symbol), ['A', 'B', 'C']);
  assert.equal(started.length, 5);
  assert.equal(peak, 2);
});

test('adds valuations only from a matching listing, so chart rows can rank by P/E', () => {
  assert.deepEqual(valuationFromMetric('JPM', { symbol: 'JPM', metric: { marketCapitalization: 860125.4, peTTM: 13.04 } }),
    { marketCap: 860125400000, trailingPE: 13.04 });
  assert.equal(valuationFromMetric('BRK.B', { symbol: 'BRK.A', metric: { marketCapitalization: 1235074 } }), null);
  assert.deepEqual(valuationFromMetric('X', { symbol: 'X', metric: { marketCapitalization: 0, peTTM: -4 } }), { marketCap: null, trailingPE: null });

  const rows = [
    { symbol: 'JPM', currency: 'USD', marketCap: null, trailingPE: null },
    { symbol: 'AAPL', currency: 'USD', marketCap: null, trailingPE: null },
    { symbol: 'KO', currency: 'USD', marketCap: null, trailingPE: null }
  ];
  const valued = withValuations(rows, { JPM: { marketCap: 8.6e11, trailingPE: 13 }, AAPL: { marketCap: 5.2e12, trailingPE: 39 } });
  assert.deepEqual(rankUniverse('undervalued_large_caps', valued).map(row => row.symbol), ['JPM', 'AAPL']);
  assert.deepEqual(valued[2], rows[2]);
});
