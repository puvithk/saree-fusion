// Where the API lives.
//
// Empty string on purpose: every call becomes a same-origin relative request
// (`/api/...`). In development Vite's proxy forwards it to Flask; in production
// vercel.json rewrites it to the backend service. One origin in both places,
// which is what lets the httpOnly SameSite=Lax session cookie ride along
// without any per-fetch credentials option.
//
// Set VITE_API_URL only to point a local frontend at a deployed backend. Doing
// so makes requests cross-origin, so that backend must list this origin in
// ALLOWED_ORIGINS and sign-in needs third-party cookies allowed.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
