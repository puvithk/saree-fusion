import { BrowserRouter as Router, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import AnimatedRoutes from './components/motion/AnimatedRoutes';
import FusionResult from './pages/FusionResult';
import DesignDetails from './pages/DesignDetails';
import Sarees from './pages/Sarees';
import Design from './pages/Design';
import WeaverDashboard from './pages/WeaverDashboard';
import Simulation from './pages/Simulation';
import ResultPage from './pages/ResultPage';
import { SareeDesignProvider } from './context/SareeDesignContext.jsx';
import './App.css';

function App() {
  return (
    <Router>
      <SareeDesignProvider>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <AnimatedRoutes>
              {/* There is no login: old /login and /signup links go to the home page */}
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/signup" element={<Navigate to="/" replace />} />

              <Route path="/" element={<Home />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/collections/:itemId" element={<CollectionDetail />} />
              <Route path="/collections/batch/:batchId" element={<FusionResult />} />
              <Route path="/collections/batch/:batchId/design/:designId" element={<DesignDetails />} />
              <Route path="/sarees" element={<Sarees />} />
              <Route path="/design" element={<Design />} />
              <Route path="/weaver" element={<WeaverDashboard />} />
              <Route path="/simulation" element={<Simulation />} />
              <Route path="/result/:batchId" element={<ResultPage />} />
              <Route path="/layout-creator" element={<Navigate to="/simulation" replace />} />
              <Route path="/layout" element={<Navigate to="/simulation" replace />} />
            </AnimatedRoutes>
          </main>
          <Footer />
        </div>
      </SareeDesignProvider>
    </Router>
  );
}

export default App;
