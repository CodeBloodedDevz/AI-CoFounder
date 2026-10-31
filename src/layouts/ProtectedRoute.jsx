// src/layouts/ProtectedRoute.jsx
// Guards all admin pages. The backend checks the token and the admin_users row on every request.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function ProtectedRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Verifying session…" />;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}
