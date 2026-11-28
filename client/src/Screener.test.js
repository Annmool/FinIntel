import { render, screen } from '@testing-library/react';
import Screener from './Screener';
import axios from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn() }));

const row = extra => ({
  symbol: 'AAPL', shortName: 'Apple Inc.', regularMarketPrice: 344.63, regularMarketChangePercent: -1.23, currency: 'USD', ...extra
});

test('warns prominently when the list is sample data', async () => {
  axios.get.mockResolvedValue({ data: [row({ dataStatus: 'sample' })] });
  render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  const notice = await screen.findByRole('status');
  expect(notice).toHaveTextContent('Sample data, not current prices');
  expect(notice).toHaveTextContent(/fixed examples/);
});

test('labels last available rows and shows no notice for current data', async () => {
  axios.get.mockResolvedValue({ data: [row({ dataStatus: 'cached' })] });
  const { unmount } = render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByRole('status')).toHaveTextContent(/last successful update/);
  unmount();

  axios.get.mockResolvedValue({ data: [row()] });
  render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByText('Apple Inc.')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('explains an empty losers list instead of asking for a retry', async () => {
  axios.get.mockImplementation(async url => ({ data: url.endsWith('day_gainers') ? [] : [row()] }));
  render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByText('None of the tracked stocks rose in the latest session.')).toBeInTheDocument();
});
