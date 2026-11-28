import { render, screen } from '@testing-library/react';
import TickerTape from './TickerTape';
import axios from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

test('still renders prices when the browser blocks storage', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  axios.get.mockResolvedValue({ data: [{ symbol: 'AAPL', close: 358.54, percent_change: 0.83, currency: 'USD' }] });
  render(<TickerTape />);
  expect((await screen.findAllByText('AAPL')).length).toBeGreaterThan(0);
});

test('ignores a stored value that is not a list', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('{"symbol":"AAPL"}');
  axios.get.mockResolvedValue({ data: [] });
  expect(() => render(<TickerTape />)).not.toThrow();
});
