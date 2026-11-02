const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePaperOrder,
  calculatePaperOrderTotals,
  calculateWeightedAveragePrice
} = require('../services/paperTrading');

test('normalizes valid symbols and rejects malformed orders', () => {
  assert.deepEqual(validatePaperOrder(' aapl ', '2.5'), { symbol: 'AAPL', quantity: 2.5 });
  assert.throws(() => validatePaperOrder('AAPL; DROP', 1), /valid symbol/);
  assert.throws(() => validatePaperOrder('AAPL', 0), /positive share quantity/);
});

test('converts a non-USD fill to the USD virtual balance', () => {
  assert.deepEqual(calculatePaperOrderTotals(2, 100, 'EUR', { EUR: 0.8 }), {
    currency: 'EUR', nativeAmount: 200, usdAmount: 250
  });
  assert.deepEqual(calculatePaperOrderTotals(2, 100, 'USD', {}), {
    currency: 'USD', nativeAmount: 200, usdAmount: 200
  });
  assert.throws(() => calculatePaperOrderTotals(1, 10, 'XYZ', {}), /Unsupported quote currency/);
});

test('computes weighted average cost when adding shares', () => {
  assert.equal(calculateWeightedAveragePrice(4, 100, 6, 120), 112);
});
