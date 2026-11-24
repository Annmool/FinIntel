import { Activity, ArrowLeft, BarChart2, BookOpen, Cpu, Globe, ShieldAlert } from 'lucide-react';
import './Academy.css';

const resources = [
  ['Indian securities market basics', 'SEBI Investor', 'Start with shares, ETFs, corporate actions, and investor protection.', 'https://investor.sebi.gov.in/iematerial.html'],
  ['Asset allocation and diversification', 'Investor.gov', 'Learn how portfolio weights drift and what rebalancing changes.', 'https://www.investor.gov/additional-resources/general-resources/publications-research/info-sheets/beginners-guide-asset'],
  ['Currency risk in international investing', 'Investor.gov', 'See how exchange-rate changes affect returns on foreign holdings.', 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/international-investing'],
  ['Monte Carlo simulation models', 'Portfolio Visualizer', 'Explore historical, statistical, and assumed-return approaches.', 'https://portfoliovisualizer.com/monte-carlo-simulation'],
  ['Value at Risk and Expected Shortfall', 'Bank for International Settlements', 'Read the formal market-risk definitions.', 'https://www.bis.org/committees/bcbs/basel-framework/standard/mar/10/inforce/2022-01-01/published/2019-12-15'],
  ['Relative Strength Index', 'Fidelity Learning Center', 'Learn how RSI is calculated and why extremes can persist.', 'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/rsi']
];

function Lesson({ title, icon: Icon, children }) {
  return (
    <section className="terminal-panel academy-lesson">
      <h2 className="panel-title"><Icon size={17} aria-hidden="true" />{title}</h2>
      {children}
    </section>
  );
}

export default function Academy({ onClose }) {
  return (
    <div className="academy">
      <button type="button" onClick={onClose} className="btn btn-ghost">
        <ArrowLeft size={16} aria-hidden="true" /> Back to Overview
      </button>

      <header className="terminal-panel academy-intro">
        <h1 className="panel-title"><BookOpen size={20} aria-hidden="true" /> Methodology &amp; Reference</h1>
        <p>Learn how FinIntel values cross-currency holdings, tests scenarios, and estimates portfolio risk.</p>
      </header>

      <div className="academy-grid">
        <Lesson title="Portfolio value and currency conversion" icon={Globe}>
          <p><strong>USD/INR</strong> is the number of rupees per US dollar. To convert USD to INR, multiply by the rate. To convert INR to USD, divide by it.</p>
          <p><strong>Example.</strong> At ₹90 per dollar, a ₹9,000 position is worth $100. If the rate rises to ₹99 per dollar and the position stays at ₹9,000, its USD value falls to $90.91. In INR view, a $100 position rises from ₹9,000 to ₹9,900 over the same FX move.</p>
          <p>When you record a real holding, enter the price you paid per share in the listed currency. Cost basis uses quantity × purchase price. Current value uses quantity × closing price. The dashboard converts both at its display FX rates, so converted unrealized P&amp;L does not preserve the exchange rate at the original purchase.</p>
        </Lesson>

        <Lesson title="Portfolio stress test" icon={Activity}>
          <p>Start with recent closing prices and provider exchange rates. Apply your price shocks to USD- and INR-priced stocks, then value the same shares using the shocked USD/INR rate. The scenario excludes cash and leaves other stock prices and exchange rates against USD fixed.</p>
          <p><strong>Try it in Overview.</strong> Set both stock shocks to 0% and USD/INR to +5% to isolate currency risk. Next set INR-priced stocks to −15%. At a baseline of ₹90 per dollar, the ₹9,000 position goes from $100 to $80.95 after both shocks.</p>
          <p>Each holding’s impact is its stressed value minus its starting value. The largest impacts are ranked by size in either direction. The result describes the scenario you entered. It gives no probability for that scenario.</p>
        </Lesson>

        <Lesson title="Monte Carlo and Quant Lab" icon={Cpu}>
          <p>Quant Lab samples many possible price paths over a chosen number of trading days. Geometric Brownian Motion (GBM) uses expected return, volatility, and correlated random shocks at each step.</p>
          <code>S(t+Δt) = S(t) × exp[(μ − ½σ²)Δt + σ√Δt × Z]</code>
          <p>Here μ is annualized price drift, σ is annualized volatility, and Z is a standard normal shock. Cholesky decomposition combines shocks across assets using the input correlation matrix.</p>
          <p>Custom historical cloud runs align adjusted closing prices and FX by date in USD and require at least 15 common observations. Presets and browser runs can use fixed assumptions. Check the run’s assumptions and history window before comparing results. Constant volatility and correlation can miss jumps or changes in market behavior.</p>
        </Lesson>

        <Lesson title="VaR, expected shortfall, and drawdown" icon={ShieldAlert}>
          <p><strong>95% Value at Risk (VaR)</strong> is a modeled loss threshold for the selected horizon. Roughly 5% of modeled outcomes fall beyond that threshold.</p>
          <p><strong>95% CVaR</strong>, also called expected shortfall, estimates the average loss in that worst 5%. For example, a 30-day VaR of $500 and CVaR of $800 mean the modeled cutoff is $500 and the average loss in that tail is about $800. Losses can exceed both.</p>
          <p><strong>Maximum drawdown</strong> measures the largest percentage fall from an earlier peak along a path. A portfolio can finish near its starting value after experiencing a large drawdown along the way.</p>
        </Lesson>

        <Lesson title="Allocation, diversification, and Sharpe ratio" icon={Activity}>
          <p>A holding’s weight is its value divided by total portfolio value, with holdings converted to a common currency. Correlation helps explain how assets move together. Several stocks can still give you concentrated exposure when they respond to the same events.</p>
          <code>Portfolio variance = wᵀΣw</code>
          <p>Here w is the vector of weights and Σ is the return covariance matrix. Quant Lab evaluates candidate allocations to approximate the efficient frontier. The highest sampled Sharpe ratio reflects excess modeled return over the risk-free rate per unit of volatility. Results can change materially when you change the inputs.</p>
        </Lesson>

        <Lesson title="Charts, screener, and paper fills" icon={BarChart2}>
          <p><strong>RSI (14)</strong> summarizes recent gains and losses on a 0–100 scale. FinIntel’s stock panel labels readings below 35 as oversold and above 65 as overbought. A 20-period moving average smooths recent closes. Both describe recent prices.</p>
          <p><strong>Screener rows</strong> can be marked as sample or last available data when the feed is limited. Check the source and date before interpreting a ranking.</p>
          <p><strong>Paper trades</strong> settle against virtual cash using a recent provider quote and provider FX when needed. The order ticket shows an estimate. The fill reflects the server quote available at execution.</p>
        </Lesson>
      </div>

      <section className="terminal-panel academy-resources" aria-labelledby="academy-resources-title">
        <h2 id="academy-resources-title" className="panel-title"><BookOpen size={17} aria-hidden="true" /> Learning resources</h2>
        <ul>
          {resources.map(([title, source, description, href]) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">{title}</a>
              <p>{source} · {description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
