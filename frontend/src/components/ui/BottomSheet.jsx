import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';

/** Swipe-down-to-dismiss bottom sheet (portal'd, scroll-locked, Esc closes). */
export default function BottomSheet({ open, onClose, title, children }) {
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-3xl border border-b-0 border-line bg-surface/95 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl"
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: { type: 'spring', stiffness: 340, damping: 34 } }}
            exit={{ y: '100%', transition: { duration: 0.2 } }}
            drag="y" dragControls={controls} dragListener={false} dragSnapToOrigin dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) onClose(); }}
          >
            <div className="flex touch-none items-center justify-center pt-2.5" onPointerDown={(e) => controls.start(e)}>
              <span className="h-1.5 w-11 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-2">
              <h2 className="line-clamp-2 font-display text-lg font-semibold text-fg">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close"
                className="sf-tap grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 pb-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
