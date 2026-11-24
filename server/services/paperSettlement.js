const mongoose = require('mongoose');
const PaperOrder = require('../models/PaperOrder');
const PaperPortfolio = require('../models/PaperPortfolio');
const VirtualAccount = require('../models/VirtualAccount');
const { validatePaperOrder, toShareUnits, calculatePaperOrderTotals, calculateWeightedAveragePrice } = require('./paperTrading');

function getOrCreateVirtualAccount(userId, session) {
  return VirtualAccount.findOneAndUpdate(
    { userId },
    { $setOnInsert: { balance: 100000 } },
    { returnDocument: 'after', upsert: true, session }
  );
}

function paperOrderError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function settlePaperOrder({ userId, side, symbol, qty, orderId }, { getPaperMarketQuote, getGlobalFxQuote, defaultFxRates }) {
  let order;
  let shareUnits;
  try {
    order = validatePaperOrder(symbol, qty);
    if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(orderId)) {
      throw new Error('Provide a valid order ID for safe retries.');
    }
    // A full sale may close a legacy position with more than four decimals.
    if (side === 'buy') shareUnits = toShareUnits(order.quantity);
  } catch (error) {
    throw paperOrderError(400, error.message);
  }

  const { symbol: cleanSymbol, quantity } = order;
  const key = JSON.stringify([userId, orderId]);
  const readReceipt = receipt => {
    if (receipt.side !== side || receipt.symbol !== cleanSymbol || receipt.quantity !== quantity) {
      throw paperOrderError(409, 'This order ID was used for a different order.');
    }
    return receipt.response;
  };

  const existingReceipt = await PaperOrder.findById(key).lean();
  if (existingReceipt) return readReceipt(existingReceipt);

  const quote = await getPaperMarketQuote(cleanSymbol);
  const fx = quote.currency === 'USD' ? null : await getGlobalFxQuote();
  if (fx && !fx.providerRates[quote.currency]) {
    throw paperOrderError(503, `No verified USD exchange rate for ${quote.currency}. Try again later.`);
  }
  const fxRates = fx?.rates ?? defaultFxRates;
  let totals;
  try {
    totals = calculatePaperOrderTotals(quantity, quote.price, quote.currency, fx?.providerRates);
  } catch (error) {
    throw paperOrderError(400, error.message);
  }

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const receipt = await PaperOrder.findById(key).session(session).lean();
      if (receipt) return readReceipt(receipt);

      const account = await getOrCreateVirtualAccount(userId, session);
      let holding = await PaperPortfolio.findOne({ userId, symbol: cleanSymbol }).session(session);
      const cashCents = Math.round(account.balance * 100);
      const orderCents = Math.round(totals.usdAmount * 100);
      const nextCashCents = side === 'buy' ? cashCents - orderCents : cashCents + orderCents;
      if (nextCashCents < 0) throw paperOrderError(400, 'Insufficient virtual funds.');
      if (!Number.isSafeInteger(nextCashCents)) throw paperOrderError(400, 'Virtual balance is outside the supported range.');

      if (side === 'buy') {
        if (holding) {
          const holdingUnits = Math.round(holding.qty * 10000);
          if (!Number.isSafeInteger(holdingUnits + shareUnits) || holdingUnits / 10000 !== holding.qty) {
            throw paperOrderError(409, 'Close this legacy fractional position before adding shares.');
          }
          if (holding.currency && holding.currency !== quote.currency) {
            throw paperOrderError(409, 'The quote currency differs from the stored position. Close the position before adding shares.');
          }
          holding.price = calculateWeightedAveragePrice(holding.qty, holding.price, quantity, quote.price);
          holding.qty = (holdingUnits + shareUnits) / 10000;
          holding.currency = quote.currency;
        } else {
          holding = new PaperPortfolio({ userId, symbol: cleanSymbol, currency: quote.currency, qty: quantity, price: quote.price });
        }
        await holding.save({ session });
      } else {
        if (!holding || holding.qty < quantity) throw paperOrderError(400, 'Not enough shares to sell.');
        if (holding.qty === quantity) {
          await holding.deleteOne({ session });
          holding = null;
        } else {
          try {
            const holdingUnits = toShareUnits(holding.qty);
            holding.qty = (holdingUnits - toShareUnits(quantity)) / 10000;
          } catch (error) {
            throw paperOrderError(400, 'Partial sales require four-decimal share quantities. Close the full position to sell legacy fractions.');
          }
          await holding.save({ session });
        }
      }

      account.balance = nextCashCents / 100;
      await account.save({ session });
      const result = {
        holding: holding?.toObject() ?? null,
        balance: account.balance,
        fxRates,
        rate: fxRates.INR,
        executedPrice: quote.price,
        currency: quote.currency,
        quoteSource: quote.source,
        quoteTimestamp: quote.sourceUpdatedAt,
        usdAmount: totals.usdAmount,
        fxRate: fx?.providerRates[quote.currency] ?? 1,
        fxSource: fx?.source ?? null
      };
      await PaperOrder.create([{ _id: key, userId, side, symbol: cleanSymbol, quantity, response: result }], { session });
      return result;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const receipt = await PaperOrder.findById(key).lean();
    if (receipt) return readReceipt(receipt);
    throw paperOrderError(503, 'Concurrent order update. Retry with the same order ID.');
  } finally {
    await session.endSession();
  }
}

module.exports = { getOrCreateVirtualAccount, settlePaperOrder };
