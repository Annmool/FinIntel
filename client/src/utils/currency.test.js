import {
  CURRENCY_SYMBOLS,
  inferCurrencyFromSymbol,
  getCurrencyCode,
  getCurrencySymbol,
  formatPrice,
  convertPrice,
  formatLargeCap
} from './currency';

describe('Currency Utilities', () => {
  test('infers correct currency codes from global ticker symbols including AED', () => {
    expect(inferCurrencyFromSymbol('EMAAR.AE')).toBe('AED');
    expect(inferCurrencyFromSymbol('DIB.DU')).toBe('AED');
    expect(inferCurrencyFromSymbol('2222.SR')).toBe('SAR');
    expect(inferCurrencyFromSymbol('005930.KS')).toBe('KRW');
    expect(inferCurrencyFromSymbol('000660.KS')).toBe('KRW');
    expect(inferCurrencyFromSymbol('RELIANCE.NS')).toBe('INR');
    expect(inferCurrencyFromSymbol('TCS.BO')).toBe('INR');
    expect(inferCurrencyFromSymbol('AAPL')).toBe('USD');
    expect(inferCurrencyFromSymbol('SAP.DE')).toBe('EUR');
    expect(inferCurrencyFromSymbol('7203.T')).toBe('JPY');
    expect(inferCurrencyFromSymbol('SHEL.L')).toBe('GBP');
    expect(inferCurrencyFromSymbol('SHOP.TO')).toBe('CAD');
    expect(inferCurrencyFromSymbol('BHP.AX')).toBe('AUD');
  });

  test('resolves proper currency symbols including AED', () => {
    expect(getCurrencySymbol('AED')).toBe('AED ');
    expect(getCurrencySymbol('EMAAR.AE')).toBe('AED ');
    expect(getCurrencySymbol({ symbol: 'EMAAR.AE' })).toBe('AED ');
    expect(getCurrencySymbol({ currency: 'AED' })).toBe('AED ');
    expect(getCurrencySymbol('KRW')).toBe('₩');
    expect(getCurrencySymbol('005930.KS')).toBe('₩');
    expect(getCurrencySymbol({ symbol: '005930.KS' })).toBe('₩');
    expect(getCurrencySymbol({ currency: 'KRW' })).toBe('₩');
    expect(getCurrencySymbol('INR')).toBe('₹');
    expect(getCurrencySymbol('RELIANCE.NS')).toBe('₹');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('AAPL')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('JPY')).toBe('¥');
  });

  test('formats prices appropriately without decimals for KRW/JPY and safely handles maxDecimals', () => {
    expect(formatPrice(242000, 'KRW')).toBe('242,000');
    expect(formatPrice(3500, 'JPY')).toBe('3,500');
    expect(formatPrice(185.5, 'USD')).toBe('185.50');
    expect(formatPrice(11.38, 'AED')).toBe('11.38');
    expect(formatPrice(2950.25, 'INR')).toBe('2,950.25');
    // Ensure { maxDecimals: 1 } does NOT throw RangeError
    expect(formatPrice(10.15, 'USD', { maxDecimals: 1 })).toBe('10.2');
    expect(formatPrice(17.25, 'AED', { maxDecimals: 1 })).toBe('17.3');
  });

  test('converts prices between currencies via FX engine including AED', () => {
    const fxRates = { USD: 1.0, AED: 3.6725, KRW: 1334.0, INR: 86.80 };
    // 11.38 AED in USD -> 11.38 / 3.6725 = 3.0987...
    const aedInUsd = convertPrice(11.38, 'AED', 'USD', fxRates);
    expect(Number(aedInUsd.toFixed(2))).toBe(3.10);

    // 242,000 KRW in USD -> 242,000 / 1334 = 181.409...
    const inUsd = convertPrice(242000, 'KRW', 'USD', fxRates);
    expect(Number(inUsd.toFixed(2))).toBe(181.41);

    // 100 USD in AED -> 367.25 AED
    const inAed = convertPrice(100, 'USD', 'AED', fxRates);
    expect(inAed).toBe(367.25);
  });

  test('formats large caps with appropriate currency symbol and unit', () => {
    expect(formatLargeCap(1.5e12, 'KRW')).toBe('₩1.50T');
    expect(formatLargeCap(3.2e12, 'USD')).toBe('$3.20T');
    expect(formatLargeCap(500e9, 'INR')).toBe('₹500.00B');
    expect(formatLargeCap(100e9, 'AED')).toBe('AED 100.00B');
  });
});
