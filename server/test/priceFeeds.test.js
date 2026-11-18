const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apiKeys, createPriceFeeds } = require('../services/priceFeeds');
const { createMetalsFeed } = require('../services/metals');

const candle = { datetime: '2026-11-18', open: '100', high: '110', low: '99', close: '105' };
const candles = { meta: { symbol: 'AAPL', currency: 'USD' }, values: [candle] };
const unavailable = async () => { throw new Error('Provider unavailable'); };

test('rotates failed keys, cools down quota errors, and keeps keys out of the response', async () => {
  const called = [];
  const feeds = createPriceFeeds({
    http: { get: async (url, options) => {
      called.push(options.headers.Authorization);
      return { data: called.at(-1) === 'apikey exhausted' ? { status: 'error', code: 429 } : candles };
    } },
    fetchYahooHistory: unavailable, twelveKeys: apiKeys('exhausted', 'good,good')
  });
  const result = await feeds.getHistory('AAPL');
  await feeds.getHistory('AAPL');
  assert.deepEqual(called, ['apikey exhausted', 'apikey good', 'apikey good']);
  assert.equal(result.meta.source, 'Twelve Data');
  assert.ok(!JSON.stringify(result).includes('apikey'));
});

test('rejects malformed primary prices and succeeds through independent history fallback', async () => {
  const feeds = createPriceFeeds({
    http: { get: async () => ({ data: { ...candles, values: [{ ...candle, close: 'NaN' }] } }) },
    fetchYahooHistory: async () => candles, twelveKeys: ['one']
  });
  assert.equal((await feeds.getHistory('AAPL')).meta.source, 'Yahoo Finance');
});

test('uses Alpha Vantage after outages, maps OHLC, and refuses foreign ticker guesses', async () => {
  const calls = [];
  const feeds = createPriceFeeds({
    http: { get: async (url, { params }) => {
      calls.push(params.symbol);
      return { data: { 'Meta Data': { '2. Symbol': 'AAPL' }, 'Time Series (Daily)': {
        '2026-11-18': { '1. open': '100', '2. high': '110', '3. low': '99', '4. close': '105', '5. volume': '1000' }
      } } };
    } },
    fetchYahooHistory: unavailable, alphaKeys: ['alpha']
  });
  assert.equal((await feeds.getHistory('AAPL')).values[0].close, '105');
  await assert.rejects(feeds.getHistory('INFY.NS'), { status: 503 });
  assert.deepEqual(calls, ['AAPL']);
});

test('paper quotes reject wrong listing, currency and stale timestamps', async () => {
  for (const invalid of [
    { symbol: 'WRONG' }, { currency: 'INR' }, { timestamp: Date.now() / 1000 - 8 * 86400 }
  ]) {
    const feeds = createPriceFeeds({
      fetchYahooQuote: unavailable, twelveKeys: ['one'],
      http: { get: async () => ({ data: { symbol: 'AAPL', currency: 'USD', close: '100', timestamp: Date.now() / 1000, ...invalid } }) }
    });
    await assert.rejects(feeds.getQuote('AAPL'), { status: 503 });
  }
});

test('spot metals expose units and original provider times, with partial feed failure', async () => {
  const updatedAt = new Date().toISOString();
  const feed = createMetalsFeed({
    http: { get: async url => {
      if (url.endsWith('XAG')) throw new Error('Silver unavailable');
      return { data: { symbol: 'XAU', price: 2500, updatedAt } };
    } },
    yahoo: { quote: unavailable }
  });
  const [gold, silver] = await feed();
  assert.equal(gold.price, 2500);
  assert.equal(gold.unit, 'troy oz');
  assert.equal(gold.updatedAt, updatedAt);
  assert.equal(gold.kind, 'Spot reference');
  assert.equal(silver.price, null);
});

test('labels futures fallback and preserves previous prices and timestamps on total failure', async () => {
  let failed = false;
  const time = new Date();
  const feed = createMetalsFeed({
    http: { get: unavailable },
    yahoo: { quote: async symbol => {
      if (failed) throw new Error('offline');
      return { symbol, currency: 'USD', regularMarketPrice: 100, regularMarketTime: time };
    } }
  });
  const first = await feed();
  assert.match(first[0].kind, /Futures reference/);
  failed = true;
  const second = await feed();
  assert.equal(second[0].cached, true);
  assert.equal(second[0].updatedAt, first[0].updatedAt);
});
