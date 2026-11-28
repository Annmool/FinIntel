import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import axios from './apiClient';
import { auth } from './firebase';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
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
    if (url.endsWith('/api/stock/AAPL/mark')) {
      return { data: { price: 140, currency: 'USD', source: 'Fixture provider', date: new Date().toISOString().slice(0, 10), status: 'recent-close' } };
    }
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
  fireEvent.click(await screen.findByRole('button', { name: 'AAPL' }));
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

test('shows the source of a holding close and updates cost basis after a correction', async () => {
  holdings = [{ _id: 'holding', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD' }];
  axios.patch.mockResolvedValue({ data: { ...holdings[0], price: 120, costRevision: 1 } });
  render(<App />);
  expect(await screen.findByText(/Recent close.*Fixture provider/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit cost' }));
  const price = screen.getByLabelText(/purchase price per share/i);
  expect(price).toHaveValue(100);
  fireEvent.change(price, { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save price' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(axios.patch).toHaveBeenCalledWith(expect.stringMatching(/portfolio\/holding\/cost$/),
    { price: 120, revision: 0 }, expect.any(Object));
  expect(within(screen.getByRole('row', { name: /AAPL/ })).getByText(/\+\$20\.00/)).toBeInTheDocument();
});

test('shows last-known marks and leaves missing holdings unvalued', async () => {
  holdings = [{ _id: 'a', symbol: 'AAPL', qty: 1, price: 100 }, { _id: 'b', symbol: 'TCS.NS', qty: 1, price: 3000 }];
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation(async url => {
    if (url.endsWith('/TCS.NS/mark')) return { data: { status: 'unavailable' } };
    const res = await get(url);
    if (url.endsWith('/AAPL/mark')) res.data.status = 'last-known';
    return res;
  });
  render(<App />);
  expect(await screen.findByText(/Last-known close.*Fixture provider/)).toBeInTheDocument();
  const missing = screen.getByRole('row', { name: /TCS\.NS/ });
  expect(within(missing).getByText('Quote unavailable')).toBeInTheDocument();
  expect(within(missing).queryByText(/0\.0%/)).not.toBeInTheDocument();
});

test('shows the executed paper trade and pages to older orders', async () => {
  const fill = {
    id: 'recent-order', side: 'buy', symbol: 'TCS.NS', quantity: 1, currency: 'INR', executedPrice: 3300,
    usdAmount: 33, fxRate: 100, fxSource: 'Fixture FX', quoteSource: 'Fixture quote', filledAt: '2026-11-20T12:00:00.000Z'
  };
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation((url, config) => url.endsWith('/api/paper-history')
    ? Promise.resolve({ data: config.params.cursor
      ? { trades: [{ ...fill, side: 'sell', id: 'old-order' }], nextCursor: null }
      : { trades: [fill], nextCursor: 'older' } })
    : get(url, config));
  render(<App />);
  const history = screen.getByText('Paper trade history').closest('details');
  history.open = true;
  fireEvent(history, new Event('toggle'));
  expect(await screen.findByText('Buy 1 TCS.NS')).toBeInTheDocument();
  expect(screen.getByText(/1 USD = 100\.00 INR.*Fixture FX/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Older trades' }));
  expect(await screen.findByText('Sell 1 TCS.NS')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Older trades' })).toBeDisabled();
});

test('says when account data failed to load instead of showing an empty portfolio, and retries', async () => {
  holdings = [{ _id: 'holding', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD' }];
  const get = axios.get.getMockImplementation();
  axios.get.mockImplementation(url => url.includes('/api/portfolio/') ? Promise.reject(new Error('server asleep')) : get(url));
  render(<App />);
  expect(screen.getByText('Loading your holdings…')).toBeInTheDocument();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/account data could not be loaded/i);
  expect(screen.queryByRole('row', { name: /AAPL/ })).not.toBeInTheDocument();

  axios.get.mockImplementation(get);
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('row', { name: /AAPL/ })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('reports the real API connection instead of a fixed operational badge', async () => {
  const get = axios.get.getMockImplementation();
  let failFx;
  axios.get.mockImplementation(url => url.includes('/api/forex/rate')
    ? new Promise((resolve, reject) => { failFx = reject; })
    : get(url));
  render(<App />);
  expect(screen.getByText('Connecting to API…')).toBeInTheDocument();
  expect(screen.queryByText(/System Operational|100%/)).not.toBeInTheDocument();
  await act(async () => failFx(new Error('offline')));
  expect(screen.getByText('API unreachable')).toBeInTheDocument();
});

test('asks before removing a holding and reports a failed removal', async () => {
  holdings = [{ _id: 'holding', symbol: 'AAPL', qty: 2, price: 100, currency: 'USD' }];
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  axios.delete.mockReset();
  render(<App />);
  const remove = await screen.findByRole('button', { name: 'Remove' });
  fireEvent.click(remove);
  expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Remove 2 AAPL/));
  expect(axios.delete).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  axios.delete.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(remove);
  expect(await screen.findByText('Could not remove AAPL. Try again.')).toBeInTheDocument();
  expect(screen.getByRole('row', { name: /AAPL/ })).toBeInTheDocument();

  axios.delete.mockImplementationOnce(async () => { holdings = []; return { data: 'Deleted' }; });
  fireEvent.click(remove);
  expect(await screen.findByText('Removed AAPL from portfolio')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('row', { name: /AAPL/ })).not.toBeInTheDocument());
  expect(axios.delete).toHaveBeenLastCalledWith(expect.stringContaining('/api/portfolio/holding'));
  confirm.mockRestore();
});

test('keeps the chosen theme after a reload', async () => {
  const { unmount } = render(<App />);
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  fireEvent.click(screen.getAllByRole('button', { name: 'Toggle Theme' })[0]);
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  unmount();
  render(<App />);
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  await screen.findByText('$0.00 Sim Cash');
});

test('a reopened paper ticket recovers an unconfirmed order before starting a new one', async () => {
  // jsdom has no crypto.randomUUID; browsers provide it on https and localhost.
  let nextId = 0;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => 'order-id-0000000' + (nextId += 1) } });
  const sent = [];
  axios.post.mockImplementation(async (url, body) => {
    sent.push(body.orderId);
    if (sent.length < 3) throw new Error('response lost');
    return { data: { currency: 'USD', executedPrice: 100, quoteSource: 'Fixture' } };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'AAPL' }));
  const openTicket = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Paper Buy' }));
    return screen.getByRole('dialog', { name: 'Paper buy AAPL' });
  };

  let ticket = await openTicket();
  fireEvent.click(within(ticket).getByRole('button', { name: 'Set quantity to 5' }));
  expect(within(ticket).getByLabelText(/Order Quantity/)).toHaveValue(5);
  const execute = within(ticket).getByRole('button', { name: 'Execute Paper Buy' });
  fireEvent.click(execute);
  expect(await within(ticket).findByText('response lost')).toBeInTheDocument();
  fireEvent.click(execute);
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toBe(sent[0]);

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  ticket = await openTicket();
  fireEvent.click(within(ticket).getByRole('button', { name: 'Set quantity to 5' }));
  expect(within(ticket).getByRole('status')).toHaveTextContent(/previous submission.*unconfirmed/i);
  fireEvent.click(within(ticket).getByRole('button', { name: 'Execute Paper Buy' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(sent[2]).toBe(sent[0]);

  ticket = await openTicket();
  fireEvent.click(within(ticket).getByRole('button', { name: 'Set quantity to 5' }));
  fireEvent.click(within(ticket).getByRole('button', { name: 'Execute Paper Buy' }));
  await waitFor(() => expect(sent).toHaveLength(4));
  expect(sent[3]).not.toBe(sent[0]);
});
