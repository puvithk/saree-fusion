import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { BsGrid } from 'react-icons/bs';
import { HiOutlineSparkles } from 'react-icons/hi';
import { FiCheck, FiTrash2, FiPlus, FiX, FiZoomIn, FiZoomOut, FiMaximize } from 'react-icons/fi';
import BatchCard from '../components/BatchCard';
import sareesilhouette from '../assets/saree-silhouette.png';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext.jsx';
import { loadSavedSimulations, deleteSavedSimulation } from '../utils/savedSimulations';

const FILTERS = [
  { key: 'all', label: 'All Batches', icon: <BsGrid /> },
  { key: 'generating', label: 'Generating', icon: <HiOutlineSparkles /> },
  { key: 'completed', label: 'Completed', icon: <FiCheck /> },
];

function SimulationCard({ sim, onDelete, onOpen }) {
  return (
    <article className="sim-card">
      <button type="button" className="sim-card-media" onClick={onOpen}
        aria-label={`Enlarge ${sim.name || 'saved simulation'}`}>
        <img src={sim.thumbnail} alt={sim.name || 'Saved simulation'} />
      </button>
      <div className="sim-card-body">
        <div className="sim-card-text">
          <h3 className="sim-card-title">{sim.name || 'Untitled simulation'}</h3>
          <p className="sim-card-date">{new Date(sim.savedAt).toLocaleString()}</p>
        </div>
        <div className="sim-card-actions">
          <div className="sim-swatches">
            {['body', 'border', 'pallu'].map((k) => (
              <span key={k} className="sim-swatch" title={`${k} ${sim.palette?.[k]?.color || ''}`}
                style={{ background: sim.palette?.[k]?.color }} />
            ))}
          </div>
          <button className="icon-btn" aria-label="Delete saved simulation" onClick={onDelete}>
            <FiTrash2 />
          </button>
        </div>
      </div>
    </article>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// Zoom about a point (cx, cy) measured from the stage centre, keeping that
// point fixed under the cursor; zoom 1 always re-centres the image
function zoomAbout(view, nextZoom, cx = 0, cy = 0) {
  const zoom = clampZoom(nextZoom);
  if (zoom === 1) return { zoom, x: 0, y: 0 };
  const k = zoom / view.zoom;
  return { zoom, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

const FIT = { zoom: 1, x: 0, y: 0 };

function ImageLightbox({ sim, onClose }) {
  const [view, setView] = useState(FIT);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const stageRef = useRef(null);

  const zoomBy = (factor) => setView((v) => zoomAbout(v, v.zoom * factor));
  const reset = () => setView(FIT);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setView((v) => zoomAbout(v, v.zoom * 1.25));
      else if (e.key === '-') setView((v) => zoomAbout(v, v.zoom / 1.25));
      else if (e.key === '0') setView(FIT);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Wheel zoom toward the cursor (non-passive so the page doesn't scroll)
  useEffect(() => {
    const stage = stageRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      setView((v) => zoomAbout(v, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cx, cy));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (view.zoom === 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (d) setView((v) => ({ ...v, x: e.clientX - d.x, y: e.clientY - d.y }));
  };
  const endDrag = () => { drag.current = null; setDragging(false); };
  const onDoubleClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setView((v) => (v.zoom > 1 ? FIT
      : zoomAbout(v, 2.5, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)));
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={sim.name || 'Saved simulation'} onClick={onClose}>
      <figure className="lightbox-card" onClick={(e) => e.stopPropagation()}>
        <header className="lightbox-card-head">
          <figcaption>
            <strong>{sim.name || 'Untitled simulation'}</strong>
            <span>{new Date(sim.savedAt).toLocaleString()}</span>
          </figcaption>
          <div className="lightbox-toolbar">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)} disabled={view.zoom <= MIN_ZOOM}><FiZoomOut /></button>
            <button type="button" className="lightbox-zoom-level" aria-label="Reset zoom" onClick={reset}>{Math.round(view.zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)} disabled={view.zoom >= MAX_ZOOM}><FiZoomIn /></button>
            <button type="button" aria-label="Fit to card" onClick={reset} disabled={view.zoom === 1}><FiMaximize /></button>
            <button type="button" className="lightbox-card-close" aria-label="Close" onClick={onClose}><FiX /></button>
          </div>
        </header>
        <div
          ref={stageRef}
          className={`lightbox-stage${view.zoom > 1 ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
        >
          <img
            src={sim.thumbnail}
            alt={sim.name || 'Saved simulation'}
            draggable={false}
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              transition: dragging ? 'none' : undefined,
            }}
          />
        </div>
        <p className="lightbox-hint">Scroll or double-click to zoom · drag to move · Esc to close</p>
      </figure>
    </div>
  );
}

export default function Collections() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [batchesList, setBatchesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [savedSims, setSavedSims] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let stale = false;
    loadSavedSimulations(user)
      .then((sims) => { if (!stale) setSavedSims(sims); })
      .catch((err) => console.error('Error fetching saved simulations:', err));
    return () => { stale = true; };
  }, [user]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/batches`)
      .then((res) => res.json())
      .then((data) => {
        const mappedData = data.map((b) => ({
          ...b,
          thumbnails: b.thumbnails.map((t) =>
            t.startsWith('/api/') ? `${API_BASE_URL}${t}` : t
          ),
        }));
        setBatchesList(mappedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching batches:', err);
        setLoading(false);
      });
  }, []);

  const filtered = activeFilter === 'all'
    ? batchesList
    : batchesList.filter((b) => b.status === activeFilter);
  const countFor = (key) => (key === 'all' ? batchesList.length : batchesList.filter((b) => b.status === key).length);

  return (
    <div className="collections-page">
      <div className="collections-container">
        <header className="collections-header">
          <div>
            <h1 className="page-title">
              My <span className="text-cyan">Collection</span>
            </h1>
            <p className="collections-subtitle">
              All your saree design batches and saved simulations in one place.
            </p>
            <div className="collections-stats">
              <span><strong>{batchesList.length}</strong> batches</span>
              <span><strong>{savedSims.length}</strong> simulations</span>
            </div>
          </div>
          <img src={sareesilhouette} alt="" className="collections-decor" />
        </header>

        {savedSims.length > 0 && (
          <section className="collections-section">
            <div className="section-head">
              <h2 className="section-head-title">Saved Simulations</h2>
              <span className="section-head-count">{savedSims.length}</span>
            </div>
            <div className="collections-grid sim-grid">
              {savedSims.map((sim) => (
                <SimulationCard key={sim.id} sim={sim} onOpen={() => setViewing(sim)}
                  onDelete={() => deleteSavedSimulation(user, sim.id)
                    .then(setSavedSims)
                    .catch((err) => console.error('Error deleting simulation:', err))} />
              ))}
            </div>
          </section>
        )}

        <section className="collections-section">
          <div className="section-head">
            <h2 className="section-head-title">Design Batches</h2>
            <div className="collections-filters" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={activeFilter === f.key}
                  className={`filter-tab ${activeFilter === f.key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f.key)}
                >
                  {f.icon} {f.label}
                  <span className="filter-count">{countFor(f.key)}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="collections-grid">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton-card" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="collections-empty">
              <p>No {activeFilter === 'all' ? '' : `${activeFilter} `}batches yet.</p>
              <Link to="/design" className="empty-cta"><FiPlus /> Create a design</Link>
            </div>
          ) : (
            <div className="collections-grid">
              {filtered.map((batch, i) => (
                <BatchCard key={batch.id || i} batch={batch} index={i} />
              ))}
            </div>
          )}
        </section>
      </div>

      {viewing && <ImageLightbox sim={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
