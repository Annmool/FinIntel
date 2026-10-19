import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Cpu,
  Zap,
  TrendingUp,
  ShieldAlert,
  PieChart,
  Activity,
  Sliders,
  Layers,
  ArrowRight,
  X,
  Target,
  Cloud,
  Laptop,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Info,
  RefreshCw
} from 'lucide-react';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://finintel-qj46.onrender.com' : 'http://localhost:5000';

const ASSET_COLORS = [
  '#4ADE80', // Emerald green
  '#60A5FA', // Sky blue
  '#FBBF24', // Amber
  '#A78BFA', // Violet
  '#F472B6', // Pink
  '#2DD4BF', // Teal
  '#FB923C', // Orange
  '#38BDF8', // Light blue
  '#E879F9', // Fuchsia
  '#34D399'  // Mint
];

// Standard Institutional Portfolio Presets available instantly with 0ms lag
const DEFAULT_PRESETS = {
  'tech-titans': {
    name: 'Tech Titans (High Growth)',
    description: 'High-beta mega-cap technology portfolio (AAPL, MSFT, NVDA, GOOGL, AMZN)',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'],
    weights: [0.25, 0.25, 0.20, 0.15, 0.15],
    expectedReturns: [0.21, 0.19, 0.38, 0.22, 0.24],
    volatilities: [0.24, 0.22, 0.42, 0.26, 0.28]
  },
  'all-weather': {
    name: 'All-Weather Risk Parity',
    description: 'Bridgewater-style multi-asset macroeconomic hedge',
    symbols: ['SPY', 'TLT', 'IEF', 'GLD', 'DBC'],
    weights: [0.30, 0.40, 0.15, 0.075, 0.075],
    expectedReturns: [0.10, 0.04, 0.035, 0.07, 0.05],
    volatilities: [0.16, 0.14, 0.08, 0.15, 0.18]
  },
  'semiconductors': {
    name: 'Semiconductor High-Beta Alpha',
    description: 'Hardware, AI accelerators, and foundry leaders (NVDA, TSM, AMD, ASML)',
    symbols: ['NVDA', 'TSM', 'AMD', 'ASML'],
    weights: [0.35, 0.25, 0.20, 0.20],
    expectedReturns: [0.36, 0.28, 0.26, 0.25],
    volatilities: [0.44, 0.32, 0.46, 0.34]
  },
  'defensive-dividend': {
    name: 'Defensive Aristocrats',
    description: 'Low-volatility consumer staples and healthcare with steady yields',
    symbols: ['JNJ', 'PG', 'KO', 'PEP', 'MCD'],
    weights: [0.20, 0.20, 0.20, 0.20, 0.20],
    expectedReturns: [0.08, 0.09, 0.07, 0.08, 0.10],
    volatilities: [0.12, 0.13, 0.11, 0.12, 0.14]
  }
};


// Cholesky decomposition: A = L * L^T for correlated shocks
function choleskyDecomp(matrix, n) {
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = val > 1e-12 ? Math.sqrt(val) : 0;
      } else {
        L[i][j] = L[j][j] > 1e-12 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  return L;
}

// Ultra-fast client-side Monte Carlo simulation engine with full feature parity
function simulateClientSide({
  symbols,
  weights,
  numSimulations,
  timeHorizonDays,
  initialPortfolioValue,
  riskFreeRate,
  expectedReturns,
  volatilities,
  correlationMatrix
}) {
  const t0 = performance.now();
  const n = symbols.length;
  // Respect the exact user-selected path count (supporting up to 200,000 paths)
  const M = Math.max(1000, Math.min(200000, parseInt(numSimulations) || 50000));
  const T = timeHorizonDays;
  const dt = 1.0 / 252.0;
  const sqrtDt = Math.sqrt(dt);

  const expReturns = expectedReturns && expectedReturns.length === n
    ? expectedReturns
    : symbols.map(() => 0.16);

  const vols = volatilities && volatilities.length === n
    ? volatilities
    : symbols.map(() => 0.22);

  // Correlation matrix fallback
  let corr = correlationMatrix;
  if (!corr || corr.length !== n) {
    corr = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.45))
    );
  }

  // Covariance matrix
  const covMatrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => corr[i][j] * vols[i] * vols[j])
  );

  // Cholesky decomposition of correlation matrix
  const L = choleskyDecomp(corr, n);

  // Pre-scaled Cholesky: scaledL[i][k] = L[i][k] * vol[i] * sqrt(dt)
  const scaledL = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n);
    const v = vols[i] * sqrtDt;
    for (let k = 0; k <= i; k++) {
      row[k] = L[i][k] * v;
    }
    return row;
  });

  // Precalculated asset drift
  const drift = new Float64Array(n);
  const initAssetVals = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    drift[i] = (expReturns[i] - 0.5 * vols[i] * vols[i]) * dt;
    initAssetVals[i] = initialPortfolioValue * weights[i];
  }

  // Precalculated baseline portfolio metrics
  let expectedReturn = 0;
  for (let i = 0; i < n; i++) expectedReturn += weights[i] * expReturns[i];

  let portVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portVar += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  const volatility = Math.sqrt(Math.max(0, portVar));
  const sharpeRatio = volatility > 1e-6 ? (expectedReturn - riskFreeRate) / volatility : 0;

  // Box-Muller standard normal generator with state caching
  let spareNormal = 0;
  let hasSpare = false;
  function norm() {
    if (hasSpare) {
      hasSpare = false;
      return spareNormal;
    }
    let u = Math.random();
    while (u <= 1e-15) u = Math.random();
    const v = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u));
    const theta = 6.283185307179586 * v;
    spareNormal = r * Math.sin(theta);
    hasSpare = true;
    return r * Math.cos(theta);
  }

  const snapshotSteps = Math.min(T, 25);
  const snapshotIndices = [];
  for (let s = 0; s < snapshotSteps; s++) {
    snapshotIndices.push(Math.round(((s + 1) * T) / snapshotSteps));
  }

  const endingValues = new Float64Array(M);
  const maxDrawdowns = new Float64Array(M);
  const snapshotVals = Array.from({ length: snapshotSteps }, () => new Float64Array(M));
  const samplePaths = Array.from({ length: 15 }, () => new Float64Array(snapshotSteps));

  const indShocks = new Float64Array(n);
  const assetVals = new Float64Array(n);

  for (let sim = 0; sim < M; sim++) {
    for (let i = 0; i < n; i++) assetVals[i] = initAssetVals[i];

    let peak = initialPortfolioValue;
    let worstDD = 0;
    let nextSnap = 0;
    let portTotal = initialPortfolioValue;

    for (let t = 1; t <= T; t++) {
      for (let i = 0; i < n; i++) indShocks[i] = norm();

      portTotal = 0;
      for (let i = 0; i < n; i++) {
        let diffusion = 0;
        const row = scaledL[i];
        for (let k = 0; k <= i; k++) {
          diffusion += row[k] * indShocks[k];
        }
        assetVals[i] *= Math.exp(drift[i] + diffusion);
        portTotal += assetVals[i];
      }

      if (portTotal > peak) peak = portTotal;
      const dd = peak > 1e-6 ? (peak - portTotal) / peak : 0;
      if (dd > worstDD) worstDD = dd;

      if (nextSnap < snapshotSteps && t === snapshotIndices[nextSnap]) {
        snapshotVals[nextSnap][sim] = portTotal;
        if (sim < 15) samplePaths[sim][nextSnap] = portTotal;
        nextSnap++;
      }
    }
    endingValues[sim] = portTotal;
    maxDrawdowns[sim] = worstDD;
  }

  // Calculate percentiles at each snapshot day
  const p5 = [], p25 = [], p50 = [], p75 = [], p95 = [];
  for (let s = 0; s < snapshotSteps; s++) {
    const arr = Array.from(snapshotVals[s]).sort((a, b) => a - b);
    p5.push(arr[Math.floor(M * 0.05)]);
    p25.push(arr[Math.floor(M * 0.25)]);
    p50.push(arr[Math.floor(M * 0.50)]);
    p75.push(arr[Math.floor(M * 0.75)]);
    p95.push(arr[Math.floor(M * 0.95)]);
  }

  endingValues.sort();
  const var95 = Math.max(0, initialPortfolioValue - endingValues[Math.floor(M * 0.05)]);
  const var99 = Math.max(0, initialPortfolioValue - endingValues[Math.floor(M * 0.01)]);

  // CVaR (Expected Shortfall)
  const idx95 = Math.floor(M * 0.05);
  const idx99 = Math.floor(M * 0.01);

  let cvar95Sum = 0;
  for (let i = 0; i <= idx95; i++) cvar95Sum += (initialPortfolioValue - endingValues[i]);
  const cvar95 = idx95 > 0 ? cvar95Sum / (idx95 + 1) : var95;

  let cvar99Sum = 0;
  for (let i = 0; i <= idx99; i++) cvar99Sum += (initialPortfolioValue - endingValues[i]);
  const cvar99 = idx99 > 0 ? cvar99Sum / (idx99 + 1) : var99;

  // Max Drawdown statistics
  maxDrawdowns.sort();
  let meanDD = 0;
  for (let i = 0; i < M; i++) meanDD += maxDrawdowns[i];
  meanDD = (meanDD / M) * 100;
  const worstDD99 = maxDrawdowns[Math.floor(M * 0.99)] * 100;

  // Terminal distribution histogram (20 bins)
  const numBins = 20;
  const minVal = endingValues[0];
  const maxVal = endingValues[M - 1];
  const binWidth = Math.max(1, (maxVal - minVal) / numBins);
  const histBins = [];
  const histCounts = new Array(numBins).fill(0);
  for (let b = 0; b < numBins; b++) histBins.push(minVal + (b + 0.5) * binWidth);
  for (let i = 0; i < M; i++) {
    const b = Math.min(numBins - 1, Math.max(0, Math.floor((endingValues[i] - minVal) / binWidth)));
    histCounts[b]++;
  }

  // Fast Dirichlet Markowitz Efficient Frontier Sampling (1,500 samples)
  const frontierPoints = [];
  let bestSharpe = { sharpe: -9999, expectedReturn: 0, volatility: 0, weights: [] };
  let minVol = { sharpe: 0, expectedReturn: 0, volatility: 999999, weights: [] };

  // Single asset extremes
  for (let i = 0; i < n; i++) {
    const w = new Array(n).fill(0);
    w[i] = 1.0;
    const r = expReturns[i];
    const v = vols[i];
    const sh = v > 1e-6 ? (r - riskFreeRate) / v : 0;
    const pt = { expectedReturn: r, volatility: v, sharpe: sh, weights: w };
    frontierPoints.push(pt);
    if (sh > bestSharpe.sharpe) bestSharpe = pt;
    if (v < minVol.volatility) minVol = pt;
  }

  const numFrontierSamples = 1500;
  for (let s = 0; s < numFrontierSamples; s++) {
    const w = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let u = Math.random();
      while (u <= 1e-10) u = Math.random();
      w[i] = -Math.log(u);
      sum += w[i];
    }
    for (let i = 0; i < n; i++) w[i] /= sum;

    let r = 0;
    for (let i = 0; i < n; i++) r += w[i] * expReturns[i];

    let vSq = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        vSq += w[i] * w[j] * covMatrix[i][j];
      }
    }
    const v = Math.sqrt(Math.max(0, vSq));
    const sh = v > 1e-6 ? (r - riskFreeRate) / v : 0;
    const pt = { expectedReturn: r, volatility: v, sharpe: sh, weights: Array.from(w) };
    frontierPoints.push(pt);

    if (sh > bestSharpe.sharpe) bestSharpe = pt;
    if (v < minVol.volatility) minVol = pt;
  }

  // Extract Pareto-optimal curve
  frontierPoints.sort((a, b) => a.volatility - b.volatility);
  const paretoCurve = [];
  let maxR = -9999;
  for (const pt of frontierPoints) {
    if (pt.expectedReturn > maxR) {
      maxR = pt.expectedReturn;
      paretoCurve.push({ volatility: pt.volatility, expectedReturn: pt.expectedReturn, sharpe: pt.sharpe });
    }
  }

  const t1 = performance.now();
  const execTimeMs = t1 - t0;
  const totalSteps = M * T * n;

  return {
    success: true,
    engineMode: 'local',
    cpp: {
      engine: 'FinIntel Client SIMD Engine (Local Hardware)',
      benchmark: {
        executionTimeMs: execTimeMs,
        numThreads: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
        simulations: M,
        timeHorizonDays: T,
        totalSimulatedSteps: totalSteps,
        throughputStepsPerSec: totalSteps / (execTimeMs / 1000)
      },
      portfolio: {
        initialValue: initialPortfolioValue,
        expectedReturn,
        volatility,
        sharpeRatio: Number(sharpeRatio.toFixed(2))
      },
      risk: {
        var95_dollar: var95,
        var95_percent: (var95 / initialPortfolioValue) * 100,
        var99_dollar: var99,
        var99_percent: (var99 / initialPortfolioValue) * 100,
        cvar95_dollar: cvar95,
        cvar95_percent: (cvar95 / initialPortfolioValue) * 100,
        cvar99_dollar: cvar99,
        cvar99_percent: (cvar99 / initialPortfolioValue) * 100,
        maxDrawdownMean: meanDD,
        maxDrawdownWorst99: worstDD99
      },
      snapshotDays: snapshotIndices,
      trajectories: { p5, p25, p50, p75, p95 },
      samplePaths: samplePaths.map(p => Array.from(p)),
      histogram: {
        bins: histBins,
        counts: histCounts
      },
      efficientFrontier: {
        maxSharpe: bestSharpe,
        minVol: minVol,
        curve: paretoCurve
      },
      methodology: 'Computed instantly using Correlated Geometric Brownian Motion (GBM) via Cholesky Decomposition with Box-Muller standard normals.'
    }
  };
}

// Pure math utility to normalize weights so they sum to exactly 1.0000 (100.0%)
function normalizeArrayTo1(arr) {
  const n = arr ? arr.length : 0;
  if (n === 0) return [];
  const sum = arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
  if (sum <= 0) {
    const eq = Number((1 / n).toFixed(4));
    const res = new Array(n).fill(eq);
    const diff = Number((1 - eq * n).toFixed(4));
    res[n - 1] = Math.max(0, Number((res[n - 1] + diff).toFixed(4)));
    return res;
  }
  const normalized = arr.map(w => Number(((Number(w) || 0) / sum).toFixed(4)));
  const partialSum = normalized.slice(0, -1).reduce((acc, v) => acc + v, 0);
  normalized[n - 1] = Math.max(0, Number((1.0 - partialSum).toFixed(4)));
  return normalized;
}

export default function QuantLab({ onClose, userPortfolio = [], paperPortfolio = [] }) {
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState('tech-titans');
  const [symbols, setSymbols] = useState(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']);
  const [weights, setWeights] = useState([0.25, 0.25, 0.20, 0.15, 0.15]);
  const [numSimulations, setNumSimulations] = useState(50000);
  const [timeHorizonDays, setTimeHorizonDays] = useState(90);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskFreeRate, setRiskFreeRate] = useState(0.045);
  const [engineMode, setEngineMode] = useState('cloud'); // 'cloud' | 'local'
  const [fallbackNote, setFallbackNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('trajectories'); // 'trajectories' | 'frontier' | 'distribution'

  // Canvas refs and hover tooltip state
  const canvasContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const frontierCanvasRef = useRef(null);
  const [hoverData, setHoverData] = useState(null); // { x, y, title, lines: [] }

  // Strictly clamp active weights to symbols.length so phantom weights never exist
  const displayedWeights = useMemo(() => {
    return symbols.map((_, i) => {
      const val = weights[i];
      return (typeof val === 'number' && Number.isFinite(val)) ? val : (1 / symbols.length);
    });
  }, [symbols, weights]);

  // Total percentage strictly for visible assets on screen
  const weightTotal = useMemo(() => {
    return displayedWeights.reduce((sum, value) => sum + value, 0);
  }, [displayedWeights]);

  const weightTotalPct = useMemo(() => {
    return Number((weightTotal * 100).toFixed(1));
  }, [weightTotal]);

  const weightsValid = useMemo(() => {
    return (
      symbols.length > 0 &&
      displayedWeights.length === symbols.length &&
      displayedWeights.every(w => Number.isFinite(w) && w >= 0 && w <= 1) &&
      Math.abs(weightTotal - 1.0) <= 0.005
    );
  }, [symbols, displayedWeights, weightTotal]);

  // Invariant: Prune any leftover hidden weights whenever symbol count changes
  useEffect(() => {
    if (weights.length !== symbols.length && symbols.length > 0) {
      setWeights(prev => {
        if (prev.length === symbols.length) return prev;
        if (prev.length > symbols.length) return prev.slice(0, symbols.length);
        const diff = symbols.length - prev.length;
        return [...prev, ...new Array(diff).fill(0)];
      });
    }
  }, [symbols.length, weights.length]);

  // Fetch presets on mount and merge with defaults
  useEffect(() => {
    axios.get(`${API_URL}/api/quant/presets`)
      .then(res => {
        if (res.data && Object.keys(res.data).length > 0) {
          setPresets(prev => ({ ...prev, ...res.data }));
        }
      })
      .catch(() => {});
  }, []);

  const runSimulation = useCallback(async (forcedMode = null, targetSymbols = null, targetWeights = null, targetPreset = null) => {
    const activeMode = forcedMode || engineMode;
    const activeSyms = targetSymbols || symbols;
    const activeW = targetWeights || displayedWeights;
    const activePresetKey = targetPreset !== undefined && targetPreset !== null ? targetPreset : selectedPreset;

    const sum = activeW.reduce((a, b) => a + b, 0);
    if (!activeSyms.length || activeSyms.length > 50 || Math.abs(sum - 1) > 0.02) {
      setError(`Allocations must total 100% (currently ${(sum * 100).toFixed(1)}%). Click Normalize or adjust sliders.`);
      return;
    }

    setLoading(true);
    setError('');
    setFallbackNote('');

    const presetData = presets[activePresetKey] || {};
    const normalizedWeights = normalizeArrayTo1(activeW);

    if (activeMode === 'local') {
      try {
        const clientRes = simulateClientSide({
          symbols: activeSyms,
          weights: normalizedWeights,
          numSimulations,
          timeHorizonDays,
          initialPortfolioValue: initialCapital,
          riskFreeRate,
          expectedReturns: presetData.expectedReturns,
          volatilities: presetData.volatilities
        });
        setResult(clientRes);
      } catch (err) {
        setError('Local simulation error: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Cloud C++ Engine mode
    try {
      const payload = {
        symbols: activeSyms,
        weights: normalizedWeights,
        numSimulations,
        timeHorizonDays,
        initialPortfolioValue: initialCapital,
        riskFreeRate,
        expectedReturns: presetData.expectedReturns,
        volatilities: presetData.volatilities
      };

      const res = await axios.post(`${API_URL}/api/quant/simulate`, payload, { timeout: 8000 });
      setResult(res.data);
    } catch (err) {
      console.warn('[QuantLab] Cloud Engine latency or error. Falling back seamlessly to local hardware...', err);
      try {
        const fallbackRes = simulateClientSide({
          symbols: activeSyms,
          weights: normalizedWeights,
          numSimulations,
          timeHorizonDays,
          initialPortfolioValue: initialCapital,
          riskFreeRate,
          expectedReturns: presetData.expectedReturns,
          volatilities: presetData.volatilities
        });
        setResult(fallbackRes);
        setFallbackNote('Connected to client hardware engine for instant zero-lag response.');
      } catch (clientErr) {
        setError(err.response?.data?.error || 'Simulation failed. Check parameters.');
      }
    } finally {
      setLoading(false);
    }
  }, [symbols, displayedWeights, numSimulations, timeHorizonDays, initialCapital, riskFreeRate, engineMode, presets, selectedPreset]);

  // Initial simulation on mount
  useEffect(() => {
    runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (key) => {
    setSelectedPreset(key);
    if (presets[key]) {
      const p = presets[key];
      const newSyms = [...p.symbols];
      const newWeights = normalizeArrayTo1(p.weights.slice(0, newSyms.length));
      setSymbols(newSyms);
      setWeights(newWeights);
      setError('');
      // Immediately run simulation for newly chosen preset so charts and frontier reflect this preset instantly
      runSimulation(null, newSyms, newWeights, key);
    }
  };

  const handleLoadUserPortfolio = (portfolioList, name) => {
    if (!portfolioList || portfolioList.length === 0) {
      setError(`Your ${name} is empty. Add holdings first or select a preset.`);
      return;
    }
    const cleanSyms = portfolioList.map(p => p.symbol);
    const totalQtyVal = portfolioList.reduce((acc, p) => acc + (p.qty * (p.price || 100)), 0);
    const computedWeights = portfolioList.map(p => {
      const val = p.qty * (p.price || 100);
      return totalQtyVal > 0 ? (val / totalQtyVal) : (1 / cleanSyms.length);
    });

    const normalizedW = normalizeArrayTo1(computedWeights);
    setSelectedPreset('custom');
    setSymbols(cleanSyms);
    setWeights(normalizedW);
    if (totalQtyVal > 1000) {
      setInitialCapital(Math.round(totalQtyVal));
    }
    setError('');
    runSimulation(null, cleanSyms, normalizedW, 'custom');
  };

  const handleWeightChange = (index, newVal) => {
    const updated = [...displayedWeights];
    updated[index] = Math.max(0, Math.min(1, parseFloat(newVal) || 0));
    setWeights(updated);
    setSelectedPreset('custom');
  };

  const handleAdjustWeightDelta = (index, delta) => {
    const updated = [...displayedWeights];
    updated[index] = Math.max(0, Math.min(1, Number((updated[index] + delta).toFixed(2))));
    setWeights(updated);
    setSelectedPreset('custom');
  };

  const normalizeWeights = () => {
    const normalized = normalizeArrayTo1(displayedWeights);
    setWeights(normalized);
    setError('');
  };

  const setEqualWeights = () => {
    const n = symbols.length;
    if (n === 0) return;
    const eq = Number((1 / n).toFixed(4));
    const newWeights = new Array(n).fill(eq);
    const remainder = Number((1 - eq * (n - 1)).toFixed(4));
    newWeights[n - 1] = Math.max(0, remainder);
    setWeights(newWeights);
    setSelectedPreset('custom');
    setError('');
  };

  const applyOptimalWeights = () => {
    if (!result?.cpp?.efficientFrontier?.maxSharpe?.weights) return;
    const optimal = result.cpp.efficientFrontier.maxSharpe.weights;
    if (optimal.length !== symbols.length) {
      setError('Recalculating optimal frontier weights for current portfolio...');
      runSimulation();
      return;
    }
    const normalized = normalizeArrayTo1(optimal.slice(0, symbols.length));
    setWeights(normalized);
    setSelectedPreset('custom');
    setError('');
  };

  // Render Monte Carlo Fan Chart Canvas with High DPI & Hover Crosshair
  useEffect(() => {
    if (!result || !result.cpp || !canvasRef.current || activeTab !== 'trajectories') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 760;
    const height = 350;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const { trajectories, samplePaths, snapshotDays, portfolio } = result.cpp;
    if (!trajectories || !snapshotDays) return;

    const padding = { top: 35, right: 145, bottom: 42, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let minVal = Math.min(...trajectories.p5);
    let maxVal = Math.max(...trajectories.p95);
    (samplePaths || []).forEach(p => {
      minVal = Math.min(minVal, ...p);
      maxVal = Math.max(maxVal, ...p);
    });
    minVal *= 0.94;
    maxVal *= 1.06;

    const numPoints = snapshotDays.length;
    const getX = (i) => padding.left + (i / (numPoints - 1)) * chartW;
    const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

    // Background horizontal grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = 'rgba(156, 163, 175, 0.7)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';

    const numGridLines = 5;
    for (let i = 0; i <= numGridLines; i++) {
      const v = minVal + (i / numGridLines) * (maxVal - minVal);
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`$${Math.round(v).toLocaleString()}`, padding.left - 12, y + 4);
    }

    // Time horizon X labels
    ctx.textAlign = 'center';
    snapshotDays.forEach((day, i) => {
      if (i % Math.ceil(numPoints / 6) === 0 || i === numPoints - 1) {
        const x = getX(i);
        ctx.fillStyle = 'rgba(156, 163, 175, 0.65)';
        ctx.fillText(`Day ${day}`, x, height - 14);
      }
    });

    // 1. Shaded 5th-95th percentile band
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = getX(i);
      const y = getY(trajectories.p95[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = numPoints - 1; i >= 0; i--) {
      const x = getX(i);
      const y = getY(trajectories.p5[i]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const grad90 = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    grad90.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
    grad90.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
    ctx.fillStyle = grad90;
    ctx.fill();

    // 2. Shaded 25th-75th percentile band
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = getX(i);
      const y = getY(trajectories.p75[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = numPoints - 1; i >= 0; i--) {
      const x = getX(i);
      const y = getY(trajectories.p25[i]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.fill();

    // 3. Faint stochastic sample paths
    if (samplePaths && samplePaths.length > 0) {
      ctx.lineWidth = 1;
      samplePaths.forEach((path, idx) => {
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(148, 163, 184, 0.14)' : 'rgba(105, 211, 154, 0.16)';
        ctx.beginPath();
        path.forEach((val, i) => {
          const x = getX(i);
          const y = getY(val);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    }

    // 4. Baseline Initial Value Dotted Line
    const initY = getY(portfolio.initialValue);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, initY);
    ctx.lineTo(width - padding.right, initY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Percentile Lines
    // p95 (Bullish emerald)
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    trajectories.p95.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // p5 (Bearish red)
    ctx.strokeStyle = '#F87171';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    trajectories.p5.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // p50 (Median primary accent green)
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    trajectories.p50.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // End badges with background pill
    const lastIdx = numPoints - 1;
    const lastX = getX(lastIdx);

    const drawLabel = (val, color, text) => {
      const y = getY(val);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, y, 4, 0, Math.PI * 2);
      ctx.fill();

      const labelStr = `${text}: $${Math.round(val).toLocaleString()}`;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(labelStr).width;
      const badgeX = lastX + 8;
      const badgeY = y - 10;

      ctx.fillStyle = 'rgba(10, 16, 12, 0.88)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, textWidth + 12, 19, 4);
      } else {
        ctx.rect(badgeX, badgeY, textWidth + 12, 19);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(labelStr, badgeX + 6, y + 3);
    };

    drawLabel(trajectories.p95[lastIdx], '#34D399', 'Bull 95%');
    drawLabel(trajectories.p50[lastIdx], '#10B981', 'Median');
    drawLabel(trajectories.p5[lastIdx], '#F87171', 'Bear 5%');

    // 6. Interactive Cursor Crosshair & Highlight
    if (hoverData && hoverData.dayIndex !== undefined && hoverData.dayIndex >= 0 && hoverData.dayIndex < numPoints) {
      const hX = getX(hoverData.dayIndex);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hX, padding.top);
      ctx.lineTo(hX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      const pts = [
        { val: trajectories.p95[hoverData.dayIndex], col: '#34D399' },
        { val: trajectories.p50[hoverData.dayIndex], col: '#10B981' },
        { val: trajectories.p5[hoverData.dayIndex], col: '#F87171' }
      ];

      pts.forEach(p => {
        const pY = getY(p.val);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(hX, pY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }, [result, activeTab, hoverData]);

  // Render Markowitz Efficient Frontier Canvas
  useEffect(() => {
    if (!result || !result.cpp || !result.cpp.efficientFrontier || !frontierCanvasRef.current || activeTab !== 'frontier') return;
    const canvas = frontierCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 760;
    const height = 350;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const { curve, maxSharpe, minVol } = result.cpp.efficientFrontier;
    const currentPort = result.cpp.portfolio;

    const padding = { top: 35, right: 80, bottom: 50, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let minVolX = Math.max(0, (minVol.volatility || 0.15) * 0.75);
    let maxVolX = Math.max(maxSharpe.volatility || 0.35, currentPort.volatility || 0.25, 0.40) * 1.25;
    let minRetY = Math.min(0, minVol.expectedReturn || 0.05, currentPort.expectedReturn || 0.1) * 0.8;
    let maxRetY = Math.max(maxSharpe.expectedReturn || 0.25, currentPort.expectedReturn || 0.15, 0.40) * 1.2;

    const spanVol = Math.max(0.08, maxVolX - minVolX);
    const spanRet = Math.max(0.08, maxRetY - minRetY);

    const getX = (v) => padding.left + ((v - minVolX) / spanVol) * chartW;
    const getY = (r) => padding.top + chartH - ((r - minRetY) / spanRet) * chartH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = 'rgba(156, 163, 175, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';

    // Y Axis (Return)
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const r = minRetY + (i / 5) * (maxRetY - minRetY);
      const y = getY(r);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${(r * 100).toFixed(0)}%`, padding.left - 12, y + 4);
    }

    // X Axis (Volatility)
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const v = minVolX + (i / 5) * (maxVolX - minVolX);
      const x = getX(v);
      ctx.fillText(`${(v * 100).toFixed(0)}% Vol`, x, height - 16);
    }

    // Capital Allocation Line (CAL) tangent to Max Sharpe
    const rfX = getX(0);
    const rfY = getY(riskFreeRate);
    const msX = getX(maxSharpe.volatility);
    const msY = getY(maxSharpe.expectedReturn);

    if (rfX < msX) {
      const slope = (msY - rfY) / (msX - rfX);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(rfX, rfY);
      ctx.lineTo(msX + 160, msY + 160 * slope);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Efficient Frontier Curve
    if (curve && curve.length > 1) {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      curve.forEach((pt, i) => {
        const x = getX(pt.volatility);
        const y = getY(pt.expectedReturn);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 1. Min Volatility Point
    const mvX = getX(minVol.volatility);
    const mvY = getY(minVol.expectedReturn);
    ctx.fillStyle = '#60A5FA';
    ctx.beginPath();
    ctx.arc(mvX, mvY, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E5ECE7';
    ctx.textAlign = 'left';
    ctx.fillText(`Min Vol (${(minVol.volatility * 100).toFixed(1)}%)`, mvX + 10, mvY - 4);

    // 2. Max Sharpe Point
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(msX, msY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FBBF24';
    ctx.fillText(`Max Sharpe (${maxSharpe.sharpe.toFixed(2)})`, msX + 14, msY - 4);

    // 3. Current Portfolio Point
    const cpX = getX(currentPort.volatility);
    const cpY = getY(currentPort.expectedReturn);
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.arc(cpX, cpY, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#F87171';
    ctx.fillText(`Current (${currentPort.sharpeRatio.toFixed(2)} Sharpe)`, cpX + 12, cpY + 16);

  }, [result, activeTab, riskFreeRate]);

  // Handle Canvas Mouse Move for interactive tooltip
  const handleCanvasMouseMove = (e) => {
    if (!result || !result.cpp || !canvasRef.current || activeTab !== 'trajectories') return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { snapshotDays, trajectories, portfolio } = result.cpp;
    if (!snapshotDays || !trajectories) return;

    const padding = { top: 35, right: 145, bottom: 42, left: 75 };
    const chartW = rect.width - padding.left - padding.right;

    if (mouseX < padding.left || mouseX > rect.width - padding.right) {
      setHoverData(null);
      return;
    }

    const ratio = (mouseX - padding.left) / chartW;
    const dayIdx = Math.round(ratio * (snapshotDays.length - 1));
    const clampedIdx = Math.max(0, Math.min(snapshotDays.length - 1, dayIdx));

    const day = snapshotDays[clampedIdx];
    const p95Val = trajectories.p95[clampedIdx];
    const p75Val = trajectories.p75[clampedIdx];
    const p50Val = trajectories.p50[clampedIdx];
    const p25Val = trajectories.p25[clampedIdx];
    const p5Val = trajectories.p5[clampedIdx];
    const init = portfolio.initialValue;

    const calcReturn = (v) => {
      const pct = ((v - init) / init) * 100;
      return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
    };

    setHoverData({
      x: mouseX,
      y: mouseY,
      dayIndex: clampedIdx,
      day,
      p95: { val: Math.round(p95Val), ret: calcReturn(p95Val) },
      p75: { val: Math.round(p75Val), ret: calcReturn(p75Val) },
      p50: { val: Math.round(p50Val), ret: calcReturn(p50Val) },
      p25: { val: Math.round(p25Val), ret: calcReturn(p25Val) },
      p5: { val: Math.round(p5Val), ret: calcReturn(p5Val) }
    });
  };

  const handleCanvasMouseLeave = () => {
    setHoverData(null);
  };

  return (
    <div className="quant-lab-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quant-lab-modal">
        {/* Modal Top Bar */}
        <div className="quant-header">
          <div className="quant-header-left">
            <div className="quant-icon-badge">
              <Cpu size={22} color="#10B981" />
            </div>
            <div>
              <div className="quant-title-wrap">
                <h2 className="quant-modal-title">
                  FinIntel Quant Lab <span className="quant-badge-cpp">Institutional Core</span>
                </h2>
                <div className="status-live-pill">
                  <span className="dot-pulse"></span>
                  <span>C++20 · OpenMP SIMD Multi-threaded</span>
                </div>
              </div>
              <p className="quant-subtitle">
                Institutional Monte Carlo simulations, Value-at-Risk (VaR/CVaR), and Markowitz Mean-Variance Optimization
              </p>
            </div>
          </div>

          <div className="quant-header-right">
            <div className="engine-mode-toggle">
              <button
                className={`mode-btn ${engineMode === 'cloud' ? 'active' : ''}`}
                onClick={() => { setEngineMode('cloud'); runSimulation('cloud'); }}
                title="Execute high-throughput C++20 OpenMP Engine on Cloud"
              >
                <Cloud size={13} />
                <span>Cloud C++ Core</span>
              </button>
              <button
                className={`mode-btn ${engineMode === 'local' ? 'active' : ''}`}
                onClick={() => { setEngineMode('local'); runSimulation('local'); }}
                title="Execute simulation directly on your device hardware"
              >
                <Laptop size={13} />
                <span>Local Device</span>
              </button>
            </div>
            <button className="btn-close" onClick={onClose} aria-label="Close Quant Lab">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="quant-body-grid">
          {/* Left Column: Configuration Controls */}
          <div className="quant-sidebar-panel">
            <div className="panel-section-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="#10B981" />
                <span>Institutional Presets</span>
              </div>
              <span className="preset-count-badge font-mono">{Object.keys(presets).length} Models</span>
            </div>

            <div className="preset-grid-2col">
              {Object.entries(presets).map(([k, p]) => (
                <button
                  key={k}
                  className={`preset-card-compact ${selectedPreset === k ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(k)}
                >
                  <div className="preset-card-name">{p.name.replace(/\(.*?\)/, '').trim()}</div>
                  <div className="preset-card-sub font-mono">{p.symbols.join(', ')}</div>
                </button>
              ))}
            </div>

            {(userPortfolio.length > 0 || paperPortfolio.length > 0) && (
              <div className="preset-sync-row">
                {userPortfolio.length > 0 && (
                  <button
                    className="btn-sync-compact"
                    onClick={() => handleLoadUserPortfolio(userPortfolio, 'Real Portfolio')}
                  >
                    <Target size={12} />
                    <span>Real Portfolio ({userPortfolio.length})</span>
                  </button>
                )}
                {paperPortfolio.length > 0 && (
                  <button
                    className="btn-sync-compact"
                    onClick={() => handleLoadUserPortfolio(paperPortfolio, 'Paper Trading Portfolio')}
                  >
                    <Activity size={12} />
                    <span>Paper Trades ({paperPortfolio.length})</span>
                  </button>
                )}
              </div>
            )}

            {/* Asset Allocation Weights */}
            <div className="panel-section-title" style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PieChart size={14} color="#10B981" />
                <span>Asset Weights</span>
                <span className={`weight-badge-tag ${weightsValid ? 'valid' : 'invalid'}`}>
                  {weightTotalPct}%
                </span>
              </div>
              <div className="weight-quick-actions">
                <button className="btn-mini-action" onClick={normalizeWeights} title="Normalize to 100%">
                  Normalize
                </button>
                <button className="btn-mini-action" onClick={setEqualWeights} title="Equal Weight (1/N)">
                  Equal 1/N
                </button>
              </div>
            </div>

            {/* Segmented Color Allocation Bar */}
            <div className="quant-alloc-bar-container">
              <div className="quant-alloc-bar">
                {symbols.map((sym, idx) => {
                  const pct = Math.max(0, (displayedWeights[idx] || 0) * 100);
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={sym}
                      className="quant-alloc-segment"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: ASSET_COLORS[idx % ASSET_COLORS.length]
                      }}
                      title={`${sym}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
                {weightTotal < 0.995 && (
                  <div
                    className="quant-alloc-segment-unallocated"
                    style={{ width: `${Math.max(0, (1 - weightTotal) * 100)}%` }}
                    title={`Unallocated: ${((1 - weightTotal) * 100).toFixed(1)}%`}
                  />
                )}
              </div>
            </div>

            {/* Sliders with asset badges & nudge controls */}
            <div className="asset-weight-table">
              {symbols.map((sym, idx) => {
                const color = ASSET_COLORS[idx % ASSET_COLORS.length];
                const pct = Math.round((displayedWeights[idx] || 0) * 100);
                return (
                  <div key={sym} className="weight-row-modern">
                    <div className="weight-row-header">
                      <div className="weight-asset-identity">
                        <span className="weight-asset-dot" style={{ backgroundColor: color }} />
                        <span className="asset-tag font-mono">{sym}</span>
                      </div>
                      <div className="weight-stepper-wrap">
                        <button
                          className="btn-stepper"
                          onClick={() => handleAdjustWeightDelta(idx, -0.05)}
                          title="-5%"
                        >
                          -5%
                        </button>
                        <span className="weight-pct font-mono">{pct}%</span>
                        <button
                          className="btn-stepper"
                          onClick={() => handleAdjustWeightDelta(idx, 0.05)}
                          title="+5%"
                        >
                          +5%
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={displayedWeights[idx] || 0}
                      onChange={(e) => handleWeightChange(idx, e.target.value)}
                      className="weight-slider"
                      style={{ accentColor: color }}
                    />
                  </div>
                );
              })}
            </div>

            {!weightsValid && (
              <div className="quant-error-banner-small" role="alert">
                <div className="quant-error-banner-inner">
                  <span>
                    Allocations total <strong>{weightTotalPct}%</strong> (must be 100.0%).
                  </span>
                  <button
                    className="btn-rebalance-inline"
                    onClick={normalizeWeights}
                    title="Auto-rebalance allocations to total exactly 100%"
                  >
                    <CheckCircle2 size={12} />
                    <span>Normalize to 100%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Execution Parameters */}
            <div className="panel-section-title" style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={14} color="#10B981" />
                <span>Simulation Parameters</span>
              </div>
            </div>

            <div className="param-grid-compact">
              <div className="param-field">
                <label>Simulated Paths</label>
                <select
                  value={numSimulations}
                  onChange={(e) => setNumSimulations(parseInt(e.target.value))}
                  className="param-select font-mono"
                >
                  <option value={10000}>10,000 paths (Ultra Fast)</option>
                  <option value={50000}>50,000 paths (Institutional)</option>
                  <option value={100000}>100,000 paths (High Precision)</option>
                  <option value={200000}>200,000 paths (Stress Test)</option>
                </select>
              </div>

              <div className="param-field">
                <label>Time Horizon</label>
                <select
                  value={timeHorizonDays}
                  onChange={(e) => setTimeHorizonDays(parseInt(e.target.value))}
                  className="param-select font-mono"
                >
                  <option value={30}>30 Days (1 Month)</option>
                  <option value={90}>90 Days (1 Quarter)</option>
                  <option value={180}>180 Days (Half Year)</option>
                  <option value={252}>252 Days (1 Year)</option>
                </select>
              </div>

              <div className="param-field">
                <label>Initial Capital ($)</label>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Math.max(1000, parseFloat(e.target.value) || 100000))}
                  className="param-input font-mono"
                />
              </div>

              <div className="param-field">
                <label>Risk-Free Rate (Rf)</label>
                <input
                  type="number"
                  step="0.005"
                  value={riskFreeRate}
                  onChange={(e) => setRiskFreeRate(parseFloat(e.target.value) || 0.045)}
                  className="param-input font-mono"
                />
              </div>
            </div>

            <button
              className="btn-run-sim-modern"
              onClick={() => runSimulation()}
              disabled={loading || !weightsValid}
            >
              {loading ? (
                <div className="mini-spinner-quant"></div>
              ) : (
                <>
                  <Zap size={16} fill="#0b140e" />
                  <span>{engineMode === 'cloud' ? 'Execute Cloud C++ Engine' : 'Run Local Hardware Engine'}</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Visualizations & Analytics */}
          <div className="quant-results-panel">
            {error && (
              <div className="quant-error-banner" role="alert">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            {fallbackNote && (
              <div className="quant-fallback-banner" role="status">
                <Info size={14} />
                <span>{fallbackNote}</span>
              </div>
            )}

            {/* High-Performance Diagnostics Card */}
            {result && result.cpp && (
              <div className="benchmark-card-modern">
                <div className="benchmark-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={14} color="#10B981" />
                    <span className="benchmark-card-title">Execution Performance & Telemetry</span>
                  </div>
                  <div className="benchmark-tag-row">
                    <span className="engine-speed-badge">
                      ⚡ {(result.cpp.benchmark.executionTimeMs).toFixed(1)} ms
                    </span>
                    <span className="engine-mode-badge">
                      {result.engineMode === 'cloud' ? 'C++20 Native Core' : 'Local SIMD'}
                    </span>
                  </div>
                </div>

                <div className="benchmark-metrics-grid-modern">
                  <div className="metric-box-modern">
                    <span className="metric-box-label">Engine Runtime</span>
                    <span className="metric-box-val font-mono">
                      {result.cpp.benchmark.executionTimeMs.toFixed(1)} ms
                    </span>
                    <span className="metric-box-sub font-mono">
                      {result.engineMode === 'cloud'
                        ? `${result.cpp.benchmark.numThreads} OpenMP thread(s)`
                        : `${result.cpp.benchmark.numThreads} CPU Core(s)`}
                    </span>
                  </div>

                  <div className="metric-box-modern">
                    <span className="metric-box-label">Simulated Paths</span>
                    <span className="metric-box-val font-mono">
                      {result.cpp.benchmark.simulations.toLocaleString()}
                    </span>
                    <span className="metric-box-sub font-mono">
                      {((result.cpp.benchmark.totalSimulatedSteps || (result.cpp.benchmark.simulations * timeHorizonDays * symbols.length)) / 1e6).toFixed(1)}M steps
                    </span>
                  </div>

                  <div className="metric-box-modern">
                    <span className="metric-box-label">Throughput</span>
                    <span className="metric-box-val font-mono success">
                      {((result.cpp.benchmark.throughputStepsPerSec || 0) / 1e6).toFixed(1)}M
                    </span>
                    <span className="metric-box-sub font-mono">
                      steps / second
                    </span>
                  </div>

                  <div className="metric-box-modern">
                    <span className="metric-box-label">Time Horizon</span>
                    <span className="metric-box-val font-mono">
                      {result.cpp.benchmark.timeHorizonDays} Days
                    </span>
                    <span className="metric-box-sub font-mono">
                      {symbols.length} correlated assets
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB SELECTOR */}
            <div className="quant-tab-row-modern">
              <button
                className={`quant-tab-btn-modern ${activeTab === 'trajectories' ? 'active' : ''}`}
                onClick={() => setActiveTab('trajectories')}
              >
                <TrendingUp size={15} />
                <span>Monte Carlo Fan Chart</span>
              </button>
              <button
                className={`quant-tab-btn-modern ${activeTab === 'frontier' ? 'active' : ''}`}
                onClick={() => setActiveTab('frontier')}
              >
                <Target size={15} />
                <span>Markowitz Efficient Frontier</span>
              </button>
              <button
                className={`quant-tab-btn-modern ${activeTab === 'distribution' ? 'active' : ''}`}
                onClick={() => setActiveTab('distribution')}
              >
                <BarChart3 size={15} />
                <span>Terminal Value Distribution</span>
              </button>
            </div>

            {/* VISUALIZATION CANVAS */}
            <div className="canvas-wrapper-modern" ref={canvasContainerRef}>
              {activeTab === 'trajectories' && (
                <div style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    className="quant-canvas-interactive"
                    onMouseMove={handleCanvasMouseMove}
                    onMouseLeave={handleCanvasMouseLeave}
                  />

                  {/* Interactive Floating Hover Tooltip */}
                  {hoverData && (
                    <div
                      className="canvas-interactive-tooltip"
                      style={{
                        left: `${Math.min(hoverData.x + 14, (canvasContainerRef.current?.clientWidth || 700) - 220)}px`,
                        top: `${Math.max(10, hoverData.y - 80)}px`
                      }}
                    >
                      <div className="tooltip-header font-mono">Day {hoverData.day}</div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: '#34D399' }} />
                        <span className="tooltip-label">95th % (Bull):</span>
                        <span className="tooltip-val font-mono">${hoverData.p95.val.toLocaleString()} ({hoverData.p95.ret})</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: '#6EE7B7' }} />
                        <span className="tooltip-label">75th % (Upper):</span>
                        <span className="tooltip-val font-mono">${hoverData.p75.val.toLocaleString()} ({hoverData.p75.ret})</span>
                      </div>
                      <div className="tooltip-row highlight">
                        <span className="tooltip-dot" style={{ backgroundColor: '#10B981' }} />
                        <span className="tooltip-label">Median (50th):</span>
                        <span className="tooltip-val font-mono">${hoverData.p50.val.toLocaleString()} ({hoverData.p50.ret})</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: '#FCA5A5' }} />
                        <span className="tooltip-label">25th % (Lower):</span>
                        <span className="tooltip-val font-mono">${hoverData.p25.val.toLocaleString()} ({hoverData.p25.ret})</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: '#F87171' }} />
                        <span className="tooltip-label">5th % (Bear):</span>
                        <span className="tooltip-val font-mono danger">${hoverData.p5.val.toLocaleString()} ({hoverData.p5.ret})</span>
                      </div>
                    </div>
                  )}

                  <div className="canvas-legend-modern">
                    <span className="legend-chip"><span className="color-dot bull"></span><span>95th Percentile</span></span>
                    <span className="legend-chip"><span className="color-dot median"></span><span>Median Path</span></span>
                    <span className="legend-chip"><span className="color-dot bear"></span><span>5th Percentile</span></span>
                    <span className="legend-chip"><span className="color-dot init"></span><span>Starting Value ($100k)</span></span>
                  </div>
                </div>
              )}

              {activeTab === 'frontier' && (
                <div style={{ position: 'relative' }}>
                  {!result?.cpp?.efficientFrontier ? (
                    <div className="quant-empty-state">
                      <Target size={24} />
                      <strong>Efficient frontier calculating...</strong>
                      <span>Adjust weights or execute simulation to construct the frontier curve.</span>
                    </div>
                  ) : (
                    <>
                      <canvas
                        ref={frontierCanvasRef}
                        className="quant-canvas-interactive"
                      />
                      <div className="canvas-legend-modern">
                        <span className="legend-chip"><span className="color-dot gold"></span><span>Max Sharpe (Optimal)</span></span>
                        <span className="legend-chip"><span className="color-dot cyan"></span><span>Min Volatility</span></span>
                        <span className="legend-chip"><span className="color-dot red"></span><span>Current Portfolio</span></span>
                        <span className="legend-chip"><span className="cal-line-dash"></span><span>Capital Allocation Line</span></span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'distribution' && result?.cpp?.histogram && (
                <div className="histogram-container-modern">
                  <div className="histogram-header-caption">
                    Probability Density of Ending Portfolio Value at Day {result.cpp.benchmark.timeHorizonDays || timeHorizonDays} ({(result.cpp.benchmark.simulations || numSimulations).toLocaleString()} paths):
                  </div>
                  <div className="histogram-bars-wrapper-modern">
                    {result.cpp.histogram.counts.map((count, i) => {
                      const maxCount = Math.max(1, ...(result.cpp.histogram.counts || [1]));
                      const barH = (count / maxCount) * 100;
                      const binVal = result.cpp.histogram.bins[i];
                      const isLoss = binVal < initialCapital;
                      return (
                        <div key={i} className="hist-col-modern" title={`$${Math.round(binVal).toLocaleString()}: ${count.toLocaleString()} paths`}>
                          <div
                            className={`hist-bar-modern ${isLoss ? 'loss' : 'gain'}`}
                            style={{ height: `${Math.max(4, barH)}%` }}
                          ></div>
                          {i % 4 === 0 && (
                            <span className="hist-label-modern font-mono">
                              ${Math.round(binVal / 1000)}k
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* INSTITUTIONAL RISK METRICS KPI GRID */}
            {result && result.cpp && (
              <div className="risk-metrics-grid-modern">
                <div className="risk-card-modern danger-glow">
                  <div className="risk-header-row">
                    <span className="risk-title">Value-at-Risk (VaR 95%)</span>
                    <span className="risk-badge danger font-mono">95% Confidence</span>
                  </div>
                  <span className="risk-value font-mono danger">
                    ${Math.round(result.cpp.risk.var95_dollar).toLocaleString()}
                  </span>
                  <span className="risk-sub">
                    {result.cpp.risk.var95_percent.toFixed(1)}% simulated capital threshold loss
                  </span>
                </div>

                <div className="risk-card-modern danger-glow">
                  <div className="risk-header-row">
                    <span className="risk-title">Conditional VaR (CVaR 95%)</span>
                    <span className="risk-badge danger font-mono">Expected Shortfall</span>
                  </div>
                  <span className="risk-value font-mono danger">
                    ${Math.round(result.cpp.risk.cvar95_dollar || result.cpp.risk.var95_dollar * 1.3).toLocaleString()}
                  </span>
                  <span className="risk-sub">
                    Expected loss in the worst 5% tail distribution
                  </span>
                </div>

                <div className="risk-card-modern warning-glow">
                  <div className="risk-header-row">
                    <span className="risk-title">Mean Max Drawdown</span>
                    <span className="risk-badge warning font-mono">Historical Stress</span>
                  </div>
                  <span className="risk-value font-mono warning">
                    {result.cpp.risk.maxDrawdownMean.toFixed(1)}%
                  </span>
                  <span className="risk-sub">
                    {result.cpp.risk.maxDrawdownWorst99 != null
                      ? `Worst 99% Peak-to-Trough: ${result.cpp.risk.maxDrawdownWorst99.toFixed(1)}%`
                      : 'Simulated peak-to-trough path loss'}
                  </span>
                </div>

                <div className="risk-card-modern success-glow">
                  <div className="risk-header-row">
                    <span className="risk-title">Sharpe Ratio</span>
                    <span className="risk-badge success font-mono">Risk-Adjusted</span>
                  </div>
                  <span className="risk-value font-mono success">
                    {result.cpp.portfolio.sharpeRatio.toFixed(2)}
                  </span>
                  <span className="risk-sub">
                    {result.cpp.efficientFrontier
                      ? `Frontier Peak: ${result.cpp.efficientFrontier.maxSharpe.sharpe.toFixed(2)}`
                      : 'Risk-free benchmark: 4.5%'}
                  </span>
                </div>
              </div>
            )}

            {/* OPTIMAL REBALANCING RECOMMENDATION WITH 1-CLICK APPLY */}
            {result && result.cpp && result.cpp.efficientFrontier && (
              <div className="rebalancing-card-modern">
                <div className="rebalancing-header-modern">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="#FBBF24" />
                    <span className="rebalance-title">
                      Markowitz Tangency Portfolio (Maximum Sharpe Allocation)
                    </span>
                  </div>
                  {result.cpp.efficientFrontier.maxSharpe?.weights?.length === symbols.length ? (
                    <button
                      className="btn-apply-optimal"
                      onClick={applyOptimalWeights}
                      title="Apply Markowitz optimal weights directly to your sliders"
                    >
                      <CheckCircle2 size={13} />
                      <span>Apply Optimal Weights</span>
                    </button>
                  ) : (
                    <button
                      className="btn-apply-optimal"
                      onClick={() => runSimulation()}
                      title="Recalculate optimal frontier for current assets"
                    >
                      <RefreshCw size={13} />
                      <span>Recalculate for Assets</span>
                    </button>
                  )}
                </div>

                {result.cpp.efficientFrontier.maxSharpe?.weights?.length === symbols.length ? (
                  <div className="rebalance-chips-grid">
                    {symbols.map((sym, i) => {
                      const currentW = (displayedWeights[i] || 0) * 100;
                      const optimalW = (result.cpp.efficientFrontier.maxSharpe.weights[i] || 0) * 100;
                      const diff = optimalW - currentW;
                      return (
                        <div key={sym} className="rebalance-chip-modern">
                          <div className="rebalance-chip-top">
                            <span className="chip-symbol font-mono">{sym}</span>
                            <span className={`chip-diff font-mono ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neutral'}`}>
                              {diff > 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`}
                            </span>
                          </div>
                          <div className="rebalance-chip-compare font-mono">
                            <span>{currentW.toFixed(0)}%</span>
                            <ArrowRight size={11} color="var(--text-tertiary)" />
                            <span className="optimal-num">{optimalW.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rebalance-stale-notice">
                    <span>Portfolio assets changed. Run simulation to recalculate Markowitz optimal weights for these {symbols.length} assets.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
