import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { upsertSavedSimulation } from '../../utils/savedSimulations';

const THUMB_MAX = 480; // longest side, px

function makeThumbnail(canvas) {
  const t = document.createElement('canvas');
  // Keep the template's true-length aspect ratio
  const k = THUMB_MAX / Math.max(canvas.width, canvas.height);
  t.width = Math.max(1, Math.round(canvas.width * k));
  t.height = Math.max(1, Math.round(canvas.height * k));
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.75);
}

// ─── CollectionAutoSaver ─────────────────────────────────────────────────────
// Renders nothing. Tracks the latest simulation config and persists it to the
// user's Saved Collections when the simulation unmounts (Back / Exit / route
// change) or the tab is closed — no manual save prompt.
// Saves only if the session has real content: handed-over assets or edits.
export default function CollectionAutoSaver({ canvasRef, config, hasAssets }) {
  const { user } = useAuth();
  const sessionId = useRef(`SIM-${Date.now().toString(36)}`);
  const latest = useRef({ config, hasAssets, user });
  const initialJSON = useRef(JSON.stringify(config));

  useEffect(() => {
    latest.current = { config, hasAssets, user };
  }, [config, hasAssets, user]);

  useEffect(() => {
    // Capture the element now; the ref is detached before unmount cleanup runs
    const canvas = canvasRef.current;
    let saved = false;

    const save = () => {
      if (saved || !canvas) return;
      const { config: cfg, hasAssets: has, user: u } = latest.current;
      const dirty = JSON.stringify(cfg) !== initialJSON.current;
      if (!has && !dirty) return;
      saved = upsertSavedSimulation(u, {
        id: sessionId.current,
        savedAt: new Date().toISOString(),
        thumbnail: makeThumbnail(canvas),
        ...cfg,
      });
    };

    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [canvasRef]);

  return null;
}
