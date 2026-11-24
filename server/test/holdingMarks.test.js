const test = require('node:test');
const assert = require('node:assert/strict');
const { createHoldingMarks } = require('../services/holdingMarks');

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
