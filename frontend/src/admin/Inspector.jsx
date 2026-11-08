import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from './api.js';

function List({ items }) {
  if (!items?.length) return <div className="ad-muted small">None</div>;
  return <ul className="ad-feed">{items.map((t, i) => <li key={i}>{t || 'Untitled'}</li>)}</ul>;
}

export default function Inspector({ user, onClose }) {
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(null);
  const [tab, setTab] = useState('input');
  const [view, setView] = useState('batches');

  // Newest first, then roll up per calendar day.
  const batches = useMemo(() => [...(rec?.batches || [])].sort((a, b) => b._createdAt.localeCompare(a._createdAt)), [rec]);
  const daily = useMemo(() => {
    const m = new Map();
    for (const b of batches) {
      const day = new Date(b._createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const r = m.get(day) || { day, batches: 0, uploaded: 0, generated: 0 };
      r.batches += 1; r.uploaded += b.uploaded || 0; r.generated += b.generated || 0;
      m.set(day, r);
    }
    return [...m.values()];
  }, [batches]);
  const total = daily.reduce((t, r) => ({ batches: t.batches + r.batches, uploaded: t.uploaded + r.uploaded, generated: t.generated + r.generated }), { batches: 0, uploaded: 0, generated: 0 });

  useEffect(() => {
    adminFetch(`/users/${user.id}/records`).then((d) => { setRec(d); setPick([...d.batches].sort((a, b) => b._createdAt.localeCompare(a._createdAt))[0] || null); }).catch((e) => setErr(e.message));
  }, [user.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const comps = pick?.inputs || {};
  const orders = (rec?.orders || []).filter((o) => pick && o.batchId === pick.id);

  return (
    <div className="ad-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ad-glass ad-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ad-panel-h"><h2>{user.name || user.email}<small className="ad-muted"> · {user.email}</small></h2>
          <button className="ad-btn" onClick={onClose}>Close</button></div>
        {err && <div className="ad-error">{err}</div>}
        <div className="ad-tabs ad-view">
          <button className={view === 'batches' ? 'on' : ''} onClick={() => setView('batches')}>Batches</button>
          <button className={view === 'daily' ? 'on' : ''} onClick={() => setView('daily')}>Daily summary</button>
        </div>
        {rec && view === 'daily' && (
          <div className="ad-table" style={{ marginTop: '.8rem' }}>
            <div className="ad-tr head ad-tr4"><span>Date</span><span>Batches</span><span>Images uploaded</span><span>Images generated</span></div>
            {daily.map((r) => (
              <div className="ad-tr ad-tr4" key={r.day}>
                <span data-l="Date">{r.day}</span><span data-l="Batches">{r.batches}</span>
                <span data-l="Uploaded">{r.uploaded}</span><span data-l="Generated">{r.generated}</span>
              </div>))}
            <div className="ad-tr ad-tr4"><b>Total</b><b>{total.batches}</b><b>{total.uploaded}</b><b>{total.generated}</b></div>
            {!daily.length && <div className="ad-muted ad-pad">No activity yet.</div>}
          </div>
        )}
        {!rec ? <div className="ad-muted">Loading…</div> : view === 'batches' && (
          <div className="ad-insp">
            <div className="ad-insp-list">
              <div className="ad-muted small">{rec.batches.length} batches · {rec.orders.length} orders</div>
              {batches.map((b) => (
                <button key={b.id} className={`ad-item ${pick?.id === b.id ? 'on' : ''}`} onClick={() => setPick(b)}>
                  <b>{b.name || b.id}</b><small>{new Date(b._createdAt).toLocaleString()} · {b.uploaded} in / {b.generated} out</small>
                </button>))}
              {!rec.batches.length && <div className="ad-muted">No batches.</div>}
            </div>
            {pick && (
              <div className="ad-insp-detail">
                <div className="ad-tabs">
                  <button className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>Input</button>
                  <button className={tab === 'output' ? 'on' : ''} onClick={() => setTab('output')}>Output</button>
                </div>
                <div className="ad-split">
                  <section className={tab === 'input' ? 'show' : ''}>
                    <h3>Input</h3>
                    <p className="ad-prompt">{pick.description || <span className="ad-muted">No description</span>}</p>
                    {['pallu', 'border', 'body'].map((k) => (<div key={k}><div className="ad-muted small cap">{k} ({comps[k]?.length || 0})</div><List items={comps[k]} /></div>))}
                  </section>
                  <section className={tab === 'output' ? 'show' : ''}>
                    <h3>Output <small className="ad-muted">{pick.engine}</small></h3>
                    <div className="ad-num">{pick.designs?.length || 0}<small className="ad-muted"> designs generated</small></div>
                    <List items={(pick.designs || []).map((d) => `${d.name || 'Design'}${d.matchPercent ? ' · ' + d.matchPercent : ''}`)} />
                    {orders.length > 0 && <><h3>Orders</h3>
                      <ul className="ad-feed">{orders.map((o) => <li key={o.id}><span>{o.id}</span><span className="ad-pill">{o.status}</span><span className="ad-muted">{o.customerName} ×{o.quantity}</span></li>)}</ul></>}
                  </section>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
