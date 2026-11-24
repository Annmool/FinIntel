const MAX_QUOTE_AGE_MS = 30 * 60 * 1000;

function isFreshAlertQuote(quote, now) {
  const quoteTime = Date.parse(quote?.sourceUpdatedAt);
  return Number.isFinite(quote?.price) && quote.price > 0 &&
    typeof quote?.currency === 'string' && /^[A-Z]{3}$/.test(quote.currency) &&
    Boolean(quote.source) && now - quoteTime <= MAX_QUOTE_AGE_MS && quoteTime <= now + 60_000;
}

function buildAlertReceipt(alert, quote, now = Date.now()) {
  if (alert.triggered || !isFreshAlertQuote(quote, now)) return null;
  const quoteTime = new Date(quote.sourceUpdatedAt);
  if (alert.createdAt && quoteTime < alert.createdAt) return null;

  // Older alerts compared directly with the provider's native unit.
  const currency = alert.currency || quote.originalUnit || quote.currency;
  const price = currency === 'GBX' && quote.currency === 'GBP' ? quote.price * 100 : quote.price;
  if (currency !== quote.currency && !(currency === 'GBX' && quote.currency === 'GBP')) return null;
  if (!Number.isFinite(price) || !Number.isFinite(alert.targetPrice) || alert.targetPrice <= 0) return null;
  const hit = (alert.condition === 'ABOVE' && price >= alert.targetPrice) ||
    (alert.condition === 'BELOW' && price <= alert.targetPrice);
  return hit ? { price, currency, source: quote.source, quoteTime, triggeredAt: new Date(now) } : null;
}

async function recordAlertReceipt(Alert, alert, quote, now = Date.now()) {
  const receipt = buildAlertReceipt(alert, quote, now);
  if (!receipt) return false;
  const result = await Alert.updateOne({ _id: alert._id, triggered: false }, { $set: { triggered: true, receipt } });
  return result.modifiedCount === 1;
}

module.exports = { isFreshAlertQuote, buildAlertReceipt, recordAlertReceipt };
