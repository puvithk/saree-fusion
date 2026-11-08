import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { printTechPack } from '../../utils/techPack';
import { compileLoomFiles, filesFromOrder } from '../../utils/loomExport';
import { haptic } from '../../utils/haptics';

const btn = 'sf-tap flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/60 px-4 text-left font-semibold text-fg disabled:opacity-45';

/**
 * Bottom sheet with the three quick actions for a saree.
 * `item` is a collection item (see utils/collectionItems.js); `detailsTo` is its detail route.
 */
export default function QuickActionSheet({ item, detailsTo, open, onClose }) {
  const [loom, setLoom] = useState({ status: 'idle', files: [] });

  // reset when switching to another saree
  useEffect(() => {
    const files = filesFromOrder(item?.order);
    setLoom(files.length ? { status: 'done', files } : { status: 'idle', files: [] });
  }, [item]);

  if (!item) return null;
  const canLoom = item.kind === 'design' && Boolean(item.template);

  const exportLoom = async () => {
    haptic(15);
    setLoom({ status: 'working', files: [] });
    try {
      const { files } = await compileLoomFiles({ batchId: item.batchId, designId: item.id, order: item.order });
      setLoom({ status: 'done', files });
    } catch (err) {
      setLoom({ status: 'error', files: [], message: err.message });
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={item.name}>
      <div className="flex gap-4 pb-4">
        {item.drape && <img src={item.drape} alt="" className="h-28 w-20 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0 space-y-1 text-sm">
          <span className="inline-block rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold">{item.status.label}</span>
          <p className="truncate text-muted">{item.id}</p>
          {item.createdLabel && <p className="text-muted">{item.createdLabel}</p>}
        </div>
      </div>

      <div className="space-y-2.5 pb-3">
        <Link to={detailsTo} onClick={onClose} className={btn}>
          <ExternalLink size={20} className="text-gold" /> View details
        </Link>
        <button type="button" className={btn} onClick={() => { haptic(); printTechPack(item); }}>
          <FileText size={20} className="text-gold" /> Download tech-pack PDF
        </button>
        <button type="button" className={btn} onClick={exportLoom} disabled={!canLoom || loom.status === 'working'}
          title={canLoom ? undefined : 'Loom export needs a generated design with a flat template'}>
          {loom.status === 'working' ? <Loader2 size={20} className="animate-spin text-gold" /> : <Download size={20} className="text-gold" />}
          {loom.status === 'working' ? 'Compiling loom files…' : 'Export loom files (.jac, .wif, .dob)'}
        </button>
      </div>

      {loom.status === 'error' && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /> {loom.message}
        </p>
      )}
      {loom.status === 'done' && (
        <ul className="mb-3 space-y-2">
          {loom.files.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.filename}
                className="sf-tap flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 text-sm text-fg">
                <Download size={18} className="shrink-0 text-gold" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
                <span className="shrink-0 text-xs text-muted">{f.group}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
