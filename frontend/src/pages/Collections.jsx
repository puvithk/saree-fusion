import { useState, useEffect } from 'react';
import { BsGrid } from 'react-icons/bs';
import { HiOutlineSparkles } from 'react-icons/hi';
import { FiCheck } from 'react-icons/fi';
import BatchCard from '../components/BatchCard';
import sareesilhouette from '../assets/saree-silhouette.png';
import { API_BASE_URL } from '../config';

const FILTERS = [
  { key: 'all', label: 'ALL BATCH', icon: <BsGrid /> },
  { key: 'generating', label: 'GENERATING', icon: <HiOutlineSparkles /> },
  { key: 'completed', label: 'COMPLETED', icon: <FiCheck /> },
];

export default function Collections() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [batchesList, setBatchesList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/batches`)
      .then((res) => res.json())
      .then((data) => {
        const mappedData = data.map((b) => ({
          ...b,
          thumbnails: b.thumbnails.map((t) =>
            t.startsWith('/api/') ? `${API_BASE_URL}${t}` : t
          ),
        }));
        setBatchesList(mappedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching batches:', err);
        setLoading(false);
      });
  }, []);

  const filtered = activeFilter === 'all'
    ? batchesList
    : batchesList.filter((b) => b.status === activeFilter);

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading your collections...
        </div>
      ) : (
        <div className="batch-grid">
          {filtered.map((batch, i) => (
            <BatchCard key={batch.id || i} batch={batch} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
