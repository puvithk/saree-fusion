import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import SareeCard from '../components/SareeCard';
import Pagination from '../components/Pagination';
import sareesilhouette from '../assets/saree-silhouette.png';

export default function FusionResult() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [genPage, setGenPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const itemsPerPage = 4;

  useEffect(() => {
    fetch(`http://localhost:5000/api/batches/${batchId}`)
      .then((res) => res.json())
      .then((data) => {
        // Map relative API urls to absolute backend urls
        const mappedDesigns = (data.designs || []).map((d) => ({
          ...d,
          image: d.image.startsWith('/api/') ? `http://localhost:5000${d.image}` : d.image,
          templateImage: d.templateImage.startsWith('/api/') ? `http://localhost:5000${d.templateImage}` : d.templateImage,
        }));
        const mappedUploadedComponents = {
          pallu: (data.uploadedComponents?.pallu || []).map((c) => ({
            ...c,
            image: c.image.startsWith('/api/') ? `http://localhost:5000${c.image}` : c.image,
          })),
          border: (data.uploadedComponents?.border || []).map((c) => ({
            ...c,
            image: c.image.startsWith('/api/') ? `http://localhost:5000${c.image}` : c.image,
          })),
          body: (data.uploadedComponents?.body || []).map((c) => ({
            ...c,
            image: c.image.startsWith('/api/') ? `http://localhost:5000${c.image}` : c.image,
          })),
        };
        setBatch({
          ...data,
          designs: mappedDesigns,
          uploadedComponents: mappedUploadedComponents,
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching batch details:', err);
        setLoading(false);
      });
  }, [batchId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
        Loading batch details...
      </div>
    );
  }

  if (!batch) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
        Batch not found.
      </div>
    );
  }

  const generatedDesigns = batch.designs || [];
  const uploadedComponents = batch.uploadedComponents || { pallu: [], border: [], body: [] };

  const genStart = (genPage - 1) * itemsPerPage;
  const genItems = generatedDesigns.slice(genStart, genStart + itemsPerPage);
  const genTotal = Math.ceil(generatedDesigns.length / itemsPerPage);

  const matchStart = (matchPage - 1) * itemsPerPage;
  const matchItems = generatedDesigns.slice(matchStart, matchStart + itemsPerPage);
  const matchTotal = Math.ceil(generatedDesigns.length / itemsPerPage);

  const progress = Math.round((batch.generatedDesigns / batch.totalDesigns) * 100) || 100;

  return (
    <div className="fusion-result-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            Fusion <span className="text-cyan">Result</span>
          </h1>
          <p className="page-subtitle">
            Saree generated unique design based on combinations
          </p>
        </div>
        <div className="page-header-right">
          <img src={sareesilhouette} alt="" className="decor-silhouette" />
          <Link to="/collections" className="back-btn">
            <FiChevronLeft /> Back to result
          </Link>
        </div>
      </div>

      <div className="fusion-layout">
        {/* Sidebar */}
        <aside className="fusion-sidebar">
          <h3 className="sidebar-title">Batch Information</h3>
          <span className="batch-id-badge">#{batch.id}</span>

          <div className="sidebar-meta">
            <div>
              <span className="meta-label">Created on</span>
              <span className="meta-value">{batch.createdOn}</span>
            </div>
            <div>
              <span className="meta-label">Status</span>
              <span className={`batch-status-badge ${batch.status === 'generating' ? 'status-generating' : 'status-completed'} small`}>
                {batch.status === 'generating' ? 'Generating' : '✓ Completed'}
              </span>
            </div>
          </div>

          <div className="sidebar-progress-section">
            <span className="meta-label">Generated design</span>
            <span className="progress-count">{batch.generatedDesigns}/{batch.totalDesigns}</span>
            <div className="batch-progress-bar">
              <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="sidebar-components">
            <h4 className="component-section-title">Uploaded Components</h4>

            <div className="component-group">
              <div className="component-group-header">
                <span>Pallu Images({uploadedComponents.pallu.length})</span>
              </div>
              {uploadedComponents.pallu.length > 0 ? (
                <div className="component-chips">
                  {uploadedComponents.pallu.map((c) => (
                    <div key={c.label} className="component-chip">{c.label}</div>
                  ))}
                </div>
              ) : (
                <p className="no-upload-text">No Pallu image uploaded</p>
              )}
            </div>

            <div className="component-group">
              <div className="component-group-header">
                <span>Border Images({uploadedComponents.border.length})</span>
              </div>
              {uploadedComponents.border.length > 0 ? (
                <div className="component-chips">
                  {uploadedComponents.border.map((c) => (
                    <div key={c.label} className="component-chip">{c.label}</div>
                  ))}
                </div>
              ) : (
                <p className="no-upload-text">No Border image uploaded</p>
              )}
            </div>

            <div className="component-group">
              <div className="component-group-header">
                <span>Body Images({uploadedComponents.body.length})</span>
              </div>
              {uploadedComponents.body.length > 0 ? (
                <div className="component-chips">
                  {uploadedComponents.body.map((c) => (
                    <div key={c.label} className="component-chip">{c.label}</div>
                  ))}
                </div>
              ) : (
                <p className="no-upload-text">No Body image uploaded</p>
              )}
            </div>
          </div>

          <div className="sidebar-description">
            <h4 className="component-section-title">Design Description</h4>
            <textarea
              className="description-textarea"
              placeholder="Enter design description..."
              rows={4}
              value={batch.description || ''}
              readOnly
            />
          </div>
        </aside>

        {/* Main Content */}
        <main className="fusion-main">
          <section className="result-section">
            <h3 className="result-section-title">Generated result</h3>
            <div className="saree-grid">
              {genItems.map((saree, i) => (
                <SareeCard
                  key={`gen-${saree.id}`}
                  saree={saree}
                  showTags={true}
                  linkTo={`/collections/batch/${batchId}/design/${saree.id}`}
                />
              ))}
            </div>
            <Pagination currentPage={genPage} totalPages={genTotal} onPageChange={setGenPage} />
          </section>

          <section className="result-section">
            <h3 className="result-section-title">Other matching result</h3>
            <div className="saree-grid">
              {matchItems.map((saree, i) => (
                <SareeCard
                  key={`match-${saree.id}`}
                  saree={saree}
                  showTags={false}
                  showMatch={true}
                  linkTo={`/collections/batch/${batchId}/design/${saree.id}`}
                />
              ))}
            </div>
            <Pagination currentPage={matchPage} totalPages={matchTotal} onPageChange={setMatchPage} />
          </section>
        </main>
      </div>
    </div>
  );
}
