import { useState, useEffect } from 'react';
import { BsGrid } from 'react-icons/bs';
import { HiOutlineSparkles } from 'react-icons/hi';
import { FiCheck, FiTrash2 } from 'react-icons/fi';
import BatchCard from '../components/BatchCard';
import sareesilhouette from '../assets/saree-silhouette.png';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext.jsx';
import { loadSavedSimulations, deleteSavedSimulation } from '../utils/savedSimulations';

const FILTERS = [
  { key: 'all', label: 'ALL BATCH', icon: <BsGrid /> },
  { key: 'generating', label: 'GENERATING', icon: <HiOutlineSparkles /> },
  { key: 'completed', label: 'COMPLETED', icon: <FiCheck /> },
];

export default function Collections() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [batchesList, setBatchesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [savedSims, setSavedSims] = useState([]);

  useEffect(() => {
    setSavedSims(loadSavedSimulations(user));
  }, [user]);

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

      {savedSims.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 className="result-section-title">Saved Simulations</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {savedSims.map((sim) => (
              <div key={sim.id} className="batch-card" style={{ padding: 10 }}>
                <img src={sim.thumbnail} alt={sim.name}
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6, background: '#f5f0eb' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {['body', 'border', 'pallu'].map((k) => (
                      <span key={k} title={`${k} ${sim.palette?.[k]?.color}`}
                        style={{ width: 14, height: 14, borderRadius: '50%',
                          background: sim.palette?.[k]?.color, border: '1px solid #0003' }} />
                    ))}
                  </div>
                  <button aria-label="Delete saved simulation"
                    onClick={() => setSavedSims(deleteSavedSimulation(user, sim.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <FiTrash2 />
                  </button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{sim.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {new Date(sim.savedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
