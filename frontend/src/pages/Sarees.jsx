import { useState } from 'react';
import { Link } from 'react-router-dom';
import SareeCard from '../components/SareeCard';
import Pagination from '../components/Pagination';
import sareesilhouette from '../assets/saree-silhouette.png';
import { latestSarees } from '../data/mockData';

export default function Sarees() {
  const [latestPage, setLatestPage] = useState(1);
  const [trendingPage, setTrendingPage] = useState(1);
  const itemsPerPage = 4;

  const latestStart = (latestPage - 1) * itemsPerPage;
  const latestItems = latestSarees.slice(latestStart, latestStart + itemsPerPage);
  const latestTotal = Math.ceil(latestSarees.length / itemsPerPage);

  const trendingStart = (trendingPage - 1) * itemsPerPage;
  const trendingItems = latestSarees.slice(trendingStart, trendingStart + itemsPerPage);
  const trendingTotal = Math.ceil(latestSarees.length / itemsPerPage);

  return (
    <div className="sarees-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            Latest <span className="text-cyan">Sarees</span>
          </h1>
          <p className="page-subtitle">
            Beautiful sarees for you, designed to enhance your elegance and style.
          </p>
        </div>
        <div className="page-header-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette" />
        </div>
      </div>

      <section className="sarees-section-card">
        <h3 className="result-section-title">Latest Saree</h3>
        <div className="saree-grid four-col">
          {latestItems.map((saree, i) => (
            <SareeCard
              key={`latest-${latestStart + i}`}
              saree={saree}
              showTags={true}
              linkTo={`/collections/batch/0/design/${latestStart + i}`}
            />
          ))}
        </div>
        <Pagination currentPage={latestPage} totalPages={latestTotal} onPageChange={setLatestPage} />
      </section>

      <section className="sarees-section-card">
        <h3 className="result-section-title">Trending Saree</h3>
        <div className="saree-grid four-col">
          {trendingItems.map((saree, i) => (
            <SareeCard
              key={`trending-${trendingStart + i}`}
              saree={saree}
              showTags={false}
              showMatch={true}
              linkTo={`/collections/batch/0/design/${trendingStart + i}`}
            />
          ))}
        </div>
        <Pagination currentPage={trendingPage} totalPages={trendingTotal} onPageChange={setTrendingPage} />
      </section>

      <div className="sarees-cta-section">
        <p className="sarees-cta-text">Make a saree that's as unique as you are.</p>
        <Link to="/design" className="generate-saree-btn">Generate Saree</Link>
      </div>
    </div>
  );
}
