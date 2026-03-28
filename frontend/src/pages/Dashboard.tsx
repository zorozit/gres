import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Dashboard.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🍽️ GRES</h1>
          <p>Gestão de Restaurantes</p>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Bem-vindo ao GRES! 👋</h2>
          <p>Sistema de Gestão Operacional para Redes de Restaurantes</p>
        </div>

        <button onClick={() => navigate('/modulos')} className="view-modules-button">
          Ver Todos os Módulos →
        </button>

        <div className="features-grid">
          <div className="feature-card" onClick={() => navigate('/modulos')}>
            <div className="feature-icon">📊</div>
            <h3>Dashboard Operacional</h3>
            <p>Visualize métricas e indicadores em tempo real</p>
          </div>

          <div className="feature-card" onClick={() => navigate('/modulos/caixa')}>
            <div className="feature-icon">💰</div>
            <h3>Controle de Caixa</h3>
            <p>Gerencie aberturas, recebimentos e fechamentos</p>
          </div>

          <div className="feature-card" onClick={() => navigate('/modulos/escalas')}>
            <div className="feature-icon">📅</div>
            <h3>Gestão de Escalas</h3>
            <p>Organize turnos e presenças de colaboradores</p>
          </div>

          <div className="feature-card" onClick={() => navigate('/modulos/saidas')}>
            <div className="feature-icon">💸</div>
            <h3>Registro de Saídas</h3>
            <p>Controle despesas e saídas operacionais</p>
          </div>

          <div className="feature-card" onClick={() => navigate('/modulos/motoboys')}>
            <div className="feature-icon">🏍️</div>
            <h3>Gestão de Motoboys</h3>
            <p>Administre entregas e comissões</p>
          </div>

          <div className="feature-card" onClick={() => navigate('/modulos/colaboradores')}>
            <div className="feature-icon">👥</div>
            <h3>Gestão de Colaboradores</h3>
            <p>Gerencie dados e históricos de funcionários</p>
          </div>
        </div>

        <div className="status-section">
          <h3>Status do Sistema</h3>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-dot online"></span>
              <span>API: Conectada</span>
            </div>
            <div className="status-item">
              <span className="status-dot online"></span>
              <span>Banco de Dados: Ativo</span>
            </div>
            <div className="status-item">
              <span className="status-dot online"></span>
              <span>Autenticação: Ativa</span>
            </div>
            <div className="status-item">
              <span className="status-dot online"></span>
              <span>Armazenamento: Disponível</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
