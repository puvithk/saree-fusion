import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { adminFetch } from './api.js';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    adminFetch('/me').then((d) => live && setAdmin(d)).catch(() => live && setAdmin(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await adminFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAdmin({ ...d, username });
  }, []);

  const logout = useCallback(async () => {
    try { await adminFetch('/logout', { method: 'POST' }); } finally { setAdmin(null); }
  }, []);

  return <Ctx.Provider value={{ admin, loading, login, logout }}>{children}</Ctx.Provider>;
}
