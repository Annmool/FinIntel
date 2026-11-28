// Ranks the fallback universe when the provider's own screener is unavailable.
function rankUniverse(type, quotes, techSymbols = new Set()) {
  const moved = quotes.filter(quote => Number.isFinite(quote.regularMarketChangePercent));
  const byChange = direction => (a, b) => direction * (a.regularMarketChangePercent - b.regularMarketChangePercent);
  const ranked = {
    // A list of gainers or losers only contains stocks that actually rose or fell.
    day_gainers: () => moved.filter(quote => quote.regularMarketChangePercent > 0).sort(byChange(-1)),
    day_losers: () => moved.filter(quote => quote.regularMarketChangePercent < 0).sort(byChange(1)),
    most_actives: () => quotes.filter(quote => quote.regularMarketVolume > 0)
      .sort((a, b) => b.regularMarketVolume - a.regularMarketVolume),
    undervalued_large_caps: () => quotes.filter(quote => quote.currency === 'USD' && quote.marketCap >= 40e9 && quote.trailingPE > 0)
      .sort((a, b) => a.trailingPE - b.trailingPE),
    tech_titans: () => quotes.filter(quote => techSymbols.has(quote.symbol))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)),
    indian_market: () => {
      const indian = quote => quote.symbol.endsWith('.NS') || quote.symbol.endsWith('.BO');
      return [...moved.filter(indian).sort(byChange(-1)), ...quotes.filter(quote => indian(quote) && !moved.includes(quote))];
    }
  }[type];
  return ranked ? ranked().slice(0, 15) : [];
}

module.exports = { rankUniverse };
