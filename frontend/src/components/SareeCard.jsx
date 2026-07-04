import { Link } from 'react-router-dom';
import { FiEdit2, FiEye } from 'react-icons/fi';

export default function SareeCard({ saree, showTags = true, showMatch = false, linkTo }) {
  return (
    <div className="saree-card">
      <div className="saree-card-image-wrapper">
        {showMatch && saree.matchPercent && (
          <span className="saree-match-badge">{saree.matchPercent}</span>
        )}
        <img src={saree.image} alt={saree.name} className="saree-card-image" />
        <Link to={linkTo || '#'} className="saree-edit-btn" aria-label="Edit saree">
          <FiEdit2 />
        </Link>
      </div>
      <div className="saree-card-info">
        <h4 className="saree-card-title">{saree.name}</h4>
        <p className="saree-card-id">#{saree.id}</p>
        {showTags && saree.tags && (
          <div className="saree-card-tags">
            {saree.tags.map((tag) => (
              <span key={tag} className="saree-tag">{tag}</span>
            ))}
          </div>
        )}
        <Link to={linkTo || '#'} className="saree-preview-btn">
          <FiEye /> Preview
        </Link>
      </div>
    </div>
  );
}
