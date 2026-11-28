import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuantLab from './QuantLab';
import axios from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./createQuantWorker', () => jest.fn());

const series = [100, 101, 102];
const simulation = var95 => ({
  success: true,
  engineMode: 'cloud',
  cpp: {
    benchmark: { executionTimeMs: 12, numThreads: 1, simulations: 50000, timeHorizonDays: 90, totalSimulatedSteps: 1, throughputStepsPerSec: 1 },
    portfolio: { initialValue: 100000, expectedReturn: 0.1, volatility: 0.2, sharpeRatio: 0.5 },
    risk: { var95_dollar: var95, var95_percent: 9, cvar95_dollar: var95 + 1000, maxDrawdownMean: 10, maxDrawdownWorst99: 20 },
    snapshotDays: [30, 60, 90],
    trajectories: { p5: series, p25: series, p50: series, p75: series, p95: series },
    samplePaths: [],
    histogram: { bins: [1], counts: [1] }
  },
  assumptions: {
    symbols: ['AAPL'], weights: [1], expectedReturns: [0.1], volatilities: [0.2], riskFreeRate: 0.045,
    sources: { expectedReturns: 'preset', volatilities: 'preset', correlationMatrix: 'preset' }
  }
});

beforeEach(() => {
  // jsdom has no canvas; the charts only need drawing calls that do nothing.
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (target, key) => key === 'measureText' ? () => ({ width: 0 })
      : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {},
    set: () => true
  });
  window.innerWidth = 1440;
  axios.get.mockResolvedValue({ data: {} });
  axios.post.mockReset();
});

test('changing presets or engine does not start cloud runs, and a failed run keeps the last result', async () => {
  axios.post.mockResolvedValueOnce({ data: simulation(9000) });
  render(<QuantLab onClose={() => {}} />);
  expect(await screen.findByText('$9,000')).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledTimes(1);

  for (const preset of [/All-Weather/, /Semiconductor/, /Defensive/, /Tech Titans/]) {
    fireEvent.click(screen.getByRole('button', { name: preset }));
  }
  fireEvent.click(screen.getByRole('button', { name: /Local Device/ }));
  fireEvent.click(screen.getByRole('button', { name: /Cloud C\+\+ Core/ }));
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(/Inputs changed/);
  expect(screen.getByText('$9,000')).toBeInTheDocument();

  axios.post.mockRejectedValueOnce({ response: { data: { error: 'Simulation limit reached. Try again in a minute.' } } });
  fireEvent.click(screen.getByRole('button', { name: /Execute Cloud/ }));
  expect(await screen.findByText(/Simulation limit reached/)).toBeInTheDocument();
  expect(screen.getByText('$9,000')).toBeInTheDocument();

  axios.post.mockResolvedValueOnce({ data: simulation(7500) });
  fireEvent.click(screen.getByRole('button', { name: /Execute Cloud/ }));
  expect(await screen.findByText('$7,500')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/Inputs changed/)).not.toBeInTheDocument());
});
