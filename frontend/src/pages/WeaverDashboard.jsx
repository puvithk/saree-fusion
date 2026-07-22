import { useState, useEffect } from 'react';
import { FiCpu, FiDownload, FiCheckCircle, FiClock, FiFileText, FiTrash2 } from 'react-icons/fi';
import sareesilhouette from '../assets/saree-silhouette.png';
import { API_BASE_URL } from '../config';

export default function WeaverDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);
  const [selectedLoom, setSelectedLoom] = useState({}); // orderId -> 'traditional' | 'digital' | 'dobby'

  const mapLoomOutputs = (outputs) => {
    if (!outputs) return null;
    const mapped = {};
    for (const key of Object.keys(outputs)) {
      const loom = outputs[key];
      mapped[key] = {
        ...loom,
        bmpUrl: loom.bmpUrl && loom.bmpUrl.startsWith('/api/') ? `${API_BASE_URL}${loom.bmpUrl}` : loom.bmpUrl,
        files: loom.files ? loom.files.map(f => ({
          ...f,
          url: f.url && f.url.startsWith('/api/') ? `${API_BASE_URL}${f.url}` : f.url
        })) : []
      };
    }
    return mapped;
  };

  const fetchOrders = () => {
    fetch(`${API_BASE_URL}/api/orders`)
      .then((res) => res.json())
      .then((data) => {
        let localOrders = [];
        try {
          localOrders = JSON.parse(localStorage.getItem('sareefusion_orders') || '[]');
        } catch (e) {
          console.error(e);
        }

        const combined = [...localOrders, ...data];
        const uniqueOrders = [];
        const seenIds = new Set();
        for (const order of combined) {
          if (!seenIds.has(order.id)) {
            seenIds.add(order.id);
            uniqueOrders.push(order);
          }
        }

        const mappedData = uniqueOrders.map((o) => {
          const design = o.design;
          return {
            ...o,
            design: {
              ...design,
              image: design.image && design.image.startsWith('/api/') ? `${API_BASE_URL}${design.image}` : design.image,
              templateImage: design.templateImage && design.templateImage.startsWith('/api/') ? `${API_BASE_URL}${design.templateImage}` : design.templateImage,
            },
            jacquardCardUrl: o.jacquardCardUrl ? (o.jacquardCardUrl.startsWith('/api/') ? `${API_BASE_URL}${o.jacquardCardUrl}` : o.jacquardCardUrl) : null,
            jacquardTxtUrl: o.jacquardTxtUrl ? (o.jacquardTxtUrl.startsWith('/api/') ? `${API_BASE_URL}${o.jacquardTxtUrl}` : o.jacquardTxtUrl) : null,
            loomOutputs: o.loomOutputs ? mapLoomOutputs(o.loomOutputs) : null
          };
        });
        setOrders(mappedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching orders:', err);
        let localOrders = [];
        try {
          localOrders = JSON.parse(localStorage.getItem('sareefusion_orders') || '[]');
        } catch (e) {}
        
        const mappedData = localOrders.map((o) => {
          const design = o.design;
          return {
            ...o,
            design: {
              ...design,
              image: design.image && design.image.startsWith('/api/') ? `${API_BASE_URL}${design.image}` : design.image,
              templateImage: design.templateImage && design.templateImage.startsWith('/api/') ? `${API_BASE_URL}${design.templateImage}` : design.templateImage,
            },
            jacquardCardUrl: o.jacquardCardUrl ? (o.jacquardCardUrl.startsWith('/api/') ? `${API_BASE_URL}${o.jacquardCardUrl}` : o.jacquardCardUrl) : null,
            jacquardTxtUrl: o.jacquardTxtUrl ? (o.jacquardTxtUrl.startsWith('/api/') ? `${API_BASE_URL}${o.jacquardTxtUrl}` : o.jacquardTxtUrl) : null,
            loomOutputs: o.loomOutputs ? mapLoomOutputs(o.loomOutputs) : null
          };
        });
        setOrders(mappedData);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleGenerateJacquard = async (orderId) => {
    setGeneratingId(orderId);
    try {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) {
        throw new Error('Order not found');
      }

      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/generate-jacquard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateImage: targetOrder.design.templateImage,
          design: targetOrder.design,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate Jacquard cards');
      }

      const updatedOrder = await response.json();

      try {
        const localOrders = JSON.parse(localStorage.getItem('sareefusion_orders') || '[]');
        const index = localOrders.findIndex(o => o.id === orderId);
        if (index !== -1) {
          localOrders[index] = {
            ...localOrders[index],
            ...updatedOrder
          };
        } else {
          localOrders.push(updatedOrder);
        }
        localStorage.setItem('sareefusion_orders', JSON.stringify(localOrders));
      } catch (e) {
        console.error(e);
      }

      fetchOrders();
    } catch (err) {
      console.error(err);
      alert('Failed to generate Jacquard loom pattern.');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error(err);
    }
    
    try {
      const localOrders = JSON.parse(localStorage.getItem('sareefusion_orders') || '[]');
      const updated = localOrders.filter(o => o.id !== orderId);
      localStorage.setItem('sareefusion_orders', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    
    fetchOrders();
  };

  return (
    <div className="weaver-dashboard-page">
      <style>{`
        .weaver-dashboard-page {
          padding: 40px var(--container-padding);
          max-width: 1400px;
          margin: 0 auto;
        }
        .weaver-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 32px;
          margin-top: 32px;
        }
        .order-card {
          background: var(--card-bg, #1a1a24);
          border: 1px solid var(--border-color, #2a2a35);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .order-card:hover {
          border-color: var(--cyan, #00f2fe);
        }
        .order-card-header {
          padding: 24px;
          border-bottom: 1px solid var(--border-color, #2a2a35);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          background: rgba(255, 255, 255, 0.02);
        }
        .order-meta-info {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .order-id-badge {
          background: rgba(0, 242, 254, 0.1);
          color: var(--cyan, #00f2fe);
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 700;
          font-family: monospace;
          font-size: 1rem;
        }
        .order-date {
          color: var(--text-secondary, #b3b3b3);
          font-size: 0.9rem;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .status-badge.pending {
          background: rgba(255, 170, 0, 0.1);
          color: #ffaa00;
        }
        .status-badge.completed {
          background: rgba(0, 230, 115, 0.1);
          color: #00e673;
        }
        .order-card-body {
          padding: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }
        @media (max-width: 992px) {
          .order-card-body {
            grid-template-columns: 1fr;
          }
        }
        .order-design-details {
          display: flex;
          gap: 20px;
        }
        .design-thumbnail-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .weaver-thumb {
          width: 140px;
          height: 140px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border-color, #2a2a35);
        }
        .thumb-label {
          font-size: 0.8rem;
          color: var(--text-secondary, #8c8c9e);
          text-align: center;
          margin-top: 4px;
        }
        .order-specs {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .specs-title {
          font-size: 1.25rem;
          color: var(--text-primary, #fff);
          font-weight: 600;
          margin-bottom: 4px;
        }
        .specs-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.95rem;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
          padding-bottom: 6px;
        }
        .specs-label {
          color: var(--text-secondary, #8c8c9e);
        }
        .specs-value {
          color: var(--text-primary, #fff);
          font-weight: 500;
        }
        .jacquard-panel {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed var(--border-color, #2a2a35);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          min-height: 220px;
        }
        .jacquard-visual-grid {
          width: 100%;
          max-height: 180px;
          object-fit: contain;
          border: 1px solid #3a3a4c;
          border-radius: 6px;
          margin-bottom: 16px;
          background: #000;
        }
        .jacquard-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          width: 100%;
          margin-bottom: 16px;
        }
        .jacquard-stat-item {
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 6px;
        }
        .jacquard-stat-val {
          display: block;
          font-weight: 700;
          color: var(--cyan, #00f2fe);
          font-size: 1.1rem;
        }
        .jacquard-stat-lbl {
          font-size: 0.75rem;
          color: var(--text-secondary, #8c8c9e);
        }
        .btn-action {
          width: 100%;
          padding: 12px 20px;
          border-radius: 8px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }
        .btn-action.generate {
          background: linear-gradient(135deg, #00f2fe, #4facfe);
          color: #101018;
        }
        .btn-action.generate:hover:not(:disabled) {
          transform: translateY(-2px);
          opacity: 0.95;
        }
        .btn-action.generate:disabled {
          background: #2a2a35;
          color: #8c8c9e;
          cursor: not-allowed;
        }
        .btn-action.download {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color, #2a2a35);
          color: var(--text-primary, #fff);
        }
        .btn-action.download:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .download-actions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          width: 100%;
        }
        .empty-orders {
          text-align: center;
          padding: 80px 40px;
          background: var(--card-bg, #1a1a24);
          border: 1px dashed var(--border-color, #2a2a35);
          border-radius: 16px;
          color: var(--text-secondary, #8c8c9e);
        }
        .empty-icon {
          font-size: 3rem;
          color: var(--cyan, #00f2fe);
          margin-bottom: 16px;
          opacity: 0.7;
        }
      `}</style>

      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            Weaver <span className="text-cyan">Profile Dashboard</span>
          </h1>
          <p className="page-subtitle">
            Manage custom design orders, view templates, and compile Jacquard card loom code.
          </p>
        </div>
        <div className="page-header-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette" />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
          Loading weaver orders queue...
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-orders">
          <FiCpu className="empty-icon" />
          <h3>No Orders Queued Yet</h3>
          <p>Orders submitted by customers using "Buy Now" will appear here in real-time.</p>
        </div>
      ) : (
        <div className="weaver-grid">
          {orders.map((order) => {
            const isDone = order.status === 'Jacquard Card Generated';
            const isGenerating = generatingId === order.id;

            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <div className="order-meta-info">
                    <span className="order-id-badge">{order.id}</span>
                    <span className="order-date">Ordered on: {order.createdOn}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={`status-badge ${isDone ? 'completed' : 'pending'}`}>
                      {isDone ? <FiCheckCircle /> : <FiClock />}
                      {order.status}
                    </span>
                    <button
                      onClick={() => handleDeleteOrder(order.id)}
                      title="Delete Order"
                      style={{
                        background: 'rgba(255, 75, 75, 0.1)',
                        border: '1px solid rgba(255, 75, 75, 0.2)',
                        color: '#ff4b4b',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 75, 75, 0.2)';
                        e.currentTarget.style.borderColor = '#ff4b4b';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 75, 75, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 75, 75, 0.2)';
                      }}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>

                <div className="order-card-body">
                  {/* Left Side: Design Preview */}
                  <div className="order-design-details">
                    <div className="design-thumbnail-container">
                      <div>
                        <img src={order.design.image} alt="Wearable Model" className="weaver-thumb" />
                        <div className="thumb-label">Drape Preview</div>
                      </div>
                      <div>
                        <img src={order.design.templateImage} alt="Weaving Layout" className="weaver-thumb" />
                        <div className="thumb-label">Flat Layout</div>
                      </div>
                    </div>

                    <div className="order-specs">
                      <h4 className="specs-title">{order.design.name}</h4>
                      <div className="specs-row" style={{ marginTop: '8px' }}>
                        <span className="specs-label">Customer Name</span>
                        <span className="specs-value">{order.customerName}</span>
                      </div>
                      <div className="specs-row">
                        <span className="specs-label">Selected Fabric</span>
                        <span className="specs-value">{order.materialName}</span>
                      </div>
                      <div className="specs-row">
                        <span className="specs-label">Batch Group</span>
                        <span className="specs-value" style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>#{order.batchId}</span>
                      </div>
                      <div className="specs-row">
                        <span className="specs-label">Price Tag</span>
                        <span className="specs-value" style={{ color: '#00e673', fontWeight: 'bold' }}>₹{order.price}</span>
                      </div>
                      <div className="specs-row">
                        <span className="specs-label">Quantity</span>
                        <span className="specs-value">{order.quantity} Saree{order.quantity > 1 ? 's' : ''}</span>
                      </div>

                      {order.yarnColors && (
                        <div className="yarn-colors-section" style={{ marginTop: '20px' }}>
                          <h5 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                            Required Loom Yarn Colors
                          </h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                            {Object.entries(order.yarnColors).map(([key, col]) => (
                              <div key={key} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: col.hex, border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', marginBottom: '6px' }} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '600', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap' }} title={col.name}>
                                  {col.name}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                                  {col.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Loom Processing Panel */}
                  <div className="jacquard-panel">
                    {isDone && order.loomOutputs ? (
                      (() => {
                        const currentLoomType = selectedLoom[order.id] || 'traditional';
                        const loomData = order.loomOutputs[currentLoomType];

                        return (
                          <>
                            {/* Loom Type Switcher */}
                            <div style={{ display: 'flex', gap: '8px', width: '100%', marginBottom: '16px' }}>
                              {Object.entries(order.loomOutputs).map(([key, output]) => (
                                <button
                                  key={key}
                                  onClick={() => setSelectedLoom({ ...selectedLoom, [order.id]: key })}
                                  style={{
                                    flex: 1,
                                    padding: '8px 4px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    background: currentLoomType === key ? 'linear-gradient(135deg, #00f2fe, #4facfe)' : 'rgba(255,255,255,0.05)',
                                    color: currentLoomType === key ? '#101018' : 'var(--text-primary, #fff)',
                                    border: currentLoomType === key ? 'none' : '1px solid rgba(255,255,255,0.1)'
                                  }}
                                >
                                  {key === 'traditional' ? 'Traditional' : key === 'digital' ? 'Digital' : 'Dobby'}
                                </button>
                              ))}
                            </div>

                            <img src={loomData.bmpUrl ? `${API_BASE_URL}${loomData.bmpUrl}` : order.jacquardCardUrl} alt="Loom Matrix" className="jacquard-visual-grid" />
                            
                            <div className="jacquard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', width: '100%', marginBottom: '16px' }}>
                              {loomData.stats.map((st, i) => (
                                <div className="jacquard-stat-item" key={i} style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '8px', borderRadius: '6px' }}>
                                  <span className="jacquard-stat-val" style={{ display: 'block', fontWeight: '700', color: 'var(--cyan, #00f2fe)', fontSize: '0.95rem' }}>
                                    {st.value}
                                  </span>
                                  <span className="jacquard-stat-lbl" style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #8c8c9e)' }}>
                                    {st.label}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="download-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%' }}>
                              {loomData.files.map((file, i) => (
                                <a 
                                  key={i} 
                                  href={`${API_BASE_URL}${file.url}`} 
                                  download={file.filename} 
                                  className="btn-action download"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--border-color, #2a2a35)',
                                    color: 'var(--text-primary, #fff)',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    textDecoration: 'none'
                                  }}
                                >
                                  <FiDownload /> {file.label.replace('Download ', '')}
                                </a>
                              ))}
                            </div>
                          </>
                        );
                      })()
                    ) : isDone && !order.loomOutputs ? (
                      // Fallback for orders created in the prior session without loomOutputs dictionary
                      <>
                        <img src={order.jacquardCardUrl} alt="Jacquard Matrix" className="jacquard-visual-grid" />
                        <div className="jacquard-stats">
                          <div className="jacquard-stat-item">
                            <span className="jacquard-stat-val">{order.hookSize}</span>
                            <span className="jacquard-stat-lbl">Warp Hooks</span>
                          </div>
                          <div className="jacquard-stat-item">
                            <span className="jacquard-stat-val">{order.totalCards}</span>
                            <span className="jacquard-stat-lbl">Punch Cards</span>
                          </div>
                          <div className="jacquard-stat-item">
                            <span className="jacquard-stat-val">1-Bit</span>
                            <span className="jacquard-stat-lbl">Jacquard B&W</span>
                          </div>
                        </div>

                        <div className="download-actions-grid">
                          <a href={order.jacquardCardUrl} download className="btn-action download">
                            <FiDownload /> Loom BMP
                          </a>
                          <a href={order.jacquardTxtUrl} download className="btn-action download">
                            <FiFileText /> Punch Cards (.txt)
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <FiCpu style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '16px', opacity: 0.5 }} />
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.95rem' }}>
                          Process the customized flat layout to compile the binary lift matrices and Jacquard code cards for automated looms.
                        </p>
                        <button
                          className="btn-action generate"
                          onClick={() => handleGenerateJacquard(order.id)}
                          disabled={isGenerating}
                        >
                          <FiCpu /> {isGenerating ? 'Compiling Loom Cards...' : 'Generate Loom Cards'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
