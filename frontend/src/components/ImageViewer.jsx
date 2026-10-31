import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FiZoomIn, FiZoomOut, FiMaximize, FiRotateCcw } from 'react-icons/fi';
import styles from './ImageViewer.module.css';

// ─── ImageViewer ─────────────────────────────────────────────────────────────
// Zoom / pan viewer for very wide saree templates.
// Zoom is measured against the image's real pixels: 100% = one image pixel per
// screen pixel. The image is re-laid-out at the zoomed size (width/height, not
// a CSS scale transform), so the browser resamples from the full-resolution
// source at every zoom level instead of stretching a cached bitmap.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const STEP = 1.25;

export default function ImageViewer({ src, alt = '', height = '90vh', className = '' }) {
  const stageRef = useRef(null);
  const [natural, setNatural] = useState(null);   // { w, h } of the source image
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);         // { zoom, x, y }; x/y = image top-left in stage px
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map());              // active pointers, for drag + pinch
  const gesture = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const fitZoom = natural && stage.w
    ? Math.min(stage.w / natural.w, stage.h / natural.h)
    : 1;
  // Fit may need to go below 50% for a very wide template
  const minZoom = Math.min(MIN_ZOOM, fitZoom);

  // Keep the image on screen: centred when smaller than the stage, otherwise
  // its edges can't be dragged inside the stage
  const clampView = useCallback((v) => {
    if (!natural) return v;
    const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, v.zoom));
    const w = natural.w * zoom, h = natural.h * zoom;
    const axis = (pos, size, room) => (size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, pos)));
    return { zoom, x: axis(v.x, w, stage.w), y: axis(v.y, h, stage.h) };
  }, [natural, stage, minZoom]);

  // Zoom keeping stage point (px, py) fixed; defaults to the stage centre
  const zoomAt = useCallback((nextZoom, px = stage.w / 2, py = stage.h / 2) => {
    setView((v) => {
      if (!v) return v;
      const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, nextZoom(v.zoom)));
      const k = zoom / v.zoom;
      return clampView({ zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    });
  }, [stage, minZoom, clampView]);

  // Opening view: as large as possible — the template's height fills the
  // viewer (never below 100%), anchored to its starting edge for panning
  const fillZoom = natural && stage.h ? Math.min(MAX_ZOOM, Math.max(1, stage.h / natural.h)) : 1;
  const openView = useCallback(() => setView(clampView({ zoom: fillZoom, x: 0, y: 0 })), [clampView, fillZoom]);

  const fit = useCallback(() => setView(clampView({ zoom: fitZoom, x: 0, y: 0 })), [clampView, fitZoom]);
  const setZoom = (z) => zoomAt(() => z);

  // Track stage size
  useLayoutEffect(() => {
    const el = stageRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry.contentRect;
      setStage({ w: width, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // New image → wait for its real size, then fit
  useEffect(() => {
    setNatural(null);
    setView(null);
  }, [src]);

    useEffect(() => {
    if (natural && stage.w && !view) openView();
  }, [natural, stage, view, openView]);

  // Re-clamp when the stage resizes (rotation, window resize)
  useEffect(() => {
    setView((v) => (v ? clampView(v) : v));
  }, [clampView]);

  // Wheel / trackpad zoom toward the cursor (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = stageRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)); // ctrlKey = trackpad pinch
      zoomAt((z) => z * factor, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Pointer drag (mouse / pen / one finger) and pinch (two fingers) ──
  const localPoint = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const view = viewRef.current;
    if (!view) return;
    if (pts.length === 1) {
      gesture.current = { type: 'pan', start: pts[0], view };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
    startGesture();
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, localPoint(e));
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (g.type === 'pan' && pts.length === 1) {
      setView(clampView({
        zoom: g.view.zoom,
        x: g.view.x + pts[0].x - g.start.x,
        y: g.view.y + pts[0].y - g.start.y,
      }));
    } else if (g.type === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, g.view.zoom * (dist / g.dist)));
      const k = zoom / g.view.zoom;
      // Scale about the starting midpoint, then follow the fingers' movement
      setView(clampView({
        zoom,
        x: mid.x - (g.mid.x - g.view.x) * k,
        y: mid.y - (g.mid.y - g.view.y) * k,
      }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    } else {
      // e.g. lifting one finger of a pinch → continue as a pan from here
      startGesture();
    }
  };

  const onDoubleClick = (e) => {
    const p = localPoint(e);
    zoomAt((z) => (z < 1 - 1e-3 ? 1 : fitZoom), p.x, p.y);
  };

  const onKeyDown = (e) => {
    const pan = (dx, dy) => setView((v) => v && clampView({ ...v, x: v.x + dx, y: v.y + dy }));
    const keys = {
      '+': () => zoomAt((z) => z * STEP),
      '=': () => zoomAt((z) => z * STEP),
      '-': () => zoomAt((z) => z / STEP),
      '0': fit,
      '1': () => setZoom(1),
      ArrowLeft: () => pan(60, 0),
      ArrowRight: () => pan(-60, 0),
      ArrowUp: () => pan(0, 60),
      ArrowDown: () => pan(0, -60),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  const zoom = view?.zoom ?? fitZoom;
  const near = (z) => Math.abs(zoom - z) < 0.005;
  const canPan = natural && (natural.w * zoom > stage.w + 1 || natural.h * zoom > stage.h + 1);

  return (
    <div className={`${styles.viewer} ${className}`} style={{ height }}>
      <div
        ref={stageRef}
        className={`${styles.stage} ${canPan ? styles.pannable : ''} ${dragging ? styles.dragging : ''}`}
        tabIndex={0}
        role="img"
        aria-label={`${alt} — zoom ${Math.round(zoom * 100)}%. Use + and − to zoom, arrow keys to move.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={`${styles.image} ${zoom > 1 ? styles.magnified : ''} ${dragging ? styles.noAnim : ''}`}
          style={natural && view ? {
            width: natural.w * zoom,
            height: natural.h * zoom,
            transform: `translate3d(${view.x}px, ${view.y}px, 0)`,
          } : { visibility: 'hidden' }}
        />
        {!natural && <div className={styles.loading}>Loading template…</div>}
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label="Zoom controls">
        <button type="button" onClick={() => zoomAt((z) => z / STEP)} disabled={zoom <= minZoom + 1e-3}
          aria-label="Zoom out" title="Zoom out (−)"><FiZoomOut /></button>
        <span className={styles.level} aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAt((z) => z * STEP)} disabled={zoom >= MAX_ZOOM - 1e-3}
          aria-label="Zoom in" title="Zoom in (+)"><FiZoomIn /></button>
        <span className={styles.divider} />
        <button type="button" className={`${styles.preset} ${near(0.75) ? styles.active : ''}`}
          onClick={() => setZoom(0.75)}>75%</button>
        <button type="button" className={`${styles.preset} ${near(1) ? styles.active : ''}`}
          onClick={() => setZoom(1)} title="Actual pixels (1)">100%</button>
        <button type="button" className={`${styles.preset} ${near(fitZoom) ? styles.active : ''}`}
          onClick={fit} title="Fit to screen (0)"><FiMaximize /><span>Fit</span></button>
        <span className={styles.divider} />
        <button type="button" onClick={openView} aria-label="Reset view" title="Reset"><FiRotateCcw /></button>
      </div>
    </div>
  );
}
