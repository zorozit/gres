import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_ROLES = ['Administrador', 'Gerente', 'admin', 'gerente', 'ADMIN', 'GERENTE', 'Manager'];

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, only Admin and Gerente can access this route */
  adminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly) {
    const role = (user as any)?.perfil || localStorage.getItem('user_role') || '';
    if (!ADMIN_ROLES.includes(role)) {
      return <Navigate to="/modulos" replace />;
    }
  }

  return <>{children}</>;
};
