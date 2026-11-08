import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiUser, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import './UserMenu.css';

/**
 * Navbar account control: a sign-in link when nobody is signed in, otherwise
 * the user's avatar with a menu holding their identity and sign-out.
 */
export default function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // Close on an outside click or Escape, the way a menu is expected to behave.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (loading) {
    return <span className="action-btn user-menu-placeholder" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link to="/login" className="action-btn" aria-label="Sign in" title="Sign in">
        <FiUser />
      </Link>
    );
  }

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('/', { replace: true });
  };

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className="action-btn user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name || user.email}`}
      >
        {user.pictureUrl ? (
          <img className="user-menu-avatar" src={user.pictureUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--initial">{initial}</span>
        )}
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-identity">
            {user.name && <span className="user-menu-name">{user.name}</span>}
            <span className="user-menu-email">{user.email}</span>
          </div>
          <button type="button" className="user-menu-item" role="menuitem" onClick={handleSignOut}>
            <FiLogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
