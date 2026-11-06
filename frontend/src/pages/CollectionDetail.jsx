import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  FiArrowLeft, FiMaximize, FiFileText, FiDownload, FiPlayCircle, FiX, FiExternalLink, FiAlertCircle,
} from 'react-icons/fi';
import ZoomViewer from '../components/collections/ZoomViewer';
import ShuttleLoader from '../components/motion/ShuttleLoader';
import { useSareeDesign } from '../context/SareeDesignContext.jsx';
import { useCollectionItems, useMediaQuery } from '../utils/collectionItems';
import { printTechPack } from '../utils/techPack';
import { compileLoomFiles, filesFromOrder } from '../utils/loomExport';

const COMPONENTS = [
  { key: 'border', title: 'Border Swatch' },
  { key: 'body', title: 'Body Motif / Texture' },
  { key: 'pallu', title: 'Pallu Panel' },
];
const TABS = [
  { key: 'components', label: 'Components' },
  { key: 'details', label: 'Details' },
  { key: 'loom', label: 'Loom files' },
];

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

function FullscreenViewer({ src, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <motion.div className="cd-full" role="dialog" aria-modal="true" aria-label={`${title} full-screen viewer`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="cd-full-head">
        <strong>{title}</strong>
        <button type="button" onClick={onClose} aria-label="Close full-screen viewer"><FiX /></button>
      </header>
      <motion.div className="cd-full-body" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.97 }}>
        <ZoomViewer src={src} alt={title} />
      </motion.div>
    </motion.div>
  );
}

export default function CollectionDetail() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { setAssets } = useSareeDesign();
  const { items, loading } = useCollectionItems();
  const item = items.find((i) => i.id === itemId);

  const isMobile = useMediaQuery('(max-width: 900px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState('components');
  const [view, setView] = useState('drape'); // drape | template | split
  const [preview, setPreview] = useState(null); // border | body | pallu | null
  const [fullscreen, setFullscreen] = useState(false);
  const [loom, setLoom] = useState({ status: 'idle', files: [] });

  const dragControls = useDragControls();
  const dragged = useRef(false);

  // Reset per-item UI state when navigating between items
  useEffect(() => {
    setView('drape');
    setPreview(null);
    setTab('components');
    setSheetOpen(false);
  }, [itemId]);
  useEffect(() => {
    const files = filesFromOrder(item?.order);
    setLoom(files.length ? { status: 'done', files } : { status: 'idle', files: [] });
  }, [item]);

  if (loading) {
    return (
      <div className="cd-page"><div className="cd-container cd-center"><ShuttleLoader label="Loading design…" /></div></div>
    );
  }
  if (!item) {
    return (
      <div className="cd-page">
        <div className="cd-container cd-center">
          <p>We couldn't find that item.</p>
          <Link to="/collections" className="empty-cta"><FiArrowLeft /> Back to collection</Link>
        </div>
      </div>
    );
  }

  const canTemplate = Boolean(item.template);
  const canLoom = item.kind === 'design' && canTemplate;
  const previewSwatch = preview && item.swatches[preview]?.image ? item.swatches[preview] : null;
  const mainSrc = previewSwatch ? previewSwatch.image : view === 'template' && canTemplate ? item.template : item.drape;
  const mainTitle = previewSwatch
    ? COMPONENTS.find((c) => c.key === preview).title
    : view === 'template' ? 'Continuous template' : 'Mannequin drape';

  const openSheet = (nextTab) => { if (nextTab) setTab(nextTab); setSheetOpen(true); };

  const exportLoom = async () => {
    if (!canLoom) return;
    openSheet('loom');
    setLoom({ status: 'working', files: [] });
    try {
      const { files } = await compileLoomFiles({ batchId: item.batchId, designId: item.id, order: item.order });
      setLoom({ status: 'done', files });
    } catch (err) {
      setLoom({ status: 'error', files: [], message: err.message });
    }
  };

  const reopenInStudio = () => {
    const { body, border, pallu } = item.swatches;
    if (body?.image || border?.image || pallu?.image) {
      setAssets({ bodyImage: body?.image || null, borderImage: border?.image || null, palluImage: pallu?.image || null });
    }
    navigate('/simulation');
  };

  const onDragEnd = (_, info) => {
    if (info.offset.y < -50 || info.velocity.y < -400) setSheetOpen(true);
    else if (info.offset.y > 50 || info.velocity.y > 400) setSheetOpen(false);
    setTimeout(() => { dragged.current = false; }, 0);
  };

  const actions = [
    { key: 'zoom', icon: <FiMaximize />, label: 'Full-screen zoom', short: 'Zoom', onClick: () => setFullscreen(true), disabled: !mainSrc },
    { key: 'pdf', icon: <FiFileText />, label: 'Download Tech-Pack PDF', short: 'Tech-Pack', onClick: () => printTechPack(item) },
    { key: 'loom', icon: <FiDownload />, label: 'Export Loom Files (.jac, .wif, .dob)', short: 'Loom files', onClick: exportLoom,
      disabled: !canLoom || loom.status === 'working',
      hint: canLoom ? undefined : 'Loom export needs a generated design with a flat template' },
    { key: 'studio', icon: <FiPlayCircle />, label: 'Re-open in Studio Simulation', short: 'Studio', onClick: reopenInStudio },
  ];

  const views = [
    { key: 'drape', label: 'Mannequin drape' },
    ...(canTemplate ? [{ key: 'template', label: 'Template' }, { key: 'split', label: 'Side by side' }] : []),
  ];

  return (
    <div className="cd-page">
      <div className="cd-container">
        <nav className="cd-crumbs" aria-label="Breadcrumb">
          <Link to="/collections" className="cd-back"><FiArrowLeft /> Collection</Link>
        </nav>

        <header className="cd-head">
          <div>
            <h1 className="cd-title">{item.name}</h1>
            <p className="cd-sub">{item.id} · {item.createdLabel || '—'}</p>
          </div>
          <span className={`status-pill status-${item.status.key}`}>{item.status.label}</span>
        </header>

        <div className="cd-layout">
          <section className="cd-stage-col" aria-label="Saree viewer">
            <div className="cd-viewbar">
              <div className="cd-seg" role="tablist" aria-label="View mode">
                {views.map((v) => (
                  <button key={v.key} type="button" role="tab" aria-selected={!previewSwatch && view === v.key}
                    className={!previewSwatch && view === v.key ? 'is-active' : ''}
                    onClick={() => { setPreview(null); setView(v.key); }}>
                    {!previewSwatch && view === v.key && <motion.span layoutId="seg-pill" className="cd-seg-pill" />}
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
              {previewSwatch && (
                <button type="button" className="cd-clear" onClick={() => setPreview(null)}>
                  <FiX /> Close swatch preview
                </button>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {!previewSwatch && view === 'split' ? (
                <motion.div key="split" className="cd-split" {...fade}>
                  <ZoomViewer src={item.drape} alt="Mannequin drape" />
                  <ZoomViewer src={item.template} alt="Continuous template" />
                </motion.div>
              ) : (
                <motion.div key={`${mainSrc}`} className="cd-single" {...fade}>
                  <ZoomViewer src={mainSrc} alt={mainTitle} onFullscreen={() => setFullscreen(true)} />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <div className={`cd-sheet${sheetOpen ? ' is-open' : ''}`}>
            <motion.aside
              className="cd-panel"
              drag={isMobile ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragSnapToOrigin
              dragElastic={0.18}
              dragMomentum={false}
              onDragStart={() => { dragged.current = true; }}
              onDragEnd={onDragEnd}
            >
              <button type="button" className="cd-handle"
                aria-label={sheetOpen ? 'Collapse details' : 'Expand details'} aria-expanded={sheetOpen}
                onPointerDown={(e) => { if (isMobile) dragControls.start(e); }}
                onClick={() => { if (!dragged.current) setSheetOpen((o) => !o); }}>
                <span />
              </button>

              <div className="cd-actions" role="toolbar" aria-label="Quick actions">
                {actions.map((a) => (
                  <button key={a.key} type="button" className={`cd-action cd-action-${a.key}`}
                    onClick={a.onClick} disabled={a.disabled} title={a.hint || a.label} aria-label={a.label}>
                    {a.icon}
                    <span className="cd-action-long">{a.label}</span>
                    <span className="cd-action-short">{a.short}</span>
                  </button>
                ))}
              </div>

              <div className="cd-tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                    className={tab === t.key ? 'is-active' : ''}
                    onClick={() => { setTab(t.key); setSheetOpen(true); }}>
                    {tab === t.key && <motion.span layoutId="tab-underline" className="cd-tab-line" />}
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="cd-tabpanel">
                <AnimatePresence mode="wait" initial={false}>
                  {tab === 'components' && (
                    <motion.div key="components" {...fade}>
                      <p className="cd-hint">Exact swatches used in this saree. Tap one to inspect it.</p>
                      <div className="cd-tray">
                        {COMPONENTS.map(({ key, title }) => {
                          const sw = item.swatches[key];
                          const inspectable = Boolean(sw?.image);
                          return (
                            <button key={key} type="button" className={`cd-swatch${preview === key ? ' is-active' : ''}`}
                              aria-pressed={preview === key} disabled={!inspectable}
                              onClick={() => setPreview((p) => (p === key ? null : key))}>
                              <span className="cd-swatch-visual" style={sw?.color ? { background: sw.color } : undefined}>
                                {sw?.image && <img src={sw.image} alt="" loading="lazy" />}
                              </span>
                              <span className="cd-swatch-title">{title}</span>
                              <span className="cd-swatch-code">{sw?.label || sw?.color || 'Not recorded'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {tab === 'details' && (
                    <motion.dl key="details" className="cd-details" {...fade}>
                      <div><dt>Design ID</dt><dd>{item.id}</dd></div>
                      <div><dt>Source</dt><dd>{item.kind === 'simulation' ? 'Studio simulation' : 'AI fusion'}</dd></div>
                      {item.engine && <div><dt>Engine</dt><dd>{item.engine}</dd></div>}
                      {item.match && <div><dt>Match</dt><dd>{item.match}</dd></div>}
                      {item.tags.length > 0 && <div><dt>Lineage</dt><dd>Pallu {item.tags[0]} · Border {item.tags[1]} · Body {item.tags[2]}</dd></div>}
                      <div><dt>Created</dt><dd>{item.createdLabel || '—'}</dd></div>
                      {item.kind === 'design' && item.batchId && (
                        <div><dt>Batch</dt><dd>
                          <Link to={`/collections/batch/${item.batchId}/design/${item.id}`} className="cd-link">
                            Open order page <FiExternalLink />
                          </Link>
                        </dd></div>
                      )}
                    </motion.dl>
                  )}

                  {tab === 'loom' && (
                    <motion.div key="loom" {...fade}>
                      {loom.status === 'working' && <ShuttleLoader label="Compiling .jac, .wif and .dob files…" />}
                      {loom.status === 'error' && (
                        <div className="cd-alert" role="alert"><FiAlertCircle /> {loom.message}
                          <button type="button" onClick={exportLoom}>Retry</button></div>
                      )}
                      {loom.status === 'idle' && (
                        <div className="cd-empty">
                          <p>{canLoom ? 'No loom files compiled yet.' : 'Loom files are available for generated designs only.'}</p>
                          {canLoom && <button type="button" className="cd-primary" onClick={exportLoom}>Compile loom files</button>}
                        </div>
                      )}
                      {loom.status === 'done' && (
                        <ul className="cd-files">
                          {loom.files.map((f) => (
                            <li key={f.url}>
                              <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.filename}>
                                <FiDownload /><span><b>{f.label}</b><small>{f.group}</small></span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.aside>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {fullscreen && <FullscreenViewer src={mainSrc} title={mainTitle} onClose={() => setFullscreen(false)} />}
      </AnimatePresence>
    </div>
  );
}
