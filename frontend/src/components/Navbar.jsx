import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSearch, FiUser, FiHeart, FiShoppingCart, FiGrid } from 'react-icons/fi';
import { BiHome, BiPencil } from 'react-icons/bi';
import { BsGrid, BsChevronRight } from 'react-icons/bs';
import { GiClothes } from 'react-icons/gi';
import logoImage from '../assets/logo-image.png';
import ThemeToggle from './ui/ThemeToggle';
import BottomNav from './ui/BottomNav';

const navLinks = [
  { to: '/', label: 'Home', icon: <BiHome /> },
  { to: '/design', label: 'Design', icon: <BiPencil /> },
  { to: '/collections', label: 'Collections', icon: <BsGrid /> },
  { to: '/sarees', label: 'Saree', icon: <GiClothes /> },
  { to: '/simulation', label: 'Simulation', icon: <FiGrid /> },
  { to: '/weaver', label: 'Weaver Profile', icon: <FiUser /> },
];

export default function Navbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer whenever the route changes
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock page scroll + Esc to close while the drawer is open
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // If the window grows to desktop width the drawer is no longer relevant
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const onChange = () => { if (mq.matches) setMenuOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  const account = <button className="action-btn" aria-label="Account"><FiUser /></button>;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <div className="logo-icon">
            <img src={logoImage} alt="SareeFusion logo" height={50} width={50} />
          </div>
          <div className="logo-text">
            <span className="logo-name">Saree<span className="logo-accent">Fusion</span></span>
            <span className="logo-tagline">Personalize Your Perfect Drape and Heritage</span>
          </div>
        </Link>

        <nav className="navbar-nav" aria-label="Primary">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to} className={`nav-link ${isActive(link.to) ? 'active' : ''}`}>
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="navbar-actions">
          <button className="action-btn" aria-label="Search"><FiSearch /></button>
          <ThemeToggle />
          {account}
          <button className="action-btn" aria-label="Wishlist"><FiHeart /></button>
          <button className="action-btn" aria-label="Cart"><FiShoppingCart /></button>
        </div>

        <button
          type="button"
          className={`nav-burger${menuOpen ? ' is-open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
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

      {createPortal(<AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="mobile-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              id="mobile-menu"
              className="mobile-menu"
              aria-label="Mobile"
              initial={{ x: '100%' }}
              animate={{ x: 0, transition: { type: 'spring', stiffness: 320, damping: 34 } }}
              exit={{ x: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
            >
              <ul className="mobile-links">
                {navLinks.map((link, i) => (
                  <motion.li
                    key={link.to}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.05 + i * 0.045 } }}
                  >
                    <NavLink to={link.to} end={link.to === '/'} className={`mobile-link ${isActive(link.to) ? 'active' : ''}`}>
                      {link.icon}<span>{link.label}</span><BsChevronRight className="mobile-chev" />
                    </NavLink>
                  </motion.li>
                ))}
              </ul>

              <div className="mobile-foot">
                <div className="mobile-quick">
                  <button className="action-btn" aria-label="Search"><FiSearch /></button>
                  <ThemeToggle />
                  <button className="action-btn" aria-label="Wishlist"><FiHeart /></button>
                  <button className="action-btn" aria-label="Cart"><FiShoppingCart /></button>
                </div>
                {account}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>, document.body)}

      <BottomNav onMore={() => setMenuOpen(true)} moreOpen={menuOpen} />
    </header>
  );
}
