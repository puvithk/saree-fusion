import { API_BASE_URL } from '../config.js';

// Same-origin cookie (sf_admin); no token handling in JS.
export async function adminFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}/api/admin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
