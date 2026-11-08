import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, X, Download, Printer, RefreshCw, ArrowLeft, LogOut, ArrowRight, ChevronDown } from 'lucide-react';
import { useSareeDesign } from '../context/SareeDesignContext.jsx';
import ColorPickerOverlay from '../components/saree/ColorPickerOverlay';
import CadViewer from '../components/saree/CadViewer';
import SimulationCanvas from '../components/saree/SimulationCanvas';
import CollectionAutoSaver from '../components/saree/CollectionAutoSaver';
import GeneratingOverlay from '../components/saree/GeneratingOverlay';
import { generateBatch } from '../utils/generateBatch';
import { haptic } from '../utils/haptics';

// three.js is only downloaded when the 3D view is first opened
const DrapeViewer3D = lazy(() => import('../components/saree/DrapeViewer3D'));

const VIEWS = [
  { key: 'layout', label: 'Flat template' },
  { key: 'cad',    label: 'CAD sketch' },
  { key: '3d',     label: 'Mannequin drape' },
];

const DRAPE_STYLES = [
  { key: 'normal', label: 'Nivi' },
  { key: 'mysore', label: 'Mysore' },
  { key: 'kadagu', label: 'Kodava (Kadagu)' },
];

// Load an image URL (object URL from the Design page, or a static path)
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    if (!url.startsWith('blob:')) el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
}

// ─── Default parameters matching standard saree CAD layout ───────────────────
const DEF = {
  epi: 120, ppi: 80,
  leftBorderIn: 6, rightBorderIn: 6, bodyWidthIn: 36,
  sareeLenIn: 216, blousePieceIn: 32, // 5.5 m saree + 0.8 m blouse piece
  palluLenIn: 45.6, blendIn: 3, motifAlong: 24,
  motifRepsAcross: 3, borderHooks: 480, bodyHooks: 1920,
};

// ─── Compute all derived technical specs ─────────────────────────────────────
function computeSpecs(p) {
  const totalW = p.leftBorderIn + p.bodyWidthIn + p.rightBorderIn;
  return {
    warpEnds: {
      leftBorder: Math.round(p.epi * p.leftBorderIn),
      body:       Math.round(p.epi * p.bodyWidthIn),
      rightBorder:Math.round(p.epi * p.rightBorderIn),
      total:      Math.round(p.epi * totalW),
    },
    hooks: {
      perBorder:     p.borderHooks,
      body:          p.bodyHooks,
      perBodyRepeat: Math.round(p.bodyHooks / Math.max(1, p.motifRepsAcross)),
      total:         2 * p.borderHooks + p.bodyHooks,
    },
    picks: {
      pallu:       Math.round(p.ppi * p.palluLenIn),
      blendBand:   Math.round(p.ppi * p.blendIn),
      motifRow:    Math.round(p.ppi * (p.motifAlong / 2)),
      bodyRepeat:  Math.round(p.ppi * p.motifAlong),
    },
    repeat: {
      across:        (p.bodyWidthIn / Math.max(1, p.motifRepsAcross)).toFixed(1),
      along:         p.motifAlong.toFixed(1),
      borderRepeats: Math.ceil(p.palluLenIn / Math.max(0.1, p.motifAlong)),
      borderStretch: (p.palluLenIn /
        (Math.ceil(p.palluLenIn / Math.max(0.1, p.motifAlong)) * p.motifAlong)).toFixed(3),
    },
  };
}

// ─── BMP encoder (24-bit, top-down) ──────────────────────────────────────────
function encodeImageDataAsBMP(imageData) {
  const { width, height, data } = imageData;
  const paddedRow = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = paddedRow * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new Uint8Array(fileSize);
  const dv = new DataView(buf.buffer);
  // File header
  buf[0] = 0x42; buf[1] = 0x4D;
  dv.setUint32(2, fileSize, true);
  dv.setUint32(10, 54, true);
  // DIB header
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true); // positive = bottom-up rows
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(30, 0, true);
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  // Pixel data (bottom-up BGR)
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y;
    const rowStart = 54 + bmpRow * paddedRow;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = rowStart + x * 3;
      buf[d] = data[s + 2]; buf[d + 1] = data[s + 1]; buf[d + 2] = data[s];
    }
  }
  return buf;
}

// ─── Extract top yarn colors from canvas ─────────────────────────────────────
function extractYarnColors(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;
  const counts = {};
  const step = 8;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, cnt]) => {
      const r = ((key >> 10) & 0x1F) << 3;
      const g = ((key >> 5)  & 0x1F) << 3;
      const b = (key         & 0x1F) << 3;
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      return { hex, pct: ((cnt / total) * 100).toFixed(1) };
    });
}

// ─── Small UI atoms (Tailwind, theme-aware) ──────────────────────────────────
const panel = 'rounded-2xl border border-line bg-glass backdrop-blur-md';
const tap = 'sf-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold';

function SectionTitle({ children }) {
  return <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-widest text-gold first:mt-0">{children}</div>;
}

// Collapsible on phones/tablets; always open from the xl breakpoint up
function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`${panel} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="sf-tap flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-bold text-fg xl:pointer-events-none">
        {title}
        <ChevronDown size={18} className={`text-muted transition-transform xl:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'block' : 'hidden'} px-4 pb-4 xl:block`}>{children}</div>
    </section>
  );
}

// ─── Number input ─────────────────────────────────────────────────────────────
function NumInput({ label, unit, value, onChange, min = 0, step = 1 }) {
  return (
    <label className="mb-2.5 block">
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-muted/70">{unit}</span>
      </span>
      <input
        type="number" inputMode="decimal" min={min} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 h-11 w-full rounded-xl border border-line bg-surface-2/70 px-3 text-base text-fg focus:border-gold focus:outline-none"
      />
    </label>
  );
}

// ─── Stats card ───────────────────────────────────────────────────────────────
function StatCard({ title, rows }) {
  return (
    <div className={`${panel} p-4`}>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gold">{title}</div>
      {rows.map(([label, val]) => (
        <div key={label} className="flex justify-between border-b border-line py-1.5 last:border-0">
          <span className="text-sm text-muted">{label}</span>
          <span className={`text-sm text-fg ${label === 'Total' ? 'font-bold' : ''}`}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Image uploader with motif controls ──────────────────────────────────────
function MotifUploader({ label, slot, onChange }) {
  const inputRef = useRef(null);
  return (
    <div className="mb-3 rounded-2xl border border-line bg-surface-2/50 p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gold">{label}</div>
      {slot.url ? (
        <div className="relative mb-2">
          <img src={slot.url} alt={label} className="h-20 w-full rounded-xl object-cover" />
          <button type="button" aria-label={`Remove ${label}`} onClick={() => onChange({ ...slot, url: null, el: null })}
            className="sf-tap absolute right-1 top-1 grid h-11 w-11 place-items-center text-white">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/65"><X size={14} /></span>
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current.click()}
          className="sf-tap mb-2 flex h-16 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-sm text-muted">
          <UploadCloud size={18} /> Upload {label}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => {
          const file = e.target.files[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          const el = new Image();
          el.onload = () => onChange({ ...slot, url, el });
          el.src = url;
        }}
      />
      <label className="mb-1 block">
        <span className="flex justify-between text-xs text-muted"><span>Scale</span><span>{slot.scale.toFixed(2)}×</span></span>
        <input type="range" min="0.2" max="3" step="0.05" value={slot.scale}
          onChange={e => onChange({ ...slot, scale: parseFloat(e.target.value) })}
          className="h-8 w-full accent-[#e3bb4f]" />
      </label>
      <label className="block">
        <span className="flex justify-between text-xs text-muted"><span>Rotation</span><span>{slot.rot}°</span></span>
        <input type="range" min="0" max="360" step="1" value={slot.rot}
          onChange={e => onChange({ ...slot, rot: parseInt(e.target.value) })}
          className="h-8 w-full accent-[#e3bb4f]" />
      </label>
    </div>
  );
}

// Pinch-to-zoom for the flat template; native touch scrolling handles panning
function usePinchZoom(ref, zoom, setZoom) {
  const start = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const down = (e) => { if (e.touches.length === 2) start.current = { d: dist(e.touches), z: zoom }; };
    const move = (e) => {
      if (e.touches.length === 2 && start.current) {
        e.preventDefault();
        setZoom(Math.min(2, Math.max(0.1, start.current.z * (dist(e.touches) / start.current.d))));
      }
    };
    const up = () => { start.current = null; };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
    };
  }, [ref, zoom, setZoom]);
}

// ─── Simulation page ──────────────────────────────────────────────────────────
export default function Simulation() {
  const { assets } = useSareeDesign();
  // Set when a saved layout is re-opened from the collection: restores its loom
  // parameters and colourway, and keeps saving into the same collection entry.
  const restore = assets.restore || null;
  const [p, setP] = useState({ ...DEF, ...(restore?.params || {}) });
  const [imgs, setImgs] = useState({
    border: { url: null, el: null, color: '#c47b1a', tint: 0.4,  scale: 1, rot: 0, ...(restore?.palette?.border || {}) },
    body:   { url: null, el: null, color: '#e01050', tint: 0.4,  scale: 1, rot: 0, ...(restore?.palette?.body || {}) },
    pallu:  { url: null, el: null, color: '#4a2080', tint: 0.35, scale: 1, rot: 0, ...(restore?.palette?.pallu || {}) },
  });
  const [view, setView] = useState('layout');
  const [drapeStyle, setDrapeStyle] = useState(assets.style || 'normal');
  const navigate = useNavigate();
  const [yarnColors, setYarnColors] = useState([]);
  const [zoom, setZoom] = useState(0.5);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const canvasRef = useRef(null);
  const imgsRef = useRef(imgs);
  useEffect(() => { imgsRef.current = imgs; }, [imgs]);

  // Small JPEG copies of the three swatches, saved with the collection entry so the
  // layout can be re-opened and edited later (object URLs do not survive a reload)
  const getImages = useCallback(() => {
    const out = {};
    ['body', 'border', 'pallu'].forEach((key) => {
      const el = imgsRef.current[key]?.el;
      if (!el || !el.width) return;
      const k = Math.min(1, 640 / Math.max(el.width, el.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(el.width * k));
      c.height = Math.max(1, Math.round(el.height * k));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(el, 0, 0, c.width, c.height);
      out[key] = c.toDataURL('image/jpeg', 0.8);
    });
    return out;
  }, []);
  const viewportRef = useRef(null);
  usePinchZoom(viewportRef, zoom, setZoom);

  // Fit the whole template inside the scroll viewport
  const fitToView = useCallback(() => {
    const box = viewportRef.current;
    const c = canvasRef.current;
    if (!box || !c) return;
    const r = c.getBoundingClientRect();
    const w = r.width / zoom;
    const h = r.height / zoom;
    if (!w || !h) return;
    setZoom(Math.max(0.1, Math.min(1, (box.clientWidth - 4) / w, (box.clientHeight || h) / h)));
  }, [zoom]);

  const specs = computeSpecs(p);

  // ── After every client-side redraw of the template ──
  const handleDraw = useCallback((canvas) => {
    setYarnColors(extractYarnColors(canvas.getContext('2d'), canvas.width, canvas.height));
  }, []);

  // ── Lightweight snapshot for auto-save (no image data besides the thumbnail) ──
  const hasAssets = Boolean(assets.bodyImage || assets.borderImage || assets.palluImage);
  const saveConfig = useMemo(() => ({
    name: `Saree ${DRAPE_STYLES.find(d => d.key === drapeStyle)?.label ?? ''} drape`.trim(),
    drapeStyle,
    description: assets.description || '',
    assetNames: assets.assetNames || {},
    palette: Object.fromEntries(['body', 'border', 'pallu'].map(k =>
      [k, { color: imgs[k].color, tint: imgs[k].tint, scale: imgs[k].scale, rot: imgs[k].rot }])),
    params: p,
  }), [drapeStyle, assets, imgs, p]);

  const setImg = useCallback((key, val) => setImgs(prev => ({ ...prev, [key]: val })), []);
  const patchImg = useCallback((key, patch) =>
    setImgs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })), []);

  // ── Auto-assemble from the assets handed over by the Design page ──
  useEffect(() => {
    let cancelled = false;
    const slots = { body: assets.bodyImage, border: assets.borderImage, pallu: assets.palluImage };
    Object.entries(slots).forEach(([key, url]) => {
      if (!url) return;
      loadImage(url)
        .then(el => { if (!cancelled) patchImg(key, { url, el }); })
        .catch(err => console.error(`Failed to load ${key} image`, err));
    });
    return () => { cancelled = true; };
  }, [assets, patchImg]);
  const setParam = (key) => (val) => setP(prev => ({ ...prev, [key]: val }));

  // ── Next Step: compile both outputs on the backend (saved to batches.json),
  //    then land on the Result page ──
  async function handleNextStep() {
    if (generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const batch = await generateBatch({
        assets,
        style: drapeStyle,
        description: assets.description,
        templateCanvas: canvasRef.current,
      });
      navigate(`/result/${batch.id}`, { state: { batch } });
    } catch (err) {
      console.error(err);
      setGenError(err.message || 'Generation failed. Please try again.');
      setGenerating(false);
    }
  }

  // ── Export as BMP ──
  function exportBMP() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bmpData = encodeImageDataAsBMP(imgData);
    const blob = new Blob([bmpData], { type: 'image/bmp' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'saree_layout.bmp';
    a.click();
  }

  // ── Export as print-ready PDF via browser print ──
  function exportPrint() {
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    const specs = computeSpecs(p);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Saree Layout</title>
      <style>
        body { margin: 0; background: #fff; font-family: Arial, sans-serif; }
        .page { display: flex; gap: 20px; padding: 20px; }
        img { width: 280px; flex-shrink: 0; }
        table { border-collapse: collapse; font-size: 12px; }
        th { background: #f0a030; color: #fff; padding: 5px 10px; text-align: left; }
        td { padding: 4px 10px; border-bottom: 1px solid #eee; }
        h2 { font-size: 14px; margin: 12px 0 6px; color: #333; }
        @media print { button { display: none; } }
      </style></head><body>
      <div style="padding:16px">
        <h1 style="font-size:18px; margin:0 0 16px">Saree Technical Specification</h1>
        <div class="page">
          <img src="${dataURL}" />
          <div>
            <h2>WARP ENDS</h2>
            <table>
              <tr><th>Section</th><th>Ends</th></tr>
              <tr><td>Left border</td><td>${specs.warpEnds.leftBorder}</td></tr>
              <tr><td>Body</td><td>${specs.warpEnds.body}</td></tr>
              <tr><td>Right border</td><td>${specs.warpEnds.rightBorder}</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>${specs.warpEnds.total}</strong></td></tr>
            </table>
            <h2>JACQUARD HOOKS</h2>
            <table>
              <tr><th>Section</th><th>Hooks</th></tr>
              <tr><td>Each border</td><td>${specs.hooks.perBorder}</td></tr>
              <tr><td>Body</td><td>${specs.hooks.body}</td></tr>
              <tr><td>Per body repeat</td><td>${specs.hooks.perBodyRepeat}</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>${specs.hooks.total}</strong></td></tr>
            </table>
            <h2>PICKS</h2>
            <table>
              <tr><th>Section</th><th>Picks</th></tr>
              <tr><td>Pallu</td><td>${specs.picks.pallu}</td></tr>
              <tr><td>Blend band</td><td>${specs.picks.blendBand}</td></tr>
              <tr><td>Motif row</td><td>${specs.picks.motifRow}</td></tr>
              <tr><td>Body repeat</td><td>${specs.picks.bodyRepeat}</td></tr>
            </table>
            <h2>REPEAT</h2>
            <table>
              <tr><th>Axis</th><th>Value</th></tr>
              <tr><td>Across</td><td>${specs.repeat.across}"</td></tr>
              <tr><td>Along</td><td>${specs.repeat.along}"</td></tr>
              <tr><td>Border repeats</td><td>${specs.repeat.borderRepeats}</td></tr>
              <tr><td>Border stretch</td><td>${specs.repeat.borderStretch}×</td></tr>
            </table>
          </div>
        </div>
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    win.document.close();
  }

  // ── UI ──
  const zoomPct = Math.round(zoom * 100);
  const presetActive = (v) => Math.abs(zoom - v) < 0.005;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-4 sm:px-6 xl:px-8">

      <CollectionAutoSaver canvasRef={canvasRef} config={saveConfig} hasAssets={hasAssets}
        getImages={getImages} sessionId={restore?.id} />
      {(generating || genError) && (
        <GeneratingOverlay error={genError} onRetry={handleNextStep} onDismiss={() => setGenError('')} />
      )}

      {/* Header */}
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-gold sm:text-3xl">Simulation studio</h1>
          <p className="text-xs text-muted sm:text-sm">Flat template · CAD · 3D mannequin drape. Changes auto-save to your collection on exit.</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button type="button" onClick={() => navigate(-1)} className={`${tap} shrink-0 border border-line bg-surface text-fg`}>
            <ArrowLeft size={16} /> Back
          </button>
          <button type="button" onClick={() => navigate('/collections')} className={`${tap} shrink-0 border border-line bg-surface text-fg`}>
            <LogOut size={16} /> Exit
          </button>
          <button type="button" onClick={exportBMP} className={`${tap} shrink-0 border border-line bg-surface text-fg`}>
            <Download size={16} /> BMP
          </button>
          <button type="button" onClick={exportPrint} className={`${tap} shrink-0 border border-line bg-surface text-fg`}>
            <Printer size={16} /> PDF
          </button>
          <button type="button" onClick={handleNextStep} disabled={generating}
            className={`${tap} shrink-0 bg-gradient-to-br from-[#f2d874] to-gold text-[#1d1700] shadow-[0_8px_22px_rgba(201,162,39,0.3)] disabled:opacity-60`}>
            Next step <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">

        {/* ── Viewport ── (first on mobile, centre on desktop) */}
        <main className="order-first min-w-0 space-y-3 xl:order-none">
          <div className={`${panel} p-2`}>
            <div role="tablist" className="grid grid-cols-3 gap-1.5">
              {VIEWS.map(v => (
                <button key={v.key} type="button" role="tab" aria-selected={v.key === view}
                  onClick={() => { haptic(); setView(v.key); }}
                  className={`sf-tap min-h-11 rounded-xl px-2 text-[13px] font-semibold sm:text-sm ${v.key === view ? 'bg-gold text-[#1d1700] shadow' : 'text-muted'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`${panel} relative p-2 sm:p-3`}>
            {view === 'cad' && <div className="overflow-auto"><CadViewer params={p} specs={specs} /></div>}

            {view === '3d' && (
              <Suspense fallback={<div className="grid h-64 place-items-center text-muted">Loading 3D viewer…</div>}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Drape style</span>
                  {DRAPE_STYLES.map(d => (
                    <button key={d.key} type="button" onClick={() => setDrapeStyle(d.key)}
                      className={`sf-tap min-h-11 rounded-xl px-3 text-xs font-semibold ${d.key === drapeStyle ? 'bg-gold text-[#1d1700]' : 'bg-surface-2 text-muted'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-xl"><DrapeViewer3D imgs={imgs} params={p} drapeStyle={drapeStyle} /></div>
              </Suspense>
            )}

            {/* The layout canvas stays mounted: it feeds yarn colours and the auto-save thumbnail */}
            <div className={view === 'layout' ? 'block' : 'hidden'}>
              <div ref={viewportRef}
                className="max-h-[62vh] touch-pan-x touch-pan-y overflow-auto rounded-xl border border-line bg-black/10 xl:max-h-[72vh]">
                <SimulationCanvas canvasRef={canvasRef} params={p} imgs={imgs} zoom={zoom} onDraw={handleDraw} />
              </div>
              <p className="mt-2 text-center text-[11px] text-muted">
                ◀ {p.leftBorderIn}" border · {p.bodyWidthIn}" body · border {p.rightBorderIn}" ▶ · pinch to zoom, drag to pan
              </p>
            </div>
          </div>

          {/* Floating zoom toolbar. Lives outside the blurred card: backdrop-filter would
              otherwise become the containing block for position:fixed. */}
          {view === 'layout' && (
  <div role="toolbar" aria-label="Zoom"
    className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-[145] flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-glass p-1.5 shadow-2xl backdrop-blur-xl lg:sticky lg:bottom-3 lg:left-auto lg:mx-auto lg:w-fit lg:translate-x-0 lg:shadow-lg">
    {[['75%', () => setZoom(0.75), presetActive(0.75)], ['100%', () => setZoom(1), presetActive(1)], ['Fit', fitToView, false]].map(([label, fn, on]) => (
      <button key={label} type="button" onClick={() => { haptic(); fn(); }}
        className={`sf-tap min-h-11 min-w-14 rounded-xl px-3 text-sm font-bold ${on ? 'bg-gold text-[#1d1700]' : 'text-fg'}`}>
        {label}
      </button>
    ))}
    <span className="min-w-12 px-1 text-center text-xs tabular-nums text-muted">{zoomPct}%</span>
  </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard title="Warp ends" rows={[
              ['Left border', specs.warpEnds.leftBorder], ['Body', specs.warpEnds.body],
              ['Right border', specs.warpEnds.rightBorder], ['Total', specs.warpEnds.total]]} />
            <StatCard title="Jacquard hooks" rows={[
              ['Each border', specs.hooks.perBorder], ['Body', specs.hooks.body],
              ['Per body repeat', specs.hooks.perBodyRepeat], ['Total', specs.hooks.total]]} />
            <StatCard title="Picks" rows={[
              ['Pallu', specs.picks.pallu], ['Blend band', specs.picks.blendBand],
              ['Motif row', specs.picks.motifRow], ['Body repeat', specs.picks.bodyRepeat]]} />
            <StatCard title="Repeat" rows={[
              ['Across', `${specs.repeat.across}"`], ['Along', `${specs.repeat.along}"`],
              ['Border repeats', specs.repeat.borderRepeats], ['Border stretch', `${specs.repeat.borderStretch}×`]]} />
          </div>

          {yarnColors.length > 0 && (
            <div className={`${panel} p-4`}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gold">
                Yarn colours in the loom files ({yarnColors.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {yarnColors.map(({ hex, pct }) => (
                  <span key={hex} className="inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-xs text-fg">
                    <span className="h-5 w-5 rounded-full border border-line" style={{ background: hex }} />
                    {hex} · {pct}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ── Loom parameters ── */}
        <div className="min-w-0 xl:order-first">
          <Accordion title="Loom parameters">
            <SectionTitle>Dimensions</SectionTitle>
            <NumInput label="EPI (ends per inch)" unit="ends/in" value={p.epi} onChange={setParam('epi')} min={1} />
            <NumInput label="PPI (picks per inch)" unit="picks/in" value={p.ppi} onChange={setParam('ppi')} min={1} />
            <NumInput label="Left border width" unit="inches" value={p.leftBorderIn} onChange={setParam('leftBorderIn')} step={0.5} />
            <NumInput label="Right border width" unit="inches" value={p.rightBorderIn} onChange={setParam('rightBorderIn')} step={0.5} />
            <NumInput label="Body width" unit="inches" value={p.bodyWidthIn} onChange={setParam('bodyWidthIn')} step={0.5} />
            <p className="mb-3 text-xs text-muted">Total width: {(p.leftBorderIn + p.bodyWidthIn + p.rightBorderIn).toFixed(1)}"</p>

            <SectionTitle>Length (true scale)</SectionTitle>
            <NumInput label="Saree length" unit="inches" value={p.sareeLenIn} onChange={setParam('sareeLenIn')} min={60} />
            <NumInput label="Blouse piece" unit="inches" value={p.blousePieceIn} onChange={setParam('blousePieceIn')} />
            <p className="mb-3 text-xs text-muted">
              Total: {(p.sareeLenIn + p.blousePieceIn).toFixed(0)}" ≈ {((p.sareeLenIn + p.blousePieceIn) * 0.0254).toFixed(2)} m
            </p>

            <SectionTitle>Pallu &amp; blend</SectionTitle>
            <NumInput label="Pallu length" unit="inches" value={p.palluLenIn} onChange={setParam('palluLenIn')} step={0.5} />
            <NumInput label="Blend band" unit="inches" value={p.blendIn} onChange={setParam('blendIn')} step={0.5} />

            <SectionTitle>Motif repeat</SectionTitle>
            <NumInput label="Repeats across body" unit="count" value={p.motifRepsAcross} onChange={setParam('motifRepsAcross')} min={1} />
            <NumInput label="Repeat along (motif height)" unit="inches" value={p.motifAlong} onChange={setParam('motifAlong')} step={0.5} />

            <SectionTitle>Jacquard hooks</SectionTitle>
            <NumInput label="Hooks per border" unit="hooks" value={p.borderHooks} onChange={setParam('borderHooks')} min={1} />
            <NumInput label="Hooks for body" unit="hooks" value={p.bodyHooks} onChange={setParam('bodyHooks')} min={1} />

            <button type="button" onClick={() => setP({ ...DEF })}
              className={`${tap} mt-2 w-full border border-line bg-surface text-fg`}>
              <RefreshCw size={14} /> Reset defaults
            </button>
          </Accordion>
        </div>

        {/* ── Design elements ── */}
        <div className="min-w-0">
          <Accordion title="Design elements" defaultOpen>
            <div className="mb-3"><ColorPickerOverlay imgs={imgs} onChange={patchImg} /></div>
            <MotifUploader label="Border image" slot={imgs.border} onChange={v => setImg('border', v)} />
            <MotifUploader label="Body motif" slot={imgs.body} onChange={v => setImg('body', v)} />
            <MotifUploader label="Pallu image" slot={imgs.pallu} onChange={v => setImg('pallu', v)} />
          </Accordion>
        </div>
      </div>
    </div>
  );
}
