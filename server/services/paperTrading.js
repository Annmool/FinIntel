function validatePaperOrder(symbol, quantity) {
  const parsedQuantity = Number(quantity);
  if (
    typeof symbol !== 'string' ||
    !/^[A-Z0-9.^=_-]{1,24}$/i.test(symbol.trim()) ||
    !['number', 'string'].includes(typeof quantity) ||
    !Number.isFinite(parsedQuantity) ||
    parsedQuantity <= 0
  ) {
    throw new Error('Provide a valid symbol and a positive share quantity.');
  }

  return { symbol: symbol.trim().toUpperCase(), quantity: parsedQuantity };
}

function toShareUnits(quantity) {
  const units = Math.round(quantity * 10000);
  if (!Number.isSafeInteger(units) || units <= 0 || units / 10000 !== quantity) {
    throw new Error('Share quantity must be positive and have at most four decimal places.');
  }
  return units;
}

function calculatePaperOrderTotals(quantity, price, currency, fxRates) {
  const parsedQuantity = Number(quantity);
  const parsedPrice = Number(price);
  const currencyCode = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const rate = currencyCode === 'USD' ? 1 : Number(fxRates?.[currencyCode]);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new Error('Order quantity and market price must be positive numbers.');
  }
  if (!/^[A-Z]{3}$/.test(currencyCode) || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Unsupported quote currency: ${currencyCode || 'unknown'}.`);
  }

  const nativeAmount = parsedQuantity * parsedPrice;
  const usdCents = Math.round((nativeAmount / rate) * 100);
  if (!Number.isFinite(nativeAmount) || !Number.isSafeInteger(usdCents) || usdCents <= 0) {
    throw new Error('Order value must be at least one USD cent after rounding and within the supported range.');
  }
  return {
    currency: currencyCode,
    nativeAmount,
    usdAmount: usdCents / 100
  };
}

function calculateWeightedAveragePrice(existingQuantity, existingPrice, addedQuantity, addedPrice) {
  const totalQuantity = Number(existingQuantity) + Number(addedQuantity);
  if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
    throw new Error('Total holding quantity must be positive.');
  }
  return ((Number(existingQuantity) * Number(existingPrice)) + (Number(addedQuantity) * Number(addedPrice))) / totalQuantity;
}

function normalizePaperQuote(requestedSymbol, quote, source) {
  if (typeof quote?.symbol !== 'string' || quote.symbol.toUpperCase() !== requestedSymbol) return null;
  const quotedInPence = quote.currency === 'GBp' || quote.currency === 'GBX';
  const currency = quotedInPence ? 'GBP' : quote.currency;
  const price = Number(quote.regularMarketPrice) / (quotedInPence ? 100 : 1);
  const time = marketTimeMs(quote.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || typeof currency !== 'string' ||
      !/^[A-Z]{3}$/.test(currency) || !isRecentMarketTime(time)) return null;

  return { price, currency, source, sourceUpdatedAt: new Date(time).toISOString() };
}

function marketTimeMs(timestamp) {
  if (timestamp instanceof Date) return timestamp.getTime();
  return Number.isFinite(timestamp) ? timestamp * 1000 : NaN;
}

function isRecentMarketTime(time) {
  const age = Date.now() - time;
  return age >= -60000 && age <= 7 * 86400000;
}

module.exports = {
  validatePaperOrder, toShareUnits, calculatePaperOrderTotals, calculateWeightedAveragePrice,
  normalizePaperQuote, marketTimeMs, isRecentMarketTime
};
