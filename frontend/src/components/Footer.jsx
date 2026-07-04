import { Link } from 'react-router-dom';
import { FaFacebook, FaLinkedin, FaYoutube, FaInstagram } from 'react-icons/fa';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="navbar-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 40 50" width="36" height="44">
                <circle cx="20" cy="8" r="6" fill="#00D4FF" />
                <path d="M12 16 C12 16 8 50 20 50 C32 50 28 16 28 16" fill="#00D4FF" opacity="0.7" />
                <path d="M20 20 C20 20 35 30 30 50" stroke="#00D4FF" fill="none" strokeWidth="2" opacity="0.5" />
              </svg>
            </div>
            <div className="logo-text">
              <span className="logo-name">
                Saree<span className="logo-accent">Fusion</span>
              </span>
              <span className="logo-tagline">Personalize Your Perfect Drape and Heritage</span>
            </div>
          </Link>
        </div>
        <div className="footer-tagline">
          <h3>Where Expectations <span className="text-cyan">Meets Excellence</span></h3>
        </div>
      </div>
      <div className="footer-socials">
        <a href="#" aria-label="Facebook"><FaFacebook /></a>
        <a href="#" aria-label="LinkedIn"><FaLinkedin /></a>
        <a href="#" aria-label="YouTube"><FaYoutube /></a>
        <a href="#" aria-label="Instagram"><FaInstagram /></a>
      </div>
    </footer>
  );
}
