export const CURRENCY_SYMBOLS = {
  USD: '$',
  INR: '₹',
  KRW: '₩',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AED: 'AED ',
  SAR: 'SAR ',
  QAR: 'QAR ',
  KWD: 'KWD ',
  BHD: 'BHD ',
  OMR: 'OMR ',
  ILS: '₪',
  TRY: '₺',
  ZAR: 'R',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  HKD: 'HK$',
  CNY: '¥',
  CHF: 'CHF ',
  SGD: 'S$',
  TWD: 'NT$',
  BRL: 'R$',
  MXN: 'Mex$',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
  IDR: 'Rp ',
  MYR: 'RM ',
  THB: '฿',
  PHP: '₱',
  VND: '₫'
};

export const DEFAULT_FX_RATES = {
  USD: 1.0,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  INR: 86.80,
  KRW: 1334.0,
  EUR: 0.893,
  GBP: 0.745,
  JPY: 157.0,
  CAD: 1.395,
  AUD: 1.52,
  HKD: 7.85,
  CNY: 7.20,
  CHF: 0.88,
  SGD: 1.32,
  TWD: 32.0,
  BRL: 5.60
};

export function inferCurrencyFromSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return 'USD';
  const s = symbol.trim().toUpperCase();
  // Middle East & GCC
  if (s.endsWith('.AE') || s.endsWith('.DU') || s.endsWith('.AD')) return 'AED';
  if (s.endsWith('.SR') || s.endsWith('.SAU')) return 'SAR';
  if (s.endsWith('.QA')) return 'QAR';
  if (s.endsWith('.KW')) return 'KWD';
  if (s.endsWith('.BH')) return 'BHD';
  if (s.endsWith('.OM')) return 'OMR';
  if (s.endsWith('.TA')) return 'ILS';
  if (s.endsWith('.IS')) return 'TRY';
  if (s.endsWith('.CA')) return 'EGP';
  // Asia
  if (s.endsWith('.KS') || s.endsWith('.KQ')) return 'KRW';
  if (s.endsWith('.NS') || s.endsWith('.BO')) return 'INR';
  if (s.endsWith('.T')) return 'JPY';
  if (s.endsWith('.HK')) return 'HKD';
  if (s.endsWith('.SS') || s.endsWith('.SZ')) return 'CNY';
  if (s.endsWith('.TW') || s.endsWith('.TWO')) return 'TWD';
  if (s.endsWith('.SI')) return 'SGD';
  if (s.endsWith('.JK')) return 'IDR';
  if (s.endsWith('.KL')) return 'MYR';
  if (s.endsWith('.BK')) return 'THB';
  if (s.endsWith('.PS')) return 'PHP';
  if (s.endsWith('.VN')) return 'VND';
  // Europe & UK
  if (s.endsWith('.L') || s.endsWith('.IL')) return 'GBP';
  if (s.endsWith('.DE') || s.endsWith('.PA') || s.endsWith('.AS') || s.endsWith('.MI') || s.endsWith('.MC') || s.endsWith('.BR') || s.endsWith('.HE') || s.endsWith('.VI') || s.endsWith('.F') || s.endsWith('.AT')) return 'EUR';
  if (s.endsWith('.SW')) return 'CHF';
  if (s.endsWith('.ST')) return 'SEK';
  if (s.endsWith('.OL')) return 'NOK';
  if (s.endsWith('.CO')) return 'DKK';
  if (s.endsWith('.WA')) return 'PLN';
  // Americas & Oceania
  if (s.endsWith('.TO') || s.endsWith('.V') || s.endsWith('.CN')) return 'CAD';
  if (s.endsWith('.AX')) return 'AUD';
  if (s.endsWith('.NZ')) return 'NZD';
  if (s.endsWith('.SA')) return 'BRL';
  if (s.endsWith('.MX')) return 'MXN';
  if (s.endsWith('.JO')) return 'ZAR';
  return 'USD';
}

export function getCurrencyCode(itemOrSymbol) {
  if (!itemOrSymbol) return 'USD';
  if (typeof itemOrSymbol === 'string') {
    const upper = itemOrSymbol.trim().toUpperCase();
    if (CURRENCY_SYMBOLS[upper]) return upper;
    // If it's already a 3-letter currency code (e.g. AED, SAR, USD) without a stock exchange dot, preserve it
    if (/^[A-Z]{3}$/.test(upper) && !upper.includes('.')) return upper;
    return inferCurrencyFromSymbol(itemOrSymbol);
  }
  if (typeof itemOrSymbol === 'object') {
    if (itemOrSymbol.currency) {
      const cur = itemOrSymbol.currency.trim().toUpperCase();
      if (cur) return cur;
    }
    if (itemOrSymbol.meta?.currency) {
      const cur = itemOrSymbol.meta.currency.trim().toUpperCase();
      if (cur) return cur;
    }
    if (itemOrSymbol.symbol) return inferCurrencyFromSymbol(itemOrSymbol.symbol);
  }
  return 'USD';
}

export function getCurrencySymbol(itemOrSymbolOrCode) {
  const code = getCurrencyCode(itemOrSymbolOrCode);
  if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code];
  return code ? `${code} ` : '$';
}

export function formatPrice(price, currencyCodeOrSymbol = 'USD', options = {}) {
  const num = typeof price === 'number' ? price : parseFloat(price);
  if (!Number.isFinite(num)) return '--';
  const code = getCurrencyCode(currencyCodeOrSymbol);
  // Zero-decimal currencies like KRW (Korean Won) and JPY (Japanese Yen)
  const isZeroDecimal = code === 'KRW' || code === 'JPY' || code === 'VND' || code === 'IDR';

  let minDec = options.minDecimals !== undefined ? options.minDecimals : (isZeroDecimal ? 0 : 2);
  let maxDec = options.maxDecimals !== undefined ? options.maxDecimals : (isZeroDecimal ? 0 : 2);

  // Guard against RangeError where minDecimals > maxDecimals
  if (options.maxDecimals !== undefined && options.minDecimals === undefined) {
    minDec = Math.min(minDec, maxDec);
  } else if (options.minDecimals !== undefined && options.maxDecimals === undefined) {
    maxDec = Math.max(minDec, maxDec);
  }

  minDec = Math.max(0, Math.min(20, minDec));
  maxDec = Math.max(minDec, Math.min(20, maxDec));

  return num.toLocaleString(undefined, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec
  });
}

export function convertPrice(amount, fromCurrency, toCurrency, fxRates = DEFAULT_FX_RATES) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(num)) return 0;
  const from = getCurrencyCode(fromCurrency);
  const to = getCurrencyCode(toCurrency);
  if (from === to) return num;
  const rates = { ...DEFAULT_FX_RATES, ...fxRates };
  const fromRate = rates[from] || 1.0;
  const toRate = rates[to] || 1.0;
  // Convert from -> USD -> to
  const inUsd = num / fromRate;
  return inUsd * toRate;
}

export function formatLargeCap(cap, currencyCodeOrSymbol = 'USD') {
  const num = typeof cap === 'number' ? cap : parseFloat(cap);
  if (!Number.isFinite(num) || num <= 0) return '--';
  const sym = getCurrencySymbol(currencyCodeOrSymbol);
  if (num >= 1e12) return `${sym}${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${sym}${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${sym}${(num / 1e6).toFixed(2)}M`;
  return `${sym}${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
