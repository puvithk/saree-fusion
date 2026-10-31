import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiX, FiDownload, FiPrinter, FiRefreshCw, FiArrowLeft, FiLogOut, FiArrowRight } from 'react-icons/fi';
import { useSareeDesign } from '../context/SareeDesignContext.jsx';
import ColorPickerOverlay from '../components/saree/ColorPickerOverlay';
import CadViewer from '../components/saree/CadViewer';
import SimulationCanvas from '../components/saree/SimulationCanvas';
import CollectionAutoSaver from '../components/saree/CollectionAutoSaver';
import GeneratingOverlay from '../components/saree/GeneratingOverlay';
import { generateBatch } from '../utils/generateBatch';

// three.js is only downloaded when the 3D view is first opened
const DrapeViewer3D = lazy(() => import('../components/saree/DrapeViewer3D'));

const VIEWS = [
  { key: 'layout', label: 'Layout' },
  { key: 'cad',    label: 'CAD Sketch' },
  { key: '3d',     label: '3D Drape' },
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

// ─── Numeric input ────────────────────────────────────────────────────────────
function NumInput({ label, unit, value, onChange, min = 0, step = 1 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#aaa', fontSize: 12 }}>{label}</span>
        <span style={{ color: '#666', fontSize: 11 }}>{unit}</span>
      </div>
      <input
        type="number" min={min} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          width: '100%', padding: '5px 8px', marginTop: 3,
          background: '#2a2d3e', color: '#fff', border: '1px solid #3a3d4e',
          borderRadius: 6, fontSize: 13, outline: 'none',
        }}
      />
    </div>
  );
}

// ─── Stats card ───────────────────────────────────────────────────────────────
function StatCard({ title, rows }) {
  return (
    <div style={{
      background: '#1e2235', borderRadius: 10, padding: '14px 18px',
      flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{ color: '#f0a030', fontSize: 11, fontWeight: 700,
        letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      {rows.map(([label, val]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', borderBottom: '1px solid #2a2d40' }}>
          <span style={{ color: '#aaa', fontSize: 13 }}>{label}</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: label === 'Total' ? 700 : 400 }}>
            {val}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Image uploader with motif controls ──────────────────────────────────────
function MotifUploader({ label, slot, onChange }) {
  const inputRef = useRef(null);
  return (
    <div style={{ marginBottom: 16, background: '#1e2235', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ color: '#f0a030', fontSize: 11, fontWeight: 700,
        letterSpacing: 1, marginBottom: 8 }}>{label.toUpperCase()}</div>
      {slot.url ? (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <img src={slot.url} alt={label}
            style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 6 }} />
          <button onClick={() => onChange({ ...slot, url: null, el: null })}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
              border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '2px 5px' }}>
            <FiX size={12} />
          </button>
        </div>
      ) : (
        <div onClick={() => inputRef.current.click()}
          style={{ border: '1.5px dashed #3a3d4e', borderRadius: 6, height: 56,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#666', fontSize: 12, marginBottom: 8 }}>
          <FiUploadCloud size={14} style={{ marginRight: 6 }} /> Upload {label}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          const el = new Image();
          el.onload = () => onChange({ ...slot, url, el });
          el.src = url;
        }}
      />
      {/* Scale */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#aaa', fontSize: 11 }}>Scale</span>
          <span style={{ color: '#ccc', fontSize: 11 }}>{slot.scale.toFixed(2)}×</span>
        </div>
        <input type="range" min="0.2" max="3" step="0.05" value={slot.scale}
          onChange={e => onChange({ ...slot, scale: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: '#f0a030' }} />
      </div>
      {/* Rotation */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#aaa', fontSize: 11 }}>Rotation</span>
          <span style={{ color: '#ccc', fontSize: 11 }}>{slot.rot}°</span>
        </div>
        <input type="range" min="0" max="360" step="1" value={slot.rot}
          onChange={e => onChange({ ...slot, rot: parseInt(e.target.value) })}
          style={{ width: '100%', accentColor: '#f0a030' }} />
      </div>
    </div>
  );
}

// ─── Simulation page ──────────────────────────────────────────────────────────
export default function Simulation() {
  const [p, setP] = useState({ ...DEF });
  const [imgs, setImgs] = useState({
    border: { url: null, el: null, color: '#c47b1a', tint: 0.4,  scale: 1, rot: 0 },
    body:   { url: null, el: null, color: '#e01050', tint: 0.4,  scale: 1, rot: 0 },
    pallu:  { url: null, el: null, color: '#4a2080', tint: 0.35, scale: 1, rot: 0 },
  });
  const [view, setView] = useState('layout');
  const { assets } = useSareeDesign();
  const [drapeStyle, setDrapeStyle] = useState(assets.style || 'normal');
  const navigate = useNavigate();
  const [yarnColors, setYarnColors] = useState([]);
  const [zoom, setZoom] = useState(0.5);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const canvasRef = useRef(null);

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
  return (
    <div style={{ background: '#12152a', minHeight: '100vh', color: '#fff',
      fontFamily: "'Inter', sans-serif", padding: '0 0 40px' }}>

      <CollectionAutoSaver canvasRef={canvasRef} config={saveConfig} hasAssets={hasAssets} />
      {(generating || genError) && (
        <GeneratingOverlay error={genError} onRetry={handleNextStep} onDismiss={() => setGenError('')} />
      )}

      {/* Header */}
      <div style={{ background: '#1a1e35', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #2a2d42', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f0a030' }}>
            Saree Simulation Suite
          </h1>
          <span style={{ fontSize: 12, color: '#666' }}>
            Layout · CAD · 3D drape — changes auto-save to your collection on exit
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => navigate(-1)} style={btnStyle('#2a2d40')}>
            <FiArrowLeft size={14} /> &nbsp;Back
          </button>
          <button onClick={() => navigate('/collections')} style={btnStyle('#6a2a3a')}>
            <FiLogOut size={14} /> &nbsp;Exit Simulation
          </button>
          <button onClick={exportBMP}
            style={btnStyle('#2a5080')}>
            <FiDownload size={14} /> &nbsp;Export BMP
          </button>
          <button onClick={exportPrint}
            style={btnStyle('#3a5040')}>
            <FiPrinter size={14} /> &nbsp;Print / PDF
          </button>
          <button onClick={handleNextStep} disabled={generating}
            style={{ ...btnStyle('linear-gradient(135deg, #00D4FF, #0097A7)'), fontWeight: 700 }}>
            Next Step &nbsp;<FiArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Main three-column area */}
      <div style={{ display: 'flex', gap: 0, minHeight: 700, alignItems: 'flex-start' }}>

        {/* ── Left: Controls ── */}
        <div style={{ width: 220, flexShrink: 0, background: '#161929',
          padding: '16px 14px', overflowY: 'auto', maxHeight: '80vh',
          borderRight: '1px solid #2a2d42' }}>
          <SectionTitle>DIMENSIONS</SectionTitle>
          <NumInput label="EPI (Ends Per Inch)" unit="ends/in"
            value={p.epi} onChange={setParam('epi')} min={1} />
          <NumInput label="PPI (Picks Per Inch)" unit="picks/in"
            value={p.ppi} onChange={setParam('ppi')} min={1} />
          <NumInput label="Left Border Width"  unit="inches"
            value={p.leftBorderIn}  onChange={setParam('leftBorderIn')}  step={0.5} />
          <NumInput label="Right Border Width" unit="inches"
            value={p.rightBorderIn} onChange={setParam('rightBorderIn')} step={0.5} />
          <NumInput label="Body Width" unit="inches"
            value={p.bodyWidthIn} onChange={setParam('bodyWidthIn')} step={0.5} />
          <div style={{ color: '#555', fontSize: 11, marginBottom: 12 }}>
            Total width: {(p.leftBorderIn + p.bodyWidthIn + p.rightBorderIn).toFixed(1)}"
          </div>

          <SectionTitle>LENGTH (TRUE SCALE)</SectionTitle>
          <NumInput label="Saree Length" unit="inches"
            value={p.sareeLenIn} onChange={setParam('sareeLenIn')} min={60} step={1} />
          <NumInput label="Blouse Piece" unit="inches"
            value={p.blousePieceIn} onChange={setParam('blousePieceIn')} step={1} />
          <div style={{ color: '#555', fontSize: 11, marginBottom: 12 }}>
            Total: {(p.sareeLenIn + p.blousePieceIn).toFixed(0)}" ≈ {((p.sareeLenIn + p.blousePieceIn) * 0.0254).toFixed(2)} m
          </div>

          <SectionTitle>PALLU &amp; BLEND</SectionTitle>
          <NumInput label="Pallu Length" unit="inches"
            value={p.palluLenIn} onChange={setParam('palluLenIn')} step={0.5} />
          <NumInput label="Blend Band"   unit="inches"
            value={p.blendIn}    onChange={setParam('blendIn')}    step={0.5} />

          <SectionTitle>MOTIF REPEAT</SectionTitle>
          <NumInput label="Repeats Across Body" unit="count"
            value={p.motifRepsAcross} onChange={setParam('motifRepsAcross')} min={1} />
          <NumInput label="Repeat Along (Motif Height)" unit="inches"
            value={p.motifAlong} onChange={setParam('motifAlong')} step={0.5} />

          <SectionTitle>JACQUARD HOOKS</SectionTitle>
          <NumInput label="Hooks per Border" unit="hooks"
            value={p.borderHooks} onChange={setParam('borderHooks')} min={1} />
          <NumInput label="Hooks for Body"   unit="hooks"
            value={p.bodyHooks}   onChange={setParam('bodyHooks')}   min={1} />

          <button onClick={() => setP({ ...DEF })}
            style={{ ...btnStyle('#2a2d40'), width: '100%', marginTop: 8, justifyContent: 'center' }}>
            <FiRefreshCw size={12} /> &nbsp;Reset defaults
          </button>
        </div>

        {/* ── Center: Canvas ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '20px 16px', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                style={{ ...btnStyle(v.key === view ? '#f0a030' : '#2a2d40'),
                  color: v.key === view ? '#000' : '#ccc' }}>
                {v.label}
              </button>
            ))}
          </div>

          {view === 'cad' && <CadViewer params={p} specs={specs} />}

          {view === '3d' && (
            <Suspense fallback={<div style={{ color: '#666', padding: 40 }}>Loading 3D viewer…</div>}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#666', fontSize: 12 }}>Drape style</span>
                {DRAPE_STYLES.map(d => (
                  <button key={d.key} onClick={() => setDrapeStyle(d.key)}
                    style={{ ...btnStyle(d.key === drapeStyle ? '#f0a030' : '#2a2d40'),
                      padding: '3px 10px', fontSize: 11, color: d.key === drapeStyle ? '#000' : '#aaa' }}>
                    {d.label}
                  </button>
                ))}
              </div>
              <DrapeViewer3D imgs={imgs} params={p} drapeStyle={drapeStyle} />
            </Suspense>
          )}

          {/* Layout canvas stays mounted: it feeds yarn colours and the auto-save thumbnail */}
          <div style={{ display: view === 'layout' ? 'flex' : 'none', flexDirection: 'column',
            alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: '#666', fontSize: 12 }}>Preview zoom</span>
            {[0.25, 0.5, 0.75, 1].map(z => (
              <button key={z} onClick={() => setZoom(z)}
                style={{ ...btnStyle(z === zoom ? '#f0a030' : '#2a2d40'),
                  padding: '3px 10px', fontSize: 11, color: z === zoom ? '#000' : '#aaa' }}>
                {Math.round(z * 100)}%
              </button>
            ))}
          </div>

          <div style={{ overflow: 'auto', maxHeight: '72vh',
            border: '1px solid #2a2d42', borderRadius: 8 }}>
            <SimulationCanvas canvasRef={canvasRef} params={p} imgs={imgs} zoom={zoom} onDraw={handleDraw} />
          </div>

          {/* Dimensions legend */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#666' }}>
            <span>◀ {p.leftBorderIn}" border</span>
            <span>▐ {p.bodyWidthIn}" body ▐</span>
            <span>border {p.rightBorderIn}" ▶</span>
          </div>
          </div>
        </div>

        {/* ── Right: Motif uploads ── */}
        <div style={{ width: 240, flexShrink: 0, background: '#161929',
          padding: '16px 14px', overflowY: 'auto', maxHeight: '80vh',
          borderLeft: '1px solid #2a2d42' }}>
          <ColorPickerOverlay imgs={imgs} onChange={patchImg} />
          <SectionTitle>DESIGN ELEMENTS</SectionTitle>
          <MotifUploader label="Border Image" slot={imgs.border}
            onChange={v => setImg('border', v)} />
          <MotifUploader label="Body Motif"   slot={imgs.body}
            onChange={v => setImg('body', v)} />
          <MotifUploader label="Pallu Image"  slot={imgs.pallu}
            onChange={v => setImg('pallu', v)} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatCard title="WARP ENDS" rows={[
            ['Left border',  specs.warpEnds.leftBorder],
            ['Body',         specs.warpEnds.body],
            ['Right border', specs.warpEnds.rightBorder],
            ['Total',        specs.warpEnds.total],
          ]} />
          <StatCard title="JACQUARD HOOKS" rows={[
            ['Each border',     specs.hooks.perBorder],
            ['Body',            specs.hooks.body],
            ['Per body repeat', specs.hooks.perBodyRepeat],
            ['Total',           specs.hooks.total],
          ]} />
          <StatCard title="PICKS" rows={[
            ['Pallu',       specs.picks.pallu],
            ['Blend band',  specs.picks.blendBand],
            ['Motif row',   specs.picks.motifRow],
            ['Body repeat', specs.picks.bodyRepeat],
          ]} />
          <StatCard title="REPEAT" rows={[
            ['Across',          `${specs.repeat.across}"`],
            ['Along',           `${specs.repeat.along}"`],
            ['Border repeats',  specs.repeat.borderRepeats],
            ['Border stretch',  `${specs.repeat.borderStretch}×`],
          ]} />
        </div>

        {/* Yarn colors */}
        {yarnColors.length > 0 && (
          <div style={{ background: '#1e2235', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ color: '#f0a030', fontSize: 11, fontWeight: 700,
              letterSpacing: 1, marginBottom: 10 }}>
              YARN COLOURS IN THE LOOM FILES ({yarnColors.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {yarnColors.map(({ hex, pct }) => (
                <div key={hex} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#252840', borderRadius: 20, padding: '3px 10px 3px 4px',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: hex, border: '1.5px solid #333', flexShrink: 0,
                  }} />
                  <span style={{ color: '#ccc', fontSize: 11 }}>{hex} · {pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ color: '#f0a030', fontSize: 10, fontWeight: 700,
      letterSpacing: 1, marginBottom: 8, marginTop: 12 }}>{children}</div>
  );
}

function btnStyle(bg) {
  return {
    display: 'inline-flex', alignItems: 'center',
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  };
}
