import { useNavigate } from 'react-router-dom';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useSareeDesign } from '../../context/SareeDesignContext.jsx';

// Single entry point into the simulation suite.
// Hands the already-loaded object URLs (not base64) to /simulation via
// context: zero network / zero AI cost. Colour, layout and 3D all run client-side.
export default function SareeGeneratorButton({ uploads, style, description, canGenerate }) {
  const navigate = useNavigate();
  const { setAssets } = useSareeDesign();

  const handleGenerate = () => {
    if (!canGenerate) return;
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
    });
    navigate('/simulation');
  };

  return (
    <div className="design-generate-section">
      <button
        className={`generate-fusion-btn ${!canGenerate ? 'disabled' : ''}`}
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        <HiOutlineSparkles /> Generate Saree
      </button>
      {!canGenerate && (
        <p className="generate-hint">Upload at least one Pallu, Border, or Body image to generate</p>
      )}
    </div>
  );
}
