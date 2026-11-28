// Finnhub covers plain US tickers and writes share classes with a dot (BF.B).
function finnhubSymbol(symbol) {
  if (symbol.includes('.') || symbol.includes(':')) return null;
  return /^[A-Z]{1,5}(-[A-Z])?$/.test(symbol) ? symbol.replace('-', '.') : null;
}

// Finnhub answers some share classes with a sibling listing (BRK.B returns
// BRK.A, whose price is about 1,500 times higher). Only accept an exact match.
function finnhubFundamentals(requested, profile, metricResponse) {
  if (!profile || profile.ticker !== requested) return null;
  const metrics = metricResponse?.symbol === requested ? metricResponse.metric || {} : {};
  return { profile: { ...profile, currency: profile.currency || 'USD' }, metrics };
}

module.exports = { finnhubSymbol, finnhubFundamentals };
