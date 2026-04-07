import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';

interface HeaderProps {
  title: string;
  showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack = true }) => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { activeUnit } = useUnit();

  const handleLogout = () => {
    if (confirm('Deseja sair do sistema?')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <header style={styles.header}>
      <div style={styles.headerContent}>
        <div style={styles.leftSection}>
          {showBack && (
            <button 
              onClick={() => navigate(-1)}
              style={styles.backButton}
              title="Voltar"
            >
              ← Voltar
            </button>
          )}
          <h1 style={styles.title}>{title}</h1>
        </div>

        <div style={styles.rightSection}>
          <div style={styles.userInfo}>
            <span style={styles.userLabel}>Usuário:</span>
            <span style={styles.userName}>{user?.email || 'Anônimo'}</span>
          </div>
          
          {activeUnit && (
            <div style={styles.unitInfo}>
              <span style={styles.unitLabel}>Unidade:</span>
              <span style={styles.unitName}>{activeUnit.nome}</span>
            </div>
          )}

          <button 
            onClick={handleLogout}
            style={styles.logoutButton}
            title="Sair do sistema"
          >
            🚪 Sair
          </button>
        </div>
      </div>
    </header>
  );
};

const styles = {
  header: {
    backgroundColor: '#1a2e44',
    color: 'white',
    padding: '14px 20px',
    borderBottom: '3px solid #1976d2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    marginBottom: '20px',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: '1400px',
    margin: '0 auto',
    gap: '20px',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    flex: 1,
  },
  backButton: {
    padding: '8px 12px',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.3s',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 'bold',
    color: 'white',
    letterSpacing: '0.3px',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  userLabel: {
    fontWeight: 'bold',
    color: '#bdc3c7',
  },
  userName: {
    color: '#ecf0f1',
    fontFamily: 'monospace',
  },
  unitInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    paddingLeft: '15px',
    borderLeft: '1px solid #34495e',
  },
  unitLabel: {
    fontWeight: 'bold',
    color: '#bdc3c7',
  },
  unitName: {
    color: '#f39c12',
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: '8px 12px',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.3s',
  },
};
