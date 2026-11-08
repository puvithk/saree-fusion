import { useEffect, useState } from 'react';
import { adminFetch } from './api.js';

const fmtBytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const SERIES = [['batches', '#8b7bff'], ['orders', '#34d3b6'], ['signups', '#f5b84b']];

function Chart({ data }) {
  const W = 720, H = 220, P = 28;
  const max = Math.max(1, ...data.flatMap((d) => SERIES.map(([k]) => d[k])));
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, data.length - 1);
  const y = (v) => H - P - (v / max) * (H - P * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ad-chart" role="img" aria-label="Last 30 days activity">
      {[0, 0.5, 1].map((t) => (
        <g key={t}><line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.08)" />
          <text x={4} y={y(max * t) + 4} fill="#8a90a8" fontSize="10">{Math.round(max * t)}</text></g>
      ))}
      {SERIES.map(([k, c]) => (
        <polyline key={k} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"
          points={data.map((d, i) => `${x(i)},${y(d[k])}`).join(' ')} />
      ))}
      <text x={P} y={H - 6} fill="#8a90a8" fontSize="10">{data[0]?.date}</text>
      <text x={W - P} y={H - 6} fill="#8a90a8" fontSize="10" textAnchor="end">{data.at(-1)?.date}</text>
    </svg>
  );
}

export default function Overview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { adminFetch('/overview').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="ad-error">{err}</div>;
  if (!d) return <div className="ad-muted">Loading overview…</div>;
  const t = d.totals;
  const cards = [
    ['Total users', t.users], ['Active (7d)', t.activeUsers7d], ['Suspended', t.suspended],
    ['Design batches', t.batches], ['Orders', t.orders], ['Simulations', t.simulations],
    ['DB-stored files', fmtBytes(t.storageBytes)],
  ];
  return (
    <>
      <h1 className="ad-h1">Executive Overview</h1>
      <section className="ad-cards">
        {cards.map(([l, v]) => <div key={l} className="ad-glass ad-card"><div className="ad-muted small">{l}</div><div className="ad-num">{v}</div></div>)}
      </section>
      <section className="ad-glass ad-panel">
        <div className="ad-panel-h"><h2>Last 30 days</h2>
          <div className="ad-legend">{SERIES.map(([k, c]) => <span key={k}><b style={{ background: c }} />{k}</span>)}</div></div>
        <Chart data={d.series} />
      </section>
      <section className="ad-glass ad-panel">
        <h2>Recent activity</h2>
        <ul className="ad-feed">
          {d.recent.map((r) => (
            <li key={r.kind + r.id}><span className={`ad-pill ${r.kind}`}>{r.kind}</span>
              <span>{r.id}</span><span className="ad-muted">{r.email || 'unowned'}</span>
              <span className="ad-muted small">{new Date(r.at).toLocaleString()}</span></li>
          ))}
          {!d.recent.length && <li className="ad-muted">Nothing yet.</li>}
        </ul>
      </section>
    </>
  );
}
