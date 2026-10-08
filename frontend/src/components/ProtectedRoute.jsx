import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { user, loading, authEnabled } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  // If auth is disabled, always pass through
  if (!authEnabled) return children;

  // If auth is enabled and no user, redirect to login with return path
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
