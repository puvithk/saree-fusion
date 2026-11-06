import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, AUTH_ENABLED } from '../config.js';

const AuthContext = createContext(null);

// The API can answer with an empty or non-JSON body (cold start, wrong routing, 5xx);
// turn that into a readable error instead of "Unexpected end of JSON input".
async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server sent an unexpected response (HTTP ${res.status}). Please try again.`);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    if (!AUTH_ENABLED) {
      setUser({ name: 'Guest', email: 'guest@example.com', phone: '', role: 'guest' });
      setLoading(false);
      return;
    }
    const stored = localStorage.getItem('sf_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('sf_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || `Login failed (HTTP ${res.status}). The API may be unreachable.`);
    if (!data.user) throw new Error('Login failed: the server returned no user.');
    setUser(data.user);
    localStorage.setItem('sf_user', JSON.stringify(data.user));
    return data.user;
  }, []);

  const signup = useCallback(async (name, email, phone, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || `Signup failed (HTTP ${res.status}). The API may be unreachable.`);
    if (!data.user) throw new Error('Signup failed: the server returned no user.');
    setUser(data.user);
    localStorage.setItem('sf_user', JSON.stringify(data.user));
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('sf_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, authEnabled: AUTH_ENABLED }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
