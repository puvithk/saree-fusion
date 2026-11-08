import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from './AdminAuth.jsx';

const NAV = [
  { to: '/admin', label: 'Overview', icon: '◈', end: true },
  { to: '/admin/users', label: 'Users & Inspector', icon: '☰' },
  { to: '/admin/settings', label: 'Help & Settings', icon: '✎' },
];

export default function AdminLayout() {
  const { admin, loading, logout } = useAdmin();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  if (loading) return <div className="ad-center ad-muted">Loading…</div>;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;

  return (
    <div className="ad-shell">
      <aside className={`ad-side ad-glass ${open ? 'open' : ''}`}>
        <div className="ad-brand">SareeFusion <span>Admin</span></div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className="ad-nav">
              <i>{n.icon}</i>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ad-side-foot">
          <div className="ad-muted small">Signed in as {admin.username || 'admin'}</div>
          <button className="ad-btn" onClick={async () => { await logout(); nav('/admin/login'); }}>Sign out</button>
        </div>
      </aside>
      {open && <div className="ad-scrim" onClick={() => setOpen(false)} />}
      <div className="ad-main">
        <header className="ad-top ad-glass">
          <button className="ad-btn burger" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <div className="ad-muted small">Admin Console</div>
        </header>
        <main className="ad-content"><Outlet /></main>
      </div>
    </div>
  );
}
