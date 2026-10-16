import React from 'react';
import { BookOpen, ArrowLeft, Activity, ShieldAlert, Cpu, BarChart2 } from 'lucide-react';

const Academy = ({ onClose }) => {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px 0' }}>
          <ArrowLeft size={16} />
          <span>Back to Overview</span>
        </button>
        <span className="term-badge neutral">Quantitative Reference & Methodology</span>
      </div>

      <div className="terminal-panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <div>
            <h1 className="panel-title" style={{ fontSize: '1.2rem' }}>
              <BookOpen size={20} color="var(--accent)" />
              Financial Engineering & Analytics Reference
            </h1>
            <span className="panel-subtitle">
              Theoretical frameworks, stochastic models, risk metrics, and terminal operation guide
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0 0 16px 0', lineHeight: '1.6' }}>
          FinIntel implements institutional financial models designed to measure risk, simulate tail events, and optimize asset allocation. Below is an overview of the core analytical principles embedded throughout the terminal.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Module 1 */}
        <div className="terminal-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '0.88rem' }}>
              <Cpu size={16} color="var(--accent)" />
              Monte Carlo Simulation & GBM
            </h3>
            <span className="term-badge neutral">Stochastic SDE</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
            Asset trajectories are modeled via <strong>Geometric Brownian Motion (GBM)</strong>:
            <br />
            <code className="font-mono" style={{ display: 'block', padding: '8px 10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-xs)', margin: '8px 0', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
              S(t+Δt) = S(t) · exp((μ - 0.5σ²)Δt + σ√Δt · Z)
            </code>
            Where <span className="font-mono">μ</span> is annualized drift, <span className="font-mono">σ</span> is volatility, and <span className="font-mono">Z</span> is a standard normal shock. Cross-asset correlation is modeled via <strong>Cholesky decomposition</strong> (<span className="font-mono">R = L·Lᵀ</span>).
          </p>
        </div>

        {/* Module 2 */}
        <div className="terminal-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '0.88rem' }}>
              <ShieldAlert size={16} color="var(--danger)" />
              Value-at-Risk (VaR) & CVaR
            </h3>
            <span className="term-badge neg">Risk Theory</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
            <strong>Value-at-Risk (VaR 95%)</strong> defines the maximum expected dollar loss at a 95% statistical confidence interval over a given holding period.
            <br /><br />
            <strong>Conditional VaR (CVaR / Expected Shortfall)</strong> measures the expected loss conditional on exceeding the VaR cutoff:
            <code className="font-mono" style={{ display: 'block', padding: '8px 10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-xs)', margin: '8px 0', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
              CVaR_α = E[ Loss | Loss ≥ VaR_α ]
            </code>
            This captures fat-tail risk as mandated under Basel III banking guidelines.
          </p>
        </div>

        {/* Module 3 */}
        <div className="terminal-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '0.88rem' }}>
              <Activity size={16} color="var(--info)" />
              Modern Portfolio Theory (MPT)
            </h3>
            <span className="term-badge neutral">Markowitz</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
            Developed by Harry Markowitz, MPT constructs the <strong>Efficient Frontier</strong> by balancing portfolio expected return <span className="font-mono">E[R_p]</span> against portfolio variance:
            <code className="font-mono" style={{ display: 'block', padding: '8px 10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-xs)', margin: '8px 0', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
              σ_p² = wᵀ Σ w
            </code>
            The <strong>Tangency Portfolio</strong> maximizes the Sharpe Ratio along the Capital Allocation Line (CAL), providing the maximum excess return per unit of volatility.
          </p>
        </div>

        {/* Module 4 */}
        <div className="terminal-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '0.88rem' }}>
              <BarChart2 size={16} color="var(--warning)" />
              Technical Indicators & RSI
            </h3>
            <span className="term-badge neutral">Technicals</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
            <strong>Relative Strength Index (RSI 14)</strong> measures the velocity of price changes on a scale from 0 to 100:
            <br />
            • <span className="font-mono" style={{ color: 'var(--success)' }}>RSI &lt; 30</span>: Oversold momentum condition.
            <br />
            • <span className="font-mono" style={{ color: 'var(--danger)' }}>RSI &gt; 70</span>: Overbought momentum condition.
            <br /><br />
            Combined with a 20-day Simple Moving Average (SMA), it tracks mean-reversion probabilities without subjective chart drawing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Academy;
