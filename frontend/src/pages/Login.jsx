import { useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import logoImage from '../assets/logo-image.png';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Already logged in → redirect to home
  if (user) return <Navigate to={from} replace />;

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Decorative background blobs */}
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />

      <div className="auth-card">
        {/* Branding */}
        <div className="auth-brand">
          <img src={logoImage} alt="SareeFusion" className="auth-logo" />
          <div className="auth-brand-text">
            <span className="auth-brand-name">Saree<span className="text-cyan">Fusion</span></span>
            <span className="auth-brand-tag">Personalize Your Perfect Drape</span>
          </div>
        </div>

        <div className="auth-divider" />

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue your saree journey</p>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">Email address</label>
            <div className="auth-input-wrap">
              <FiMail className="auth-input-icon" />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                className="auth-input"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <FiLock className="auth-input-icon" />
              <input
                id="login-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                className="auth-input"
                required
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={loading} id="login-submit-btn">
            {loading ? (
              <span className="auth-btn-spinner" />
            ) : (
              <>Sign in <FiArrowRight /></>
            )}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-switch-link">Create one</Link>
        </p>
      </div>
    </div>
  );
}
