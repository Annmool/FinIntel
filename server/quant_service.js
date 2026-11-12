const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const BINARY_NAME = isWindows ? 'quant_engine.exe' : 'quant_engine';
const QUANT_BINARY = path.join(__dirname, 'quant_core', BINARY_NAME);
const SOURCE_FILE = path.join(__dirname, 'quant_core', 'quant_engine.cpp');

// Ensure MSYS2 paths are included in PATH on Windows for OpenMP DLLs and GCC 14.2
const extendedEnv = { ...process.env };
if (isWindows) {
  const msysPaths = ['C:\\msys64\\ucrt64\\bin', 'C:\\msys64\\mingw64\\bin', 'C:\\msys64\\usr\\bin'];
  const validMsys = msysPaths.filter(p => fs.existsSync(p));
  if (validMsys.length > 0) {
    extendedEnv.PATH = `${validMsys.join(';')};${extendedEnv.PATH || ''}`;
  }
}

let binaryBuildPromise;

// Compile asynchronously on the first simulation when the deployment did not
// build the native binary. Concurrent first requests share the same build.
function ensureBinaryExists() {
  if (binaryBuildPromise) return binaryBuildPromise;
  const binary = fs.statSync(QUANT_BINARY, { throwIfNoEntry: false });
  const source = fs.statSync(SOURCE_FILE, { throwIfNoEntry: false });
  if (binary && (!source || binary.mtimeMs >= source.mtimeMs)) return Promise.resolve();

  console.log('[QuantCore] Building the native engine with g++...');
  const compiler = isWindows && fs.existsSync('C:\\msys64\\ucrt64\\bin\\g++.exe')
    ? 'C:\\msys64\\ucrt64\\bin\\g++.exe'
    : 'g++';
  const args = ['-O3', '-fopenmp', '-std=c++20', SOURCE_FILE, '-o', QUANT_BINARY];

  const build = new Promise((resolve, reject) => {
    const child = spawn(compiler, args, { windowsHide: true, env: extendedEnv });
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('C++ quant engine compilation timed out after 120 seconds.'));
    }, 120000);

    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-12000); });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(new Error(`Could not start C++ compiler: ${error.message}`));
    });
    child.once('close', code => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(`C++ quant engine compilation failed (${code}): ${stderr}`));
      if (!isWindows) {
        try { fs.chmodSync(QUANT_BINARY, 0o755); } catch (_) {}
      }
      console.log(`[QuantCore] Successfully compiled ${BINARY_NAME}`);
      resolve();
    });
  });

  binaryBuildPromise = build;
  build.finally(() => {
    if (binaryBuildPromise === build) binaryBuildPromise = undefined;
  }).catch(() => {});
  return build;
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
async function runCppQuantEngine(inputData) {
  await ensureBinaryExists();
  return new Promise((resolve, reject) => {
    const child = spawn(QUANT_BINARY, [], {
      windowsHide: true,
      env: extendedEnv
    });

    let stdoutData = '';
    let stderrData = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error('C++ quant simulation timed out after 120 seconds.'));
      }
    }, 120000);

    const failForOutputLimit = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(new Error('C++ quant engine exceeded its output limit.'));
    };

    child.stdout.on('data', (chunk) => {
      if (stdoutData.length + chunk.length > 20 * 1024 * 1024) return failForOutputLimit();
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData = `${stderrData}${chunk}`.slice(-12000);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn C++ Quant Core: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
    child.stdin.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(error);
    });
    child.stdin.end(JSON.stringify(inputData));
  });
}

/**
 * JavaScript fallback Monte Carlo simulation. Its timings are not directly
 * comparable to the native engine because the implementations differ.
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

function isPositiveSemidefinite(matrix) {
  const factors = matrix.map(row => row.map(() => 0));
  const tolerance = 1e-10;

  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j <= i; j++) {
      let residual = matrix[i][j];
      for (let k = 0; k < j; k++) residual -= factors[i][k] * factors[j][k];
      if (!Number.isFinite(residual)) return false;
      if (i === j) {
        if (residual < -tolerance) return false;
        factors[i][j] = residual > tolerance ? Math.sqrt(residual) : 0;
      } else if (factors[j][j] > 0) {
        factors[i][j] = residual / factors[j][j];
      } else if (Math.abs(residual) > tolerance) {
        return false;
      }
    }
  }
  return true;
}

function computeAssetParameters(assetHistoryMap, symbols) {
  const prices = symbols.map(symbol => new Map(
    (assetHistoryMap[symbol] || [])
      .filter(bar => /^\d{4}-\d{2}-\d{2}$/.test(bar.datetime) && Number.isFinite(bar.close) && bar.close > 0)
      .map(bar => [bar.datetime, bar.close])
  ));
  const dates = [...prices[0].keys()].filter(date => prices.every(series => series.has(date))).sort();
  if (dates.length < 15) return null;

  const sampleCount = dates.length - 1;
  const deviations = prices.map(series => {
    const returns = dates.slice(1).map((date, index) => Math.log(series.get(date)) - Math.log(series.get(dates[index])));
    const mean = returns.reduce((sum, value) => sum + value, 0) / sampleCount;
    return { mean, centered: returns.map(value => value - mean) };
  });

  const norms = deviations.map(({ centered }) => Math.hypot(...centered));
  const volatilities = norms.map(norm => norm * Math.sqrt(252 / (sampleCount - 1)));
  // The GBM integrator subtracts half the variance from the price drift.
  const expectedReturns = deviations.map(({ mean }, i) => mean * 252 + volatilities[i] ** 2 / 2);
  const correlationMatrix = deviations.map(({ centered }, i) => deviations.map((other, j) => {
    if (i === j) return 1;
    if (norms[i] === 0 || norms[j] === 0) return 0;
    const crossProduct = centered.reduce((sum, value, k) => sum + value * other.centered[k], 0);
    return Math.max(-1, Math.min(1, crossProduct / (norms[i] * norms[j])));
  }));

  return { expectedReturns, volatilities, correlationMatrix, sampleCount, from: dates[0], to: dates.at(-1) };
}

module.exports = {
  PRESETS,
  runCppQuantEngine,
  runJsMonteCarloBenchmark,
  computeAssetParameters,
  isPositiveSemidefinite
};
