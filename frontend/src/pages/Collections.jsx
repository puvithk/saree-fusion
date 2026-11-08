import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSearch, FiX, FiPlus, FiTrash2, FiCheckCircle, FiCpu, FiEdit3, FiFolder, FiGrid } from 'react-icons/fi';
import TiltCard from '../components/motion/TiltCard';
import QuickActionSheet from '../components/collections/QuickActionSheet';
import { deleteSavedSimulation } from '../utils/savedSimulations';
import { STATUS, groupFolders, useCollectionItems } from '../utils/collectionItems';

const STATUS_FILTERS = [{ key: 'all', label: 'All' }, ...Object.values(STATUS)];
const SOURCES = [
  { key: 'all', label: 'All sources' },
  { key: 'design', label: 'AI fusion designs' },
  { key: 'simulation', label: 'Studio simulations' },
];
const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name', label: 'Name A–Z' },
];

const STATUS_ICON = { ready: <FiCheckCircle />, compiled: <FiCpu />, draft: <FiEdit3 /> };

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};
const cardIn = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 26 } },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.15 } },
};

function ItemCard({ item, onDelete, onQuick }) {
  const { swatches } = item;
  const [showLayout, setShowLayout] = useState(false);
  // Designs have a drape photo and a separate flat layout; simulations only have the layout
  const canToggle = Boolean(item.layout && item.drape && item.layout !== item.drape);
  const shown = showLayout && item.layout ? item.layout : item.drape;
  return (
    <motion.li variants={cardIn} className="cg-cell">
      <TiltCard className="cg-card">
        <Link to={`/collections/${encodeURIComponent(item.id)}`} className="cg-link" aria-label={`Open ${item.name}`}
          onClick={(e) => {
            // On phones a tap opens the quick-action sheet instead of leaving the page
            if (window.matchMedia('(max-width: 767px)').matches) { e.preventDefault(); onQuick(item); }
          }}>
          <div className="cg-media">
            {shown
              ? <img src={shown} alt="" loading="lazy" className={showLayout ? 'is-layout' : ''} />
              : <div className="cg-media-empty">Generating…</div>}
            <span className={`status-pill status-${item.status.key}`}>
              {STATUS_ICON[item.status.key]} {item.status.label}
            </span>
          </div>
          <div className="cg-body">
            <h3 className="cg-title" title={item.name}>{item.name}</h3>
            <p className="cg-meta">
              {item.kind === 'simulation' ? 'Studio simulation' : 'AI fusion'} · {item.createdLabel || '—'}
            </p>
            <div className="cg-swatches" aria-label="Component swatches">
              {['border', 'body', 'pallu'].map((k) => {
                const sw = swatches[k];
                return (
                  <span key={k} className="cg-swatch" title={`${k}${sw?.label ? ` · ${sw.label}` : ''}`}
                    style={sw?.color ? { background: sw.color } : undefined}>
                    {sw?.image && <img src={sw.image} alt="" loading="lazy" />}
                  </span>
                );
              })}
              <span className="cg-swatch-hint">Border · Body · Pallu</span>
            </div>
          </div>
        </Link>
        {canToggle && (
          <div className="cg-viewtoggle" role="group" aria-label="Preview">
            <button type="button" className={!showLayout ? 'is-active' : ''} aria-pressed={!showLayout}
              onClick={() => setShowLayout(false)}>Drape</button>
            <button type="button" className={showLayout ? 'is-active' : ''} aria-pressed={showLayout}
              onClick={() => setShowLayout(true)}>Layout</button>
          </div>
        )}
        {onDelete && (
          <button type="button" className="cg-delete" aria-label={`Delete ${item.name}`} onClick={onDelete}>
            <FiTrash2 />
          </button>
        )}
      </TiltCard>
    </motion.li>
  );
}

function FolderCard({ folder }) {
  const covers = folder.items.map((i) => i.drape || i.layout).filter(Boolean).slice(0, 3);
  const compiled = folder.items.filter((i) => i.status.key === 'compiled').length;
  return (
    <motion.li variants={cardIn} className="cg-cell">
      <TiltCard className="cg-card cg-folder">
        <Link to={`/collections/folder/${encodeURIComponent(folder.id)}`} className="cg-link" aria-label={`Open folder ${folder.name}`}>
          <div className="cg-folder-stack">
            {covers.length === 0 && <div className="cg-media-empty">Empty</div>}
            {covers.map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" style={{ '--i': i }} />
            ))}
            <span className="cg-folder-count"><FiFolder /> {folder.items.length}</span>
          </div>
          <div className="cg-body">
            <h3 className="cg-title" title={folder.name}>{folder.name}</h3>
            <p className="cg-meta">
              {folder.kind === 'simulation' ? 'Saved layouts' : `#${folder.id}`} · {folder.items.length} {folder.items.length === 1 ? 'item' : 'items'}
              {compiled > 0 && ` · ${compiled} loom-ready`}
            </p>
          </div>
        </Link>
      </TiltCard>
    </motion.li>
  );
}

function SkeletonGrid() {
  return (
    <ul className="cg-grid" aria-busy="true" aria-label="Loading collection">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="cg-cell">
          <div className="cg-card cg-skeleton">
            <div className="cg-media shimmer" />
            <div className="cg-body">
              <div className="shimmer sk-line" style={{ width: '70%' }} />
              <div className="shimmer sk-line" style={{ width: '45%' }} />
              <div className="shimmer sk-line" style={{ width: '30%' }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Collections() {
  const { items, loading, error, reload } = useCollectionItems();
  const [params, setParams] = useSearchParams();
  const [deleted, setDeleted] = useState(() => new Set());
  const [sheetItem, setSheetItem] = useState(null);

  const q = params.get('q') || '';
  const status = params.get('status') || 'all';
  const source = params.get('source') || 'all';
  const sort = params.get('sort') || 'newest';
  const view = params.get('view') === 'folders' ? 'folders' : 'items';

  const setParam = (key, value, fallback) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (value === fallback || !value) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true });

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter((it) => {
      if (deleted.has(it.id)) return false;
      if (status !== 'all' && it.status.key !== status) return false;
      if (source !== 'all' && it.kind !== source) return false;
      if (!needle) return true;
      const hay = [it.name, it.id, ...(it.tags || []), ...Object.values(it.swatches).flatMap((s) => [s?.label, s?.color])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'oldest' ? a.created - b.created : b.created - a.created));
  }, [items, q, status, source, sort, deleted]);

  const folders = useMemo(() => groupFolders(visible), [visible]);
  const live = items.filter((it) => !deleted.has(it.id));
  const countFor = (key) => (key === 'all' ? live.length : live.filter((it) => it.status.key === key).length);
  const filtersActive = q || status !== 'all' || source !== 'all';

  const removeSim = (item) => {
    setDeleted((d) => new Set(d).add(item.id));
    deleteSavedSimulation(item.id).catch((err) => {
      console.error('Error deleting simulation:', err);
      setDeleted((d) => { const n = new Set(d); n.delete(item.id); return n; });
    });
  };

  return (
    <div className="collections-page">
      <div className="collections-container">
        <header className="collections-header">
          <div>
            <h1 className="page-title">My <span className="text-cyan">Collection</span></h1>
            <p className="collections-subtitle">
              Every saree you've fused or simulated — open one to see its swatches, drape and loom files.
            </p>
            <div className="collections-stats">
              <span><strong>{live.filter((i) => i.kind === 'design').length}</strong> designs</span>
              <span><strong>{live.filter((i) => i.kind === 'simulation').length}</strong> simulations</span>
              <span><strong>{countFor('compiled')}</strong> loom-ready</span>
            </div>
          </div>
        </header>

        <section className="cg-controls" aria-label="Filter collection">
          <label className="cg-search">
            <FiSearch aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value, '')}
              placeholder="Search name, ID, swatch code or colour"
              aria-label="Search collection"
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setParam('q', '', '')}><FiX /></button>
            )}
          </label>
          <div className="cg-selects">
            <select value={source} onChange={(e) => setParam('source', e.target.value, 'all')} aria-label="Source">
              {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => setParam('sort', e.target.value, 'newest')} aria-label="Sort">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </section>

        <div className="cg-sticky">
          <div className="cg-viewmode" role="group" aria-label="View mode">
            <button type="button" className={view === 'items' ? 'is-active' : ''} aria-pressed={view === 'items'}
              onClick={() => setParam('view', 'items', 'items')}><FiGrid /> All sarees</button>
            <button type="button" className={view === 'folders' ? 'is-active' : ''} aria-pressed={view === 'folders'}
              onClick={() => setParam('view', 'folders', 'items')}><FiFolder /> Folders</button>
          </div>
          <div className="cg-chips" role="tablist" aria-label="Status">
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={status === f.key}
                className={`cg-chip${status === f.key ? ' is-active' : ''}`}
                onClick={() => setParam('status', f.key, 'all')}>
                {status === f.key && <motion.span layoutId="chip-pill" className="cg-chip-pill" />}
                <span className="cg-chip-text">{f.label} <em>{countFor(f.key)}</em></span>
              </button>
            ))}
          </div>
        </div>

        {loading ? <SkeletonGrid /> : error ? (
          <div className="collections-empty">
            <p>{error}</p>
            <button type="button" className="empty-cta" onClick={reload}>Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="collections-empty">
            <p>{filtersActive ? 'Nothing matches those filters.' : 'No sarees in your collection yet.'}</p>
            {filtersActive
              ? <button type="button" className="empty-cta" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
              : <Link to="/design" className="empty-cta"><FiPlus /> Create a design</Link>}
          </div>
        ) : (
          <motion.ul className="cg-grid" variants={grid} initial="hidden" animate="show"
            key={`${view}|${status}|${source}|${sort}`}>
              {view === 'folders' && folders.map((f) => <FolderCard key={f.id} folder={f} />)}
              {view === 'items' && visible.map((item) => (
                <ItemCard key={item.id} item={item}
                  onQuick={setSheetItem}
                  onDelete={item.kind === 'simulation' ? () => removeSim(item) : undefined} />
              ))}
          </motion.ul>
        )}
      </div>

      <QuickActionSheet item={sheetItem}
        detailsTo={sheetItem ? `/collections/${encodeURIComponent(sheetItem.id)}` : '#'}
        open={Boolean(sheetItem)} onClose={() => setSheetItem(null)} />
    </div>
  );
}
