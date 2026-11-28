// Groq retires hosted models regularly. Keep the model in configuration so a
// retirement is an environment change instead of a silent permanent fallback.
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

function indicatorSummary(rsi, sentiment) {
  const rsiNum = Number.parseFloat(rsi);
  if (!Number.isFinite(rsiNum)) return 'RSI is unavailable. Load more price history to calculate momentum.';
  const verdict = rsiNum > 65 ? 'overbought momentum, signaling potential consolidation'
    : rsiNum < 35 ? 'oversold conditions, indicating potential mean-reversion buying interest'
    : 'balanced neutral momentum';
  return `RSI is ${rsiNum.toFixed(1)}. The indicator suggests ${verdict}. Headline sentiment: ${sentiment || 'unavailable'}.`;
}

function createAnalyst({ groq, model = DEFAULT_MODEL, log = console.error }) {
  return async function summarize({ symbol, price, currencySymbol, currencyCode, rsi, sentiment, headlines = [] }) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [{
          role: 'user',
          content: `Analyze ${symbol}. Price: ${currencySymbol}${price} (${currencyCode}), RSI: ${rsi}, Sentiment: ${sentiment}. News: ${headlines.join('. ')}. Summarize the supplied indicators and headlines in three sentences. Keep observations tied to the supplied data and avoid price predictions or trading instructions.`
        }],
        model
      });
      const analysis = completion?.choices?.[0]?.message?.content?.trim();
      if (!analysis) throw new Error('The model returned no text');
      return { analysis, source: 'model' };
    } catch (error) {
      log(`AI summary fell back to indicators (model ${model}): ${error.message}`);
      return { analysis: indicatorSummary(rsi, sentiment), source: 'indicator' };
    }
  };
}

const SENTIMENTS = new Set(['Bullish', 'Bearish', 'Neutral', 'Unavailable']);

// The endpoint is public, so everything that reaches the prompt is checked.
function parseAnalysisRequest(body, symbolPattern) {
  const { symbol, price, rsi, sentiment, news, currency } = body ?? {};
  const cleanSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const parsedPrice = ['number', 'string'].includes(typeof price) ? Number(price) : NaN;
  const hasRsi = rsi !== null && rsi !== undefined && rsi !== '';
  const parsedRsi = ['number', 'string'].includes(typeof rsi) ? Number(rsi) : NaN;
  const currencyCode = typeof currency === 'string' ? currency.trim().toUpperCase() : undefined;
  if (!symbolPattern.test(cleanSymbol) || !Number.isFinite(parsedPrice) || parsedPrice <= 0 ||
      (hasRsi && !(parsedRsi >= 0 && parsedRsi <= 100)) ||
      (sentiment !== undefined && !SENTIMENTS.has(sentiment)) ||
      (currency !== undefined && !/^[A-Z]{3}$/.test(currencyCode ?? ''))) {
    return null;
  }
  const headlines = (Array.isArray(news) ? news : []).slice(0, 2)
    .map(item => typeof item?.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '')
    .filter(Boolean);
  return {
    symbol: cleanSymbol, price: parsedPrice, currencyCode, headlines,
    rsi: hasRsi ? parsedRsi.toFixed(2) : null, sentiment: sentiment ?? 'Unavailable'
  };
}

module.exports = { DEFAULT_MODEL, createAnalyst, indicatorSummary, parseAnalysisRequest };
