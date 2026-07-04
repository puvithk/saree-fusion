import { Link } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import { HiOutlineSparkles } from 'react-icons/hi';

export default function BatchCard({ batch, index }) {
  const isGenerating = batch.status === 'generating';
  const progress = Math.round((batch.generatedDesigns / batch.totalDesigns) * 100);

  return (
    <div className="batch-card">
      <div className={`batch-status-badge ${isGenerating ? 'status-generating' : 'status-completed'}`}>
        {isGenerating ? (
          <><HiOutlineSparkles /> Generating</>
        ) : (
          <><FiCheck /> Completed</>
        )}
      </div>

      <h3 className="batch-title">
        {batch.name} #{batch.id}
      </h3>
      <p className="batch-meta">ID : {batch.id}</p>
      <p className="batch-meta">Created on : {batch.createdOn}</p>

      <div className="batch-thumbnails">
        <div className="batch-thumb-row">
          {batch.thumbnails.map((thumb, i) => (
            <div key={i} className="batch-thumb-item">
              <img src={thumb} alt={`Thumbnail ${i + 1}`} className="batch-thumb-img" />
            </div>
          ))}
          {batch.extraCount > 0 && (
            <div className="batch-thumb-extra">+{batch.extraCount}</div>
          )}
        </div>
        <div className="batch-component-labels">
          <div className="batch-label">
            <span>Pallu</span>
            <strong>{batch.palluCount}</strong>
          </div>
          <div className="batch-label">
            <span>Border</span>
            <strong>{batch.borderCount}</strong>
          </div>
          <div className="batch-label">
            <span>Body</span>
            <strong>{batch.bodyCount}</strong>
          </div>
        </div>
      </div>

      {isGenerating ? (
        <div className="batch-progress">
          <span className="batch-progress-label">Generating designs...</span>
          <div className="batch-progress-bar">
            <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <Link to={`/collections/batch/${index}`} className="batch-view-btn">
          View all Designs
        </Link>
      )}
    </div>
  );
}
