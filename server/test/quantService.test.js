const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAssetParameters, isPositiveSemidefinite } = require('../quant_service');

function prices(count, firstDay = 1) {
  return Array.from({ length: count }, (_, index) => ({
    datetime: `2026-01-${String(firstDay + index).padStart(2, '0')}`,
    close: index % 2 ? 110 : 100
  }));
}

test('correlates matching date intervals instead of array positions', () => {
  const result = computeAssetParameters({ A: prices(17).reverse(), B: prices(17, 2) }, ['A', 'B']);
  assert.equal(result.from, '2026-01-02');
  assert.equal(result.to, '2026-01-17');
  assert.equal(result.sampleCount, 15);
  assert.ok(result.correlationMatrix[0][1] < -0.99999);
  assert.ok(isPositiveSemidefinite(result.correlationMatrix));
});

test('drops invalid bars across the common sample and reports insufficient history', () => {
  const a = prices(16);
  const b = prices(16);
  b[4].close = -1;
  const result = computeAssetParameters({ A: a, B: b }, ['A', 'B']);
  assert.equal(result.sampleCount, 14);
  assert.ok(Number.isFinite(result.correlationMatrix[0][1]));
  assert.equal(computeAssetParameters({ A: a, B: b.slice(0, 14) }, ['A', 'B']), null);
});

test('rejects impossible correlations and allows singular valid matrices', () => {
  assert.equal(isPositiveSemidefinite([[1, -0.9, -0.9], [-0.9, 1, -0.9], [-0.9, -0.9, 1]]), false);
  assert.equal(isPositiveSemidefinite([[1, 1], [1, 1]]), true);
  assert.equal(isPositiveSemidefinite([[1, 1, 0], [1, 1, 0.1], [0, 0.1, 1]]), false);
});

test('caps engine threads to the configured or available CPUs', () => {
  const { quantThreadCount } = require('../quant_service');
  assert.equal(quantThreadCount(undefined, 1), 1);
  assert.equal(quantThreadCount(undefined, 32), 8);
  assert.equal(quantThreadCount('2', 32), 2);
  assert.equal(quantThreadCount('0', 4), 4);
  assert.equal(quantThreadCount('many', undefined), 1);
});

test('stops the native engine when the request is abandoned', { skip: !require('fs').existsSync(require('path').join(__dirname, '..', 'quant_core', process.platform === 'win32' ? 'quant_engine.exe' : 'quant_engine')) }, async () => {
  const { runCppQuantEngine } = require('../quant_service');
  const controller = new AbortController();
  const run = runCppQuantEngine({
    symbols: ['A', 'B', 'C', 'D', 'E'], weights: [0.2, 0.2, 0.2, 0.2, 0.2], numSimulations: 200000, timeHorizonDays: 365,
    initialPortfolioValue: 100000, riskFreeRate: 0, expectedReturns: [0.1, 0.1, 0.1, 0.1, 0.1],
    volatilities: [0.2, 0.2, 0.2, 0.2, 0.2],
    correlationMatrix: [0, 1, 2, 3, 4].map(i => [0, 1, 2, 3, 4].map(j => i === j ? 1 : 0.3))
  }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(run, /cancelled/);
});
