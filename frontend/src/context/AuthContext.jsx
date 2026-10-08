import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, AUTH_ENABLED } from '../config.js';

const AuthContext = createContext(null);

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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
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
