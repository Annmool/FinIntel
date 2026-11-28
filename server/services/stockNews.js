// Yahoo's search matches headlines by keyword, so "RELIANCE" returns any
// article containing the word. Keep only articles Yahoo itself tagged with the
// requested listing, or with the same ticker on a sibling exchange.
function newsQuery(symbol) {
  return symbol.split(':')[0].replace(/\.(NS|BO)$/, '');
}

function isAboutListing(symbol, relatedTickers) {
  const [base, suffix] = symbol.split('.');
  return Array.isArray(relatedTickers) && relatedTickers.some(ticker => {
    if (typeof ticker !== 'string') return false;
    const related = ticker.toUpperCase();
    if (related === symbol) return true;
    const [relatedBase, relatedSuffix] = related.split('.');
    return Boolean(suffix && relatedSuffix) && relatedBase === base;
  });
}

function selectStockNews(symbol, items, scoreHeadline, limit = 5) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.title && isAboutListing(symbol, item.relatedTickers))
    .slice(0, limit)
    .map(item => ({
      title: item.title,
      url: item.link,
      urlToImage: item.thumbnail?.resolutions?.[0]?.url || null,
      source: { name: item.publisher },
      publishedAt: item.providerPublishTime,
      sentimentScore: scoreHeadline(item.title)
    }));
}

module.exports = { newsQuery, isAboutListing, selectStockNews };
