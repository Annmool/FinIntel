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

module.exports = { validatePaperOrder, toShareUnits, calculatePaperOrderTotals, calculateWeightedAveragePrice };
