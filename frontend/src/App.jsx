import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Collections from './pages/Collections';
import FusionResult from './pages/FusionResult';
import DesignDetails from './pages/DesignDetails';
import Sarees from './pages/Sarees';
import Design from './pages/Design';
import WeaverDashboard from './pages/WeaverDashboard';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/batch/:batchId" element={<FusionResult />} />
            <Route path="/collections/batch/:batchId/design/:designId" element={<DesignDetails />} />
            <Route path="/sarees" element={<Sarees />} />
            <Route path="/design" element={<Design />} />
            <Route path="/weaver" element={<WeaverDashboard />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
