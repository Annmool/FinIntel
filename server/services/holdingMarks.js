const DAY = 86400000;
const RECENT_CLOSE_AGE = 4 * DAY;
const LAST_KNOWN_MAX_AGE = 7 * DAY;
const MAX_MARKS = 500;

function createHoldingMarks({ now = Date.now } = {}) {
  const remembered = new Map();
  function remember(symbol, history) {
    const candle = history?.values?.[0];
    const price = Number(candle?.close);
    const date = candle?.datetime;
    const { currency, source } = history?.meta ?? {};
    const timestamp = Date.parse(date);
    if (!Number.isFinite(price) || price <= 0 || !currency || !source ||
        !Number.isFinite(timestamp) || timestamp > now() || now() - timestamp > LAST_KNOWN_MAX_AGE) return;
    const previous = remembered.get(symbol);
    if (previous && date < previous.date) return;
    remembered.delete(symbol);
    remembered.set(symbol, { price, currency, source, date, fetchedAt: new Date(now()).toISOString() });
    if (remembered.size > MAX_MARKS) remembered.delete(remembered.keys().next().value);
  }

  async function getMark(symbol, loadHistory) {
    let refreshFailed = false;
    try {
      await loadHistory(symbol);
    } catch {
      refreshFailed = true;
    }
    const mark = remembered.get(symbol);
    if (!mark || now() - Date.parse(mark.date) > LAST_KNOWN_MAX_AGE) {
      remembered.delete(symbol);
      return { status: 'unavailable' };
    }
    return {
      ...mark,
      status: refreshFailed || now() - Date.parse(mark.date) > RECENT_CLOSE_AGE ? 'last-known' : 'recent-close'
    };
  }

  return { remember, getMark };
}

module.exports = { createHoldingMarks };
