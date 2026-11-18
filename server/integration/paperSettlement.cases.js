const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const PaperOrder = require('../models/PaperOrder');
const PaperPortfolio = require('../models/PaperPortfolio');
const VirtualAccount = require('../models/VirtualAccount');
const { settlePaperOrder } = require('../services/paperSettlement');

const uri = process.env.PAPER_TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/?replicaSet=rs0';
const dbName = `finintel_test_${randomUUID().replace(/-/g, '')}`;

before(async () => {
  // Restrict this destructive test harness to a disposable local database.
  assert.match(uri, /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/\?(?:replicaSet=[\w-]+)$/);
  await mongoose.connect(uri, { dbName, directConnection: true, serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok(hello.setName && hello.isWritablePrimary, 'A writable replica-set primary is required');
  await Promise.all([PaperOrder.init(), PaperPortfolio.init(), VirtualAccount.init()]);
});

after(async () => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName === dbName) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
});

const market = {
  getPaperMarketQuote: async () => ({ price: 100, currency: 'USD', source: 'Fixture' }),
  getGlobalFxQuote: async () => { throw new Error('USD orders should not request FX'); },
  defaultFxRates: { INR: 90 }
};

function buy(userId, overrides = {}, providers = market) {
  return settlePaperOrder({ userId, side: 'buy', symbol: 'AAPL', qty: 1, orderId: randomUUID(), ...overrides }, providers);
}

async function verifyAccount(userId, balance, quantity, receipts) {
  const account = await VirtualAccount.findOne({ userId }).lean();
  const holdings = await PaperPortfolio.find({ userId }).lean();
  assert.equal(account.balance, balance);
  assert.deepEqual(holdings.map(holding => holding.qty), quantity ? [quantity] : []);
  const keys = (await PaperOrder.find({}, { _id: 1 }).lean()).filter(({ _id }) => JSON.parse(_id)[0] === userId);
  assert.equal(keys.length, receipts);
}

test('concurrent buys cannot spend the same available cash', async () => {
  const userId = randomUUID();
  await VirtualAccount.create({ userId, balance: 100 });
  const results = await Promise.allSettled([buy(userId), buy(userId)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejection = results.find(result => result.status === 'rejected').reason;
  assert.equal(rejection.status, 400);
  assert.match(rejection.message, /Insufficient virtual funds/);
  await verifyAccount(userId, 0, 1, 1);
});

test('concurrent duplicates and later replay debit cash once', { timeout: 10000 }, async () => {
  const userId = randomUUID();
  await VirtualAccount.create({ userId, balance: 500 });
  const orderId = randomUUID();
  // Release both requests after they pass the initial receipt lookup.
  let arrivals = 0;
  let release;
  const bothArrived = new Promise(resolve => { release = resolve; });
  const providers = {
    ...market,
    async getPaperMarketQuote() {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothArrived;
      return market.getPaperMarketQuote();
    }
  };
  const [a, b] = await Promise.all([buy(userId, { orderId }, providers), buy(userId, { orderId }, providers)]);
  assert.equal(a.balance, 400);
  assert.equal(b.balance, 400);
  assert.equal(String(a.holding._id), String(b.holding._id));
  const replay = await buy(userId, { orderId }, {
    ...market,
    getPaperMarketQuote: async () => { throw new Error('A replay should read the stored receipt'); }
  });
  assert.equal(replay.balance, 400);
  await assert.rejects(buy(userId, { orderId, qty: 2 }), { status: 409 });
  await verifyAccount(userId, 400, 1, 1);
});

test('failure after cash and holdings writes rolls both back and allows a retry', async t => {
  const userId = randomUUID();
  const orderId = randomUUID();
  await VirtualAccount.create({ userId, balance: 500 });
  const createReceipt = t.mock.method(PaperOrder, 'create', async () => { throw new Error('Injected receipt failure'); });
  await assert.rejects(buy(userId, { orderId }), /Injected receipt failure/);
  assert.equal(createReceipt.mock.callCount(), 1);
  await verifyAccount(userId, 500, 0, 0);

  createReceipt.mock.restore();
  await buy(userId, { orderId });
  await verifyAccount(userId, 400, 1, 1);
});

test('concurrent full closes cannot sell the same position twice', async () => {
  const userId = randomUUID();
  await buy(userId);
  const sell = () => buy(userId, { side: 'sell' });
  const results = await Promise.allSettled([sell(), sell()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejection = results.find(result => result.status === 'rejected').reason;
  assert.equal(rejection.status, 400);
  assert.match(rejection.message, /Not enough shares/);
  await verifyAccount(userId, 100000, 0, 2);
});
