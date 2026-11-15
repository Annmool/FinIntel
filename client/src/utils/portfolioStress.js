export function calculatePortfolioStress(holdings, marks, fxRates, currency, shocks, now = Date.now()) {
  const validShock = (value, minimum) => typeof value === 'string' && value.trim() !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= 100;

  if (!validShock(shocks.usd, -100) || !validShock(shocks.inr, -100) ||
      !validShock(shocks.fx, -99.99)) {
    return { status: 'invalid' };
  }
  if (!holdings.length) return { status: 'empty' };

  const priceFactors = { USD: 1 + Number(shocks.usd) / 100, INR: 1 + Number(shocks.inr) / 100 };
  const fxFactor = 1 + Number(shocks.fx) / 100;
  const rate = code => code === 'USD' ? 1 : fxRates[code];
  const validRate = value => Number.isFinite(value) && value > 0;
  if (!validRate(rate(currency))) return { status: 'unavailable', missing: [`${currency} exchange rate`] };

  const positions = new Map();
  const missing = new Set();
  let oldestMark = now;
  for (const { symbol, qty } of holdings) {
    const mark = marks[symbol];
    const date = Date.parse(mark?.date);
    const inPence = mark?.currency === 'GBp' || mark?.currency === 'GBX';
    const native = inPence ? 'GBP' : mark?.currency;
    if (!mark || !Number.isFinite(mark.price) || mark.price <= 0 ||
        !Number.isFinite(date) || date > now || now - date > 7 * 86400000 ||
        !/^[A-Z]{3}$/.test(native ?? '') || !validRate(rate(native)) ||
        !Number.isFinite(qty) || qty <= 0) {
      missing.add(symbol);
      continue;
    }
    const nativeValue = qty * mark.price / (inPence ? 100 : 1);
    const current = native === currency ? nativeValue : nativeValue / rate(native) * rate(currency);
    // Rates are quoted per USD, so converting out of INR uses the reciprocal shock.
    let conversionFactor = 1;
    if (native !== currency && currency === 'INR') conversionFactor = fxFactor;
    if (native !== currency && native === 'INR') conversionFactor = 1 / fxFactor;
    const stressed = current * (priceFactors[native] ?? 1) * conversionFactor;
    const position = positions.get(symbol) ?? { symbol, current: 0, stressed: 0 };
    positions.set(symbol, { symbol, current: position.current + current, stressed: position.stressed + stressed });
    oldestMark = Math.min(oldestMark, date);
  }
  if (missing.size) return { status: 'unavailable', missing: [...missing] };

  const contributions = [...positions.values()].map(({ symbol, current, stressed }) => ({
    symbol, change: stressed - current
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const current = [...positions.values()].reduce((sum, position) => sum + position.current, 0);
  const stressed = [...positions.values()].reduce((sum, position) => sum + position.stressed, 0);
  const change = stressed - current;
  const percent = change / current * 100;
  if (!Number.isFinite(percent) || !Number.isFinite(stressed)) return { status: 'invalid' };
  return { status: 'ready', current, stressed, change, percent, contributions, oldestMark };
}
