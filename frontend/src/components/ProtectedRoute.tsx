import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_ROLES = ['Administrador', 'Gerente', 'admin', 'gerente', 'ADMIN', 'GERENTE', 'Manager'];
const SUPER_ADMIN_ROLES = ['Administrador', 'admin', 'ADMIN'];

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Se true, apenas Admin e Gerente podem acessar */
  adminOnly?: boolean;
  /** Se true, apenas Admin pode acessar */
  superAdminOnly?: boolean;
  /** Lista explícita de perfis permitidos (ex: ['admin','gerente']) */
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  adminOnly = false,
  superAdminOnly = false,
  allowedRoles,
}) => {
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

  const role = ((user as any)?.perfil || localStorage.getItem('user_role') || '').toLowerCase();

  // Verificação por lista explícita
  if (allowedRoles && allowedRoles.length > 0) {
    const allowed = allowedRoles.map(r => r.toLowerCase());
    if (!allowed.includes(role)) {
      return <Navigate to="/modulos" replace />;
    }
  }

  // Verificação superAdmin
  if (superAdminOnly) {
    if (!SUPER_ADMIN_ROLES.map(r => r.toLowerCase()).includes(role)) {
      return <Navigate to="/modulos" replace />;
    }
  }

  // Verificação adminOnly
  if (adminOnly) {
    if (!ADMIN_ROLES.map(r => r.toLowerCase()).includes(role)) {
      return <Navigate to="/modulos" replace />;
    }
  }

  return <>{children}</>;
};
