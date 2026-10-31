// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import ProtectedRoute from './layouts/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import BusinessDetail from './pages/BusinessDetail.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Sponsored from './pages/Sponsored.jsx';
import Monitoring from './pages/Monitoring.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/users"         element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/users/:id"     element={<ProtectedRoute><BusinessDetail /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
          <Route path="/sponsored"     element={<ProtectedRoute><Sponsored /></ProtectedRoute>} />
          <Route path="/monitoring"    element={<ProtectedRoute><Monitoring /></ProtectedRoute>} />
          <Route path="/settings"      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
