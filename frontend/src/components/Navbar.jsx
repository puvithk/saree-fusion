import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiUser, FiHeart, FiShoppingCart, FiLogOut } from 'react-icons/fi';
import { BiHome, BiPencil } from 'react-icons/bi';
import { BsGrid, BsChevronRight } from 'react-icons/bs';
import { GiClothes } from 'react-icons/gi';
import { useAuth } from '../context/AuthContext.jsx';
import logoImage from '../assets/logo-image.png';

const navLinks = [
  { to: '/', label: 'Home', icon: <BiHome /> },
  { to: '/design', label: 'Design', icon: <BiPencil /> },
  { to: '/collections', label: 'Collections', icon: <BsGrid /> },
  { to: '/sarees', label: 'Saree', icon: <GiClothes /> },
  { to: '/weaver', label: 'Weaver Profile', icon: <FiUser /> },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, authEnabled } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getBreadcrumbs = () => {
    const path = location.pathname;
    const crumbs = [];
    if (path.startsWith('/collections/batch/')) {
      crumbs.push({ label: 'Collections', to: '/collections' });
      crumbs.push({ label: 'Fusion result', to: path.split('/design/')[0] });
      if (path.includes('/design/')) {
        crumbs.push({ label: 'Design details', to: path, active: true });
      } else {
        crumbs[crumbs.length - 1].active = true;
      }
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <div className="logo-icon">
            <img src={logoImage} alt='logo' height={50} width={50}></img>
          </div>
          <div className="logo-text">
            <span className="logo-name">
              Saree<span className="logo-accent">Fusion</span>
            </span>
            <span className="logo-tagline">Personalize Your Perfect Drape and Heritage</span>
          </div>
        </Link>

        <nav className="navbar-nav">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="navbar-actions">
          <button className="action-btn" aria-label="Search"><FiSearch /></button>

          {authEnabled && user ? (
            /* Logged-in user area */
            <div className="navbar-user">
              <div className="navbar-avatar" title={user.name}>
                {user.name ? user.name.charAt(0).toUpperCase() : <FiUser />}
              </div>
              <span className="navbar-username">{user.name}</span>
              <button
                className="action-btn logout-btn"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
              >
                <FiLogOut />
              </button>
            </div>
          ) : authEnabled && !user ? (
            /* Auth enabled but not logged in */
            <Link to="/login" className="navbar-signin-link">
              <FiUser /> Sign in
            </Link>
          ) : (
            /* Auth disabled */
            <button className="action-btn" aria-label="Account"><FiUser /></button>
          )}

          <button className="action-btn" aria-label="Wishlist"><FiHeart /></button>
          <button className="action-btn" aria-label="Cart"><FiShoppingCart /></button>
        </div>
      </div>

      {breadcrumbs.length > 0 && (
        <div className="breadcrumb-bar">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="breadcrumb-item">
              {i > 0 && <BsChevronRight className="breadcrumb-sep" />}
              {crumb.active ? (
                <span className="breadcrumb-active">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="breadcrumb-link">{crumb.label}</Link>
              )}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
