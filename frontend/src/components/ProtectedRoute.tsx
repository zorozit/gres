import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** ID do módulo a verificar nas permissões salvas (ex: 'colaboradores') */
  moduloId?: string;
  /** Perfis que sempre têm acesso independente das permissões salvas (ex: admin sempre acessa tudo) */
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

const ADMIN_ROLES    = ['admin', 'administrador'];
const SUPER_ADMIN    = ['admin', 'administrador'];

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  moduloId,
  adminOnly = false,
  superAdminOnly = false,
}) => {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const { loaded: permLoaded, temAcesso } = usePermissoes();

  // Aguarda autenticação E permissões carregarem
  if (authLoading || !permLoaded) {
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
  const isAdmin = ADMIN_ROLES.includes(role);
  const isSuperAdmin = SUPER_ADMIN.includes(role);

  // superAdminOnly: só admin passa
  if (superAdminOnly && !isSuperAdmin) {
    return <Navigate to="/modulos" replace />;
  }

  // adminOnly: só admin/gerente passa
  if (adminOnly && !isAdmin && role !== 'gerente' && role !== 'manager') {
    return <Navigate to="/modulos" replace />;
  }

  // Verificação via permissões salvas (única fonte de verdade)
  if (moduloId) {
    if (!temAcesso(role, moduloId)) {
      return <Navigate to="/modulos" replace />;
    }
  }

  return <>{children}</>;
};
