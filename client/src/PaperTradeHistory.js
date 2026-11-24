import React, { useEffect, useState } from 'react';
import axios from './apiClient';
import { API_URL } from './apiConfig';
import { formatPrice, getCurrencySymbol } from './utils/currency';

export default function PaperTradeHistory({ refresh }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState([null]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cursor = pages.at(-1);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    axios.get(`${API_URL}/api/paper-history`, {
      params: { limit: 10, ...(cursor ? { cursor } : {}) },
      signal: controller.signal,
      timeout: 15000
    }).then(({ data }) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Paper trades are unavailable. Try again.');
    });
    return () => controller.abort();
  }, [cursor, open, refresh, retry]);

  return (
    <details className="paper-history" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Paper trade history</summary>
      {open && (
        <>
          {error ? <p role="status">{error} <button className="btn btn-secondary btn-sm" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
            : !result ? <p role="status">Loading paper trades…</p>
            : result.trades.length === 0 ? <p>No settled paper trades yet.</p>
            : (
              <div className="terminal-table-container">
                <table className="terminal-table" aria-label="Paper trade receipts">
                  <thead><tr><th>Trade</th><th className="num-col">Fill</th><th className="num-col">Cash movement</th></tr></thead>
                  <tbody>
                    {result.trades.map(trade => (
                      <tr key={trade.id}>
                        <td>
                          <strong>{trade.side === 'buy' ? 'Buy' : 'Sell'} {trade.quantity} {trade.symbol}</strong>
                          <small className="receipt-detail">{new Date(trade.filledAt).toLocaleString()}</small>
                        </td>
                        <td className="num-col">
                          {getCurrencySymbol(trade.currency)}{formatPrice(trade.executedPrice, trade.currency)}
                          {(trade.quoteSource || trade.quoteTimestamp) && (
                            <small className="receipt-detail">
                              {[trade.quoteSource, trade.quoteTimestamp && new Date(trade.quoteTimestamp).toLocaleString()].filter(Boolean).join(' · ')}
                            </small>
                          )}
                        </td>
                        <td className="num-col">
                          {trade.side === 'buy' ? '−' : '+'}${formatPrice(trade.usdAmount, 'USD')}
                          {trade.currency !== 'USD' && trade.fxRate && (
                            <small className="receipt-detail">
                              1 USD = {formatPrice(trade.fxRate, trade.currency, { maxDecimals: 6 })} {trade.currency}
                              {trade.fxSource && ` · ${trade.fxSource}`}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {(pages.length > 1 || result?.nextCursor) && (
            <div className="paper-history-pagination">
              <button className="btn btn-secondary btn-sm" disabled={pages.length === 1} onClick={() => setPages(previous => previous.slice(0, -1))}>Newer trades</button>
              <button className="btn btn-secondary btn-sm" disabled={!result?.nextCursor} onClick={() => {
                setPages(previous => [...previous, result.nextCursor]);
                setResult(null);
              }}>Older trades</button>
            </div>
          )}
        </>
      )}
    </details>
  );
}
