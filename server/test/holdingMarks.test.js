const test = require('node:test');
const assert = require('node:assert/strict');
const { createHoldingMarks } = require('../services/holdingMarks');
const { buildAlertReceipt } = require('../services/alertReceipts');
const { createPriceFeeds } = require('../services/priceFeeds');

test('holds on to the newest close during provider outages, then expires it', async () => {
  let now = Date.parse('2026-11-25T12:00:00Z');
  const marks = createHoldingMarks({ now: () => now });
  const history = { meta: { currency: 'INR', source: 'Fallback provider' }, values: [{ close: '3320.25', datetime: '2026-11-24' }] };
  const offline = async () => { throw new Error('offline'); };
  assert.deepEqual(await marks.getMark('TCS.NS', offline), { status: 'unavailable' });

  const mark = await marks.getMark('TCS.NS', async symbol => marks.remember(symbol, history));
  assert.deepEqual(mark, {
    status: 'recent-close', currency: 'INR', price: 3320.25, source: 'Fallback provider',
    date: '2026-11-24', fetchedAt: '2026-11-25T12:00:00.000Z'
  });
  const fallback = await marks.getMark('TCS.NS', offline);
  assert.deepEqual(fallback, { ...mark, status: 'last-known' });

  marks.remember('TCS.NS', { ...history, values: [{ close: '500', datetime: '2026-11-22' }] });
  assert.equal((await marks.getMark('TCS.NS', offline)).price, mark.price);
  now = Date.parse('2026-11-29T12:00:00Z');
  assert.equal((await marks.getMark('TCS.NS', async () => {})).status, 'last-known');
  now = Date.parse('2026-12-02T12:00:00Z');
  assert.deepEqual(await marks.getMark('TCS.NS', offline), { status: 'unavailable' });
});

test('alert receipts skip stale, missing, pre-creation and wrong-currency quotes', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const alert = { targetPrice: 1000, condition: 'ABOVE', currency: 'INR', createdAt: new Date('2026-11-25T11:45:00Z') };
  const quote = { price: 1012, currency: 'INR', source: 'Fixture', sourceUpdatedAt: '2026-11-25T11:50:00Z' };
  assert.equal(buildAlertReceipt(alert, null, now), null);
  assert.equal(buildAlertReceipt(alert, { ...quote, currency: 'USD' }, now), null);
  assert.equal(buildAlertReceipt(alert, { ...quote, sourceUpdatedAt: '2026-11-25T11:44:00Z' }, now), null);
  assert.equal(buildAlertReceipt({ ...alert, createdAt: undefined }, quote, now + 31 * 60_000), null);
  assert.deepEqual(buildAlertReceipt(alert, quote, now), {
    price: 1012, currency: 'INR', source: 'Fixture',
    quoteTime: new Date(quote.sourceUpdatedAt), triggeredAt: new Date(now)
  });
  assert.equal(buildAlertReceipt({ targetPrice: 220, condition: 'ABOVE', currency: 'GBX' },
    { ...quote, price: 2.25, currency: 'GBP' }, now).price, 225);
});

test('a Yahoo quote too old for alerts can fall through to a fresher provider', async () => {
  const now = Date.now();
  const earlier = new Date(now - 60 * 60_000).toISOString();
  const primary = { price: 120, currency: 'USD', source: 'Yahoo Finance', sourceUpdatedAt: earlier };
  const feeds = createPriceFeeds({
    fetchYahooQuote: async () => primary,
    twelveKeys: ['fixture'],
    http: { get: async () => ({
      data: { symbol: 'AAPL', currency: 'USD', close: '125', timestamp: Math.floor(now / 1000) }
    }) }
  });
  assert.equal((await feeds.getQuote('AAPL')).source, 'Yahoo Finance');
  const fresh = await feeds.getQuote('AAPL', quote => Date.parse(quote.sourceUpdatedAt) >= now - 30 * 60_000);
  assert.equal(fresh.price, 125);
  assert.equal(fresh.source, 'Twelve Data');
});
