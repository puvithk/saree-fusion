import { useEffect } from 'react';

// ─── Flat saree template at true proportions ─────────────────────────────────
// Pure composition: the source images are only drawn, never modified.
// 1 inch = PX_PER_IN canvas pixels, so the canvas is the real saree aspect
// (e.g. 48" × (216" saree + 32" blouse piece) → 1488 × 288 px).
//
// Drawn in loom order (top → bottom: pallu, body, blouse piece, with both
// warp borders running the full length), then rotated 90° counter-clockwise
// into the flat layout orientation of the reference template:
//   ═══════════════ top border (continuous) ═══════════════
//   [ pallu (weft) | body                  | blouse piece ]
//   ═══════════════ bottom border (continuous) ════════════
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

// Upright tiles: at scale 1 each tile is exactly h tall (aspect kept), so there
// is a single motif row vertically, repeated along x. The slot's Scale slider
// resizes tiles (scale < 1 adds rows) and Rotation turns each tile about its
// centre.
function tileRow(ctx, slot, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const img = slot.el;
  if (img) {
    // Whole-pixel tiles, each overlapping the next by 1 px: fractional tile
    // edges anti-alias into visible hairline division lines otherwise
    const th = Math.max(8, Math.round(h * (slot.scale || 1)));
    const tw = Math.max(8, Math.round(th * (img.width / Math.max(1, img.height))));
    const rad = ((slot.rot || 0) * Math.PI) / 180;
    // Rotated tiles need extra coverage so the corners stay filled
    const extra = rad ? Math.ceil(Math.hypot(tw, th)) : 0;
    for (let ty = Math.round(y) - extra; ty < y + h + extra; ty += th) {
      for (let tx = Math.round(x) - extra; tx < x + w + extra; tx += tw) {
        if (!rad) { ctx.drawImage(img, tx, ty, tw + 1, th + 1); continue; }
        ctx.save();
        ctx.translate(tx + tw / 2, ty + th / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -tw / 2, -th / 2, tw + 1, th + 1);
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

function drawTemplate(canvas, p, imgs) {
  const ctx = canvas.getContext('2d');
  const { W, H } = templateSize(p);
  const px = (inches) => Math.round(inches * PX_PER_IN);
  const lb = px(p.leftBorderIn), rb = px(p.rightBorderIn);
  const fieldW = W - lb - rb;                 // weft field between the warp borders
  const palluH = px(p.palluLenIn);
  const blendH = Math.max(2, px(p.blendIn));  // pallu ↔ body cross-fade
  const f = JOIN_FEATHER_PX;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, H, W);
  // Rotate 90° counter-clockwise: loom-order (x, y) → canvas (y, W - x),
  // so the pallu end sits at the left of the flat layout
  ctx.translate(0, W);
  ctx.rotate(-Math.PI / 2);

  ctx.fillStyle = '#f5f0eb';
  ctx.fillRect(0, 0, W, H);

  // Warp rule: border warp ends never move, so both borders run unbroken from
  // the first pick to the last (pallu → body → blouse). Pallu, body and blouse
  // are weft changes only, woven in the field between them. No crosswise
  // border is drawn anywhere — a warp border cannot turn 90°.

  // 1. Body field between the borders, through the saree and the blouse piece.
  //    Drawn in screen space (not loom space) so the swatch stays upright:
  //    one tile spans the field height, repeated only along the length.
  //    Loom rect (lb, palluH - blendH, fieldW, …) ↔ screen rect below.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  tileRow(ctx, imgs.body, palluH - blendH, rb, H - palluH + blendH, fieldW);
  ctx.restore();

  // 2. Pallu: panel between the borders at the left end, placed once, its
  //    inner edge cross-fading into the body. Drawn in screen space so the
  //    image stays upright; Scale zooms it and Rotation turns it in its panel.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const pw = palluH + blendH;
  feathered(ctx, 0, rb, pw, fieldW, { right: blendH * 2 }, (o) => {
    const slot = imgs.pallu;
    o.save();
    o.beginPath();
    o.rect(0, rb, pw, fieldW);
    o.clip();
    if (slot.el) {
      o.translate(pw / 2, rb + fieldW / 2);
      o.rotate(((slot.rot || 0) * Math.PI) / 180);
      o.scale(slot.scale || 1, slot.scale || 1);
      o.drawImage(slot.el, -pw / 2, -fieldW / 2, pw, fieldW);
      o.setTransform(1, 0, 0, 1, 0, -rb); // back to screen space of this layer
    } else {
      o.fillStyle = slot.color;
      o.fillRect(0, rb, pw, fieldW);
      o.globalAlpha = 0.15;
      o.fillStyle = '#000';
      for (let x = 0; x < pw; x += px(4)) o.fillRect(x, rb, px(1.5), fieldW);
      o.globalAlpha = 1;
    }
    tintRect(o, 0, rb, pw, fieldW, slot.color, slot.tint);
    o.restore();
  });
  ctx.restore();

  // 3. Continuous warp borders: full length, edge to edge, never broken.
  //    Like the body, drawn in screen space so the swatch stays upright: one
  //    tile spans the band height, repeated only along the length.
  //    Loom left border → bottom band, loom right border → top band; each
  //    reaches f px into the field and fades there.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  feathered(ctx, 0, 0, H, rb + f, { bottom: f }, (o) =>
    tileRow(o, imgs.border, 0, 0, H, rb + f));
  feathered(ctx, 0, W - lb - f, H, lb + f, { top: f }, (o) =>
    tileRow(o, imgs.border, 0, W - lb - f, H, lb + f));
  ctx.restore();

  // 4. Blouse piece: same warp and body weave, so it continues seamlessly —
  //    no cut / division line is drawn

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
