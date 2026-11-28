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

module.exports = { DEFAULT_MODEL, createAnalyst, indicatorSummary };
