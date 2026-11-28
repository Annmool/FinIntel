import { portfolioCsvRows, toCsv } from './exportCsv';

const holding = {
  symbol: 'RELIANCE.NS', qty: 10, nativeCurrency: 'INR', entryPrice: 1250, currPrice: 1382.6,
  currentValNative: 13826, currentValBase: 148.7123, pnlNative: 1326, pnlPercent: 10.608
};

test('keeps every holding value in its own column', () => {
  const rows = portfolioCsvRows([holding], 'USD');
  const lines = toCsv(rows).split('\r\n');
  expect(lines).toHaveLength(2);
  expect(lines[0].split(',')).toHaveLength(9);
  expect(lines[1]).toBe('"RELIANCE.NS","10","INR","1250","1382.6","13826","148.71","1326","10.61"');
  expect(rows[0][6]).toBe('Value (USD)');
});

test('leaves unavailable marks blank instead of exporting NaN', () => {
  const [, row] = portfolioCsvRows([{ ...holding, currPrice: NaN, currentValNative: NaN, currentValBase: NaN, pnlNative: NaN, pnlPercent: NaN }], 'INR');
  expect(row.slice(4)).toEqual(['', '', '', '', '']);
});

test('quotes separators and quotes, and neutralises formula-like text', () => {
  expect(toCsv([['1,234.50', 'He said "hi"', '=SUM(A1)', -5]])).toBe('"1,234.50","He said ""hi""","\'=SUM(A1)","-5"');
});
