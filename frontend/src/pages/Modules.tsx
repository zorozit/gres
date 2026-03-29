import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Modules.css';

export const Modules: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();

  const modules = [
    {
      id: 'dashboard',
      icon: '📊',
      title: 'Dashboard Operacional',
      description: 'Visualize métricas e indicadores em tempo real',
      path: '/dashboard',
      color: '#667eea'
    },
    {
      id: 'caixa',
      icon: '💰',
      title: 'Controle de Caixa',
      description: 'Gerencie aberturas, recebimentos e fechamentos',
      path: '/modulos/caixa',
      color: '#f093fb'
    },
    {
      id: 'escalas',
      icon: '📅',
      title: 'Gestão de Escalas',
      description: 'Organize turnos e presenças de colaboradores',
      path: '/modulos/escalas',
      color: '#4facfe'
    },
    {
      id: 'saidas',
      icon: '💸',
      title: 'Registro de Saídas',
      description: 'Controle despesas e saídas operacionais',
      path: '/modulos/saidas',
      color: '#43e97b'
    },
    {
      id: 'motoboys',
      icon: '🏍️',
      title: 'Gestão de Motoboys',
      description: 'Administre entregas e comissões',
      path: '/modulos/motoboys',
      color: '#fa709a'
    },
    {
      id: 'colaboradores',
      icon: '👥',
      title: 'Gestão de Colaboradores',
      description: 'Gerencie dados e históricos de funcionários',
      path: '/modulos/colaboradores',
      color: '#30cfd0'
    },
    {
      id: 'unidades',
      icon: '🏢',
      title: 'Cadastro de Unidades',
      description: 'Gerencie as unidades de restaurante',
      path: '/modulos/unidades',
      color: '#ff6b9d'
    },
    {
      id: 'usuarios',
      icon: '🔐',
      title: 'Gestão de Usuários',
      description: 'Controle de acesso e permissões',
      path: '/modulos/usuarios',
      color: '#c44569'
    }
  ];

  return (
    <div className="modules-container">
      <header className="modules-header">
        <div className="header-left">
          <h1>🍽️ GRES</h1>
          <p>Gestão de Restaurantes</p>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="modules-main">
        <div className="modules-header-section">
          <h2>Módulos do Sistema</h2>
          <p>Selecione um módulo para começar</p>
        </div>

        <div className="modules-grid">
          {modules.map((module) => (
            <div
              key={module.id}
              className="module-card"
              onClick={() => navigate(module.path)}
              style={{ borderTopColor: module.color }}
            >
              <div className="module-icon" style={{ color: module.color }}>
                {module.icon}
              </div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <button className="module-button" style={{ backgroundColor: module.color }}>
                Acessar →
              </button>
            </div>
          ))}
        </div>

        <div className="modules-footer">
          <p>💡 Dica: Clique em qualquer módulo para começar</p>
        </div>
      </main>
    </div>
  );
};
