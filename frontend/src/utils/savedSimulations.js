// Saved simulation designs, stored per user in the backend database
// (simulations.json via /api/simulations).
// Each entry is small: a ~30 KB JPEG thumbnail plus colour / layout metadata.
import { API_BASE_URL } from '../config';

const ownerOf = (user) => (user?.email || 'guest').toLowerCase();
const LEGACY_KEY = (user) => `sf_saved_simulations:${user?.email || 'guest'}`;

export async function loadSavedSimulations(user) {
  await migrateLocalSimulations(user);
  const res = await fetch(`${API_BASE_URL}/api/simulations?owner=${encodeURIComponent(ownerOf(user))}`);
  if (!res.ok) throw new Error(`Could not load simulations (${res.status})`);
  return res.json();
}

// Insert or replace by id (one entry per simulation session).
// keepalive lets the request finish while the page is being closed; browsers
// cap keepalive bodies at 64 KB, so larger snapshots go as a normal request.
const KEEPALIVE_MAX = 60 * 1024;

export function upsertSavedSimulation(user, entry) {
  const body = JSON.stringify({ ...entry, owner: ownerOf(user) });
  fetch(`${API_BASE_URL}/api/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: body.length < KEEPALIVE_MAX,
  }).catch((err) => console.error('Could not save simulation', err));
  return true;
}

export async function deleteSavedSimulation(user, id) {
  await fetch(`${API_BASE_URL}/api/simulations/${encodeURIComponent(id)}?owner=${encodeURIComponent(ownerOf(user))}`,
    { method: 'DELETE' });
  return loadSavedSimulations(user);
}

// One-time move of simulations saved by older builds in localStorage
async function migrateLocalSimulations(user) {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY(user))) || [];
  } catch {
    return;
  }
  if (!legacy.length) return;
  const results = await Promise.all(legacy.map((entry) =>
    fetch(`${API_BASE_URL}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, owner: ownerOf(user) }),
    }).then((r) => r.ok).catch(() => false)));
  if (results.every(Boolean)) {
    try { localStorage.removeItem(LEGACY_KEY(user)); } catch { /* ignore */ }
  }
}
