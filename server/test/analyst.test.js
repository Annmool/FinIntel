const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnalyst } = require('../services/analyst');

const request = {
  symbol: 'AAPL', price: '358.54', currencySymbol: '$', currencyCode: 'USD',
  rsi: '72.10', sentiment: 'Bullish', headlines: ['Apple shares rise']
};

test('asks the configured model and returns its text as a model summary', async () => {
  const calls = [];
  const groq = { chat: { completions: { create: async options => {
    calls.push(options);
    return { choices: [{ message: { content: ' Momentum is elevated. ' } }] };
  } } } };
  const result = await createAnalyst({ groq, model: 'configured-model' })(request);
  assert.deepEqual(result, { analysis: 'Momentum is elevated.', source: 'model' });
  assert.equal(calls[0].model, 'configured-model');
  assert.match(calls[0].messages[0].content, /AAPL.*\$358\.54 \(USD\).*Apple shares rise/);
});

test('labels the indicator fallback and reports why when the model is retired or silent', async () => {
  const logged = [];
  const retired = { chat: { completions: { create: async () => { throw new Error('model_not_found'); } } } };
  const result = await createAnalyst({ groq: retired, model: 'old-model', log: line => logged.push(line) })(request);
  assert.equal(result.source, 'indicator');
  assert.match(result.analysis, /RSI is 72\.1.*overbought.*Bullish/);
  assert.match(logged[0], /old-model.*model_not_found/);

  const silent = { chat: { completions: { create: async () => ({ choices: [{ message: { content: '' } }] }) } } };
  const empty = await createAnalyst({ groq: silent, log: () => {} })({ ...request, rsi: null });
  assert.deepEqual(empty, { analysis: 'RSI is unavailable. Load more price history to calculate momentum.', source: 'indicator' });
});
