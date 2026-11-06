export const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:5000');

// Set VITE_AUTH_ENABLED=false in your .env to disable authentication entirely.
// When false, all routes are accessible without login and a guest user is injected.
// Login is switched off for now: the app opens straight to the home page as a guest.
// Set VITE_AUTH_ENABLED=true to turn authentication back on.
export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';
