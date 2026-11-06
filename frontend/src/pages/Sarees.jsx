import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoreHorizontal, Search, Sparkles, X } from 'lucide-react';
import QuickActionSheet from '../components/collections/QuickActionSheet';
import { latestSarees } from '../data/mockData';
import { haptic } from '../utils/haptics';

const COLOR_DOTS = {
  Red: '#c1121f', Gold: '#d4a017', Ivory: '#f1e9d2', Maroon: '#6d1a36', Green: '#1f7a4d',
};
const GROUPS = [
  { key: 'color', label: 'Colour' },
  { key: 'weave', label: 'Weave' },
  { key: 'motif', label: 'Motif' },
];
// Varied crop ratios give the masonry its rhythm
const RATIOS = ['aspect-[4/5]', 'aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[5/6]'];

// Catalog entries as collection items, so the shared quick-action sheet can use them
const catalog = latestSarees.map((s, i) => ({
  ...s,
  index: i,
  kind: 'design',
  drape: s.image,
  template: s.image,
  batchId: '0',
  status: { key: 'ready', label: 'Production Ready' },
  swatches: {},
  order: null,
  createdLabel: `${s.weave} · ${s.color}`,
}));

const unique = (key) => [...new Set(catalog.map((s) => s[key]))];

export default function Sarees() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ color: null, weave: null, motif: null });
  const [sheetItem, setSheetItem] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((s) =>
      GROUPS.every(({ key }) => !filters[key] || s[key] === filters[key])
      && (!q || [s.name, s.id, s.color, s.weave, s.motif].join(' ').toLowerCase().includes(q)));
  }, [query, filters]);

  const toggle = (key, value) => {
    haptic(8);
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));
  };
  const active = Object.values(filters).filter(Boolean).length + (query ? 1 : 0);
  const detailsTo = (s) => `/collections/batch/0/design/${s.index}`;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Saree <span className="text-gold">catalog</span>
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-base">Browse designs by colour, weave and motif.</p>
        </div>
        <Link to="/design"
          className="sf-tap inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f2d874] to-gold px-5 font-semibold text-[#1d1700]">
          <Sparkles size={18} /> Create your own
        </Link>
      </header>

      {/* Sticky search + horizontally scrolling filter pills */}
      <div className="sticky top-[60px] z-30 -mx-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl sm:top-16 sm:-mx-6 sm:px-6 lg:top-[72px] lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
        <label className="flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface px-4 focus-within:border-gold">
          <Search size={18} className="shrink-0 text-muted" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, colour, weave or motif"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-muted focus:outline-none" />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')}
              className="sf-tap grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted"><X size={16} /></button>
          )}
        </label>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {GROUPS.map(({ key, label }) => (
            <div key={key} className="flex shrink-0 items-center gap-2">
              <span className="pl-1 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
              {unique(key).map((value) => {
                const on = filters[key] === value;
                return (
                  <button key={value} type="button" aria-pressed={on} onClick={() => toggle(key, value)}
                    className={`sf-tap inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors
                      ${on ? 'border-gold bg-gold text-[#1d1700]' : 'border-line bg-surface text-fg'}`}>
                    {key === 'color' && <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: COLOR_DOTS[value] }} />}
                    {value}
                  </button>
                );
              })}
              <span className="mx-1 h-6 w-px shrink-0 bg-line last:hidden" />
            </div>
          ))}
          {active > 0 && (
            <button type="button" onClick={() => { setFilters({ color: null, weave: null, motif: null }); setQuery(''); }}
              className="sf-tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-gold">
              <X size={15} /> Clear ({active})
            </button>
          )}
        </div>
      </div>

      <p className="my-4 text-sm text-muted" aria-live="polite">{visible.length} {visible.length === 1 ? 'saree' : 'sarees'}</p>

      {visible.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line py-16 text-center text-muted">
          <p>No sarees match those filters.</p>
          <button type="button" onClick={() => { setFilters({ color: null, weave: null, motif: null }); setQuery(''); }}
            className="sf-tap min-h-11 rounded-xl bg-gold px-5 font-semibold text-[#1d1700]">Clear filters</button>
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {visible.map((s, i) => (
            <motion.article key={s.id} layout="position" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04, type: 'spring', stiffness: 260, damping: 26 }}
              className="group relative mb-4 break-inside-avoid overflow-hidden rounded-3xl border border-line bg-glass shadow-lg backdrop-blur-md transition-shadow hover:shadow-[0_0_0_1px_var(--sf-gold),0_18px_44px_rgba(0,0,0,0.25)]">
              <button type="button" className="sf-tap block w-full text-left"
                onClick={() => {
                  haptic(8);
                  if (window.matchMedia('(max-width: 767px)').matches) setSheetItem(s);
                  else navigate(detailsTo(s));
                }}>
                <div className={`${RATIOS[i % RATIOS.length]} overflow-hidden bg-surface-2`}>
                  <img src={s.image} alt={s.name} loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="space-y-1.5 p-4">
                  <h3 className="font-display text-base font-semibold leading-snug text-fg">{s.name}</h3>
                  <p className="text-xs text-muted">{s.weave} · {s.color} · {s.motif}</p>
                  <span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                    {s.matchPercent}
                  </span>
                </div>
              </button>
              <button type="button" aria-label={`Quick actions for ${s.name}`}
                onClick={() => { haptic(8); setSheetItem(s); }}
                className="sf-tap absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
                <MoreHorizontal size={20} />
              </button>
            </motion.article>
          ))}
        </div>
      )}

      <QuickActionSheet item={sheetItem} detailsTo={sheetItem ? detailsTo(sheetItem) : '#'}
        open={Boolean(sheetItem)} onClose={() => setSheetItem(null)} />
    </div>
  );
}
