import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Help from './pages/Help';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import CollectionFolder from './pages/CollectionFolder';
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

// Admin console is a separate, lazily loaded app; weaver pages never import it.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

// Everything that reads or writes a weaver's own work sits behind a session.
// The guard is for usability; the API checks the cookie on every request itself.
const guarded = (element) => <ProtectedRoute>{element}</ProtectedRoute>;

function WeaverApp() {
  return (
    <>
      <AuthProvider>
        <SareeDesignProvider>
          <div className="app">
            <Navbar />
            <main className="main-content">
              <AnimatedRoutes>
                <Route path="/login" element={<Login />} />
                {/* Google is the only sign-in, so there is no separate sign-up step */}
                <Route path="/signup" element={<Navigate to="/login" replace />} />

                {/* Public: the landing page and the static saree catalogue */}
                <Route path="/" element={<Home />} />
                <Route path="/sarees" element={<Sarees />} />
                <Route path="/help" element={<Help />} />

                {/* Private: a user's designs, batches, orders and loom files */}
                <Route path="/collections" element={guarded(<Collections />)} />
                <Route path="/collections/folder/:folderId" element={guarded(<CollectionFolder />)} />
                <Route path="/collections/:itemId" element={guarded(<CollectionDetail />)} />
                <Route path="/collections/batch/:batchId" element={guarded(<FusionResult />)} />
                <Route
                  path="/collections/batch/:batchId/design/:designId"
                  element={guarded(<DesignDetails />)}
                />
                <Route path="/design" element={guarded(<Design />)} />
                <Route path="/weaver" element={guarded(<WeaverDashboard />)} />
                <Route path="/simulation" element={guarded(<Simulation />)} />
                <Route path="/result/:batchId" element={guarded(<ResultPage />)} />

                <Route path="/layout-creator" element={<Navigate to="/simulation" replace />} />
                <Route path="/layout" element={<Navigate to="/simulation" replace />} />
              </AnimatedRoutes>
            </main>
            <Footer />
          </div>
        </SareeDesignProvider>
      </AuthProvider>
    </>
  );
}

function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}

function Shell() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }
  return <WeaverApp />;
}

export default App;
