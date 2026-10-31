// ─── Client-side colour combinations ─────────────────────────────────────────
// Pure UI: every change only re-tints the canvas via multiply blending.
// No API / AI calls are made here.

const COLOR_PRESETS = [
  { name: 'Kanchi Classic', body: '#b0122b', border: '#d4a017', pallu: '#7a0c1e' },
  { name: 'Peacock',        body: '#0f6b6b', border: '#c9a227', pallu: '#1d3f8f' },
  { name: 'Mysore Mango',   body: '#e8a317', border: '#8b1a1a', pallu: '#2e7d32' },
  { name: 'Royal Purple',   body: '#4a2080', border: '#c47b1a', pallu: '#e01050' },
  { name: 'Ivory Zari',     body: '#f3e9d2', border: '#b8860b', pallu: '#a0522d' },
];

const SLOTS = [
  { key: 'body',   label: 'Body' },
  { key: 'border', label: 'Border' },
  { key: 'pallu',  label: 'Pallu' },
];

export default function ColorPickerOverlay({ imgs, onChange }) {
  const applyPreset = (preset) => {
    SLOTS.forEach(({ key }) => onChange(key, { color: preset[key] }));
  };

  return (
    <div style={{ background: '#1e2235', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ color: '#f0a030', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
        COLOUR COMBINATIONS
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {COLOR_PRESETS.map((preset) => (
          <button key={preset.name} onClick={() => applyPreset(preset)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#252840',
              border: '1px solid #2f3350', borderRadius: 6, padding: '5px 8px',
              color: '#ccc', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ display: 'flex' }}>
              {SLOTS.map(({ key }) => (
                <span key={key} style={{ width: 12, height: 12, background: preset[key],
                  border: '1px solid #111' }} />
              ))}
            </span>
            {preset.name}
          </button>
        ))}
      </div>

      {SLOTS.map(({ key, label }) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>{label}</span>
            <input type="color" value={imgs[key].color}
              onChange={(e) => onChange(key, { color: e.target.value })}
              style={{ width: 28, height: 22, padding: 0, border: 'none',
                borderRadius: 4, cursor: 'pointer', background: 'none' }} />
          </div>
          <input type="range" min="0" max="0.9" step="0.05" value={imgs[key].tint}
            title={`${label} tint strength`}
            onChange={(e) => onChange(key, { tint: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: imgs[key].color }} />
        </div>
      ))}
    </div>
  );
}
