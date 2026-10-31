// src/hooks/useAuth.jsx
import { useState, useEffect, createContext, useContext } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.getCurrentAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
    // The API client signals when the session can no longer be renewed: back to the login page.
    const expired = () => setAdmin(null);
    window.addEventListener('admin-session-expired', expired);
    return () => window.removeEventListener('admin-session-expired', expired);
  }, []);

  async function login(credentials) {
    const data = await authService.login(credentials);
    setAdmin(data.admin);
    return data;
  }

  async function logout() {
    await authService.logout();
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout, setAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
