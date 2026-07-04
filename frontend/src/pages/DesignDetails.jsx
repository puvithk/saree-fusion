import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiShoppingCart } from 'react-icons/fi';
import { BsCreditCard } from 'react-icons/bs';
import SareeCard from '../components/SareeCard';
import Pagination from '../components/Pagination';
import sareesilhouette from '../assets/saree-silhouette.png';
import redSaree from '../assets/red-saree.png';
import { generatedDesigns, materials } from '../data/mockData';

export default function DesignDetails() {
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState(0);
  const [matchPage, setMatchPage] = useState(1);

  const thumbnails = [redSaree, redSaree, redSaree, redSaree];
  const extraThumbs = 2;
  const itemsPerPage = 4;
  const matchStart = (matchPage - 1) * itemsPerPage;
  const matchItems = generatedDesigns.slice(matchStart, matchStart + itemsPerPage);
  const matchTotal = Math.ceil(generatedDesigns.length / itemsPerPage);

  return (
    <div className="design-details-page">
      <div className="design-top-bar">
        <div className="design-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette small" />
        </div>
        <Link to="/collections/batch/0" className="back-btn">
          <FiChevronLeft /> Back to result
        </Link>
      </div>

      <div className="design-layout">
        {/* Image Gallery */}
        <div className="design-gallery">
          <div className="gallery-main">
            <button className="gallery-arrow left" onClick={() => setCurrentImage(Math.max(0, currentImage - 1))}>
              <FiChevronLeft />
            </button>
            <img src={thumbnails[currentImage]} alt="Saree" className="gallery-main-img" />
            <button className="gallery-arrow right" onClick={() => setCurrentImage(Math.min(thumbnails.length - 1, currentImage + 1))}>
              <FiChevronRight />
            </button>
          </div>
          <div className="gallery-thumbs">
            {thumbnails.map((thumb, i) => (
              <button
                key={i}
                className={`gallery-thumb ${i === currentImage ? 'active' : ''}`}
                onClick={() => setCurrentImage(i)}
              >
                <img src={thumb} alt={`Thumbnail ${i + 1}`} />
              </button>
            ))}
            {extraThumbs > 0 && (
              <span className="gallery-thumb-extra">+{extraThumbs}</span>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="design-info">
          <h1 className="design-title">Royal Heritage Red Saree</h1>
          <p className="design-id">Saree ID: FS-2025-06-09-12-001</p>
          <h3 className="design-section-label">Description</h3>
          <p className="design-description">
            A timeless red saree featuring intricate gold zari woven borders and traditional motifs.
            Perfect for weddings, festivals, and grand celebrations.
          </p>

          <div className="design-component-tags">
            <div className="design-tag">
              <span className="tag-name">Pallu</span>
              <span className="tag-code text-cyan">P1</span>
            </div>
            <div className="design-tag">
              <span className="tag-name">Border</span>
              <span className="tag-code" style={{ color: '#FF4444' }}>BR1</span>
            </div>
            <div className="design-tag">
              <span className="tag-name">Body</span>
              <span className="tag-code text-cyan">B1</span>
            </div>
          </div>

          <h3 className="design-section-label">Available in Different Materials / Quality</h3>
          <div className="materials-table">
            <div className="materials-header">
              <span>Materials / Quality</span>
              <span>Details</span>
              <span>Price(INR)</span>
            </div>
            {materials.map((mat, i) => (
              <div
                key={mat.name}
                className={`material-row ${i === selectedMaterial ? 'selected' : ''}`}
                onClick={() => setSelectedMaterial(i)}
              >
                <label className="material-radio">
                  <input
                    type="radio"
                    name="material"
                    checked={i === selectedMaterial}
                    onChange={() => setSelectedMaterial(i)}
                  />
                  <span className="material-name">{mat.name}</span>
                </label>
                <span className="material-details">{mat.details}</span>
                <span className="material-price">₹{mat.price}</span>
              </div>
            ))}
          </div>

          <div className="design-actions">
            <button className="add-to-cart-btn">
              <FiShoppingCart /> Add to cart
            </button>
            <button className="buy-now-btn">
              <BsCreditCard /> Buy now
            </button>
          </div>
        </div>
      </div>

      {/* Other matching results */}
      <section className="other-results-section">
        <h3 className="result-section-title">Other matching result</h3>
        <div className="saree-grid four-col">
          {matchItems.map((saree, i) => (
            <SareeCard
              key={`match-${matchStart + i}`}
              saree={saree}
              showTags={false}
              showMatch={true}
              linkTo={`/collections/batch/0/design/${matchStart + i}`}
            />
          ))}
        </div>
        <Pagination currentPage={matchPage} totalPages={matchTotal} onPageChange={setMatchPage} />
      </section>
    </div>
  );
}
