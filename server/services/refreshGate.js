// Lets a caller-triggered refresh through at most once per interval, so a
// public "force refresh" cannot spend a provider's request quota.
function createRefreshGate(minIntervalMs, now = Date.now) {
  let lastAllowed = -Infinity;
  return function allowRefresh() {
    if (now() - lastAllowed < minIntervalMs) return false;
    lastAllowed = now();
    return true;
  };
}

module.exports = { createRefreshGate };
