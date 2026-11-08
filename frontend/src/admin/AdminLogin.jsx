import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAdmin } from './AdminAuth.jsx';

export default function AdminLogin() {
  const { admin, loading, login } = useAdmin();
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && admin) return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(username, password); nav('/admin', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="ad-login">
      <form className="ad-glass ad-login-card" onSubmit={submit}>
        <div className="ad-brand big">SareeFusion <span>Admin</span></div>
        <p className="ad-muted">Restricted area. Authorised administrators only.</p>
        <label>User ID<input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></label>
        {error && <div className="ad-error" role="alert">{error}</div>}
        <button className="ad-btn primary" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="ad-muted small" style={{ textAlign: 'center', color: 'inherit' }}>← Back to home</Link>
      </form>
    </div>
  );
}
