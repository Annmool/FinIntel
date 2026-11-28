// Quote every cell so thousands separators, commas in names, and quotes stay in
// their own column. Cells that could be read as formulas are neutralised.
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows) {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

const amount = value => Number.isFinite(value) ? Number(value.toFixed(2)) : '';

// Raw numbers with the currency in its own column, so a spreadsheet can sum them.
export function portfolioCsvRows(holdings, baseCurrency) {
  return [
    ['Symbol', 'Quantity', 'Currency', 'Entry Price', 'Market Price', 'Market Value',
      `Value (${baseCurrency})`, 'Unrealized P/L', 'Unrealized P/L %'],
    ...holdings.map(holding => [
      holding.symbol, holding.qty, holding.nativeCurrency, amount(holding.entryPrice), amount(holding.currPrice),
      amount(holding.currentValNative), amount(holding.currentValBase), amount(holding.pnlNative), amount(holding.pnlPercent)
    ])
  ];
}
