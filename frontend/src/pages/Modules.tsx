import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UnitSelector } from '../components/UnitSelector';
import '../styles/Modules.css';

const ADMIN_ROLES = ['Administrador', 'Gerente', 'admin', 'gerente', 'ADMIN', 'GERENTE', 'Manager'];
const ADMIN_ONLY_ROLES = ['Administrador', 'admin', 'ADMIN'];

export const Modules: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, user } = useAuth();
  const userRole = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdminOrGerente = ADMIN_ROLES.includes(userRole);
  const isAdminOnly = ADMIN_ONLY_ROLES.includes(userRole);

  const allModules = [
    {
      id: 'dashboard',
      icon: '📊',
      title: 'Dashboard Operacional',
      description: 'Visualize métricas e indicadores em tempo real',
      path: '/modulos/dashboard',
      color: '#667eea',
      adminRequired: true,
    },
    {
      id: 'caixa',
      icon: '💰',
      title: 'Controle de Caixa',
      description: 'Gerencie aberturas, recebimentos e fechamentos',
      path: '/modulos/caixa',
      color: '#f093fb',
      adminRequired: false,
    },
    {
      id: 'escalas',
      icon: '📅',
      title: 'Gestão de Escalas',
      description: 'Organize turnos e presenças de colaboradores',
      path: '/modulos/escalas',
      color: '#4facfe',
      adminRequired: false,
    },
    {
      id: 'saidas',
      icon: '💸',
      title: 'Registro de Saídas',
      description: 'Controle despesas e saídas operacionais',
      path: '/modulos/saidas',
      color: '#43e97b',
      adminRequired: false,
    },
    {
      id: 'motoboys',
      icon: '🏍️',
      title: 'Gestão de Motoboys',
      description: 'Administre entregas e comissões',
      path: '/modulos/motoboys',
      color: '#fa709a',
      adminRequired: false,
    },
    {
      id: 'colaboradores',
      icon: '👥',
      title: 'Gestão de Colaboradores',
      description: 'Gerencie dados e históricos de funcionários',
      path: '/modulos/colaboradores',
      color: '#30cfd0',
      adminRequired: false,
    },
    {
      id: 'folha-pagamento',
      icon: '💳',
      title: 'Folha de Pagamento',
      description: 'Calcule e gerencie pagamentos de colaboradores',
      path: '/modulos/folha-pagamento',
      color: '#2e7d32',
      adminRequired: true,
    },
    {
      id: 'extrato',
      icon: '📋',
      title: 'Extrato de Pagamentos',
      description: 'Histórico analítico de pagamentos e descontos',
      path: '/modulos/extrato',
      color: '#00838f',
      adminRequired: true,
    },
    {
      id: 'importacoes-contabeis',
      icon: '📥',
      title: 'Importações Contábeis',
      description: 'Importe PDFs da contabilidade e distribua para folha e saídas',
      path: '/modulos/importacoes-contabeis',
      color: '#6d4c41',
      adminRequired: true,
    },
    {
      id: 'unidades',
      icon: '🏢',
      title: 'Cadastro de Unidades',
      description: 'Gerencie as unidades de restaurante',
      path: '/modulos/unidades',
      color: '#ff6b9d',
      superAdminRequired: true,
    },
    {
      id: 'usuarios',
      icon: '🔐',
      title: 'Gestão de Usuários',
      description: 'Controle de acesso e permissões',
      path: '/modulos/usuarios',
      color: '#c44569',
      superAdminRequired: true,
    },
    {
      id: 'usuarios-edicao',
      icon: '✏️',
      title: 'Edição de Usuários',
      description: 'Editar usuários e vincular a unidades',
      path: '/modulos/usuarios-edicao',
      color: '#8e44ad',
      superAdminRequired: true,
    }
  ];

  // Filter modules based on role
  const modules = allModules.filter(m => {
    if ((m as any).superAdminRequired) return isAdminOnly;
    if ((m as any).adminRequired) return isAdminOrGerente;
    return true;
  });

  return (
    <div className="modules-container">
      <header className="modules-header">
        <div className="header-content">
          <h1>GIRES - Gestão Inteligente para Restaurantes</h1>
          <div className="user-info">
            <span style={{ fontSize: '13px' }}>
              {email}
              {userRole && (
                <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px',
                  backgroundColor: isAdminOrGerente ? '#e8f5e9' : '#fff3e0',
                  color: isAdminOrGerente ? '#2e7d32' : '#e65100', fontSize: '11px', fontWeight: 'bold' }}>
                  {userRole}
                </span>
              )}
            </span>
            <button onClick={logout} className="logout-btn">Sair</button>
          </div>
        </div>
      </header>

      <main className="modules-main">
        <UnitSelector />

        <div className="modules-grid">
          {modules.map(module => (
            <div
              key={module.id}
              className="module-card"
              style={{ borderTopColor: module.color }}
              onClick={() => navigate(module.path)}
            >
              <div className="module-icon">{module.icon}</div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <button className="module-btn">Acessar →</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
