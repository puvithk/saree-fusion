import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, FolderOpen } from 'lucide-react';
import ShuttleLoader from '../components/motion/ShuttleLoader';
import { groupFolders, useCollectionItems } from '../utils/collectionItems';

const statusCls = {
  ready: 'bg-emerald-500/15 text-emerald-500',
  compiled: 'bg-amber-500/15 text-gold',
  draft: 'bg-surface-2 text-muted',
};

function Preview({ src, label }) {
  return (
    <figure className="min-w-0">
      <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2">
        {src
          ? <img src={src} alt={label} loading="lazy" className="h-full w-full object-contain" />
          : <span className="text-xs text-muted">Not available</span>}
      </div>
      <figcaption className="mt-1.5 text-center text-xs font-medium text-muted">{label}</figcaption>
    </figure>
  );
}

export default function CollectionFolder() {
  const { folderId } = useParams();
  const { items, loading } = useCollectionItems();
  const folder = useMemo(() => groupFolders(items).find((f) => f.id === folderId), [items, folderId]);

  if (loading) {
    return <div className="grid place-items-center py-24"><ShuttleLoader label="Opening folder…" /></div>;
  }
  if (!folder) {
    return (
      <div className="mx-auto grid max-w-md place-items-center gap-4 px-4 py-24 text-center">
        <FolderOpen size={44} className="text-muted" />
        <p className="text-muted">We couldn't find that folder.</p>
        <Link to="/collections?view=folders" className="sf-tap inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-5 font-semibold text-[#1d1700]">
          <ArrowLeft size={18} /> Back to collection
        </Link>
      </div>
    );
  }

  const simulations = folder.kind === 'simulation';

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <Link to="/collections?view=folders" className="sf-tap inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft size={18} /> Folders
      </Link>

      <header className="mb-6 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight text-fg sm:text-4xl">
            <FolderOpen className="text-gold" size={30} /> {folder.name}
          </h1>
          <p className="mt-1 break-all text-sm text-muted">
            {simulations ? 'Saved flat layouts from the simulation studio' : `#${folder.id}`} · {folder.items.length} {folder.items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        {!simulations && (
          <Link to={`/collections/batch/${folder.id}`}
            className="sf-tap inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-fg">
            Batch overview <ExternalLink size={16} />
          </Link>
        )}
      </header>

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {folder.items.map((item, i) => (
          <motion.li key={item.id}
            initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.05, type: 'spring', stiffness: 260, damping: 26 }}
            className="rounded-3xl border border-line bg-glass p-4 shadow-lg backdrop-blur-md transition-shadow hover:shadow-[0_0_0_1px_var(--sf-gold)]">
            <div className={`grid gap-3 ${simulations ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {simulations
                ? <Preview src={item.layout} label="Flat layout" />
                : <>
                    <Preview src={item.drape} label="Mannequin drape" />
                    <Preview src={item.layout} label="Flat layout" />
                  </>}
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold text-fg" title={item.name}>{item.name}</h2>
                <p className="truncate text-xs text-muted">{item.createdLabel || item.id}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusCls[item.status.key]}`}>
                {item.status.label}
              </span>
            </div>
            <Link to={`/collections/${encodeURIComponent(item.id)}`}
              className="sf-tap mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold/15 font-semibold text-gold">
              Open {simulations ? 'layout' : 'design'} <ExternalLink size={16} />
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
