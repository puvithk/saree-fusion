import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import SareeCard from '../components/SareeCard';
import Pagination from '../components/Pagination';
import sareesilhouette from '../assets/saree-silhouette.png';
import { generatedDesigns, uploadedComponents } from '../data/mockData';

export default function FusionResult() {
  const [genPage, setGenPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const itemsPerPage = 4;

  const genStart = (genPage - 1) * itemsPerPage;
  const genItems = generatedDesigns.slice(genStart, genStart + itemsPerPage);
  const genTotal = Math.ceil(generatedDesigns.length / itemsPerPage);

  const matchStart = (matchPage - 1) * itemsPerPage;
  const matchItems = generatedDesigns.slice(matchStart, matchStart + itemsPerPage);
  const matchTotal = Math.ceil(generatedDesigns.length / itemsPerPage);

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
          <span className="batch-id-badge">#FS-2025-06-09-12</span>

          <div className="sidebar-meta">
            <div>
              <span className="meta-label">Created on</span>
              <span className="meta-value">09 Jun 2025 , 10.30 AM</span>
            </div>
            <div>
              <span className="meta-label">Status</span>
              <span className="batch-status-badge status-completed small">
                ✓ Completed
              </span>
            </div>
          </div>

          <div className="sidebar-progress-section">
            <span className="meta-label">Generated design</span>
            <span className="progress-count">8/24</span>
            <div className="batch-progress-bar">
              <div className="batch-progress-fill" style={{ width: '33%' }} />
            </div>
          </div>

          <div className="sidebar-components">
            <h4 className="component-section-title">Uploaded Components</h4>

            <div className="component-group">
              <div className="component-group-header">
                <span>Pallu Images({uploadedComponents.pallu.length})</span>
                <a href="#" className="view-all-link">View all</a>
              </div>
              <div className="component-chips">
                {uploadedComponents.pallu.map((c) => (
                  <div key={c.label} className="component-chip">{c.label}</div>
                ))}
              </div>
            </div>

            <div className="component-group">
              <div className="component-group-header">
                <span>Border Images({uploadedComponents.border.length})</span>
                <a href="#" className="view-all-link">View all</a>
              </div>
              <div className="component-chips">
                {uploadedComponents.border.map((c) => (
                  <div key={c.label} className="component-chip">{c.label}</div>
                ))}
              </div>
            </div>

            <div className="component-group">
              <div className="component-group-header">
                <span>Body Images(0)</span>
              </div>
              <p className="no-upload-text">No Body image uploaded</p>
            </div>
          </div>

          <div className="sidebar-description">
            <h4 className="component-section-title">Design Description</h4>
            <textarea className="description-textarea" placeholder="Enter design description..." rows={4} />
          </div>

          <button className="generate-more-btn">Generate more</button>
        </aside>

        {/* Main Content */}
        <main className="fusion-main">
          <section className="result-section">
            <h3 className="result-section-title">Generated result</h3>
            <div className="saree-grid">
              {genItems.map((saree, i) => (
                <SareeCard
                  key={`gen-${genStart + i}`}
                  saree={saree}
                  showTags={true}
                  linkTo={`/collections/batch/0/design/${genStart + i}`}
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
        </main>
      </div>
    </div>
  );
}
