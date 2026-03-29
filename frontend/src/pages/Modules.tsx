import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UnitSelector } from '../components/UnitSelector';
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
    },
    {
      id: 'usuarios-edicao',
      icon: '✏️',
      title: 'Edição de Usuários',
      description: 'Editar usuários e vincular a unidades',
      path: '/modulos/usuarios-edicao',
      color: '#8e44ad'
    }
  ];

  return (
    <div className="modules-container">
      <header className="modules-header">
        <div className="header-content">
          <h1>GRES - Gestão de Restaurantes</h1>
          <div className="user-info">
            <span>{email}</span>
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
