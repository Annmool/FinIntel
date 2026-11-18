import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetalsPanel from './MetalsPanel';
import axios from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn() }));

test('shows ounce prices, INR gram conversion, and a missing silver quote', async () => {
  axios.get.mockResolvedValueOnce({ data: { quotes: [
    { symbol: 'XAU', price: 3110.34768, updatedAt: new Date().toISOString(), source: 'Gold API', kind: 'Spot reference' },
    { symbol: 'XAG', price: null }
  ] } });
  render(<MetalsPanel currency="INR" fxRates={{ INR: 90 }} />);
  expect(await screen.findByText('$3,110.35')).toBeInTheDocument();
  expect(screen.getByText(/₹9,000.00 \/ gram/)).toBeInTheDocument();
  expect(screen.getByText(/1 troy ounce ≈ 31.1035 grams/)).toBeInTheDocument();
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
});

test('keeps received prices visible when refresh fails and labels their status', async () => {
  axios.get.mockResolvedValueOnce({ data: { quotes: [
    { symbol: 'XAU', price: 2500, updatedAt: new Date().toISOString(), source: 'Yahoo Finance', kind: 'Futures reference (GC=F)' }
  ] } }).mockRejectedValueOnce(new Error('offline'));
  render(<MetalsPanel currency="USD" fxRates={{}} />);
  expect(await screen.findByText('$2,500.00')).toBeInTheDocument();
  expect(screen.getByText(/\$80.38 \/ gram/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh metals' }));
  await waitFor(() => expect(screen.getByText(/Refresh unavailable/)).toBeInTheDocument());
  expect(screen.getByText('$2,500.00')).toBeInTheDocument();
  expect(screen.getByText(/Last available/)).toBeInTheDocument();
});
