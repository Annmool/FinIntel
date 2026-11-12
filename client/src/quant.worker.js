/* global globalThis */

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
      engine: 'Browser JavaScript Worker',
      benchmark: {
        executionTimeMs: execTimeMs,
        numThreads: 1,
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
      methodology: 'Computed using Correlated Geometric Brownian Motion (GBM) via Cholesky Decomposition with Box-Muller standard normals.'
    }
  };
}

globalThis.onmessage = ({ data }) => {
  try {
    globalThis.postMessage({ result: simulateClientSide(data) });
  } catch (error) {
    globalThis.postMessage({ error: error.message });
  }
};
