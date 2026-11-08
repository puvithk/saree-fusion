import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FiZoomIn, FiZoomOut, FiMaximize2 } from 'react-icons/fi';

const MIN = 0.5;
const MAX = 10;
const FIT = { zoom: 1, x: 0, y: 0 };
const clamp = (z) => Math.min(MAX, Math.max(MIN, z));

// Zoom about a point measured from the stage centre so it stays under the cursor
function zoomAbout(v, next, cx = 0, cy = 0) {
  const zoom = clamp(next);
  if (Math.abs(zoom - 1) < 0.001) return FIT;
  const k = zoom / v.zoom;
  return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

/**
 * Pan / pinch / wheel zoom viewer with 75% / 100% / Fit presets.
 * Percentages are relative to the image's natural pixel size; "Fit" is the contained size.
 */
export default function ZoomViewer({ src, alt, onFullscreen, className = '' }) {
  const [view, setView] = useState(FIT);
  const [dragging, setDragging] = useState(false);
  const [base, setBase] = useState(1); // natural width / fitted width
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (img && img.clientWidth) setBase(Math.max(1, img.naturalWidth / img.clientWidth));
  }, []);

  useEffect(() => { setView(FIT); }, [src]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, src]);

  const pct = Math.round((view.zoom * 100) / base);
  const setPercent = (p) => setView((v) => zoomAbout(v, (p / 100) * base));
  const step = (f) => setView((v) => zoomAbout(v, v.zoom * f));
  const isFit = view.zoom === 1;
  const is = (p) => !isFit && Math.abs(pct - p) < 1;

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
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    } else {
      gesture.current = { px: e.clientX - view.x, py: e.clientY - view.y };
      if (view.zoom !== 1) setDragging(true);
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size === 2 && g.dist) {
      const [a, b] = [...pointers.current.values()];
      const next = g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist);
      setView((v) => zoomAbout(v, next));
    } else if (pointers.current.size === 1 && g.px !== undefined) {
      setView((v) => (v.zoom === 1 ? v : { ...v, x: e.clientX - g.px, y: e.clientY - g.py }));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const rest = [...pointers.current.values()];
    gesture.current = rest.length === 1 ? { px: rest[0].x - view.x, py: rest[0].y - view.y } : null;
    if (!rest.length) setDragging(false);
  };
  const onDoubleClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setView((v) => (v.zoom !== 1 ? FIT
      : zoomAbout(v, 2.5, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)));
  };

  return (
    <div className={`zv ${className}`}>
      <div
        ref={stageRef}
        className={`zv-stage${!isFit ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {src ? (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={measure}
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              transition: dragging ? 'none' : undefined,
            }}
          />
        ) : <p className="zv-empty">No preview available</p>}
      </div>

      <div className="zv-toolbar" role="toolbar" aria-label="Zoom controls">
        <button type="button" onClick={() => step(1 / 1.25)} disabled={view.zoom <= MIN} aria-label="Zoom out"><FiZoomOut /></button>
        <button type="button" className={is(75) ? 'is-active' : ''} onClick={() => setPercent(75)}>75%</button>
        <button type="button" className={is(100) ? 'is-active' : ''} onClick={() => setPercent(100)}>100%</button>
        <button type="button" className={isFit ? 'is-active' : ''} onClick={() => setView(FIT)}>Fit</button>
        <button type="button" onClick={() => step(1.25)} disabled={view.zoom >= MAX} aria-label="Zoom in"><FiZoomIn /></button>
        <span className="zv-level" aria-live="polite">{pct}%</span>
        {onFullscreen && (
          <button type="button" className="zv-full" onClick={onFullscreen} aria-label="Open full-screen viewer"><FiMaximize2 /></button>
        )}
      </div>
    </div>
  );
}
