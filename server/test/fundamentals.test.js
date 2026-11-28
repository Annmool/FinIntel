const { test } = require('node:test');
const assert = require('node:assert/strict');
const { finnhubSymbol, finnhubFundamentals } = require('../services/fundamentals');

test('maps only plain US tickers and share classes to Finnhub symbols', () => {
  assert.equal(finnhubSymbol('AAPL'), 'AAPL');
  assert.equal(finnhubSymbol('BRK-B'), 'BRK.B');
  assert.equal(finnhubSymbol('TCS.NS'), null);
  assert.equal(finnhubSymbol('INFY:NSE'), null);
  assert.equal(finnhubSymbol('AAPL&METRIC=PRICE'), null);
  assert.equal(finnhubSymbol('^NSEI'), null);
});

test('rejects a sibling share class so its 52-week range is never shown', () => {
  const brkA = { ticker: 'BRK.A', currency: 'USD', marketCapitalization: 1235074 };
  const brkAMetrics = { symbol: 'BRK.A', metric: { '52WeekHigh': 894950, '52WeekLow': 698000 } };
  assert.equal(finnhubFundamentals('BRK.B', brkA, brkAMetrics), null);
});

test('keeps a matching profile and ignores metrics for a different symbol', () => {
  const profile = { ticker: 'AAPL', name: 'Apple Inc.' };
  assert.deepEqual(
    finnhubFundamentals('AAPL', profile, { symbol: 'AAPL', metric: { '52WeekHigh': 360.83 } }),
    { profile: { ticker: 'AAPL', name: 'Apple Inc.', currency: 'USD' }, metrics: { '52WeekHigh': 360.83 } }
  );
  assert.deepEqual(finnhubFundamentals('AAPL', profile, { symbol: 'AAPL.X', metric: { '52WeekHigh': 1 } }).metrics, {});
  assert.equal(finnhubFundamentals('AAPL', {}, {}), null);
});
