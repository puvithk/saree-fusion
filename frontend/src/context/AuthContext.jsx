import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config.js';

const AuthContext = createContext(null);

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// The API can answer with an empty or non-JSON body (cold start, wrong routing,
// a 5xx from the platform). Turn that into a readable error rather than
// "Unexpected end of JSON input".
async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server sent an unexpected response (HTTP ${res.status}). Please try again.`);
  }
}

// Loads Google Identity Services once, reusing the same promise for every caller.
let gsiPromise = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (gsiPromise) return gsiPromise;

  gsiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    const script = existing || document.createElement('script');
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      gsiPromise = null; // let a later attempt retry rather than fail forever
      reject(new Error('Could not reach Google to load the sign-in button.'));
    };
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return gsiPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);   // true until the session check finishes
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const cancelled = useRef(false);

  // Restore the session on load. The cookie is httpOnly, so JavaScript cannot
  // read it; asking the server is the only way to know who we are.
  useEffect(() => {
    cancelled.current = false;

    (async () => {
      try {
        const [meRes, configRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/auth/me`),
          fetch(`${API_BASE_URL}/api/auth/config`),
        ]);
        if (cancelled.current) return;

        const me = await readJson(meRes);
        setUser(me.authenticated ? me.user : null);

        const config = await readJson(configRes);
        setClientId(config.googleClientId || '');
        if (!config.configured) {
          setError(
            'Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID in backend/.env.',
          );
        }
      } catch (err) {
        if (!cancelled.current) setError(err.message);
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    })();

    return () => { cancelled.current = true; };
  }, []);

  // Trade a Google credential for our own session cookie.
  const signInWithCredential = useCallback(async (credential) => {
    setError('');
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Google sign-in failed.');
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' });
    } finally {
      // Clear locally even if the request failed; the cookie expires regardless.
      setUser(null);
      window.google?.accounts?.id?.disableAutoSelect?.();
    }
  }, []);

  // Called by components when a request comes back 401, so a session that
  // expired mid-use sends the user to the login screen instead of looking broken.
  const handleUnauthorized = useCallback(() => setUser(null), []);

  const value = {
    user,
    loading,
    clientId,
    error,
    setError,
    isAuthenticated: Boolean(user),
    signInWithCredential,
    signOut,
    handleUnauthorized,
    loadGoogleScript,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}

export default AuthContext;
