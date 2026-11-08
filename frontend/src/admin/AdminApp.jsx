import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './AdminAuth.jsx';
import AdminLogin from './AdminLogin.jsx';
import AdminLayout from './AdminLayout.jsx';
import Overview from './Overview.jsx';
import Users from './Users.jsx';
import Settings from './Settings.jsx';
import './admin.css';

export default function AdminApp() {
  return (
    <div className="admin-root">
      <AdminAuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AdminAuthProvider>
    </div>
  );
}
