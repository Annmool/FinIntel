import { fireEvent, render, screen } from '@testing-library/react';
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

test('explains empty gainers and losers lists using available session data', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByText(/No gains were reported/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Top Losers' }));
  expect(await screen.findByText(/No declines were reported/)).toBeInTheDocument();
});

test('says when rankings cover only the tracked list', async () => {
  axios.get.mockResolvedValue({ data: [row({ scope: 'tracked', quoteSource: 'Yahoo Finance chart' })] });
  const { unmount } = render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByRole('note')).toHaveTextContent(/tracked list.*not the whole market/);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  unmount();

  axios.get.mockResolvedValue({ data: [row()] });
  render(<Screener onClose={() => {}} onSelectSymbol={() => {}} />);
  expect(await screen.findByText('Apple Inc.')).toBeInTheDocument();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
