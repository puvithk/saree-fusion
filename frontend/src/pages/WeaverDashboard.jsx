import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, CheckCircle2, ChevronDown, Clock, Cpu, Download, Factory, FileText, Layers, Loader2, Trash2,
} from 'lucide-react';
import ShuttleLoader from '../components/motion/ShuttleLoader';
import { API_BASE_URL } from '../config';
import { haptic } from '../utils/haptics';

const abs = (u) => (u && u.startsWith('/api/') ? `${API_BASE_URL}${u}` : u);

const STATE = {
  ready: { label: 'Ready', cls: 'bg-sky-500/15 text-sky-500', icon: Clock },
  production: { label: 'In Production', cls: 'bg-amber-500/15 text-amber-500', icon: Factory },
  compiled: { label: 'Compiled', cls: 'bg-emerald-500/15 text-emerald-500', icon: CheckCircle2 },
};
const LOOM_TABS = { traditional: 'Traditional', digital: 'Digital', dobby: 'Dobby' };

const panel = 'rounded-3xl border border-line bg-glass backdrop-blur-md';

function StatusBadge({ state }) {
  const { label, cls, icon: Icon } = STATE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <Icon size={14} /> {label}
    </span>
  );
}

const ext = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : 'file');

function FileButton({ file }) {
  return (
    <a href={file.href} target="_blank" rel="noopener noreferrer" download={file.filename}
      className="sf-tap flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface-2/60 px-3 text-fg">
      <span className="grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-xs font-bold uppercase text-gold">.{ext(file.filename)}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{file.label}</span>
      <Download size={18} className="shrink-0 text-muted" />
    </a>
  );
}

/* One-tap loom file hub for a single order */
function LoomHub({ order, state, onCompile }) {
  const [kind, setKind] = useState('traditional');

  if (state === 'production') {
    return <ShuttleLoader label="Compiling loom cards…" />;
  }

  if (state !== 'compiled') {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line p-6 text-center">
        <Cpu size={36} className="text-muted" />
        <p className="max-w-sm text-sm text-muted">
          Compile the flat layout into Jacquard and dobby lift files for the loom.
        </p>
        <button type="button" onClick={onCompile}
          className="sf-tap inline-flex min-h-12 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f2d874] to-gold px-6 font-semibold text-[#1d1700]">
          <Cpu size={18} /> Generate loom files
        </button>
      </div>
    );
  }

  const outputs = order.loomOutputs;
  if (!outputs) {
    // Older orders compiled before loomOutputs existed
    const legacy = [
      order.jacquardCardUrl && { label: 'Jacquard bitmap', href: order.jacquardCardUrl, filename: 'jacquard.bmp' },
      order.jacquardTxtUrl && { label: 'Punch cards', href: order.jacquardTxtUrl, filename: 'jacquard_cards.txt' },
    ].filter(Boolean);
    return <div className="grid gap-2 sm:grid-cols-2">{legacy.map((f) => <FileButton key={f.href} file={f} />)}</div>;
  }

  const current = outputs[kind] || Object.values(outputs)[0];
  const files = current.files.map((f) => ({ ...f, href: `${API_BASE_URL}${f.url}` }));
  if (current.bmpUrl && !files.some((f) => f.url === current.bmpUrl)) {
    files.push({ label: 'Loom bitmap', filename: 'jacquard.bmp', href: `${API_BASE_URL}${current.bmpUrl}` });
  }

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-2 p-1.5">
        {Object.keys(outputs).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { haptic(); setKind(k); }}
            className={`sf-tap min-h-11 rounded-xl text-sm font-semibold ${kind === k ? 'bg-gold text-[#1d1700]' : 'text-muted'}`}>
            {LOOM_TABS[k] || k}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{current.name} · {current.format}</p>
      <div className="grid grid-cols-3 gap-2">
        {current.stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface-2/70 p-2.5 text-center">
            <p className="truncate text-sm font-bold text-gold">{s.value}</p>
            <p className="text-[11px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {current.bmpUrl && (
        <img src={`${API_BASE_URL}${current.bmpUrl}`} alt="Loom matrix preview" loading="lazy"
          className="max-h-60 w-full rounded-2xl border border-line bg-white object-contain [image-rendering:pixelated]" />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {files.map((f) => <FileButton key={f.href} file={f} />)}
      </div>
    </div>
  );
}

function OrderDetail({ order, state, onCompile }) {
  return (
    <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-2">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[['Drape preview', order.design.image], ['Flat layout', order.design.templateImage]].map(([label, src]) => (
            <figure key={label}>
              <img src={src} alt={label} loading="lazy" className="aspect-square w-full rounded-2xl border border-line object-cover" />
              <figcaption className="mt-1.5 text-center text-xs text-muted">{label}</figcaption>
            </figure>
          ))}
        </div>

        <dl className="divide-y divide-line rounded-2xl border border-line bg-surface-2/40 px-4 text-sm">
          {[
            ['Customer', order.customerName],
            ['Fabric', order.materialName],
            ['Batch', `#${order.batchId}`],
            ['Quantity', `${order.quantity} saree${order.quantity > 1 ? 's' : ''}`],
            ['Price', `₹${order.price}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-fg">{v}</dd>
            </div>
          ))}
        </dl>

        {order.yarnColors && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gold">Required yarn colours</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(order.yarnColors).map(([key, col]) => (
                <div key={key} className="rounded-xl border border-line bg-surface-2/50 p-2.5 text-center">
                  <span className="mx-auto mb-1.5 block h-6 w-6 rounded-full border border-line" style={{ background: col.hex }} />
                  <p className="truncate text-xs font-semibold text-fg" title={col.name}>{col.name}</p>
                  <p className="text-[11px] text-muted">{col.role}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
          <Layers size={18} className="text-gold" /> Loom file hub
        </h4>
        <LoomHub order={order} state={state} onCompile={onCompile} />
      </div>
    </div>
  );
}

export default function WeaverDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState('');

  const fetchOrders = useCallback(() => {
    fetch(`${API_BASE_URL}/api/orders`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.map((o) => ({
          ...o,
          design: { ...o.design, image: abs(o.design.image), templateImage: abs(o.design.templateImage) },
          jacquardCardUrl: o.jacquardCardUrl ? `${API_BASE_URL}${o.jacquardCardUrl}` : null,
          jacquardTxtUrl: o.jacquardTxtUrl ? `${API_BASE_URL}${o.jacquardTxtUrl}` : null,
        })));
      })
      .catch((err) => { console.error('Error fetching orders:', err); setNotice('Could not load the order queue.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const stateOf = (o) => (generatingId === o.id ? 'production' : o.status === 'Jacquard Card Generated' ? 'compiled' : 'ready');

  const compile = async (orderId) => {
    haptic(15);
    setGeneratingId(orderId);
    setNotice('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/generate-jacquard`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate Jacquard cards');
      fetchOrders();
    } catch (err) {
      console.error(err);
      setNotice('Failed to generate the loom files. Please try again.');
    } finally {
      setGeneratingId(null);
    }
  };

  const remove = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete order');
      if (openId === orderId) setOpenId(null);
      fetchOrders();
    } catch (err) {
      console.error(err);
      setNotice('Failed to delete the order.');
    }
  };

  const counts = useMemo(() => {
    const c = { ready: 0, production: 0, compiled: 0 };
    orders.forEach((o) => { c[stateOf(o)] += 1; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, generatingId]);

  const tiles = [
    ['Total orders', orders.length, FileText],
    ['Ready', counts.ready, Clock],
    ['In production', counts.production, Factory],
    ['Compiled', counts.compiled, CheckCircle2],
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          Weaver <span className="text-gold">portal</span>
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Track production orders, review specs and download compiled loom files.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, Icon]) => (
          <div key={label} className={`${panel} flex items-center gap-3 p-4`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold"><Icon size={22} /></span>
            <div>
              <p className="font-display text-2xl font-bold leading-none text-fg">{value}</p>
              <p className="mt-1 text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {notice && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-2xl bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={18} className="shrink-0" /> {notice}
        </p>
      )}

      {loading ? (
        <div className={`${panel} grid place-items-center py-16`}><ShuttleLoader label="Loading the production queue…" /></div>
      ) : orders.length === 0 ? (
        <div className={`${panel} grid place-items-center gap-2 px-6 py-16 text-center`}>
          <Cpu size={44} className="text-gold/70" />
          <h2 className="font-display text-xl font-bold text-fg">No orders queued yet</h2>
          <p className="max-w-sm text-sm text-muted">Orders placed from a design page will appear here as soon as they arrive.</p>
        </div>
      ) : (
        /* A real table from md up; stacked cards (labels from data-label) on phones */
        <div className={`${panel} overflow-hidden md:p-2`}>
          <table className="block w-full border-collapse text-sm md:table">
            <thead className="hidden md:table-header-group">
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                {['Order', 'Design', 'Customer', 'Fabric', 'Qty', 'Price', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="block space-y-3 p-3 md:table-row-group md:space-y-0 md:p-0">
              {orders.map((o) => {
                const state = stateOf(o);
                const open = openId === o.id;
                const cell = 'flex items-center justify-between gap-4 py-1.5 before:text-xs before:text-muted before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3 md:before:hidden';
                return [
                  <tr key={o.id} className={`block rounded-2xl border border-line bg-surface-2/40 p-4 md:table-row md:rounded-none md:border-0 md:border-t md:bg-transparent md:p-0 ${open ? 'md:bg-gold/5' : ''}`}>
                    <td data-label="Order" className={`${cell} font-mono font-bold text-gold`}>
                      <span className="truncate">{o.id}</span>
                    </td>
                    <td data-label="Design" className={cell}>
                      <span className="flex items-center gap-3">
                        <img src={o.design.image} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" />
                        <span className="max-w-[16ch] truncate font-medium text-fg md:max-w-[20ch]">{o.design.name}</span>
                      </span>
                    </td>
                    <td data-label="Customer" className={`${cell} text-fg`}>{o.customerName}</td>
                    <td data-label="Fabric" className={`${cell} text-fg`}>{o.materialName}</td>
                    <td data-label="Qty" className={`${cell} text-fg`}>{o.quantity}</td>
                    <td data-label="Price" className={`${cell} font-semibold text-fg`}>₹{o.price}</td>
                    <td data-label="Status" className={cell}><StatusBadge state={state} /></td>
                    <td className="flex items-center justify-end gap-2 pt-2 md:table-cell md:px-4 md:py-3 md:text-right md:whitespace-nowrap">
                      <button type="button" onClick={() => { haptic(); setOpenId(open ? null : o.id); }} aria-expanded={open}
                        className="sf-tap inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold/15 px-4 text-sm font-semibold text-gold md:flex-none">
                        {open ? 'Hide' : 'Specs & files'}
                        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      <button type="button" onClick={() => remove(o.id)} aria-label={`Delete order ${o.id}`}
                        className="sf-tap grid h-11 w-11 shrink-0 place-items-center rounded-xl text-red-400 hover:bg-red-500/10 md:inline-grid">
                        {generatingId === o.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${o.id}-detail`} className="block md:table-row">
                      <td colSpan={8} className="block rounded-2xl border border-gold/30 bg-surface/60 md:table-cell md:rounded-none md:border-x-0">
                        <AnimatePresence initial>
                          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                            <OrderDetail order={o} state={state} onCompile={() => compile(o.id)} />
                          </motion.div>
                        </AnimatePresence>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
