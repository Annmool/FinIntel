import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import axios from './apiClient';
import { auth } from './firebase';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./firebase', () => ({ auth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth, callback) => {
    callback(auth.currentUser);
    return () => {};
  }
}));
jest.mock('./QuantLab', () => () => null);
jest.mock('./StockChart', () => () => null);
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());

let holdings;

beforeEach(() => {
  localStorage.clear();
  auth.currentUser = { uid: 'test-user', displayName: 'Test Investor' };
  holdings = [];
  axios.get.mockImplementation(async url => {
    if (url.includes('/api/portfolio/')) return { data: holdings };
    if (url.includes('/api/virtual-account/')) return { data: { balance: 0 } };
    if (url.endsWith('/api/stock/AAPL')) {
      return { data: { meta: { symbol: 'AAPL', currency: 'USD' }, values: [{ close: '140', datetime: '2026-11-20' }] } };
    }
    return { data: [] };
  });
});

test('records the entered cost and shows the gain on a real holding', async () => {
  axios.post.mockImplementation(async (url, body) => {
    holdings = [{ ...body, _id: 'test-holding' }];
    return { data: holdings[0] };
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'AAPL' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Holdings' }));
  const price = screen.getByRole('spinbutton', { name: /purchase price per share.*USD/i });
  const add = screen.getByRole('button', { name: 'Add to Portfolio' });
  expect(price).toHaveValue(null);
  expect(add).toBeDisabled();
  fireEvent.change(price, { target: { value: '-1' } });
  expect(add).toBeDisabled();
  fireEvent.change(price, { target: { value: '100' } });
  fireEvent.click(add);
  await waitFor(() => expect(add).not.toBeInTheDocument());
  expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/api\/portfolio$/), {
    userId: 'test-user', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD'
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
  const row = await screen.findByRole('row', { name: /AAPL/ });
  expect(within(row).getByText('$100.00')).toBeInTheDocument();
  expect(await within(row).findByText(/\+\$40\.00 \(40\.0%\)/)).toBeInTheDocument();
});

test('shows a real zero balance and distinguishes missing and neutral stock indicators', async () => {
  let finishNews;
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation(url => url.endsWith('/api/news/AAPL')
    ? new Promise(resolve => { finishNews = resolve; })
    : get(url));
  render(<App />);
  expect(screen.getByText('Sim Cash · Loading…')).toBeInTheDocument();
  expect(await screen.findByText('$0.00 Sim Cash')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'AAPL' }));
  await screen.findByText('RSI Signal');
  expect(within(screen.getByText('RSI Signal').parentElement).getByText('Unavailable')).toBeInTheDocument();
  expect(within(screen.getByText('News Sentiment').parentElement).getByText('Loading…')).toBeInTheDocument();
  await act(async () => finishNews({ data: [{ title: 'A neutral headline', sentimentScore: 0 }] }));
  expect(within(screen.getByText('News Sentiment').parentElement).getByText('Neutral')).toBeInTheDocument();
});

test('labels a failed balance fetch and never shows a starter balance for an existing account', async () => {
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation(url => url.includes('/api/virtual-account/')
    ? Promise.reject(new Error('offline'))
    : get(url));
  render(<App />);
  expect(await screen.findByText('Sim Cash · Unavailable')).toBeInTheDocument();
  expect(screen.queryByText(/100,000\.00/)).not.toBeInTheDocument();
});

test('Markets & Charts gives search guidance and keeps a failed lookup ready to retry', async () => {
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation(url => url.endsWith('/api/stock/AAPL')
    ? Promise.reject(new Error('offline'))
    : get(url));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Markets & Charts' }));
  expect(screen.getByText('Search by company name or ticker to open a price chart.')).toBeInTheDocument();

  const search = screen.getByPlaceholderText(/search global symbol/i);
  fireEvent.change(search, { target: { value: 'AAPL' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  const retry = await screen.findByRole('button', { name: 'Retry lookup' });
  expect(search).toHaveValue('AAPL');
  axios.get.mockImplementation(get);
  fireEvent.click(retry);
  expect(await screen.findByRole('button', { name: 'Holdings' })).toBeInTheDocument();
});
