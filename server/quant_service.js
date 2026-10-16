const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const BINARY_NAME = isWindows ? 'quant_engine.exe' : 'quant_engine';
const QUANT_BINARY = path.join(__dirname, 'quant_core', BINARY_NAME);
const SOURCE_FILE = path.join(__dirname, 'quant_core', 'quant_engine.cpp');

// Auto-compile helper if binary is missing (e.g. on fresh Render Linux deploy)
function ensureBinaryExists() {
  if (fs.existsSync(QUANT_BINARY)) return true;
  console.log(`[QuantCore] Native binary missing at ${QUANT_BINARY}. Attempting compilation with g++...`);
  try {
    const compileCmd = `g++ -O3 -fopenmp -std=c++20 "${SOURCE_FILE}" -o "${QUANT_BINARY}"`;
    execSync(compileCmd, { stdio: 'inherit' });
    if (!isWindows) {
      try { fs.chmodSync(QUANT_BINARY, 0o755); } catch (_) {}
    }
    console.log(`[QuantCore] Successfully compiled native binary: ${BINARY_NAME}`);
    return true;
  } catch (err) {
    console.error(`[QuantCore] Auto-compilation failed: ${err.message}`);
    return false;
  }
}

// Standard Institutional Portfolio Presets
const PRESETS = {
  'tech-titans': {
    name: 'Tech Titans (High Growth)',
    description: 'High-beta mega-cap technology portfolio (AAPL, MSFT, NVDA, GOOGL, AMZN)',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'],
    weights: [0.25, 0.25, 0.20, 0.15, 0.15],
    expectedReturns: [0.21, 0.19, 0.38, 0.22, 0.24],
    volatilities: [0.24, 0.22, 0.42, 0.26, 0.28]
  },
  'all-weather': {
    name: 'All-Weather Portfolio (Ray Dalio Model)',
    description: 'Risk-parity diversified across equities, long-term treasuries, and gold',
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

/**
 * Executes the native C++ quantitative binary via child process streaming
 */
function runCppQuantEngine(inputData) {
  return new Promise((resolve, reject) => {
    ensureBinaryExists();

    const child = spawn(QUANT_BINARY, [], {
      windowsHide: true,
      env: process.env
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn C++ Quant Core: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`C++ Quant Core exited with code ${code}. Stderr: ${stderrData}`));
      }
      try {
        const json = JSON.parse(stdoutData.trim());
        resolve(json);
      } catch (parseErr) {
        reject(new Error(`Failed to parse C++ Quant Core JSON: ${parseErr.message}\nRaw: ${stdoutData.slice(0, 300)}`));
      }
    });

    // Send input payload via stdin
    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

/**
 * Pure JavaScript equivalent of Monte Carlo simulation for 1-to-1 live performance benchmarking
 */
function runJsMonteCarloBenchmark(inputData) {
  const t0 = process.hrtime.bigint();
  const M = inputData.numSimulations || 10000;
  const T = inputData.timeHorizonDays || 90;
  const dt = 1.0 / 252.0;
  const symbols = inputData.symbols || ['AAPL'];
  const n = symbols.length;
  const weights = inputData.weights || Array(n).fill(1 / n);
  const returns = inputData.expectedReturns || Array(n).fill(0.12);
  const vols = inputData.volatilities || Array(n).fill(0.20);
  const initialVal = inputData.initialPortfolioValue || 100000.0;

  // Box-Muller transform for standard normal in JS
  function standardNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  const endingValues = new Float64Array(M);

  for (let sim = 0; sim < M; sim++) {
    let portTotal = 0.0;
    for (let i = 0; i < n; i++) {
      let assetVal = initialVal * weights[i];
      const drift = (returns[i] - 0.5 * vols[i] * vols[i]) * dt;
      const volSqrtDt = vols[i] * Math.sqrt(dt);

      for (let t = 1; t <= T; t++) {
        const z = standardNormal();
        assetVal *= Math.exp(drift + volSqrtDt * z);
      }
      portTotal += assetVal;
    }
    endingValues[sim] = portTotal;
  }

  // Calculate 95% VaR in JS
  endingValues.sort();
  const idx95 = Math.floor(M * 0.05);
  const var95 = Math.max(0, initialVal - endingValues[idx95]);

  const t1 = process.hrtime.bigint();
  const jsTimeMs = Number(t1 - t0) / 1e6;

  return {
    engine: 'Node.js V8 JavaScript Engine (Single-Threaded)',
    executionTimeMs: Number(jsTimeMs.toFixed(2)),
    simulations: M,
    timeHorizonDays: T,
    var95_dollar: Number(var95.toFixed(2))
  };
}

/**
 * Calculates drift, volatility, and correlation matrix from historical daily price bars
 */
function computeAssetParameters(assetHistoryMap, symbols) {
  const returnsMap = {};
  const minLen = Math.min(
    ...symbols.map(s => (assetHistoryMap[s] && assetHistoryMap[s].length > 1 ? assetHistoryMap[s].length : 0))
  );

  // If we don't have sufficient real history, fall back to institutional defaults
  if (minLen < 15) {
    return {
      expectedReturns: symbols.map(() => 0.15),
      volatilities: symbols.map(() => 0.22),
      correlationMatrix: symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1.0 : 0.40)))
    };
  }

  // Calculate daily log returns
  symbols.forEach(sym => {
    const prices = assetHistoryMap[sym].slice(0, minLen).map(p => parseFloat(p.close || p)).reverse();
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0 && prices[i] > 0) {
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }
    returnsMap[sym] = logReturns;
  });

  const numReturns = returnsMap[symbols[0]].length;
  const expectedReturns = [];
  const volatilities = [];

  symbols.forEach(sym => {
    const rets = returnsMap[sym];
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length - 1);
    const dailyVol = Math.sqrt(variance);

    // Annualize (252 trading days)
    expectedReturns.push(Number((mean * 252).toFixed(4)));
    volatilities.push(Number((dailyVol * Math.sqrt(252)).toFixed(4)));
  });

  // Calculate Correlation Matrix
  const correlationMatrix = [];
  for (let i = 0; i < symbols.length; i++) {
    const row = [];
    const retsI = returnsMap[symbols[i]];
    const meanI = expectedReturns[i] / 252;
    const volI = volatilities[i] / Math.sqrt(252);

    for (let j = 0; j < symbols.length; j++) {
      if (i === j) {
        row.push(1.0);
      } else {
        const retsJ = returnsMap[symbols[j]];
        const meanJ = expectedReturns[j] / 252;
        const volJ = volatilities[j] / Math.sqrt(252);

        let cov = 0;
        for (let k = 0; k < numReturns; k++) {
          cov += (retsI[k] - meanI) * (retsJ[k] - meanJ);
        }
        cov /= (numReturns - 1);
        const corr = (volI * volJ > 1e-8) ? cov / (volI * volJ) : 0.0;
        row.push(Number(Math.max(-0.99, Math.min(0.99, corr)).toFixed(4)));
      }
    }
    correlationMatrix.push(row);
  }

  return { expectedReturns, volatilities, correlationMatrix };
}

module.exports = {
  PRESETS,
  runCppQuantEngine,
  runJsMonteCarloBenchmark,
  computeAssetParameters
};
