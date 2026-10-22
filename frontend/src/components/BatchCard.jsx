import { Link } from 'react-router-dom';
import { FiCheck, FiArrowRight } from 'react-icons/fi';
import { HiOutlineSparkles } from 'react-icons/hi';

export default function BatchCard({ batch, index }) {
  const isGenerating = batch.status === 'generating';
  const progress = Math.round((batch.generatedDesigns / Math.max(1, batch.totalDesigns)) * 100);
  const [cover, ...rest] = batch.thumbnails || [];

  return (
    <article className="batch-card">
      <div className="batch-card-media">
        {cover && <img src={cover} alt={batch.name} className="batch-cover-img" />}
        <div className={`batch-status-badge ${isGenerating ? 'status-generating' : 'status-completed'}`}>
          {isGenerating ? <><HiOutlineSparkles /> Generating</> : <><FiCheck /> Completed</>}
        </div>
      </div>

      <div className="batch-card-body">
        <h3 className="batch-title" title={`${batch.name} #${batch.id}`}>{batch.name}</h3>
        <p className="batch-meta">#{batch.id} · {batch.createdOn}</p>

        {rest.length > 0 && (
          <div className="batch-thumb-row">
            {rest.map((thumb, i) => (
              <div key={i} className="batch-thumb-item">
                <img src={thumb} alt={`Thumbnail ${i + 2}`} className="batch-thumb-img" />
              </div>
            ))}
            {batch.extraCount > 0 && <div className="batch-thumb-extra">+{batch.extraCount}</div>}
          </div>
        )}

        <div className="batch-component-labels">
          <div className="batch-label"><span>Pallu</span><strong>{batch.palluCount}</strong></div>
          <div className="batch-label"><span>Border</span><strong>{batch.borderCount}</strong></div>
          <div className="batch-label"><span>Body</span><strong>{batch.bodyCount}</strong></div>
        </div>

        {isGenerating ? (
          <div className="batch-progress">
            <span className="batch-progress-label">Generating designs… {progress}%</span>
            <div className="batch-progress-bar">
              <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <Link to={`/collections/batch/${batch.id || index}`} className="batch-view-btn">
            View all designs <FiArrowRight />
          </Link>
        )}
      </div>
    </article>
  );
}
