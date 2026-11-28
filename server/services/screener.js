const hasChange = quote => Number.isFinite(quote.regularMarketChangePercent);
const hasVolume = quote => quote.regularMarketVolume > 0;
const hasValuation = quote => quote.currency === 'USD' && quote.marketCap > 0 && quote.trailingPE > 0;
const isIndian = quote => quote.symbol.endsWith('.NS') || quote.symbol.endsWith('.BO');

function hasScreenerCoverage(type, quotes, techSymbols) {
  const canRank = {
    day_gainers: hasChange,
    day_losers: hasChange,
    most_actives: hasVolume,
    undervalued_large_caps: hasValuation,
    tech_titans: quote => techSymbols.has(quote.symbol),
    indian_market: isIndian
  }[type];
  return Boolean(canRank && quotes.some(canRank));
}

// Ranks the fallback universe when the provider's own screener is unavailable.
function rankUniverse(type, quotes, techSymbols = new Set()) {
  const moved = quotes.filter(hasChange);
  const byChange = direction => (a, b) => direction * (a.regularMarketChangePercent - b.regularMarketChangePercent);
  const ranked = {
    // A list of gainers or losers only contains stocks that actually rose or fell.
    day_gainers: () => moved.filter(quote => quote.regularMarketChangePercent > 0).sort(byChange(-1)),
    day_losers: () => moved.filter(quote => quote.regularMarketChangePercent < 0).sort(byChange(1)),
    most_actives: () => quotes.filter(hasVolume)
      .sort((a, b) => b.regularMarketVolume - a.regularMarketVolume),
    undervalued_large_caps: () => quotes.filter(quote => hasValuation(quote) && quote.marketCap >= 40e9)
      .sort((a, b) => a.trailingPE - b.trailingPE),
    tech_titans: () => quotes.filter(quote => techSymbols.has(quote.symbol))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)),
    indian_market: () => [...moved.filter(isIndian).sort(byChange(-1)), ...quotes.filter(quote => isIndian(quote) && !hasChange(quote))]
  }[type];
  return ranked ? ranked().slice(0, 15) : [];
}

module.exports = { hasScreenerCoverage, rankUniverse };
