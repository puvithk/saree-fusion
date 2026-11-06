import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useSareeDesign } from '../../context/SareeDesignContext.jsx';
import { haptic } from '../../utils/haptics';

// Single entry point into the simulation suite.
// Hands the already-loaded object URLs (not base64) to /simulation via
// context: zero network / zero AI cost. Colour, layout and 3D all run client-side.
export default function SareeGeneratorButton({ uploads, style, description, canGenerate, className = '' }) {
  const navigate = useNavigate();
  const { setAssets } = useSareeDesign();

  const handleGenerate = () => {
    if (!canGenerate) return;
    haptic(18);
    const first = (key) => uploads[key][0];
    setAssets({
      bodyImage: first('body')?.preview ?? null,
      borderImage: first('border')?.preview ?? null,
      palluImage: first('pallu')?.preview ?? null,
      assetNames: {
        body: first('body')?.name ?? null,
        border: first('border')?.name ?? null,
        pallu: first('pallu')?.name ?? null,
      },
      style,
      description,
      restore: null,
    });
    navigate('/simulation');
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="sf-tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#f2d874] to-gold px-6 text-base font-semibold text-[#2a2100] shadow-[0_10px_28px_rgba(201,162,39,0.35)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
      >
        <Sparkles size={20} /> Generate saree
      </button>
      {!canGenerate && (
        <p className="mt-2 text-center text-xs text-muted">Upload at least one border, body or pallu image first.</p>
      )}
    </div>
  );
}
