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
              <AnimatedRoutes>
                {/* Login/Signup pages are removed for now; old links go to the home page.
                  To restore: re-import pages/Login and pages/Signup and add their routes back. */}
                {/* <Route path="/login" element={<Navigate to="/" replace />} /> */}
                {/* <Route path="/signup" element={<Navigate to="/" replace />} /> */}

                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/collections" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
                <Route path="/collections/:itemId" element={<ProtectedRoute><CollectionDetail /></ProtectedRoute>} />
                <Route path="/collections/batch/:batchId" element={<ProtectedRoute><FusionResult /></ProtectedRoute>} />
                <Route path="/collections/batch/:batchId/design/:designId" element={<ProtectedRoute><DesignDetails /></ProtectedRoute>} />
                <Route path="/sarees" element={<ProtectedRoute><Sarees /></ProtectedRoute>} />
                <Route path="/design" element={<ProtectedRoute><Design /></ProtectedRoute>} />
                <Route path="/weaver" element={<ProtectedRoute><WeaverDashboard /></ProtectedRoute>} />
                <Route path="/simulation" element={<ProtectedRoute><Simulation /></ProtectedRoute>} />
                <Route path="/result/:batchId" element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
                <Route path="/layout-creator" element={<Navigate to="/simulation" replace />} />
                <Route path="/layout" element={<Navigate to="/simulation" replace />} />
              </AnimatedRoutes>
            </main>
            <Footer />
          </div>
        </SareeDesignProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
