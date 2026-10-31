import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiCpu, FiCheck, FiBookmark, FiExternalLink } from 'react-icons/fi';
import ImageViewer from '../components/ImageViewer';
import { API_BASE_URL } from '../config';
import { withAbsoluteUrls } from '../utils/generateBatch';
import './ResultPage.css';

// Printable tech-pack in a new window (the browser's Save as PDF does the rest)
function openTechPack(batch, design) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const comps = ['pallu', 'border', 'body'].map((k) => `
    <div class="comp"><h4>${k}</h4>${(batch.uploadedComponents?.[k] || []).map((c) =>
      `<figure><img src="${esc(c.image?.startsWith('/api/') ? API_BASE_URL + c.image : c.image)}"><figcaption>${esc(c.label)}</figcaption></figure>`).join('')}</div>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tech-Pack ${esc(batch.id)}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;color:#1a1a2e;margin:32px}
      h1{margin:0 0 4px;font-size:24px} .muted{color:#666;font-size:13px}
      table{border-collapse:collapse;margin:20px 0;width:100%;font-size:13px}
      td{border:1px solid #ddd;padding:8px 10px} td:first-child{background:#f6f6f6;font-weight:600;width:200px}
      h3{margin:28px 0 10px;font-size:15px;text-transform:uppercase;letter-spacing:.5px}
      .wear{max-height:520px;max-width:100%;display:block;margin:auto}
      .tpl{width:100%;display:block;border:1px solid #ddd}
      .comps{display:flex;gap:24px;flex-wrap:wrap} .comp h4{margin:0 0 6px;text-transform:capitalize}
      figure{display:inline-block;margin:0 8px 0 0;text-align:center;font-size:11px}
      figure img{width:80px;height:80px;object-fit:cover;border:1px solid #ddd;border-radius:6px}
      .page{page-break-before:always}
      @media print{body{margin:12mm}}
    </style></head><body>
    <h1>${esc(design.name)}</h1>
    <div class="muted">SareeFusion tech-pack · ${esc(batch.id)} · ${esc(batch.createdOn)}</div>
    <table>
      <tr><td>Batch ID</td><td>${esc(batch.id)}</td></tr>
      <tr><td>Design ID</td><td>${esc(design.id)}</td></tr>
      <tr><td>Generation engine</td><td>${esc(design.engine || batch.engine)}</td></tr>
      <tr><td>Components used</td><td>Pallu ${esc(batch.palluCount)} · Border ${esc(batch.borderCount)} · Body ${esc(batch.bodyCount)}</td></tr>
      <tr><td>Border construction</td><td>Continuous warp borders, top and bottom, through body, pallu and blouse piece</td></tr>
      ${batch.description ? `<tr><td>Brief</td><td>${esc(batch.description)}</td></tr>` : ''}
    </table>
    <h3>Component swatches</h3><div class="comps">${comps}</div>
    <h3>Output 2 · Flat handloom template</h3><img class="tpl" src="${esc(design.templateImage)}">
    <div class="page"></div>
    <h3>Output 1 · Mannequin drape</h3><img class="wear" src="${esc(design.image)}">
    <script>Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})))
      .then(()=>setTimeout(()=>print(),200))<\/script>
    </body></html>`);
  w.document.close();
  return true;
}

export default function ResultPage() {
  const { batchId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(state?.batch?.id === batchId ? state.batch : null);
  const [error, setError] = useState('');
  const [order, setOrder] = useState({ status: 'idle' }); // idle | working | done | error
  const [notice, setNotice] = useState('');

  // Always confirm against the database: it is the source of truth
  useEffect(() => {
    let stale = false;
    fetch(`${API_BASE_URL}/api/batches/${encodeURIComponent(batchId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('This batch could not be found.'))))
      .then((data) => { if (!stale) setBatch(withAbsoluteUrls(data)); })
      .catch((err) => { if (!stale) setError(err.message); });
    return () => { stale = true; };
  }, [batchId]);

  const design = batch?.designs?.[0];

  const orderLoomFiles = async () => {
    setOrder({ status: 'working' });
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id, designId: design.id }),
      });
      if (!res.ok) throw new Error('Could not place the order');
      const placed = await res.json();
      const gen = await fetch(`${API_BASE_URL}/api/orders/${placed.id}/generate-jacquard`, { method: 'POST' });
      const data = await gen.json().catch(() => ({}));
      if (!gen.ok) throw new Error(data.error || 'Loom file generation failed');
      setOrder({
        status: 'done',
        id: placed.id,
        files: [
          { label: 'Jacquard card (.bmp)', url: data.jacquardCardUrl },
          { label: 'Card punch matrix (.txt)', url: data.jacquardTxtUrl },
        ].filter((f) => f.url).map((f) => ({ ...f, url: `${API_BASE_URL}${f.url}` })),
      });
    } catch (err) {
      setOrder({ status: 'error', message: err.message });
    }
  };

  if (error) {
    return (
      <div className="rp-page">
        <div className="rp-container rp-center">
          <p>{error}</p>
          <Link to="/collections" className="rp-btn">Go to Collections</Link>
        </div>
      </div>
    );
  }

  if (!batch || !design) {
    return (
      <div className="rp-page">
        <div className="rp-container">
          <div className="rp-skeleton rp-skeleton-head" />
          <div className="rp-grid">
            <div className="rp-skeleton" />
            <div className="rp-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rp-page">
      <div className="rp-container">
        <header className="rp-header">
          <div>
            <button type="button" className="rp-back" onClick={() => navigate('/simulation')}>
              <FiArrowLeft /> Back to studio
            </button>
            <h1 className="rp-title">{design.name}</h1>
            <p className="rp-meta">
              <span className="rp-saved"><FiCheck /> Saved</span>
              #{batch.id} · {batch.createdOn} · {design.engine || batch.engine}
            </p>
          </div>

          <div className="rp-actions">
            <button type="button" className="rp-btn ghost"
              onClick={() => { if (!openTechPack(batch, design)) setNotice('Allow pop-ups to download the tech-pack.'); }}>
              <FiDownload /> Download Tech-Pack
            </button>
            <button type="button" className="rp-btn ghost" onClick={orderLoomFiles}
              disabled={order.status === 'working' || order.status === 'done'}>
              <FiCpu /> {order.status === 'working' ? 'Generating loom files…'
                : order.status === 'done' ? 'Loom files ready' : 'Order Loom Files'}
            </button>
            <Link to="/collections" className="rp-btn">
              <FiBookmark /> Save to Collections
            </Link>
          </div>
        </header>

        {notice && <p className="rp-notice">{notice}</p>}
        {order.status === 'error' && <p className="rp-notice error">{order.message}</p>}
        {order.status === 'done' && (
          <div className="rp-loom-files">
            <strong>Order {order.id}</strong>
            {order.files.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" download>
                <FiDownload /> {f.label}
              </a>
            ))}
            <Link to="/weaver">Weaver dashboard <FiExternalLink /></Link>
          </div>
        )}

        <div className="rp-grid">
          <section className="rp-card rp-card-drape">
            <div className="rp-card-head">
              <span className="rp-tag">Output 1</span>
              <h2>Mannequin Drape</h2>
            </div>
            <div className="rp-drape-frame">
              <img src={design.image} alt="Saree draped on a studio mannequin" />
            </div>
          </section>

          <section className="rp-card rp-card-template">
            <div className="rp-card-head">
              <span className="rp-tag">Output 2</span>
              <h2>Flat Handloom Template</h2>
              <span className="rp-card-note">Continuous top &amp; bottom borders · pallu woven between them</span>
            </div>
            <ImageViewer src={design.templateImage} alt="Flat handloom template" height="auto" className="rp-viewer" />
          </section>
        </div>
      </div>
    </div>
  );
}
