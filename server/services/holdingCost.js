const mongoose = require('mongoose');
const Portfolio = require('../models/Portfolio');

function positiveNumber(value) {
  const parsed = ['number', 'string'].includes(typeof value) ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

async function correctHoldingCost(userId, id, { price, revision } = {}) {
  const nextPrice = positiveNumber(price);
  if (!mongoose.isObjectIdOrHexString(id) || !Number.isFinite(nextPrice) ||
      !Number.isSafeInteger(revision) || revision < 0) {
    throw Object.assign(new Error('Provide a valid holding, positive purchase price, and current revision.'), { status: 400 });
  }
  const owner = { _id: id, userId };
  const existing = await Portfolio.findOne(owner).lean();
  if (!existing) throw Object.assign(new Error('Holding not found.'), { status: 404 });
  const conflict = () => Object.assign(new Error('This purchase price changed. Reopen the editor to see the latest price.'), { status: 409 });
  if ((existing.costRevision ?? 0) !== revision) throw conflict();
  if (existing.price === nextPrice) return existing;

  const expected = revision === 0
    ? { $or: [{ costRevision: 0 }, { costRevision: { $exists: false } }] }
    : { costRevision: revision };
  const updated = await Portfolio.findOneAndUpdate(
    { ...owner, ...expected },
    {
      $set: { price: nextPrice },
      $inc: { costRevision: 1 },
      $push: { costCorrections: { previousPrice: existing.price, price: nextPrice, correctedAt: new Date() } }
    },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) throw conflict();
  return updated;
}

module.exports = { correctHoldingCost, positiveNumber };
