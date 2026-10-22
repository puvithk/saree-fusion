import { useEffect, useState } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi';
import { FiAlertTriangle } from 'react-icons/fi';
import '../../pages/ResultPage.css';

// Steps shown while /api/generate runs. The request gives no progress events,
// so they advance on a timer and the last step holds until it returns.
const STEPS = [
  'Uploading your body, border and pallu',
  'Weaving the flat handloom template',
  'Draping the saree on the studio mannequin',
  'Saving the batch to your collection',
];

export default function GeneratingOverlay({ error, onRetry, onDismiss }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (error) return undefined;
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 4500);
    return () => clearInterval(t);
  }, [error]);

  return (
    <div className="gen-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div className="gen-card">
        {error ? (
          <>
            <div className="gen-icon gen-icon-error"><FiAlertTriangle /></div>
            <h2>Generation didn&apos;t finish</h2>
            <p className="gen-error">{error}</p>
            <div className="gen-actions">
              <button type="button" className="gen-btn secondary" onClick={onDismiss}>Back to studio</button>
              <button type="button" className="gen-btn" onClick={onRetry}>Try again</button>
            </div>
          </>
        ) : (
          <>
            <div className="gen-icon"><HiOutlineSparkles /></div>
            <h2>Creating your saree</h2>
            <p className="gen-sub">This usually takes under a minute.</p>
            <ol className="gen-steps">
              {STEPS.map((label, i) => (
                <li key={label} className={i < step ? 'done' : i === step ? 'active' : ''}>
                  <span className="gen-dot" />
                  {label}
                </li>
              ))}
            </ol>
            <div className="gen-bar"><div className="gen-bar-fill" /></div>
          </>
        )}
      </div>
    </div>
  );
}
