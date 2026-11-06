// Saved simulation designs, stored in the backend database
// (simulations.json via /api/simulations).
// Each entry is small: a ~30 KB JPEG thumbnail plus colour / layout metadata.
import { API_BASE_URL } from '../config';

// There are no accounts: every simulation belongs to this single owner id
// (the same id the old guest session used, so earlier saves stay visible).
const OWNER = 'guest@example.com';
const LEGACY_KEY = 'sf_saved_simulations:guest';

export async function loadSavedSimulations() {
  await migrateLocalSimulations();
  const res = await fetch(`${API_BASE_URL}/api/simulations?owner=${encodeURIComponent(OWNER)}`);
  if (!res.ok) throw new Error(`Could not load simulations (${res.status})`);
  return res.json();
}

// Insert or replace by id (one entry per simulation session).
// keepalive lets the request finish while the page is being closed; browsers
// cap keepalive bodies at 64 KB, so larger snapshots go as a normal request.
const KEEPALIVE_MAX = 60 * 1024;

export function upsertSavedSimulation(entry) {
  const body = JSON.stringify({ ...entry, owner: OWNER });
  fetch(`${API_BASE_URL}/api/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: body.length < KEEPALIVE_MAX,
  }).catch((err) => console.error('Could not save simulation', err));
  return true;
}

export async function deleteSavedSimulation(id) {
  await fetch(`${API_BASE_URL}/api/simulations/${encodeURIComponent(id)}?owner=${encodeURIComponent(OWNER)}`,
    { method: 'DELETE' });
  return loadSavedSimulations();
}

// One-time move of simulations saved by older builds in localStorage
async function migrateLocalSimulations() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)) || [];
  } catch {
    return;
  }
  if (!legacy.length) return;
  const results = await Promise.all(legacy.map((entry) =>
    fetch(`${API_BASE_URL}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, owner: OWNER }),
    }).then((r) => r.ok).catch(() => false)));
  if (results.every(Boolean)) {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }
}
