import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Camera, Check, ImagePlus, Loader2, Palette, Shirt, Sparkles, Trash2, UploadCloud, Wand2,
} from 'lucide-react';
import SareeGeneratorButton from '../components/saree/SareeGeneratorButton';
import { compressImage } from '../utils/imageCompress';
import { haptic } from '../utils/haptics';

import redSaree from '../assets/red-saree.png';
import silkSaree from '../assets/silk-saree.png';
import cottonSaree from '../assets/cotton-saree.png';
import traditionalSaree from '../assets/traditional-saree.png';
import bridalSaree from '../assets/bridal-saree.png';

const MAX_FILES = 5;

const STEPS = [
  { key: 'border', label: 'Border', hint: 'The woven edge that frames your saree.', icon: ImagePlus, upload: true },
  { key: 'body', label: 'Body', hint: 'Motif or texture that fills the saree body.', icon: Palette, upload: true },
  { key: 'pallu', label: 'Pallu', hint: 'The decorative end piece draped over the shoulder.', icon: Shirt, upload: true },
  { key: 'style', label: 'Style', hint: 'Pick the drape tradition and a model.', icon: Wand2 },
  { key: 'review', label: 'Preview', hint: 'Review everything, add notes, then generate.', icon: Sparkles },
];

const STYLES = {
  normal: {
    label: 'Normal',
    models: [
      { id: 'model_1', name: 'Classic Red', image: redSaree },
      { id: 'model_2', name: 'Silk Drape', image: silkSaree },
      { id: 'model_3', name: 'Cotton Drape', image: cottonSaree },
    ],
  },
  mysore: {
    label: 'Mysore',
    models: [
      { id: 'model_1', name: 'Traditional', image: traditionalSaree },
      { id: 'model_2', name: 'Bridal Zari', image: bridalSaree },
      { id: 'model_3', name: 'Silk Drape', image: silkSaree },
    ],
  },
  kadagu: {
    label: 'Kadagu',
    models: [
      { id: 'model_1', name: 'Cotton Drape', image: cottonSaree },
      { id: 'model_2', name: 'Traditional', image: traditionalSaree },
      { id: 'model_3', name: 'Bridal Zari', image: bridalSaree },
    ],
  },
};

const glass = 'rounded-3xl border border-line bg-glass backdrop-blur-md';

/* ---------- Upload zone ---------- */
function UploadZone({ step, files, onAdd, onRemove }) {
  const pick = useRef(null);
  const cam = useRef(null);
  const [drag, setDrag] = useState(false);
  const full = files.length >= MAX_FILES;

  const take = (list) => {
    const images = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (images.length) onAdd(images);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!full) take(e.dataTransfer.files); }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors
          ${drag ? 'border-gold bg-gold/10' : 'border-line bg-surface-2/50'} ${full ? 'opacity-50' : ''}`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold"><UploadCloud size={28} /></span>
        <div>
          <p className="font-semibold text-fg">Add {step.label.toLowerCase()} images</p>
          <p className="text-sm text-muted">{files.length} / {MAX_FILES} added · PNG, JPG, WEBP</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <button type="button" disabled={full} onClick={() => pick.current?.click()}
            className="sf-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-4 font-semibold text-[#1d1700] disabled:opacity-50">
            <ImagePlus size={18} /> Choose photos
          </button>
          <button type="button" disabled={full} onClick={() => cam.current?.click()}
            className="sf-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-fg disabled:opacity-50 md:hidden">
            <Camera size={18} /> Use camera
          </button>
        </div>
        <p className="hidden text-xs text-muted md:block">or drag and drop images here</p>
        <input ref={pick} type="file" accept="image/*" multiple hidden
          onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.li key={f.id} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2">
                <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {step.label[0]}{i + 1}
                </span>
                {f.compressing && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-white"><Loader2 className="animate-spin" size={22} /></span>
                )}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => { haptic(); onRemove(f.id); }}
                  className="sf-tap absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full text-white">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-black/65"><Trash2 size={14} /></span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/* ---------- Style & model ---------- */
function StyleStep({ style, model, onStyle, onModel }) {
  return (
    <div className="space-y-5">
      <div role="tablist" className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-1.5">
        {Object.entries(STYLES).map(([key, s]) => (
          <button key={key} type="button" role="tab" aria-selected={style === key} onClick={() => { haptic(); onStyle(key); }}
            className={`sf-tap min-h-11 rounded-xl text-sm font-semibold ${style === key ? 'bg-gold text-[#1d1700] shadow' : 'text-muted'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {STYLES[style].models.map((m) => {
          const active = model === m.id;
          return (
            <button key={m.id} type="button" onClick={() => { haptic(); onModel(m.id); }} aria-pressed={active}
              className={`sf-tap relative overflow-hidden rounded-2xl border-2 text-left ${active ? 'border-gold shadow-[0_0_0_4px_rgba(227,187,79,0.18)]' : 'border-line'}`}>
              <img src={m.image} alt="" className="aspect-[3/4] w-full object-cover" />
              <span className="block bg-surface/90 px-2 py-2 text-xs font-medium text-fg">{m.name}</span>
              {active && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-gold text-[#1d1700]"><Check size={14} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Live summary ---------- */
function Summary({ uploads, style, model, compact = false }) {
  const m = STYLES[style].models.find((x) => x.id === model);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {STEPS.filter((s) => s.upload).map((s) => {
          const first = uploads[s.key][0];
          return (
            <div key={s.key} className="text-center">
              <div className={`mx-auto grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border ${first ? 'border-gold/60' : 'border-dashed border-line bg-surface-2/60'}`}>
                {first ? <img src={first.preview} alt="" className="h-full w-full object-cover" /> : <s.icon size={22} className="text-muted" />}
              </div>
              <p className="mt-1.5 text-xs font-semibold text-fg">{s.label}</p>
              <p className="text-[11px] text-muted">{uploads[s.key].length} added</p>
            </div>
          );
        })}
      </div>
      <div className={`flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3 ${compact ? '' : ''}`}>
        <img src={m.image} alt="" className="h-16 w-12 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="text-xs text-muted">Drape &amp; model</p>
          <p className="truncate font-semibold text-fg">{STYLES[style].label} · {m.name}</p>
        </div>
      </div>
    </div>
  );
}

export default function Design() {
  const [uploads, setUploads] = useState({ border: [], body: [], pallu: [] });
  const [style, setStyle] = useState('normal');
  const [model, setModel] = useState('model_1');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const previews = useRef(new Set());

  // Object URLs are deliberately NOT revoked on unmount: the Simulation page loads
  // them via SareeDesignContext after this page is gone. They are revoked only when
  // a file is removed or replaced by its compressed copy.
  const addFiles = useCallback((key, files) => {
    setUploads((prev) => {
      const room = MAX_FILES - prev[key].length;
      const fresh = files.slice(0, room).map((file) => {
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        return { id: `${key}-${crypto.randomUUID()}`, file, name: file.name, preview, compressing: true };
      });
      // compress in the background; the thumbnail is already visible
      fresh.forEach((entry) => {
        compressImage(entry.file).then((out) => {
          setUploads((cur) => ({
            ...cur,
            [key]: cur[key].map((e) => {
              if (e.id !== entry.id) return e;
              if (out === entry.file) return { ...e, compressing: false };
              const preview = URL.createObjectURL(out);
              previews.current.add(preview);
              URL.revokeObjectURL(e.preview);
              previews.current.delete(e.preview);
              return { ...e, file: out, preview, compressing: false };
            }),
          }));
        });
      });
      return { ...prev, [key]: [...prev[key], ...fresh] };
    });
  }, []);

  const removeFile = useCallback((key, id) => {
    setUploads((prev) => {
      const gone = prev[key].find((e) => e.id === id);
      if (gone) { URL.revokeObjectURL(gone.preview); previews.current.delete(gone.preview); }
      return { ...prev, [key]: prev[key].filter((e) => e.id !== id) };
    });
  }, []);

  const go = (next) => {
    if (next < 0 || next >= STEPS.length) return;
    setDir(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canGenerate = Object.values(uploads).some((l) => l.length > 0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const slide = {
    enter: (d) => ({ opacity: 0, x: d * 48 }),
    center: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } },
    exit: (d) => ({ opacity: 0, x: d * -48, transition: { duration: 0.15 } }),
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
      <header className="mb-5 lg:mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          Design your <span className="text-gold">saree</span>
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">Add your swatches, pick a drape, then preview in the studio.</p>
      </header>

      {/* Stepper */}
      <ol className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 lg:hidden" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center">
            <button type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
              className="sf-tap flex w-full flex-col items-center gap-1">
              <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-colors
                ${i < step ? 'bg-gold text-[#1d1700]' : i === step ? 'bg-gold/20 text-gold ring-2 ring-gold' : 'bg-surface-2 text-muted'}`}>
                {i < step ? <Check size={16} /> : i + 1}
              </span>
              <span className={`text-[11px] font-medium ${i === step ? 'text-fg' : 'text-muted'}`}>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_380px] lg:gap-8">
        {/* Desktop vertical stepper */}
        <nav className="hidden lg:block" aria-label="Steps">
          <ol className="sticky top-24 space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => go(i)}
                  className={`sf-tap flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors
                    ${i === step ? 'border-gold/70 bg-gold/10 text-fg' : 'border-transparent text-muted hover:bg-surface-2'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i < step ? 'bg-gold text-[#1d1700]' : 'bg-surface-2'}`}>
                    {i < step ? <Check size={15} /> : i + 1}
                  </span>
                  <span className="font-semibold">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Step card (swipeable on touch) */}
        <section className={`${glass} overflow-hidden p-5 sm:p-7`} aria-live="polite">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold/15 text-gold"><current.icon size={22} /></span>
            <div>
              <h2 className="font-display text-xl font-bold text-fg">Step {step + 1} · {current.label}</h2>
              <p className="text-sm text-muted">{current.hint}</p>
            </div>
          </div>

          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={current.key} custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
              drag={current.key === 'review' ? false : 'x'} dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
              onDragEnd={(_, i) => {
                if (i.offset.x < -80 || i.velocity.x < -500) go(step + 1);
                else if (i.offset.x > 80 || i.velocity.x > 500) go(step - 1);
              }}>
              {current.upload && (
                <UploadZone step={current} files={uploads[current.key]}
                  onAdd={(f) => addFiles(current.key, f)} onRemove={(id) => removeFile(current.key, id)} />
              )}
              {current.key === 'style' && (
                <StyleStep style={style} model={model} onStyle={(s) => { setStyle(s); setModel('model_1'); }} onModel={setModel} />
              )}
              {current.key === 'review' && (
                <div className="space-y-5">
                  <div className="lg:hidden"><Summary uploads={uploads} style={style} model={model} /></div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-fg">Design notes <span className="font-normal text-muted">(optional)</span></span>
                    <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. A royal red Banarasi silk saree with gold zari borders and peacock motifs on the pallu…"
                      className="w-full resize-y rounded-2xl border border-line bg-surface-2/60 p-4 text-base text-fg placeholder:text-muted focus:border-gold focus:outline-none" />
                  </label>
                  {!canGenerate && (
                    <p className="rounded-xl bg-surface-2/60 p-3 text-sm text-muted">Add at least one border, body or pallu image to continue.</p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Inline nav (desktop) */}
          <div className="mt-6 hidden items-center justify-between lg:flex">
            <button type="button" onClick={() => go(step - 1)} disabled={step === 0}
              className="sf-tap inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-5 font-semibold text-fg disabled:opacity-40">
              <ArrowLeft size={18} /> Back
            </button>
            {!isLast && (
              <button type="button" onClick={() => go(step + 1)}
                className="sf-tap inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-6 font-semibold text-[#1d1700]">
                Next <ArrowRight size={18} />
              </button>
            )}
          </div>
        </section>

        {/* Desktop live summary */}
        <aside className="hidden lg:block">
          <div className={`${glass} sticky top-24 space-y-5 p-6`}>
            <h3 className="font-display text-lg font-bold text-fg">Your saree</h3>
            <Summary uploads={uploads} style={style} model={model} />
            {description && <p className="line-clamp-4 rounded-xl bg-surface-2/60 p-3 text-sm text-muted">{description}</p>}
            <SareeGeneratorButton uploads={uploads} style={style} description={description} canGenerate={canGenerate} />
          </div>
        </aside>
      </div>

      {/* Mobile step controls: inline after the card so they never cover it on short screens */}
      <div className="mt-5 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step"
            className="sf-tap grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line text-fg disabled:opacity-35">
            <ArrowLeft size={20} />
          </button>
          {isLast ? (
            <SareeGeneratorButton className="flex-1" uploads={uploads} style={style} description={description} canGenerate={canGenerate} />
          ) : (
            <button type="button" onClick={() => go(step + 1)}
              className="sf-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-5 font-semibold text-[#1d1700]">
              {step < 3 && uploads[current.key]?.length === 0 ? 'Skip' : 'Next'} <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
