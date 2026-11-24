const PaperOrder = require('../models/PaperOrder');

async function getPaperHistory(userId, { cursor, limit = '20' }) {
  if (typeof limit !== 'string' || !/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) {
    throw Object.assign(new Error('Choose a page size from 1 to 50.'), { status: 400 });
  }
  const count = Number(limit);
  const ownerPrefix = JSON.stringify([userId]).slice(0, -1) + ',';
  let after = {};
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,2000}$/.test(cursor)) throw new Error();
      const { at, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const date = new Date(at);
      if (typeof at !== 'string' || !Number.isFinite(date.getTime()) ||
          typeof id !== 'string' || !id.startsWith(ownerPrefix)) throw new Error();
      after = { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }] };
    } catch {
      throw Object.assign(new Error('Invalid history cursor.'), { status: 400 });
    }
  }

  const load = filter => PaperOrder.find({ ...filter, ...after })
    .sort({ createdAt: -1, _id: -1 }).limit(count + 1).lean();
  const [current, legacy] = await Promise.all([
    load({ userId }),
    load({ userId: { $exists: false }, _id: { $gte: ownerPrefix, $lt: ownerPrefix + '\uffff' } })
  ]);
  const receipts = [...current, ...legacy].sort((a, b) =>
    b.createdAt - a.createdAt || (a._id < b._id ? 1 : -1));
  const page = receipts.slice(0, count);
  const last = page.at(-1);
  return {
    trades: page.map(({ _id, side, symbol, quantity, createdAt, response }) => ({
      id: JSON.parse(_id)[1], side, symbol, quantity, filledAt: createdAt,
      executedPrice: response.executedPrice, currency: response.currency, usdAmount: response.usdAmount,
      quoteSource: response.quoteSource, quoteTimestamp: response.quoteTimestamp,
      fxRate: response.fxRate, fxSource: response.fxSource
    })),
    nextCursor: receipts.length > count
      ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last._id })).toString('base64url')
      : null
  };
}

module.exports = { getPaperHistory };
