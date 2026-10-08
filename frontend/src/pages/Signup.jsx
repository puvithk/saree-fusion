import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import logoImage from '../assets/logo-image.png';

export default function Signup() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  // Already logged in → redirect home
  if (user) return <Navigate to="/" replace />;

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const validate = () => {
    if (!form.name.trim()) return 'Name is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.';
    if (!form.phone.trim()) return 'Phone number is required.';
    if (!/^\+?[\d\s\-()]{7,15}$/.test(form.phone)) return 'Enter a valid phone number.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.phone.trim(), form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />

      <div className="auth-card auth-card-signup">
        {/* Branding */}
        <div className="auth-brand">
          <img src={logoImage} alt="SareeFusion" className="auth-logo" />
          <div className="auth-brand-text">
            <span className="auth-brand-name">Saree<span className="text-cyan">Fusion</span></span>
            <span className="auth-brand-tag">Personalize Your Perfect Drape</span>
          </div>
        </div>

        <div className="auth-divider" />

        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Join SareeFusion and start your design journey</p>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div className="auth-field">
            <label htmlFor="signup-name" className="auth-label">Full name</label>
            <div className="auth-input-wrap">
              <FiUser className="auth-input-icon" />
              <input
                id="signup-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Priya Sharma"
                value={form.name}
                onChange={handleChange}
                className="auth-input"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="auth-field">
            <label htmlFor="signup-email" className="auth-label">Email address</label>
            <div className="auth-input-wrap">
              <FiMail className="auth-input-icon" />
              <input
                id="signup-email"
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

          {/* Phone */}
          <div className="auth-field">
            <label htmlFor="signup-phone" className="auth-label">Phone number</label>
            <div className="auth-input-wrap">
              <FiPhone className="auth-input-icon" />
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={handleChange}
                className="auth-input"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="auth-field">
            <label htmlFor="signup-password" className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <FiLock className="auth-input-icon" />
              <input
                id="signup-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min. 6 characters"
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

          {/* Confirm Password */}
          <div className="auth-field">
            <label htmlFor="signup-confirm" className="auth-label">Confirm password</label>
            <div className="auth-input-wrap">
              <FiLock className="auth-input-icon" />
              <input
                id="signup-confirm"
                name="confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={form.confirm}
                onChange={handleChange}
                className="auth-input"
                required
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={loading} id="signup-submit-btn">
            {loading ? (
              <span className="auth-btn-spinner" />
            ) : (
              <>Create account <FiArrowRight /></>
            )}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" className="auth-switch-link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
