import { useState } from 'react';
import { BsGrid } from 'react-icons/bs';
import { HiOutlineSparkles } from 'react-icons/hi';
import { FiCheck } from 'react-icons/fi';
import BatchCard from '../components/BatchCard';
import sareesilhouette from '../assets/saree-silhouette.png';
import { batches } from '../data/mockData';

const FILTERS = [
  { key: 'all', label: 'ALL BATCH', icon: <BsGrid /> },
  { key: 'generating', label: 'GENERATING', icon: <HiOutlineSparkles /> },
  { key: 'completed', label: 'COMPLETED', icon: <FiCheck /> },
];

export default function Collections() {
  const [activeFilter, setActiveFilter] = useState('all');

  const filtered = activeFilter === 'all'
    ? batches
    : batches.filter((b) => b.status === activeFilter);

  return (
    <div className="collections-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            My <span className="text-cyan">Collection</span>
          </h1>
          <p className="page-subtitle">
            All your saree design batches generated from your studio creations.
          </p>
        </div>
        <div className="page-header-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette" />
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-tab ${activeFilter === f.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      <div className="batch-grid">
        {filtered.map((batch, i) => (
          <BatchCard key={i} batch={batch} index={i} />
        ))}
      </div>
    </div>
  );
}
