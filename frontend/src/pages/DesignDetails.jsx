import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiShoppingCart } from 'react-icons/fi';
import { BsCreditCard } from 'react-icons/bs';
import SareeCard from '../components/SareeCard';
import Pagination from '../components/Pagination';
import sareesilhouette from '../assets/saree-silhouette.png';
import { materials } from '../data/mockData';
import { API_BASE_URL } from '../config';

export default function DesignDetails() {
  const { batchId, designId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [design, setDesign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState(0);
  const [matchPage, setMatchPage] = useState(1);
  const itemsPerPage = 4;

  const [orderStatus, setOrderStatus] = useState(null); // 'ordering', 'success', 'error'
  const [orderData, setOrderData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const calculateTotal = () => {
    if (!design) return '0';
    const rawPrice = materials[selectedMaterial].price.replace(/,/g, '');
    const priceNum = parseFloat(rawPrice) || 0;
    const total = priceNum * quantity;
    return total.toLocaleString('en-IN');
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/batches/${batchId}`)
      .then((res) => res.json())
      .then((data) => {
        const mappedDesigns = (data.designs || []).map((d) => ({
          ...d,
          image: d.image.startsWith('/api/') ? `${API_BASE_URL}${d.image}` : d.image,
          templateImage: d.templateImage.startsWith('/api/') ? `${API_BASE_URL}${d.templateImage}` : d.templateImage,
        }));
        const found = mappedDesigns.find((d) => d.id === designId);
        setBatch({ ...data, designs: mappedDesigns });
        setDesign(found || mappedDesigns[0]);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching design details:', err);
        setLoading(false);
      });
  }, [batchId, designId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
        Loading design details...
      </div>
    );
  }

  if (!design || !batch) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
        Design not found.
      </div>
    );
  }

  // Gallery displays the 2 generated formats: Wearable draped view and Flat Template view
  const thumbnails = [design.image, design.templateImage];
  const extraThumbs = 0;

  const matchItems = batch.designs.filter((d) => d.id !== design.id);
  const matchStart = (matchPage - 1) * itemsPerPage;
  const paginatedMatchItems = matchItems.slice(matchStart, matchStart + itemsPerPage);
  const matchTotal = Math.ceil(matchItems.length / itemsPerPage);

  // Extract tags: fallback if missing
  const pTag = design.tags?.[0] || 'P1';
  const brTag = design.tags?.[1] || 'BR1';
  const bTag = design.tags?.[2] || 'B1';

  const handleBuyNow = async () => {
    setOrderStatus('ordering');
    setShowConfirmModal(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchId: batchId,
          designId: designId,
          materialName: materials[selectedMaterial].name,
          price: materials[selectedMaterial].price,
          quantity: quantity,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to place order');
      }

      const data = await response.json();
      setOrderData(data);
      setOrderStatus('success');
    } catch (err) {
      console.error(err);
      setOrderStatus('error');
      alert('Failed to place order. Please try again.');
    }
  };

  return (
    <div className="design-details-page">
      <style>{`
        .order-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
        }
        .order-modal-content {
          background: var(--card-bg, #1a1a24);
          border: 1px solid var(--border-color, #2a2a35);
          border-radius: 16px;
          padding: 32px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease;
          text-align: center;
        }
        .modal-title {
          font-size: 1.8rem;
          margin-bottom: 16px;
          background: linear-gradient(135deg, #00f2fe, #4facfe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .modal-text {
          color: var(--text-primary, #ffffff);
          font-size: 1.1rem;
          margin-bottom: 20px;
          line-height: 1.5;
        }
        .modal-details-box {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          text-align: left;
        }
        .modal-detail-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 0.95rem;
          color: var(--text-secondary, #b3b3b3);
        }
        .modal-detail-item strong {
          color: var(--text-primary, #fff);
        }
        .modal-note {
          font-size: 0.85rem;
          color: var(--text-secondary, #8c8c9e);
          margin-bottom: 24px;
        }
        .modal-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        .modal-btn {
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }
        .modal-btn.primary {
          background: linear-gradient(135deg, #00f2fe, #4facfe);
          border: none;
          color: #101018;
        }
        .modal-btn.primary:hover {
          opacity: 0.9;
          transform: translateY(-2px);
        }
        .modal-btn.secondary {
          background: transparent;
          border: 1px solid var(--border-color, #2a2a35);
          color: var(--text-primary, #fff);
        }
        .modal-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .quantity-selector {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 16px 0;
        }
        .qty-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border-color, #2a2a35);
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary, #fff);
          font-size: 1.2rem;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .qty-btn:hover {
          background: var(--cyan, #00f2fe);
          color: #101018;
          border-color: var(--cyan, #00f2fe);
        }
        .qty-input {
          width: 85px;
          text-align: center;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color, #2a2a35);
          border-radius: 6px;
          padding: 6px;
          color: var(--text-primary, #fff);
          font-size: 1.1rem;
          font-weight: 600;
        }
      `}</style>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="order-modal-overlay">
          <div className="order-modal-content">
            <h2 className="modal-title">Confirm Saree Order</h2>
            <p className="modal-text">
              Review details and select the quantity of sarees to order.
            </p>
            <div className="modal-details-box">
              <div className="modal-detail-item">
                <span>Design Name:</span> <strong>{design.name}</strong>
              </div>
              <div className="modal-detail-item">
                <span>Quality / Material:</span> <strong>{materials[selectedMaterial].name}</strong>
              </div>
              <div className="modal-detail-item">
                <span>Price per Saree:</span> <strong>₹{materials[selectedMaterial].price}</strong>
              </div>
              <div className="modal-detail-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '10px' }}>
                <span>Estimated Total:</span> <strong style={{ color: '#00e673', fontSize: '1.2rem' }}>₹{calculateTotal()}</strong>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Order Quantity
              </span>
              <div className="quantity-selector">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  className="qty-input"
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuantity(isNaN(val) ? 1 : Math.max(1, val));
                  }}
                  min="1"
                />
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="modal-btn primary" onClick={handleBuyNow}>
                Confirm & Place Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {orderStatus === 'success' && (
        <div className="order-modal-overlay">
          <div className="order-modal-content">
            <h2 className="modal-title">🎉 Order Placed Successfully!</h2>
            <p className="modal-text">
              Your custom saree order <strong>#{orderData?.id}</strong> has been transmitted directly to the weaver's profile dashboard.
            </p>
            <div className="modal-details-box">
              <div className="modal-detail-item">
                <span>Design:</span> <strong>{design.name}</strong>
              </div>
              <div className="modal-detail-item">
                <span>Material:</span> <strong>{orderData?.materialName}</strong>
              </div>
              <div className="modal-detail-item">
                <span>Price per Saree:</span> <strong>₹{orderData?.price}</strong>
              </div>
              <div className="modal-detail-item">
                <span>Quantity Ordered:</span> <strong>{orderData?.quantity} Saree{orderData?.quantity > 1 ? 's' : ''}</strong>
              </div>
              <div className="modal-detail-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '10px' }}>
                <span>Total Bill Amount:</span> <strong style={{ color: '#00e673', fontSize: '1.2rem' }}>₹{((parseFloat(orderData?.price?.replace(/,/g, '')) || 0) * (orderData?.quantity || 1)).toLocaleString('en-IN')}</strong>
              </div>
            </div>
            <p className="modal-note">
              The weaver will now process your custom design and generate the Jacquard card loom punch pattern.
            </p>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setOrderStatus(null)}>
                Continue Shopping
              </button>
              <button className="modal-btn primary" onClick={() => navigate('/weaver')}>
                Go to Weaver Profile
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="design-top-bar">
        <div className="design-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette small" />
        </div>
        <Link to={`/collections/batch/${batchId}`} className="back-btn">
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
            <img src={thumbnails[currentImage]} alt="Saree View" className="gallery-main-img" />
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
                <img src={thumb} alt={i === 0 ? "Wearable View" : "Template View"} />
              </button>
            ))}
            {extraThumbs > 0 && (
              <span className="gallery-thumb-extra">+{extraThumbs}</span>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="design-info">
          <h1 className="design-title">{design.name}</h1>
          <p className="design-id">Saree ID: {design.id}</p>
          <h3 className="design-section-label">Description</h3>
          <p className="design-description">
            {batch.description || "A personalized saree design created by combining your custom-uploaded pallu, border, and body fabric components."}
          </p>

          <div className="design-component-tags">
            <div className="design-tag">
              <span className="tag-name">Pallu</span>
              <span className="tag-code text-cyan">{pTag}</span>
            </div>
            <div className="design-tag">
              <span className="tag-name">Border</span>
              <span className="tag-code" style={{ color: '#FF4444' }}>{brTag}</span>
            </div>
            <div className="design-tag">
              <span className="tag-name">Body</span>
              <span className="tag-code text-cyan">{bTag}</span>
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
            <button 
              className="buy-now-btn"
              onClick={() => {
                setQuantity(1);
                setShowConfirmModal(true);
              }}
              disabled={orderStatus === 'ordering'}
            >
              <BsCreditCard /> {orderStatus === 'ordering' ? 'Ordering...' : 'Buy now'}
            </button>
          </div>
        </div>
      </div>

      {/* Other matching results */}
      {paginatedMatchItems.length > 0 && (
        <section className="other-results-section">
          <h3 className="result-section-title">Other matching result</h3>
          <div className="saree-grid four-col">
            {paginatedMatchItems.map((saree) => (
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
      )}
    </div>
  );
}
