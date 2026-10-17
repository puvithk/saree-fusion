import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 3D drape simulation ─────────────────────────────────────────────────────
// Lazy-loaded (see Simulation page) so three.js only ships when this view opens.
// Mannequin and drape are procedural: no model files to download.
//
// Orientation: mannequin faces +z, so the wearer's LEFT is +x. Angles θ are
// measured around the y-axis with x = cos θ, z = sin θ (front = +π/2).
//
// Texturing: each saree asset gets its own texture and material, mapped onto
// its own region of the drape:
//   body   → skirt field, pleats, chest wrap, blouse, blouse piece (tiled, UVs in metres)
//   border → floor hem, pleat-fan edges, both long edges + end of the pallu, blouse trim
//            (UV x = across the band 0..1, UV y = metres along the run)
//   pallu  → only the terminal panel at the end of the fall (UV 0..1, no repeat)
// Colourways are material.color multipliers: a client-side shader tint over the
// existing textures, identical to the 2D template's multiply blend.
const FRONT = Math.PI / 2;
const BACK = -Math.PI / 2;
const NIVI_PLEATS = FRONT + 0.12; // pleats sit just right of the fall, as in the reference
const IN = 0.0254; // metres per inch

// Mannequin silhouette (radius, height), top → bottom
const PROFILE = [
  [0.0, 1.72], [0.06, 1.70], [0.075, 1.64], [0.05, 1.58], [0.06, 1.55],
  [0.14, 1.52], [0.175, 1.48], [0.17, 1.40], [0.155, 1.30], [0.125, 1.12],
  [0.13, 1.06], [0.17, 0.95], [0.165, 0.75], [0.13, 0.45], [0.095, 0.10], [0.0, 0.06],
];

function profileR(y) {
  if (y >= PROFILE[0][1]) return PROFILE[0][0];
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i - 1], [r2, y2] = PROFILE[i];
    if (y >= y2) return r1 + (r2 - r1) * ((y1 - y) / (y1 - y2));
  }
  return 0;
}
const profileSlope = (y) => (profileR(y + 0.005) - profileR(y - 0.005)) / 0.01;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ── Generic (nu × nv) grid → BufferGeometry; fn(u, v) returns { p, uv } ──
function gridGeometry(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const { p, uv: t } = fn(i / nu, j / nv);
      pos.push(p.x, p.y, p.z);
      uv.push(t[0], t[1]);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── Skirt (lower drape) ──
const SKIRT_TOP = 1.07, SKIRT_BOT = 0.04;
const PLEAT_HALF = 0.42;   // half-width of the pleat fan, radians
const PLEAT_FREQ = 44;     // ≈ 6 knife pleats across the fan

function skirtBaseR(y) {
  const t = (SKIRT_TOP - y) / (SKIRT_TOP - SKIRT_BOT);
  const flare = 0.15 + 0.16 * Math.pow(Math.max(0, t), 0.9);
  return Math.max(profileR(y) + 0.02, flare);
}

function skirtR(a, y, pleatCenter) {
  const t = (SKIRT_TOP - y) / (SKIRT_TOP - SKIRT_BOT);
  const d = angleDiff(a, pleatCenter);
  let r = skirtBaseR(y);
  if (Math.abs(d) < PLEAT_HALF) {
    // Knife pleats: sawtooth folds, deeper towards the hem, fanned out by the
    // stack of fabric tucked at the navel
    const k = 1 - Math.abs(d) / PLEAT_HALF;
    const phase = (d * PLEAT_FREQ) / (2 * Math.PI);
    r += (0.006 + 0.026 * t) * (phase - Math.floor(phase)) * Math.min(1, k * 3)
      + 0.012 * k * (0.4 + t);
  } else {
    r += Math.sin(a * 9) * 0.004 * t; // soft drape ripple on the wrap
  }
  return r;
}

const skirtPoint = (a, y, pc, extra = 0) => {
  const r = skirtR(a, y, pc) + extra;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
};

function buildSkirt(mats, pleatCenter, borderM) {
  const seam = pleatCenter + Math.PI; // texture seam hidden opposite the pleats
  const hemTop = SKIRT_BOT + borderM;
  const group = new THREE.Group();

  // Body field: waist → top of hem border
  group.add(new THREE.Mesh(gridGeometry(320, 48, (u, v) => {
    const a = seam + u * Math.PI * 2;
    const y = SKIRT_TOP + (hemTop - SKIRT_TOP) * v;
    return { p: skirtPoint(a, y, pleatCenter), uv: [u * Math.PI * 2 * skirtBaseR(y), y] };
  }), mats.body));

  // Floor hem border, continuous all the way round
  const hemR = skirtBaseR(SKIRT_BOT);
  group.add(new THREE.Mesh(gridGeometry(320, 6, (u, v) => {
    const a = seam + u * Math.PI * 2;
    const y = hemTop + (SKIRT_BOT - hemTop) * v;
    return { p: skirtPoint(a, y, pleatCenter), uv: [v, u * Math.PI * 2 * hemR] };
  }), mats.border));

  // Vertical border on both outer edges of the pleat fan, waist → hem border
  const stripM = borderM * 0.45;
  for (const edge of [-1, 1]) {
    const a0 = pleatCenter + edge * PLEAT_HALF;
    group.add(new THREE.Mesh(gridGeometry(4, 40, (u, v) => {
      const y = SKIRT_TOP + (hemTop - SKIRT_TOP) * v;
      const a = a0 + ((u - 0.5) * stripM) / skirtBaseR(y);
      return { p: skirtPoint(a, y, pleatCenter, 0.002), uv: [u, SKIRT_TOP - y] };
    }), mats.border));
  }
  return group;
}

// ── Pallu (upper drape) — display drape from the reference image ──
// 1. Wrap: from the right hip in front, diagonally up across the chest (its
//    upper border reads as the diagonal border line) to the LEFT shoulder.
// 2. Fall: from the left shoulder the pallu hangs straight down in front of
//    the left side to just above the floor; the woven pallu panel and the
//    end border sit at the bottom of the fall. The Kodava drape mirrors this.
const WRAP_KEYS = [
  [FRONT + 0.75, 1.00, 0.30],
  [FRONT + 0.25, 1.18, 0.30],
  [FRONT - 0.30, 1.37, 0.26],
  [0.30,          1.52, 0.20],
];
const FALL_TOP = 1.52, FALL_BOT = 0.10;
const FALL_THETA = FRONT - 0.62;  // hangs in front of the left side
const PALLU_PANEL_M = 0.42;      // length of the woven pallu panel at the end
const ribbonBorder = (borderM) => Math.min(0.2, borderM / 0.3);

// Minimum radius at (θ, y) that clears the body, blouse and the pleated skirt
function clearR(a, y, pleatCenter) {
  const body = profileR(y) + 0.022;
  return y < SKIRT_TOP + 0.02 ? Math.max(body, skirtR(a, y, pleatCenter) + 0.02) : body;
}

function pushOut(p, pleatCenter, extra = 0) {
  const rr = Math.hypot(p.x, p.z);
  const minR = clearR(Math.atan2(p.z, p.x), p.y, pleatCenter) + extra;
  if (rr < minR && rr > 1e-4) { p.x *= minR / rr; p.z *= minR / rr; }
  return p;
}

// Build ribbon sections from per-row frames { c, n, side, w, L, fold }
function ribbonSections(frames, pleatCenter, extra, parts) {
  const point = (k, e) => {
    const { c, n, side, w, fold } = frames[k];
    const p = c.clone().addScaledVector(side, e * w);
    p.addScaledVector(n, fold(e));
    return pushOut(p, pleatCenter, extra);
  };
  const group = new THREE.Group();
  for (const { k0, k1, e0, e1, mat, uv } of parts) {
    group.add(new THREE.Mesh(
      gridGeometry(Math.max(2, Math.round((e1 - e0) * 28)), k1 - k0, (u, v) => {
        const k = Math.round(k0 + (k1 - k0) * v);
        const e = e0 + (e1 - e0) * u;
        return { p: point(k, e), uv: uv(frames[k], e, u) };
      }), mat));
  }
  return group;
}

function buildWrap(mats, mirror, pleatCenter, bf) {
  const path = new THREE.CatmullRomCurve3(
    WRAP_KEYS.map(([th, y, w]) => new THREE.Vector3(mirror ? Math.PI - th : th, y, w)),
    false, 'centripetal');
  const onBody = (th, y) => {
    const r = clearR(th, y, pleatCenter);
    return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
  };
  const N = 80, frames = [];
  let len = 0;
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    const { x: th, y, z: w } = path.getPointAt(s);
    const c = onBody(th, y);
    const ahead = path.getPointAt(Math.min(1, s + 0.01));
    const behind = path.getPointAt(Math.max(0, s - 0.01));
    const tan = onBody(ahead.x, ahead.y).sub(onBody(behind.x, behind.y)).normalize();
    // Surface normal of the lathe body, tilted up over the shoulder slope
    const n = new THREE.Vector3(Math.cos(th), -profileSlope(y), Math.sin(th)).normalize();
    const side = new THREE.Vector3().crossVectors(tan, n).normalize();
    if (k > 0) len += c.distanceTo(frames[k - 1].c);
    // Gathered folds where the drape is pinned on the shoulder
    const gather = Math.exp(-Math.pow((s - 1) / 0.25, 2));
    frames.push({ c, n, side, w, L: len,
      fold: (e) => Math.sin(e * Math.PI * 10) * 0.012 * gather + Math.sin(e * Math.PI * 4 + s * 14) * 0.003 });
  }
  return ribbonSections(frames, pleatCenter, 0, [
    { k0: 0, k1: N, e0: -0.5 + bf, e1: 0.5 - bf, mat: mats.body, uv: (f, e) => [e * f.w, f.L] },
    { k0: 0, k1: N, e0: -0.5, e1: -0.5 + bf, mat: mats.border, uv: (f, e, u) => [u, f.L] },
    { k0: 0, k1: N, e0: 0.5 - bf, e1: 0.5, mat: mats.border, uv: (f, e, u) => [1 - u, f.L] },
  ]);
}

function buildFall(mats, mirror, pleatCenter, bf, borderM) {
  const N = 90, frames = [];
  const sign = mirror ? -1 : 1;
  const th0 = mirror ? Math.PI - 0.30 : 0.30;
  const th1 = mirror ? Math.PI - FALL_THETA : FALL_THETA;
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    const y = FALL_TOP + (FALL_BOT - FALL_TOP) * s;
    // Swing from the shoulder point round to the front-left, then hang straight
    const swing = Math.min(1, s / 0.12);
    const th = th0 + (th1 - th0) * (1 - Math.pow(1 - swing, 2));
    // Hang clear of the body and of the pleat stack, flaring gently to the floor
    const r = Math.max(profileR(y) + 0.045, y < SKIRT_TOP ? skirtBaseR(y) + 0.06 : 0) + 0.02 * s;
    const c = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    const n = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(sign);
    const w = 0.24 + 0.16 * Math.min(1, s * 1.6);
    frames.push({ c, n, side, w, L: FALL_TOP - y,
      fold: (e) => Math.sin(e * Math.PI * 6 + 0.6) * 0.008 * (0.3 + s) });
  }
  const totalL = FALL_TOP - FALL_BOT;
  const endM = borderM * 0.6;
  const kPanel = Math.round(N * (1 - (PALLU_PANEL_M + endM) / totalL));
  const kEnd = Math.round(N * (1 - endM / totalL));
  const L0 = frames[kPanel].L, L1 = frames[kEnd].L;
  return ribbonSections(frames, pleatCenter, 0.015, [
    // Body field from the shoulder down to the pallu panel
    { k0: 0, k1: kPanel, e0: -0.5 + bf, e1: 0.5 - bf, mat: mats.body, uv: (f, e) => [e * f.w, f.L] },
    // Woven pallu panel, mapped exactly once (no stretch over the drape, no repeat)
    { k0: kPanel, k1: kEnd, e0: -0.5 + bf, e1: 0.5 - bf, mat: mats.pallu,
      uv: (f, e, u) => [u, 1 - (f.L - L0) / (L1 - L0)] },
    // End border across the bottom of the pallu
    { k0: kEnd, k1: N, e0: -0.5 + bf, e1: 0.5 - bf, mat: mats.border, uv: (f, e) => [e * f.w, f.L] },
    // Long-edge borders, full length of the fall
    { k0: 0, k1: N, e0: -0.5, e1: -0.5 + bf, mat: mats.border, uv: (f, e, u) => [u, f.L] },
    { k0: 0, k1: N, e0: 0.5 - bf, e1: 0.5, mat: mats.border, uv: (f, e, u) => [1 - u, f.L] },
  ]);
}

function buildPallu(mats, mirror, pleatCenter, borderM) {
  const bf = ribbonBorder(borderM);
  const group = new THREE.Group();
  group.add(buildWrap(mats, mirror, pleatCenter, bf));
  group.add(buildFall(mats, mirror, pleatCenter, bf, borderM));
  return group;
}

// Black jersey dress form with a brushed-metal neck cap (as in the reference)
function buildMannequin() {
  const pts = PROFILE.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 })));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.035, 40),
    new THREE.MeshStandardMaterial({ color: 0xa8a8a8, roughness: 0.35, metalness: 0.8 }));
  cap.position.y = 1.715;
  group.add(cap);
  return group;
}

// Fitted blouse (choli) in the body fabric with a border trim at the hem
function buildBlouse(mats) {
  const ring = (y0, y1, mat, uvFn) => new THREE.Mesh(gridGeometry(96, 16, (u, v) => {
    const a = u * Math.PI * 2;
    const y = y0 + (y1 - y0) * v;
    const r = profileR(y) + 0.006;
    return { p: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), uv: uvFn(a * r, y, v) };
  }), mat);
  const group = new THREE.Group();
  group.add(ring(1.53, 1.21, mats.body, (s, y) => [s, y]));
  group.add(ring(1.21, 1.17, mats.border, (s, y, v) => [v, s]));
  return group;
}

// Unstitched blouse piece resting on the floor beside the mannequin
function buildBlousePiece(mats) {
  const Wm = 0.42, Dm = 0.30, edge = 0.05;
  const lay = (x, z) => new THREE.Vector3(x, 0.042 + 0.006 * Math.sin(x * 18) * Math.sin(z * 11), z);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(gridGeometry(24, 16, (u, v) => {
    const x = u * Wm, z = v * (Dm - edge);
    return { p: lay(x, z), uv: [x, z] };
  }), mats.body));
  group.add(new THREE.Mesh(gridGeometry(24, 2, (u, v) => {
    const x = u * Wm, z = Dm - edge + v * edge;
    return { p: lay(x, z), uv: [v, x] };
  }), mats.border));
  group.position.set(-0.75, 0, 0.25);
  group.rotation.y = -0.4;
  return group;
}

// ── Textures from the pre-generated asset images (no network, no AI) ──
function makeTexture(img, renderer) {
  const tex = img ? new THREE.Texture(img)
    : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

function disposeObject(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

export default function DrapeViewer3D({ imgs, params, drapeStyle = 'normal' }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const borderM = params.leftBorderIn * IN;

  // ── Renderer, camera, lights, mannequin, blouse: created once ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f4);
    // Front view slightly off-axis, matching the reference product shot
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 20);
    camera.position.set(0.45, 1.15, 2.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.8;
    controls.maxDistance = 5;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1.5, 3, 2.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe0c0, 0.7);
    fill.position.set(-2, 2, -2.5);
    scene.add(fill);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64),
      new THREE.MeshStandardMaterial({ color: 0xe6e3df, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.035;

    const matOpts = { side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1 };
    const mats = {
      body: new THREE.MeshStandardMaterial(matOpts),
      pallu: new THREE.MeshStandardMaterial(matOpts),
      // Border strips overlay the skirt: pull them forward to avoid z-fighting
      border: new THREE.MeshStandardMaterial({ ...matOpts, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    };

    const mannequin = buildMannequin();
    const blouse = buildBlouse(mats);
    const blousePiece = buildBlousePiece(mats);
    scene.add(floor, mannequin, blouse, blousePiece);
    threeRef.current = { scene, renderer, mats, textures: {} };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      [mannequin, blouse, blousePiece, floor].forEach(disposeObject);
      mannequin.traverse((o) => o.material?.dispose());
      floor.material.dispose();
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(threeRef.current.textures).forEach((t) => t.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, []);

  // ── Drape geometry: rebuilt only when the drape style / border width changes ──
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    const kodava = drapeStyle === 'kadagu';
    const drape = new THREE.Group();
    const pleatCenter = kodava ? BACK : NIVI_PLEATS;
    drape.add(buildSkirt(three.mats, pleatCenter, borderM));
    drape.add(buildPallu(three.mats, kodava, pleatCenter, borderM));
    three.scene.add(drape);
    return () => {
      three.scene.remove(drape);
      disposeObject(drape);
    };
  }, [drapeStyle, borderM]);

  // ── Textures: rebuilt only when an asset image, scale or rotation changes ──
  const { body, border, pallu } = imgs;
  const bodyTileM = (params.bodyWidthIn * IN) / Math.max(1, params.motifRepsAcross);
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    const { renderer, mats } = three;
    const aspect = (img) => (img ? img.height / Math.max(1, img.width) : 1);

    const bodyTex = makeTexture(body.el, renderer);
    bodyTex.wrapS = bodyTex.wrapT = THREE.RepeatWrapping;
    const tw = bodyTileM * body.scale;
    bodyTex.repeat.set(1 / tw, 1 / (tw * aspect(body.el)));
    bodyTex.rotation = (body.rot * Math.PI) / 180;

    const borderTex = makeTexture(border.el, renderer);
    borderTex.wrapS = borderTex.wrapT = THREE.RepeatWrapping;
    borderTex.repeat.set(1, 1 / (borderM * aspect(border.el) * border.scale));

    const palluTex = makeTexture(pallu.el, renderer); // clamp: placed once, never repeated

    const next = { body: bodyTex, border: borderTex, pallu: palluTex };
    Object.entries(next).forEach(([k, tex]) => {
      mats[k].map = tex;
      mats[k].needsUpdate = true;
    });
    const prev = three.textures;
    three.textures = next;
    Object.values(prev).forEach((t) => t.dispose());
  }, [body.el, body.scale, body.rot, border.el, border.scale, pallu.el, bodyTileM, borderM]);

  // ── Colourways: tint = lerp(white, colour, strength) as a material multiplier ──
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    for (const [k, slot] of Object.entries({ body, border, pallu })) {
      three.mats[k].color.set(0xffffff).lerp(new THREE.Color(slot.color), slot.tint);
    }
  }, [body.color, body.tint, border.color, border.tint, pallu.color, pallu.tint]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div ref={mountRef}
        style={{ width: '100%', height: '68vh', borderRadius: 8, overflow: 'hidden',
          border: '1px solid #2a2d42', cursor: 'grab' }} />
      <div style={{ fontSize: 11, color: '#666', marginTop: 6, textAlign: 'center' }}>
        Drag to rotate 360° · scroll / pinch to zoom
      </div>
    </div>
  );
}
