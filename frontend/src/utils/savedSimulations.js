// Saved simulation designs, stored per account in Postgres (/api/simulations).
//
// Ownership used to travel as an `?owner=` query parameter, which any caller
// could set to any value. It now comes from the session cookie the browser
// sends automatically, so these calls pass no owner at all.
import { API_BASE_URL } from '../config';

const LEGACY_KEY = 'sf_saved_simulations:guest';

export async function loadSavedSimulations() {
  await migrateLocalSimulations();
  const res = await fetch(`${API_BASE_URL}/api/simulations`);
  if (res.status === 401) throw new Error('Please sign in to see your saved simulations.');
  if (!res.ok) throw new Error(`Could not load simulations (${res.status})`);
  return res.json();
}

// Insert or replace by id (one entry per simulation session).
// keepalive lets the request finish while the page is being closed; browsers
// cap keepalive bodies at 64 KB, so larger snapshots go as a normal request.
const KEEPALIVE_MAX = 60 * 1024;

export function upsertSavedSimulation(entry) {
  const body = JSON.stringify(entry);
  fetch(`${API_BASE_URL}/api/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: body.length < KEEPALIVE_MAX,
  }).catch((err) => console.error('Could not save simulation', err));
  return true;
}

export async function deleteSavedSimulation(id) {
  await fetch(`${API_BASE_URL}/api/simulations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return loadSavedSimulations();
}

// One-time move of simulations saved by older builds in localStorage.
// These were written before accounts existed, so they land on whichever account
// is signed in when the browser that holds them next opens the app.
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
      body: JSON.stringify(entry),
    }).then((r) => r.ok).catch(() => false)));
  if (results.every(Boolean)) {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }
}
