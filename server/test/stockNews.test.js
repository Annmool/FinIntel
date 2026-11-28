const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newsQuery, selectStockNews } = require('../services/stockNews');

const article = (title, relatedTickers) => ({ title, relatedTickers, link: `https://news.example/${title}`, publisher: 'Wire' });

test('drops keyword matches about other companies and keeps the requested listing', () => {
  const items = [
    article('Reasons Why You Should Retain LYB Stock', ['LYB', 'RS']),
    article('Nvidia’s Reliance on Huang Could Hurt Its Rating', ['NVDA']),
    article('Reliance Industries posts record refining margin', ['RELIANCE.NS']),
    article('Reliance retail arm expands', ['RELIANCE.BO', 'TCS.NS']),
    article('Untagged wire story mentioning Reliance', undefined)
  ];
  const news = selectStockNews('RELIANCE.NS', items, () => 2);
  assert.deepEqual(news.map(item => item.title), [
    'Reliance Industries posts record refining margin', 'Reliance retail arm expands'
  ]);
  assert.equal(news[0].sentimentScore, 2);
  assert.equal(news[0].source.name, 'Wire');
});

test('does not treat an unrelated bare ticker as the same company', () => {
  const items = [article('TransConnect Services (TCS) wins award', ['TCS']), article('Apple climbs', ['AAPL', 'NVDA'])];
  assert.deepEqual(selectStockNews('TCS.NS', items, () => 0), []);
  assert.equal(selectStockNews('AAPL', items, () => 0).length, 1);
  assert.deepEqual(selectStockNews('AAPL', null, () => 0), []);
});

test('searches Indian listings by their ticker without the exchange suffix', () => {
  assert.equal(newsQuery('RELIANCE.NS'), 'RELIANCE');
  assert.equal(newsQuery('BRK-B'), 'BRK-B');
});
