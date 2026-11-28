const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasScreenerCoverage, rankUniverse } = require('../services/screener');

const quote = (symbol, change, extra = {}) => ({ symbol, regularMarketChangePercent: change, currency: 'USD', ...extra });

test('losers and gainers never include stocks that moved the other way', () => {
  const upDay = [quote('INTC', 5.4), quote('BRK-B', 0.25), quote('PG', 0), quote('KO', null)];
  assert.deepEqual(rankUniverse('day_losers', upDay), []);
  assert.deepEqual(rankUniverse('day_gainers', upDay).map(q => q.symbol), ['INTC', 'BRK-B']);

  const mixed = [quote('A', -1), quote('B', 2), quote('C', -3)];
  assert.deepEqual(rankUniverse('day_losers', mixed).map(q => q.symbol), ['C', 'A']);
});

test('an empty ranking is conclusive only when quotes contain data for that category', () => {
  const usPriceOnly = quote('AAPL', null);
  const risingUs = quote('AAPL', 2);
  assert.equal(hasScreenerCoverage('day_losers', [usPriceOnly]), false);
  assert.equal(hasScreenerCoverage('day_losers', [risingUs]), true);
  assert.deepEqual(rankUniverse('day_losers', [risingUs]), []);
  assert.equal(hasScreenerCoverage('indian_market', [risingUs]), false);
  assert.equal(hasScreenerCoverage('indian_market', [quote('TCS.NS', null)]), true);
  assert.equal(hasScreenerCoverage('most_actives', [risingUs]), false);
  assert.equal(hasScreenerCoverage('undervalued_large_caps', [risingUs]), false);
  assert.equal(hasScreenerCoverage('undervalued_large_caps', [quote('AAPL', 2, { marketCap: 50e9, trailingPE: 20 })]), true);
});

test('ranks the other screeners and keeps Indian rows without a change figure last', () => {
  const quotes = [
    quote('AAPL', 1, { marketCap: 5e12, trailingPE: 39, regularMarketVolume: 10 }),
    quote('JPM', 1, { marketCap: 6e11, trailingPE: 12, regularMarketVolume: 30 }),
    quote('TCS.NS', null, { currency: 'INR' }), quote('ITC.NS', -1, { currency: 'INR' }), quote('LT.NS', 2, { currency: 'INR' })
  ];
  assert.deepEqual(rankUniverse('undervalued_large_caps', quotes).map(q => q.symbol), ['JPM', 'AAPL']);
  assert.deepEqual(rankUniverse('most_actives', quotes).map(q => q.symbol), ['JPM', 'AAPL']);
  assert.deepEqual(rankUniverse('tech_titans', quotes, new Set(['AAPL'])).map(q => q.symbol), ['AAPL']);
  assert.deepEqual(rankUniverse('indian_market', quotes).map(q => q.symbol), ['LT.NS', 'ITC.NS', 'TCS.NS']);
  assert.deepEqual(rankUniverse('unknown', quotes), []);
});
