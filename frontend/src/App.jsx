import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Collections from './pages/Collections';
import FusionResult from './pages/FusionResult';
import DesignDetails from './pages/DesignDetails';
import Sarees from './pages/Sarees';
import Design from './pages/Design';
import WeaverDashboard from './pages/WeaverDashboard';
import Simulation from './pages/Simulation';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext.jsx';
import { SareeDesignProvider } from './context/SareeDesignContext.jsx';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
      <SareeDesignProvider>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <Routes>
              {/* Public auth routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              {/* Protected routes */}
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/collections" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
              <Route path="/collections/batch/:batchId" element={<ProtectedRoute><FusionResult /></ProtectedRoute>} />
              <Route path="/collections/batch/:batchId/design/:designId" element={<ProtectedRoute><DesignDetails /></ProtectedRoute>} />
              <Route path="/sarees" element={<ProtectedRoute><Sarees /></ProtectedRoute>} />
              <Route path="/design" element={<ProtectedRoute><Design /></ProtectedRoute>} />
              <Route path="/weaver" element={<ProtectedRoute><WeaverDashboard /></ProtectedRoute>} />
              <Route path="/simulation" element={<ProtectedRoute><Simulation /></ProtectedRoute>} />
              <Route path="/layout-creator" element={<Navigate to="/simulation" replace />} />
              <Route path="/layout" element={<Navigate to="/simulation" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </SareeDesignProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
