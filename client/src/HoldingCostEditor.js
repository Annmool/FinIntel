import React, { useEffect, useRef, useState } from 'react';
import axios from './apiClient';
import { API_URL } from './apiConfig';
import { formatPrice, getCurrencySymbol } from './utils/currency';

export default function HoldingCostEditor({ holding, onSaved, onConflict, onClose }) {
  const [price, setPrice] = useState(String(holding.entryPrice));
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const currency = holding.nativeCurrency;
  const entered = Number(price);
  const canSave = !saving && !conflict && Number.isFinite(entered) && entered > 0 && entered !== holding.entryPrice;

  useEffect(() => () => request.current?.abort(), []);

  async function save(event) {
    event.preventDefault();
    if (!canSave || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError('');
    try {
      const { data } = await axios.patch(`${API_URL}/api/portfolio/${holding._id}/cost`, {
        price: entered, revision: holding.costRevision ?? 0
      }, { signal: controller.signal, timeout: 15000 });
      if (!controller.signal.aborted) onSaved(data);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.response?.status === 409) {
        setConflict(true);
        onConflict();
      }
      setError(error.response?.data?.error || 'Could not save the purchase price.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const formatCost = amount => `${getCurrencySymbol(currency)}${formatPrice(amount, currency)}`;
  return (
    <div className="order-modal-backdrop">
      <form className="order-modal-card" role="dialog" aria-modal="true" aria-labelledby="holding-cost-title" onSubmit={save}
        onKeyDown={event => { if (event.key === 'Escape' && !saving) onClose(); }}>
        <div className="order-modal-header">
          <h2 className="panel-title" id="holding-cost-title">Edit {holding.symbol} purchase price</h2>
        </div>
        <div className="order-modal-body">
          <div className="order-input-group">
            <label className="order-input-label" htmlFor="corrected-price">Purchase price per share ({currency})</label>
            <div className="order-qty-row">
              <input className="order-number-input font-mono" id="corrected-price" type="number" step="any" required autoFocus
                value={price} onChange={event => setPrice(event.target.value)} disabled={saving || conflict} />
            </div>
          </div>
          {holding.costCorrections?.length > 0 && (
            <details className="cost-corrections">
              <summary>Price corrections</summary>
              <ul>{[...holding.costCorrections].reverse().map((change, index) => (
                <li key={index}>{formatCost(change.previousPrice)} → {formatCost(change.price)} · {new Date(change.correctedAt).toLocaleString()}</li>
              ))}</ul>
            </details>
          )}
          {error && <p className="order-validation-msg neg" role="alert">{error}</p>}
        </div>
        <div className="order-modal-footer">
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>{conflict ? 'Close' : 'Cancel'}</button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>{saving ? 'Saving…' : 'Save price'}</button>
        </div>
      </form>
    </div>
  );
}
