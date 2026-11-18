import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import axios from './apiClient';
import { API_URL } from './apiConfig';
import { formatPrice, getCurrencySymbol } from './utils/currency';
import './MetalsPanel.css';

export default function MetalsPanel({ currency, fxRates }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const { data } = await axios.get(`${API_URL}/api/metals`, { signal: controller.signal, timeout: 15000 });
        if (!Array.isArray(data?.quotes)) throw new Error('Invalid metal data');
        if (!controller.signal.aborted) {
          setQuotes(data.quotes);
          setFailed(false);
        }
      } catch (_) {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [revision]);

  return (
    <section className="terminal-panel dashboard-span-12 metals-panel" aria-labelledby="metals-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="metals-heading">Gold &amp; silver</h2>
          <p className="panel-subtitle">USD per troy ounce · 1 troy ounce ≈ 31.1035 grams</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Refresh metals"
          disabled={loading} onClick={() => setRevision(value => value + 1)}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="metals-grid" aria-busy={loading}>
        {[['XAU', 'Gold'], ['XAG', 'Silver']].map(([symbol, name]) => {
          const quote = quotes.find(item => item.symbol === symbol);
          const available = Number.isFinite(quote?.price) && quote.price > 0;
          const age = Date.now() - Date.parse(quote?.updatedAt);
          const stale = failed || quote?.cached || !Number.isFinite(age) || age > 15 * 60000;
          const rate = currency === 'USD' ? 1 : fxRates[currency];
          return (
            <article className="metal-quote" key={symbol}>
              <h3>{name} <span className="panel-subtitle">{symbol}</span></h3>
              <div className="metal-price font-mono">{available ? `$${formatPrice(quote.price, 'USD')}` : loading ? 'Loading…' : 'Unavailable'}</div>
              {available && (
                <p>{Number.isFinite(rate) && rate > 0
                  ? `≈ ${getCurrencySymbol(currency)}${formatPrice(quote.price * rate / 31.1034768, currency)} / gram${currency === 'USD' ? '' : ' · FX-converted'}`
                  : `${currency} per gram unavailable · waiting for exchange rate`}
                </p>
              )}
              {available && <>
                <p>{quote.kind} · {quote.source}</p>
                <p>{stale ? 'Last available' : 'Provider updated'} · {new Date(quote.updatedAt).toLocaleString()}</p>
              </>}
            </article>
          );
        })}
      </div>
      <p className="panel-subtitle">{failed ? 'Refresh unavailable. Displaying any previously received quotes. ' : ''}
        Prices exclude retail premiums, taxes, and making charges. Futures references are labeled when the spot feed is unavailable.
      </p>
    </section>
  );
}
