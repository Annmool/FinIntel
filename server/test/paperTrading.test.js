const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePaperOrder,
  toShareUnits,
  calculatePaperOrderTotals,
  calculateWeightedAveragePrice
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
