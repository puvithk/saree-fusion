// ─── CAD simulation: flat technical sketch of the full saree ─────────────────
// Lays the saree out lengthwise (body → blend → pallu) with selvedge borders
// top and bottom, repeat grid, seam/selvedge lines and dimension callouts.

export default function CadViewer({ params: p, specs }) {
  const totalW = p.leftBorderIn + p.bodyWidthIn + p.rightBorderIn;
  const SAREE_LENGTH_IN = p.sareeLenIn;
  const bodyLen = SAREE_LENGTH_IN - p.palluLenIn;

  // SVG units are inches, with margins for dimension lines
  const M = 18;
  const vbW = SAREE_LENGTH_IN + M * 2;
  const vbH = totalW + M * 2.6;
  const x0 = M, y0 = M;
  const yBodyTop = y0 + p.leftBorderIn;
  const yBodyBot = yBodyTop + p.bodyWidthIn;
  const xPallu = x0 + bodyLen;

  const reps = Math.max(1, p.motifRepsAcross);
  const repAcross = p.bodyWidthIn / reps;
  const repAlong = Math.max(0.5, p.motifAlong);
  const gridV = [];
  for (let x = x0 + repAlong; x < xPallu - p.blendIn; x += repAlong) gridV.push(x);
  const gridH = Array.from({ length: reps - 1 }, (_, i) => yBodyTop + repAcross * (i + 1));

  const stroke = '#7fb3ff';
  const dim = '#f0a030';
  const fs = 3.2;

  return (
    <div style={{ width: '100%', background: '#0d1b2e', borderRadius: 8, padding: 12,
      border: '1px solid #2a2d42', boxSizing: 'border-box' }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        fontFamily="monospace">
        <defs>
          <pattern id="cadGrid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#16304f" strokeWidth="0.2" />
          </pattern>
          <marker id="arr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill={dim} />
          </marker>
        </defs>
        <rect width={vbW} height={vbH} fill="url(#cadGrid)" />

        {/* Borders (selvedge bands) */}
        <rect x={x0} y={y0} width={SAREE_LENGTH_IN} height={p.leftBorderIn}
          fill="rgba(240,160,48,0.12)" stroke={stroke} strokeWidth="0.4" />
        <rect x={x0} y={yBodyBot} width={SAREE_LENGTH_IN} height={p.rightBorderIn}
          fill="rgba(240,160,48,0.12)" stroke={stroke} strokeWidth="0.4" />

        {/* Body, blend, pallu */}
        <rect x={x0} y={yBodyTop} width={bodyLen - p.blendIn} height={p.bodyWidthIn}
          fill="none" stroke={stroke} strokeWidth="0.4" />
        <rect x={xPallu - p.blendIn} y={yBodyTop} width={p.blendIn} height={p.bodyWidthIn}
          fill="rgba(127,179,255,0.15)" stroke={stroke} strokeWidth="0.3" strokeDasharray="1 1" />
        <rect x={xPallu} y={y0} width={p.palluLenIn} height={totalW}
          fill="rgba(224,16,80,0.10)" stroke={stroke} strokeWidth="0.5" />

        {/* Repeat grid in the body */}
        {gridV.map((x) => (
          <line key={`v${x}`} x1={x} y1={yBodyTop} x2={x} y2={yBodyBot}
            stroke="#3d6ea8" strokeWidth="0.2" strokeDasharray="0.8 0.8" />
        ))}
        {gridH.map((y) => (
          <line key={`h${y}`} x1={x0} y1={y} x2={xPallu - p.blendIn} y2={y}
            stroke="#3d6ea8" strokeWidth="0.2" strokeDasharray="0.8 0.8" />
        ))}

        {/* Seams: border-to-body joins and pallu join */}
        {[yBodyTop, yBodyBot].map((y) => (
          <line key={`s${y}`} x1={x0} y1={y} x2={xPallu} y2={y}
            stroke="#ff6b6b" strokeWidth="0.35" strokeDasharray="2 1" />
        ))}
        <line x1={xPallu} y1={y0} x2={xPallu} y2={y0 + totalW}
          stroke="#ff6b6b" strokeWidth="0.35" strokeDasharray="2 1" />

        {/* Labels */}
        <g fill="#cfe0ff" fontSize={fs}>
          <text x={x0 + 2} y={y0 + p.leftBorderIn / 2 + 1}>BORDER {p.leftBorderIn}"</text>
          <text x={x0 + 2} y={yBodyBot + p.rightBorderIn / 2 + 1}>BORDER {p.rightBorderIn}"</text>
          <text x={x0 + 3} y={yBodyTop + 5}>BODY · repeat {repAcross.toFixed(1)}" × {repAlong.toFixed(1)}"</text>
          <text x={xPallu + 3} y={y0 + totalW / 2}>PALLU</text>
          <text x={xPallu + 3} y={y0 + totalW / 2 + 4.5}>{p.palluLenIn}"</text>
        </g>

        {/* Dimension: overall length */}
        <line x1={x0} y1={y0 + totalW + 7} x2={x0 + SAREE_LENGTH_IN} y2={y0 + totalW + 7}
          stroke={dim} strokeWidth="0.3" markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={x0 + SAREE_LENGTH_IN / 2} y={y0 + totalW + 12} fill={dim} fontSize={fs} textAnchor="middle">
          {SAREE_LENGTH_IN}" overall · body {bodyLen.toFixed(1)}" · blend {p.blendIn}"
        </text>

        {/* Dimension: width */}
        <line x1={x0 - 7} y1={y0} x2={x0 - 7} y2={y0 + totalW}
          stroke={dim} strokeWidth="0.3" markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={x0 - 9} y={y0 + totalW / 2} fill={dim} fontSize={fs} textAnchor="middle"
          transform={`rotate(-90 ${x0 - 9} ${y0 + totalW / 2})`}>{totalW.toFixed(1)}" width</text>
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, fontSize: 11, color: '#9ab' }}>
        <span><b style={{ color: '#ff6b6b' }}>- - -</b> seam / join</span>
        <span><b style={{ color: '#3d6ea8' }}>····</b> repeat grid</span>
        <span>Border : body scale = 1 : {(p.bodyWidthIn / Math.max(0.1, p.leftBorderIn)).toFixed(2)}</span>
        <span>Border repeats in pallu: {specs.repeat.borderRepeats} (stretch {specs.repeat.borderStretch}×)</span>
        <span>Warp ends: {specs.warpEnds.total}</span>
      </div>
    </div>
  );
}
