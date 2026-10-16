import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Cpu,
  Zap,
  TrendingUp,
  ShieldAlert,
  PieChart,
  Activity,
  Gauge,
  Sliders,
  Layers,
  ArrowRight,
  X,
  Target
} from 'lucide-react';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://finintel-qj46.onrender.com' : 'http://localhost:5000';

export default function QuantLab({ onClose, userPortfolio = [], paperPortfolio = [] }) {
  const [presets, setPresets] = useState({});
  const [selectedPreset, setSelectedPreset] = useState('tech-titans');
  const [symbols, setSymbols] = useState(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']);
  const [weights, setWeights] = useState([0.25, 0.25, 0.20, 0.15, 0.15]);
  const [numSimulations, setNumSimulations] = useState(50000);
  const [timeHorizonDays, setTimeHorizonDays] = useState(90);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskFreeRate, setRiskFreeRate] = useState(0.045);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('trajectories'); // 'trajectories' | 'frontier' | 'distribution'

  const canvasRef = useRef(null);
  const frontierCanvasRef = useRef(null);

  // Fetch presets on mount
  useEffect(() => {
    axios.get(`${API_URL}/api/quant/presets`)
      .then(res => {
        setPresets(res.data);
      })
      .catch(() => {});
  }, []);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Normalize weights before submitting
      const sum = weights.reduce((a, b) => a + b, 0);
      const normalizedWeights = sum > 0 ? weights.map(w => w / sum) : symbols.map(() => 1 / symbols.length);

      const payload = {
        symbols,
        weights: normalizedWeights,
        numSimulations,
        timeHorizonDays,
        initialPortfolioValue: initialCapital,
        riskFreeRate
      };

      const res = await axios.post(`${API_URL}/api/quant/simulate`, payload);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Simulation failed. Check console or parameters.');
    } finally {
      setLoading(false);
    }
  }, [symbols, weights, numSimulations, timeHorizonDays, initialCapital, riskFreeRate]);

  const handleSelectPreset = (key) => {
    setSelectedPreset(key);
    if (presets[key]) {
      setSymbols([...presets[key].symbols]);
      setWeights([...presets[key].weights]);
    }
  };

  const handleLoadUserPortfolio = (portfolioList, name) => {
    if (!portfolioList || portfolioList.length === 0) {
      setError(`Your ${name} is empty. Add holdings first or use a Preset.`);
      return;
    }
    const cleanSyms = portfolioList.map(p => p.symbol);
    const totalQtyVal = portfolioList.reduce((acc, p) => acc + (p.qty * (p.price || 100)), 0);
    const computedWeights = portfolioList.map(p => {
      const val = p.qty * (p.price || 100);
      return totalQtyVal > 0 ? Number((val / totalQtyVal).toFixed(4)) : Number((1 / cleanSyms.length).toFixed(4));
    });

    setSelectedPreset('custom');
    setSymbols(cleanSyms);
    setWeights(computedWeights);
    if (totalQtyVal > 1000) {
      setInitialCapital(Math.round(totalQtyVal));
    }
    setError('');
  };

  const handleWeightChange = (index, newVal) => {
    const updated = [...weights];
    updated[index] = Math.max(0, Math.min(1, parseFloat(newVal) || 0));
    setWeights(updated);
    setSelectedPreset('custom');
  };

  const normalizeWeights = () => {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      setWeights(weights.map(w => Number((w / sum).toFixed(4))));
    }
  };

  // Run initial simulation on mount
  useEffect(() => {
    runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render Monte Carlo Fan Chart Canvas
  useEffect(() => {
    if (!result || !result.cpp || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const { trajectories, samplePaths, snapshotDays, portfolio } = result.cpp;
    if (!trajectories || !snapshotDays) return;

    const padding = { top: 30, right: 40, bottom: 40, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Find min and max values for scaling
    let minVal = Math.min(...trajectories.p5);
    let maxVal = Math.max(...trajectories.p95);
    (samplePaths || []).forEach(p => {
      minVal = Math.min(minVal, ...p);
      maxVal = Math.max(maxVal, ...p);
    });
    minVal *= 0.95;
    maxVal *= 1.05;

    const numPoints = snapshotDays.length;
    const getX = (i) => padding.left + (i / (numPoints - 1)) * chartW;
    const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

    // Background horizontal grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
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
      ctx.fillText(`$${Math.round(v).toLocaleString()}`, padding.left - 10, y + 4);
    }

    // Time horizon X labels
    ctx.textAlign = 'center';
    snapshotDays.forEach((day, i) => {
      if (i % Math.ceil(numPoints / 6) === 0 || i === numPoints - 1) {
        const x = getX(i);
        ctx.fillText(`Day ${day}`, x, height - 12);
      }
    });

    // 1. Shaded Band: 5th - 95th percentile
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
    grad90.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    grad90.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
    ctx.fillStyle = grad90;
    ctx.fill();

    // 2. Shaded Band: 25th - 75th percentile
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
    ctx.fillStyle = 'rgba(139, 92, 246, 0.22)';
    ctx.fill();

    // 3. Faint stochastic sample paths
    if (samplePaths && samplePaths.length > 0) {
      ctx.lineWidth = 1;
      samplePaths.forEach((path, idx) => {
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(148, 163, 184, 0.15)' : 'rgba(99, 102, 241, 0.18)';
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
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, initY);
    ctx.lineTo(width - padding.right, initY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Percentile Lines
    // p95 (Bullish green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trajectories.p95.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // p5 (Bearish red)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trajectories.p5.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // p50 (Median bright cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    trajectories.p50.forEach((v, i) => (i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v))));
    ctx.stroke();

    // Draw End badges
    const lastIdx = numPoints - 1;
    const lastX = getX(lastIdx);

    const drawLabel = (val, color, text) => {
      const y = getY(val);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${text}: $${Math.round(val).toLocaleString()}`, width - padding.right, y - 6);
    };

    drawLabel(trajectories.p95[lastIdx], '#10b981', 'Bull (95%)');
    drawLabel(trajectories.p50[lastIdx], '#38bdf8', 'Median (50%)');
    drawLabel(trajectories.p5[lastIdx], '#ef4444', 'Bear (5%)');

  }, [result, activeTab]);

  // Render Markowitz Efficient Frontier Canvas
  useEffect(() => {
    if (!result || !result.cpp || !result.cpp.efficientFrontier || !frontierCanvasRef.current || activeTab !== 'frontier') return;
    const canvas = frontierCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const { curve, maxSharpe, minVol } = result.cpp.efficientFrontier;
    const currentPort = result.cpp.portfolio;

    const padding = { top: 30, right: 40, bottom: 50, left: 65 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Range of Volatility (X) and Return (Y)
    let minVolX = minVol.volatility * 0.8;
    let maxVolX = Math.max(maxSharpe.volatility, currentPort.volatility) * 1.25;
    let minRetY = Math.min(0, minVol.expectedReturn, currentPort.expectedReturn) * 0.8;
    let maxRetY = Math.max(maxSharpe.expectedReturn, currentPort.expectedReturn, 0.40) * 1.2;

    const getX = (v) => padding.left + ((v - minVolX) / (maxVolX - minVolX)) * chartW;
    const getY = (r) => padding.top + chartH - ((r - minRetY) / (maxRetY - minRetY)) * chartH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
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
      ctx.fillText(`${(r * 100).toFixed(0)}%`, padding.left - 10, y + 4);
    }

    // X Axis (Volatility)
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const v = minVolX + (i / 5) * (maxVolX - minVolX);
      const x = getX(v);
      ctx.fillText(`${(v * 100).toFixed(0)}% Vol`, x, height - 16);
    }

    // Capital Allocation Line (CAL) from (0, Risk-Free Rate) tangent to Max Sharpe
    const rfX = getX(0);
    const rfY = getY(riskFreeRate);
    const msX = getX(maxSharpe.volatility);
    const msY = getY(maxSharpe.expectedReturn);

    // Extend line through max sharpe
    const slope = (msY - rfY) / (msX - rfX);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(rfX, rfY);
    ctx.lineTo(msX + 150, msY + 150 * slope);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Efficient Frontier Curve
    if (curve && curve.length > 1) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      curve.forEach((pt, i) => {
        const x = getX(pt.volatility);
        const y = getY(pt.expectedReturn);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 1. Min Volatility Point (Cyan diamond)
    const mvX = getX(minVol.volatility);
    const mvY = getY(minVol.expectedReturn);
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(mvX, mvY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText(`Min Vol (${(minVol.volatility * 100).toFixed(1)}%)`, mvX + 10, mvY - 4);

    // 2. Max Sharpe Point (Gold Star / Halo)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(msX, msY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`Max Sharpe (${maxSharpe.sharpe.toFixed(2)})`, msX + 12, msY - 4);

    // 3. Current Portfolio Point (Red Target)
    const cpX = getX(currentPort.volatility);
    const cpY = getY(currentPort.expectedReturn);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cpX, cpY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`Current (${currentPort.sharpeRatio.toFixed(2)} Sharpe)`, cpX + 12, cpY + 14);

  }, [result, activeTab, riskFreeRate]);

  return (
    <div className="quant-lab-overlay">
      <div className="quant-lab-modal">
        {/* Modal Top Bar */}
        <div className="quant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="quant-icon-badge">
              <Cpu size={24} color="#38bdf8" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700' }}>
                  FinIntel Quant Lab <span className="quant-badge-cpp">C++20 Engine</span>
                </h2>
                <div className="status-live-pill">
                  <span className="dot-pulse"></span>
                  <span>MSYS2 GCC 14.2 · OpenMP Multi-threaded</span>
                </div>
              </div>
              <p className="quant-subtitle">
                Institutional-grade Monte Carlo simulations, Value-at-Risk (VaR/CVaR), and Markowitz Mean-Variance Optimization
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close Quant Lab">
            <X size={20} />
          </button>
        </div>

        {/* Main Grid Content */}
        <div className="quant-body-grid">
          {/* Left Column: Configuration Controls */}
          <div className="quant-sidebar-panel">
            <div className="panel-section-title">
              <Layers size={16} />
              <span>Portfolio Presets</span>
            </div>

            <div className="preset-pill-list">
              {Object.entries(presets).map(([k, p]) => (
                <button
                  key={k}
                  className={`preset-pill ${selectedPreset === k ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(k)}
                >
                  <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{p.name}</div>
                  <div className="preset-symbols-badge">{p.symbols.join(', ')}</div>
                </button>
              ))}

              {userPortfolio.length > 0 && (
                <button
                  className="preset-pill user-sync"
                  onClick={() => handleLoadUserPortfolio(userPortfolio, 'Real Portfolio')}
                >
                  <Target size={14} />
                  <span>Sync Real Portfolio ({userPortfolio.length} assets)</span>
                </button>
              )}

              {paperPortfolio.length > 0 && (
                <button
                  className="preset-pill user-sync"
                  onClick={() => handleLoadUserPortfolio(paperPortfolio, 'Paper Trading Portfolio')}
                >
                  <Activity size={14} />
                  <span>Sync Paper Trades ({paperPortfolio.length} assets)</span>
                </button>
              )}
            </div>

            {/* Asset Allocation Sliders */}
            <div className="panel-section-title" style={{ marginTop: '20px' }}>
              <PieChart size={16} />
              <span>Asset Allocation Weights</span>
              <button className="btn-normalize" onClick={normalizeWeights} title="Normalize to 100%">
                Normalize
              </button>
            </div>

            <div className="asset-weight-table">
              {symbols.map((sym, idx) => (
                <div key={sym} className="weight-row">
                  <span className="asset-tag font-mono">{sym}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={weights[idx] || 0}
                    onChange={(e) => handleWeightChange(idx, e.target.value)}
                    className="weight-slider"
                  />
                  <span className="weight-pct font-mono">
                    {Math.round((weights[idx] || 0) * 100)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Simulation Parameters */}
            <div className="panel-section-title" style={{ marginTop: '20px' }}>
              <Sliders size={16} />
              <span>Execution Parameters</span>
            </div>

            <div className="param-grid">
              <div className="param-field">
                <label>Simulated Paths</label>
                <select
                  value={numSimulations}
                  onChange={(e) => setNumSimulations(parseInt(e.target.value))}
                  className="param-select font-mono"
                >
                  <option value={10000}>10,000 paths</option>
                  <option value={50000}>50,000 paths (Recommended)</option>
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
                  <option value={252}>252 Days (1 Trading Year)</option>
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
              className="btn-run-sim"
              onClick={runSimulation}
              disabled={loading}
            >
              {loading ? (
                <div className="mini-spinner-quant"></div>
              ) : (
                <>
                  <Zap size={18} fill="#ffffff" />
                  <span>Execute C++ Engine</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Visualizations & Analytics */}
          <div className="quant-results-panel">
            {error && (
              <div className="quant-error-banner">
                <ShieldAlert size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* PERFORMANCE BENCHMARK STANDOUT CARD */}
            {result && result.cpp && (
              <div className="benchmark-card">
                <div className="benchmark-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Gauge size={20} color="#38bdf8" />
                    <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                      C++ Core vs Node.js V8 Engine Benchmark
                    </span>
                  </div>
                  <span className="speedup-badge font-mono">
                    ⚡ {result.speedupFactor}x FASTER IN C++
                  </span>
                </div>

                <div className="benchmark-metrics-grid">
                  <div className="benchmark-metric-box cpp-box">
                    <span className="metric-label">C++20 OpenMP Engine</span>
                    <span className="metric-value font-mono">
                      {result.cpp.benchmark.executionTimeMs.toFixed(1)} ms
                    </span>
                    <span className="metric-sub font-mono">
                      {result.cpp.benchmark.numThreads} Threads · {(result.cpp.benchmark.throughputStepsPerSec / 1e6).toFixed(1)}M steps/sec
                    </span>
                  </div>

                  <div className="benchmark-metric-box js-box">
                    <span className="metric-label">V8 JavaScript Engine</span>
                    <span className="metric-value font-mono">
                      {result.jsBenchmark.executionTimeMs.toFixed(1)} ms
                    </span>
                    <span className="metric-sub">
                      Single-threaded · High GC overhead
                    </span>
                  </div>

                  <div className="benchmark-metric-box arch-box">
                    <span className="metric-label">Quant Systems Architecture</span>
                    <div className="arch-pill-row">
                      <span className="arch-chip">SIMD Vectorized</span>
                      <span className="arch-chip">Cholesky Correlation</span>
                      <span className="arch-chip">Zero GC Pauses</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB SELECTOR */}
            <div className="quant-tab-row">
              <button
                className={`quant-tab-btn ${activeTab === 'trajectories' ? 'active' : ''}`}
                onClick={() => setActiveTab('trajectories')}
              >
                <TrendingUp size={16} />
                <span>Monte Carlo Fan Chart</span>
              </button>
              <button
                className={`quant-tab-btn ${activeTab === 'frontier' ? 'active' : ''}`}
                onClick={() => setActiveTab('frontier')}
              >
                <Target size={16} />
                <span>Markowitz Efficient Frontier</span>
              </button>
              <button
                className={`quant-tab-btn ${activeTab === 'distribution' ? 'active' : ''}`}
                onClick={() => setActiveTab('distribution')}
              >
                <Activity size={16} />
                <span>Terminal Value Distribution</span>
              </button>
            </div>

            {/* VISUALIZATION CANVAS */}
            <div className="canvas-wrapper">
              {activeTab === 'trajectories' && (
                <div style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    width={720}
                    height={340}
                    className="quant-canvas"
                  />
                  <div className="canvas-legend">
                    <span className="legend-item"><span className="color-dot bull"></span> 95th Percentile (Bull Case)</span>
                    <span className="legend-item"><span className="color-dot median"></span> 50th Percentile (Median)</span>
                    <span className="legend-item"><span className="color-dot bear"></span> 5th Percentile (Bear Case)</span>
                    <span className="legend-item"><span className="color-dot init"></span> Initial Capital</span>
                  </div>
                </div>
              )}

              {activeTab === 'frontier' && (
                <div style={{ position: 'relative' }}>
                  <canvas
                    ref={frontierCanvasRef}
                    width={720}
                    height={340}
                    className="quant-canvas"
                  />
                  <div className="canvas-legend">
                    <span className="legend-item"><span className="color-dot gold"></span> Max Sharpe Portfolio (Tangency)</span>
                    <span className="legend-item"><span className="color-dot cyan"></span> Minimum Volatility Portfolio</span>
                    <span className="legend-item"><span className="color-dot red"></span> Current Allocation</span>
                  </div>
                </div>
              )}

              {activeTab === 'distribution' && result && result.cpp && (
                <div className="histogram-container">
                  <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Probability Density of Ending Portfolio Value at Day {timeHorizonDays} ({numSimulations.toLocaleString()} simulations):
                  </div>
                  <div className="histogram-bars-wrapper">
                    {result.cpp.histogram.counts.map((count, i) => {
                      const maxCount = Math.max(...result.cpp.histogram.counts);
                      const barH = (count / maxCount) * 100;
                      const binVal = result.cpp.histogram.bins[i];
                      const isLoss = binVal < initialCapital;
                      return (
                        <div key={i} className="hist-col" title={`$${Math.round(binVal).toLocaleString()}: ${count} paths`}>
                          <div
                            className={`hist-bar ${isLoss ? 'loss' : 'gain'}`}
                            style={{ height: `${barH}%` }}
                          ></div>
                          {i % 4 === 0 && (
                            <span className="hist-label font-mono">
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

            {/* INSTITUTIONAL RISK METRICS GRID */}
            {result && result.cpp && (
              <div className="risk-metrics-row">
                <div className="risk-card">
                  <span className="risk-title">Value-at-Risk (VaR 95%)</span>
                  <span className="risk-value font-mono danger">
                    ${Math.round(result.cpp.risk.var95_dollar).toLocaleString()}
                  </span>
                  <span className="risk-sub">
                    {result.cpp.risk.var95_percent.toFixed(1)}% max 95% confidence loss
                  </span>
                </div>

                <div className="risk-card">
                  <span className="risk-title">Conditional VaR (CVaR 95%)</span>
                  <span className="risk-value font-mono danger">
                    ${Math.round(result.cpp.risk.cvar95_dollar).toLocaleString()}
                  </span>
                  <span className="risk-sub">
                    Expected loss in worst 5% tail
                  </span>
                </div>

                <div className="risk-card">
                  <span className="risk-title">Mean Max Drawdown</span>
                  <span className="risk-value font-mono warning">
                    {result.cpp.risk.maxDrawdownMean.toFixed(1)}%
                  </span>
                  <span className="risk-sub">
                    Worst 99%: {result.cpp.risk.maxDrawdownWorst99.toFixed(1)}%
                  </span>
                </div>

                <div className="risk-card">
                  <span className="risk-title">Sharpe Ratio</span>
                  <span className="risk-value font-mono success">
                    {result.cpp.portfolio.sharpeRatio.toFixed(2)}
                  </span>
                  <span className="risk-sub">
                    Max Optimal: {result.cpp.efficientFrontier.maxSharpe.sharpe.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* OPTIMAL REBALANCING RECOMMENDATION */}
            {result && result.cpp && result.cpp.efficientFrontier && (
              <div className="rebalancing-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Target size={18} color="#fbbf24" />
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                    Markowitz Tangency Portfolio (Maximum Sharpe Allocation)
                  </span>
                </div>
                <div className="rebalance-weights-row">
                  {symbols.map((sym, i) => {
                    const currentW = (weights[i] || 0) * 100;
                    const optimalW = (result.cpp.efficientFrontier.maxSharpe.weights[i] || 0) * 100;
                    const diff = optimalW - currentW;
                    return (
                      <div key={sym} className="rebalance-chip">
                        <span className="chip-symbol font-mono">{sym}</span>
                        <span className="chip-current font-mono">{currentW.toFixed(0)}%</span>
                        <ArrowRight size={12} color="var(--text-tertiary)" />
                        <span className="chip-optimal font-mono">{optimalW.toFixed(0)}%</span>
                        <span className={`chip-diff font-mono ${diff > 0 ? 'pos' : 'neg'}`}>
                          ({diff > 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
