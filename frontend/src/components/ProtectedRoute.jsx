import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Gate for routes that need a signed-in user.
 *
 * This is a usability guard, not the security boundary: every /api route checks
 * the session cookie server-side, so hiding a page here is convenience only.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // <Navigate> navigates from an effect keyed on its props, and `state` is one
  // of them. A fresh object literal every render would re-fire that effect
  // every render; because AnimatePresence keeps the outgoing route mounted
  // through its exit animation, that turns into an infinite redirect loop.
  // Memoising on the path strings gives the effect a stable identity.
  const redirectState = useMemo(
    () => ({ from: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );

  // Still waiting on /api/auth/me. Rendering the login page here would flash it
  // at users who turn out to be signed in.
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <p style={{ color: 'var(--sf-muted, #6b6b6b)', fontSize: '0.9rem' }}>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={redirectState} />;
  }

  return children;
}
