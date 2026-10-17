import { useEffect } from 'react';

// ─── Flat saree template at true proportions ─────────────────────────────────
// Pure composition: the source images are only drawn, never modified.
// 1 inch = PX_PER_IN canvas pixels, so the canvas is the real saree aspect
// (e.g. 48" × (216" saree + 32" blouse piece) → 1488 × 288 px).
//
// Drawn in loom order (top → bottom: end border, pallu, body with side
// borders, blouse piece), then rotated 90° counter-clockwise into the flat
// layout orientation of the reference template:
//   [end border | pallu (full width) | body with borders top & bottom | blouse piece]
// Junctions are feathered (alpha-masked cross-fades) so the parts read as one
// woven textile, with no hard seams or bounding-box edges.
const PX_PER_IN = 6;
const JOIN_FEATHER_PX = 3; // soft weave join where border meets body

function templateSize(p) {
  const widthIn = p.leftBorderIn + p.bodyWidthIn + p.rightBorderIn;
  const lengthIn = p.sareeLenIn + p.blousePieceIn;
  return { W: Math.round(widthIn * PX_PER_IN), H: Math.round(lengthIn * PX_PER_IN) };
}

// Multiply-blend tint over a region (client-side colourway)
function tintRect(ctx, x, y, w, h, hex, alpha) {
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// Tile an image across a region; tileW is the tile width in px
function tileRegion(ctx, slot, x, y, w, h, tileW) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const img = slot.el;
  if (img) {
    const tw = Math.max(8, tileW * slot.scale);
    const th = Math.max(8, tw * (img.height / Math.max(1, img.width)));
    const rad = (slot.rot * Math.PI) / 180;
    const extra = slot.rot ? Math.hypot(tw, th) : 0;
    for (let ty = y - extra; ty < y + h + extra; ty += th) {
      for (let tx = x - extra; tx < x + w + extra; tx += tw) {
        ctx.save();
        ctx.translate(tx + tw / 2, ty + th / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -tw / 2, -th / 2, tw, th);
        ctx.restore();
      }
    }
  } else {
    ctx.fillStyle = slot.color;
    ctx.fillRect(x, y, w, h);
  }
  tintRect(ctx, x, y, w, h, slot.color, slot.tint);
  ctx.restore();
}

// Border run across the saree width (rotated so the motif runs along x)
function tileBorderAcross(ctx, slot, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y + h);
  ctx.rotate(-Math.PI / 2);
  tileRegion(ctx, slot, 0, 0, h, w, h);
  ctx.restore();
}

// Paint into an offscreen layer, fade the given edges to transparent, then
// composite — gives anti-aliased, seamless junctions between components.
function feathered(ctx, x, y, w, h, edges, paint) {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(w));
  off.height = Math.max(1, Math.ceil(h));
  const o = off.getContext('2d');
  o.translate(-x, -y);
  paint(o);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'destination-in';
  for (const [side, px] of Object.entries(edges)) {
    if (!px) continue;
    const g = {
      top:    () => o.createLinearGradient(0, 0, 0, px),
      bottom: () => o.createLinearGradient(0, off.height, 0, off.height - px),
      left:   () => o.createLinearGradient(0, 0, px, 0),
      right:  () => o.createLinearGradient(off.width, 0, off.width - px, 0),
    }[side]();
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    o.fillStyle = g;
    o.fillRect(0, 0, off.width, off.height);
  }
  ctx.drawImage(off, x, y);
}

function drawTemplate(canvas, p, imgs) {
  const ctx = canvas.getContext('2d');
  const { W, H } = templateSize(p);
  const px = (inches) => Math.round(inches * PX_PER_IN);
  const lb = px(p.leftBorderIn), rb = px(p.rightBorderIn);
  const endH = Math.min(lb, rb);              // end border across the pallu end
  const palluH = px(p.palluLenIn);            // includes the end border
  const sareeH = px(p.sareeLenIn);
  const blendH = Math.max(2, px(p.blendIn));  // pallu ↔ body cross-fade
  const bodyTileW = (W - lb - rb) / Math.max(1, p.motifRepsAcross);
  const f = JOIN_FEATHER_PX;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, H, W);
  // Rotate 90° counter-clockwise: loom-order (x, y) → canvas (y, W - x),
  // so the pallu end sits at the left of the flat layout
  ctx.translate(0, W);
  ctx.rotate(-Math.PI / 2);

  ctx.fillStyle = '#f5f0eb';
  ctx.fillRect(0, 0, W, H);

  // 1. Body field: tiled, running under the borders and into the blend zone
  tileRegion(ctx, imgs.body, 0, palluH - blendH, W, sareeH - palluH + blendH, bodyTileW);

  // 2. Pallu panel across the full width, placed once (no repeat), its lower
  //    edge cross-fading into the body
  feathered(ctx, 0, endH, W, palluH - endH + blendH, { bottom: blendH * 2 }, (o) => {
    const y0 = endH, h = palluH - endH + blendH;
    o.save();
    o.beginPath();
    o.rect(0, y0, W, h);
    o.clip();
    if (imgs.pallu.el) {
      o.drawImage(imgs.pallu.el, 0, y0, W, h);
    } else {
      o.fillStyle = imgs.pallu.color;
      o.fillRect(0, y0, W, h);
      o.globalAlpha = 0.15;
      o.fillStyle = '#000';
      for (let y = y0; y < y0 + h; y += px(4)) o.fillRect(0, y, W, px(1.5));
      o.globalAlpha = 1;
    }
    tintRect(o, 0, y0, W, h, imgs.pallu.color, imgs.pallu.tint);
    o.restore();
  });

  // 3. Longitudinal borders along the body only, feathered into the body and
  //    into the pallu so they emerge from it like a woven transition
  const borderTop = palluH - blendH;
  const borderH = sareeH - borderTop;
  feathered(ctx, 0, borderTop, lb, borderH, { right: f, top: blendH }, (o) =>
    tileRegion(o, imgs.border, 0, borderTop, lb, borderH, lb));
  feathered(ctx, W - rb, borderTop, rb, borderH, { left: f, top: blendH }, (o) =>
    tileRegion(o, imgs.border, W - rb, borderTop, rb, borderH, rb));

  // 4. End border across the pallu end, softly joined to the pallu
  feathered(ctx, 0, 0, W, endH + f, { bottom: f }, (o) =>
    tileBorderAcross(o, imgs.border, 0, 0, W, endH + f));

  // 5. Blouse piece after the saree: body fabric with a border edge,
  //    separated by a cut line
  if (H > sareeH) {
    tileRegion(ctx, imgs.body, 0, sareeH, W, H - sareeH, bodyTileW);
    feathered(ctx, 0, H - endH - f, W, endH + f, { top: f }, (o) =>
      tileBorderAcross(o, imgs.border, 0, H - endH - f, W, endH + f));
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, sareeH); ctx.lineTo(W, sareeH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ─── SimulationCanvas ────────────────────────────────────────────────────────
// onDraw lets the parent react to redraws (yarn colours, auto-save snapshot).
export default function SimulationCanvas({ canvasRef, params, imgs, zoom = 1, onDraw }) {
  const { W, H } = templateSize(params);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawTemplate(canvas, params, imgs);
    onDraw?.(canvas);
  }, [canvasRef, params, imgs, onDraw]);

  return (
    <canvas
      ref={canvasRef}
      width={H} height={W}
      style={{ display: 'block', width: Math.round(H * zoom), height: Math.round(W * zoom) }}
    />
  );
}
