import { fireEvent, render, screen, within } from '@testing-library/react';
import PortfolioStress from './PortfolioStress';
import { calculatePortfolioStress } from './utils/portfolioStress';

const date = new Date().toISOString().slice(0, 10);
const holdings = [{ symbol: 'AAPL', qty: 2 }, { symbol: 'INFY.NS', qty: 1 }];
const marks = {
  AAPL: { price: 100, currency: 'USD', date },
  'INFY.NS': { price: 9000, currency: 'INR', date }
};
const fxRates = { INR: 90 };
const shocks = { usd: '-15', inr: '0', fx: '-5' };

function panel(overrides = {}) {
  return <PortfolioStress holdings={holdings} marks={marks} fxRates={fxRates} currency="INR" {...overrides} />;
}

test('combines stock and currency shocks and ranks the biggest holding impact', () => {
  const result = calculatePortfolioStress(holdings, marks, fxRates, 'INR', shocks);
  expect(result.status).toBe('ready');
  expect(result.current).toBeCloseTo(27000);
  expect(result.stressed).toBeCloseTo(23535);
  expect(result.change).toBeCloseTo(-3465);
  expect(result.contributions.map(item => item.symbol)).toEqual(['AAPL', 'INFY.NS']);
  expect(result.contributions[0].change).toBeCloseTo(-3465);
});

test('applies the reciprocal FX effect to INR positions when reporting in USD', () => {
  const result = calculatePortfolioStress(holdings, marks, fxRates, 'USD', { usd: '0', inr: '0', fx: '25' });
  expect(result.current).toBeCloseTo(300);
  expect(result.stressed).toBeCloseTo(280);
  expect(result.contributions[0]).toEqual({ symbol: 'INFY.NS', change: -20 });
});

test('aggregates duplicate lots, normalizes pence, and accepts a price falling to zero', () => {
  const positions = [{ symbol: 'AAPL', qty: 1 }, { symbol: 'AAPL', qty: 2 }, { symbol: 'VOD.L', qty: 10 }];
  const result = calculatePortfolioStress(positions, { ...marks, 'VOD.L': { currency: 'GBp', price: 80, date } },
    { GBP: 0.8 }, 'USD', { usd: '-100', inr: '0', fx: '0' });
  expect(result.current).toBeCloseTo(310);
  expect(result.stressed).toBeCloseTo(10);
  expect(result.contributions).toEqual([{ symbol: 'AAPL', change: -300 }, { symbol: 'VOD.L', change: 0 }]);
});

test('does not show an estimate when a mark is stale or provider FX is missing', () => {
  const { rerender } = render(panel({ fxRates: {} }));
  expect(screen.getByRole('status')).toHaveTextContent('INR exchange rate');
  expect(screen.queryByText('Stressed value')).not.toBeInTheDocument();
  rerender(panel({ marks: { ...marks, AAPL: { ...marks.AAPL, date: '2000-01-01' } } }));
  expect(screen.getByRole('status')).toHaveTextContent('AAPL');
  expect(screen.queryByText('Stressed value')).not.toBeInTheDocument();
});

test('starts from a neutral scenario and updates the result as shocks are edited', () => {
  render(panel());
  const india = screen.getByRole('spinbutton', { name: 'INR-priced stocks (%)' });
  expect(india).toHaveValue(0);
  expect(screen.getByText(/0\.00%\)/)).toBeInTheDocument();
  fireEvent.change(india, { target: { value: '-15' } });
  expect(screen.getByText(/-5\.00%\)/)).toBeInTheDocument();
  const fx = screen.getByRole('spinbutton', { name: 'USD/INR (%)' });
  fireEvent.change(fx, { target: { value: '-100' } });
  expect(screen.getByRole('status')).toHaveTextContent('−99.99%');
  expect(screen.queryByText('Stressed value')).not.toBeInTheDocument();
  fireEvent.change(fx, { target: { value: '0' } });
  expect(screen.getByText('Stressed value')).toBeInTheDocument();
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
});

test('prompts for a holding when the portfolio is empty', () => {
  render(panel({ holdings: [] }));
  expect(screen.getByText(/Add a holding/)).toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});
