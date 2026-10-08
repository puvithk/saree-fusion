export const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:5000');

// Set VITE_AUTH_ENABLED=false in your .env to disable authentication entirely.
// When false, all routes are accessible without login and a guest user is injected.
export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED !== 'false';
