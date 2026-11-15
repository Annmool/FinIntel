import { useState } from 'react';
import { Activity } from 'lucide-react';
import { formatPrice, getCurrencySymbol } from './utils/currency';
import { calculatePortfolioStress } from './utils/portfolioStress';
import './PortfolioStress.css';

const fields = [
  ['usd', 'USD-priced stocks (%)', -100],
  ['inr', 'INR-priced stocks (%)', -100],
  ['fx', 'USD/INR (%)', -99.99]
];

export default function PortfolioStress({ holdings, marks, fxRates, currency }) {
  const [scenario, setScenario] = useState({ usd: '0', inr: '0', fx: '0' });
  const result = calculatePortfolioStress(holdings, marks, fxRates, currency, scenario);
  const money = value => `${getCurrencySymbol(currency)}${formatPrice(value, currency)}`;
  const signedMoney = value => `${value < 0 ? '−' : value > 0 ? '+' : ''}${money(Math.abs(value))}`;

  return (
    <section className="terminal-panel dashboard-span-12 portfolio-stress" aria-labelledby="portfolio-stress-title">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="portfolio-stress-title"><Activity size={17} color="var(--accent)" /> Portfolio stress test</h2>
          <p className="panel-subtitle">Apply hypothetical price and currency shocks to your tracked holdings.</p>
        </div>
      </div>

      {!holdings.length ? <p>Add a holding to see how a scenario could affect your portfolio.</p> : (
        <>
          <div className="portfolio-stress-fields">
            {fields.map(([key, label, minimum]) => (
              <label key={key}>
                {label}
                <input type="number" min={minimum} max="100" step="any" value={scenario[key]}
                  aria-describedby="portfolio-stress-assumptions"
                  onChange={event => setScenario({ ...scenario, [key]: event.target.value })} />
              </label>
            ))}
          </div>
          <p className="panel-subtitle" id="portfolio-stress-assumptions">
            A positive USD/INR shock means each dollar buys more rupees. In USD view, that lowers the converted value of rupee holdings. In INR view, it raises the converted value of dollar holdings.
            Other stock prices and their exchange rates against USD stay fixed.
            The estimate uses recent closes and provider FX, excludes cash, and assumes quantities stay fixed.
          </p>
          {result.status === 'invalid' && <p role="status">Enter stock shocks from −100% to +100% and a USD/INR shock from −99.99% to +100%.</p>}
          {result.status === 'unavailable' && <p role="status">Recent price or exchange-rate data unavailable for {result.missing.join(', ')}. A complete estimate requires all holdings.</p>}
          {result.status === 'ready' && (
            <>
              <dl className="portfolio-stress-metrics">
                <div><dt>Current value ({currency})</dt><dd>{money(result.current)}</dd></div>
                <div><dt>Stressed value</dt><dd>{money(result.stressed)}</dd></div>
                <div><dt>Estimated change</dt><dd>{signedMoney(result.change)} ({result.percent.toFixed(2)}%)</dd></div>
              </dl>
              <h3>Largest holding impacts</h3>
              <ul className="portfolio-stress-contributions">
                {result.contributions.slice(0, 3).map(item => (
                  <li key={item.symbol}><span>{item.symbol}</span><span>{signedMoney(item.change)}</span></li>
                ))}
              </ul>
              <p className="panel-subtitle">Oldest closing price {new Date(result.oldestMark).toISOString().slice(0, 10)}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
