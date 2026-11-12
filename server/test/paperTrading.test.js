const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePaperOrder,
  toShareUnits,
  calculatePaperOrderTotals,
  calculateWeightedAveragePrice,
  normalizePaperQuote
} = require('../services/paperTrading');

test('normalizes valid symbols and rejects malformed orders', () => {
  assert.deepEqual(validatePaperOrder(' aapl ', '2.5'), { symbol: 'AAPL', quantity: 2.5 });
  assert.throws(() => validatePaperOrder('AAPL; DROP', 1), /valid symbol/);
  assert.throws(() => validatePaperOrder('AAPL', 0), /positive share quantity/);
  assert.throws(() => validatePaperOrder('AAPL', true), /positive share quantity/);
  assert.throws(() => validatePaperOrder('AAPL', [1]), /positive share quantity/);
});

test('settles fractional quantities at four decimal places', () => {
  assert.equal(toShareUnits(0.0001), 1);
  assert.equal(toShareUnits(0.3) - toShareUnits(0.2), 1000);
  assert.throws(() => toShareUnits(0.00004), /four decimal places/);
});

test('converts a non-USD fill to the USD virtual balance', () => {
  assert.deepEqual(calculatePaperOrderTotals(2, 100, 'EUR', { EUR: 0.8 }), {
    currency: 'EUR', nativeAmount: 200, usdAmount: 250
  });
  assert.deepEqual(calculatePaperOrderTotals(2, 100, 'USD', {}), {
    currency: 'USD', nativeAmount: 200, usdAmount: 200
  });
  assert.throws(() => calculatePaperOrderTotals(1, 10, 'XYZ', {}), /Unsupported quote currency/);
  assert.throws(() => calculatePaperOrderTotals(0.0001, 10, 'USD', {}), /one USD cent/);
  assert.throws(() => calculatePaperOrderTotals(1e308, 100, 'USD', {}), /supported range/);
  assert.equal(calculatePaperOrderTotals(0.0001, 61, 'GBP', { GBP: 0.9 }).usdAmount, 0.01);
});

test('computes weighted average cost when adding shares', () => {
  assert.equal(calculateWeightedAveragePrice(4, 100, 6, 120), 112);
});

test('accepts only recent provider quotes for the requested symbol', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const quote = { symbol: 'MSFT', currency: 'USD', regularMarketPrice: '521.13', regularMarketTime: timestamp };
  assert.deepEqual(normalizePaperQuote('MSFT', quote, 'Twelve Data'), {
    price: 521.13, currency: 'USD', source: 'Twelve Data', sourceUpdatedAt: new Date(timestamp * 1000).toISOString()
  });
  assert.equal(normalizePaperQuote('AAPL', quote, 'Yahoo Finance'), null);
  assert.equal(normalizePaperQuote('MSFT', { ...quote, regularMarketTime: timestamp - 8 * 86400 }, 'Yahoo Finance'), null);
  assert.equal(normalizePaperQuote('MSFT', { ...quote, regularMarketTime: undefined }, 'Yahoo Finance'), null);
  const pence = { ...quote, symbol: 'VOD.L', currency: 'GBp', regularMarketPrice: 85, regularMarketTime: new Date(timestamp * 1000) };
  assert.equal(normalizePaperQuote('VOD.L', pence, 'Yahoo Finance chart').price, 0.85);
});
