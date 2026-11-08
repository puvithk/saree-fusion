import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './Login.css';

export default function Login() {
  const {
    isAuthenticated, loading, clientId, error, setError,
    signInWithCredential, loadGoogleScript,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [busy, setBusy] = useState(false);

  // Send people back where they were headed before the redirect to /login.
  // ProtectedRoute passes this as a path string, not a location object.
  const destination = location.state?.from || '/';

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, destination, navigate]);

  useEffect(() => {
    if (loading || !clientId || isAuthenticated) return;
    let active = true;

    loadGoogleScript()
      .then((google) => {
        if (!active || !buttonRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              await signInWithCredential(credential);
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          },
        });
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: 280,
        });
      })
      .catch((err) => { if (active) setError(err.message); });

    return () => { active = false; };
  }, [loading, clientId, isAuthenticated, loadGoogleScript, signInWithCredential, setError]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-mark">SF</span>
          <h1>SareeFusion</h1>
        </div>

        <p className="login-tagline">
          Sign in to reach your designs, batches and loom files. Your work stays private to
          your account.
        </p>

        <div className="login-action">
          {loading ? (
            <p className="login-status">Checking your session…</p>
          ) : clientId ? (
            <>
              <div ref={buttonRef} className="login-google" />
              {busy && <p className="login-status">Signing you in…</p>}
            </>
          ) : (
            <p className="login-status login-status--warn">
              Google sign-in is unavailable until the server is configured.
            </p>
          )}
        </div>

        {error && <p className="login-error" role="alert">{error}</p>}

        <p className="login-footnote">
          We only ever read your name, email address and profile picture from Google.
        </p>
      </div>
    </div>
  );
}
