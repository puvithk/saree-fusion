import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import logoImage from '../assets/logo-image.png';
import heroCollage from '../assets/hero-collage.png';
import weavingLoom from '../assets/weaving-loom.png';
import redSaree from '../assets/red-saree.png';
import palluSwatch from '../assets/pallu-swatch.png';
import borderSwatch from '../assets/border-swatch.png';
import bodySwatch from '../assets/body-swatch.png';
import { sareeCategories, latestSarees } from '../data/mockData';

export default function Home() {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <p className="hero-subtitle">Where Expectations Meets Excellence</p>
          <h1 className="hero-title">
            Personalize Your Perfect<br />
            <span className="text-cyan">Drape and Heritage</span>
          </h1>
          <p className="hero-desc">
            Design your dream saree with your unique blend of body, border, and pallu.
          </p>
          <Link to="/design" className="hero-cta">
            Start design <FiArrowRight />
          </Link>
        </div>
        <div className="hero-image">
          <img src={logoImage} alt="SareeFusion Logo" />
        </div>
      </section>

      {/* Create Customize Wear */}
      <section className="ccw-section">
        <div className="ccw-content">
          <p className="ccw-subtitle text-cyan">Design your dream saree</p>
          <h2 className="ccw-title">Create , Customize ,Wear</h2>
          <p className="ccw-desc">
            Use studio to design a saree that's your unique
          </p>
          <Link to="/design" className="ccw-cta">
            Add <FiArrowRight />
          </Link>
        </div>
        <div className="ccw-image">
          <img src={heroCollage} alt="Saree collage" />
        </div>
      </section>

      {/* Design Components */}
      <section className="components-section">
        <h2 className="section-title">
          Design <span className="text-cyan">Components</span>
        </h2>
        <div className="components-flow">
          <div className="component-item">
            <img src={palluSwatch} alt="Explore Pallu" className="component-img" />
            <span className="component-label">EXPLORE PALLU</span>
          </div>
          <div className="component-item">
            <img src={borderSwatch} alt="Explore Border" className="component-img" />
            <span className="component-label">EXPLORE BORDER</span>
          </div>
          <div className="component-item">
            <img src={bodySwatch} alt="Exploration" className="component-img" />
            <span className="component-label">EXPLORATION</span>
          </div>
          <div className="component-center">
            <div className="component-arrows">
              <svg viewBox="0 0 300 200" className="arrows-svg">
                <path d="M50 30 L150 100" stroke="#1a1a2e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                <path d="M250 30 L150 100" stroke="#1a1a2e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                <path d="M150 0 L150 100" stroke="#1a1a2e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                <path d="M150 120 L150 200" stroke="#1a1a2e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                <path d="M180 180 L260 180" stroke="#1a1a2e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                <defs>
                  <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#1a1a2e" />
                  </marker>
                </defs>
              </svg>
            </div>
            <div className="combining-label">
              <img src={redSaree} alt="Combining" className="combining-img" />
              <span>COMBINING</span>
            </div>
          </div>
          <div className="component-bottom">
            <div className="component-item">
              <span className="component-label">MANUFACTURING</span>
            </div>
            <div className="component-item weaving-item">
              <img src={weavingLoom} alt="Weaving" className="component-img" />
              <span className="component-label">WEAVING</span>
            </div>
          </div>
        </div>
      </section>

      {/* Latest Collection */}
      <section className="collection-section">
        <p className="section-subtitle">EXPLORE OUR WORK</p>
        <h2 className="section-title">
          SHOP IN OUR <span className="text-cyan">LATEST COLLECTION</span>
        </h2>
        <div className="category-grid">
          {sareeCategories.map((cat) => (
            <Link key={cat.name} to="/sarees" className="category-card">
              <img src={cat.image} alt={cat.name} className="category-img" />
              <p className="category-name">{cat.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Saree */}
      <section className="latest-saree-section">
        <h2 className="section-title">
          SHOP IN OUR <span className="text-cyan">LATEST SAREE</span>
        </h2>
        <div className="latest-saree-grid">
          {latestSarees.slice(0, 4).map((saree) => (
            <Link key={saree.id} to={`/sarees`} className="latest-saree-card">
              <img src={saree.image} alt={saree.name} className="latest-saree-img" />
              <p className="latest-saree-name">{saree.name}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
