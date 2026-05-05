import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';
import { UnitSelector } from '../components/UnitSelector';
import '../styles/Modules.css';

// Definição canônica de todos os módulos — sem flags de acesso (isso vem das permissões)
const ALL_MODULES = [
  { id: 'dashboard',             icon: '📊', title: 'Dashboard Operacional',    description: 'Visualize métricas e indicadores em tempo real',                                   path: '/modulos/dashboard',             color: '#667eea' },
  { id: 'caixa',                 icon: '💰', title: 'Controle de Caixa',         description: 'Gerencie aberturas, recebimentos e fechamentos',                                   path: '/modulos/caixa',                 color: '#f093fb' },
  { id: 'escalas',               icon: '📅', title: 'Gestão de Escalas',         description: 'Organize turnos e presenças de colaboradores',                                     path: '/modulos/escalas',               color: '#4facfe' },
  { id: 'saidas',                icon: '💸', title: 'Registro de Saídas',        description: 'Controle despesas e saídas operacionais',                                         path: '/modulos/saidas',                color: '#43e97b' },
  { id: 'motoboys',              icon: '🏍️', title: 'Gestão de Motoboys',        description: 'Administre entregas e comissões',                                                 path: '/modulos/motoboys',              color: '#fa709a' },
  { id: 'colaboradores',         icon: '👥', title: 'Gestão de Colaboradores',   description: 'Gerencie dados e históricos de funcionários',                                     path: '/modulos/colaboradores',         color: '#30cfd0' },
  { id: 'folha-pagamento',       icon: '💳', title: 'Folha de Pagamento',        description: 'Calcule e gerencie pagamentos de colaboradores',                                   path: '/modulos/folha-pagamento',       color: '#2e7d32' },
  { id: 'extrato',               icon: '📋', title: 'Extrato de Pagamentos',     description: 'Histórico analítico de pagamentos e descontos',                                   path: '/modulos/extrato',               color: '#00838f' },
  { id: 'adiantamentos-saldos',  icon: '🧾', title: 'Empréstimos e Saldos',      description: 'Controle adiantamentos especiais, parcelas e saldos em aberto',                  path: '/modulos/adiantamentos-saldos',  color: '#7b1fa2' },
  { id: 'fechamento-dinheiro',   icon: '💵', title: 'Fechamento Dinheiro',       description: 'Batimento de sangrias × pagamentos em dinheiro',                                  path: '/modulos/fechamento-dinheiro',   color: '#f57f17' },
  { id: 'importacoes-contabeis', icon: '📥', title: 'Importações Contábeis',     description: 'Importe PDFs da contabilidade e distribua para folha e saídas',                  path: '/modulos/importacoes-contabeis', color: '#6d4c41' },
  { id: 'unidades',              icon: '🏢', title: 'Cadastro de Unidades',      description: 'Gerencie as unidades de restaurante',                                             path: '/modulos/unidades',              color: '#ff6b9d' },
  { id: 'usuarios',              icon: '🔐', title: 'Gestão de Usuários',        description: 'Controle de acesso e permissões',                                                 path: '/modulos/usuarios',              color: '#c44569' },
  { id: 'permissoes',            icon: '🛡️', title: 'Config. de Permissões',     description: 'Defina quais módulos cada perfil pode acessar',                                   path: '/modulos/permissoes',            color: '#e53935' },
  { id: 'auditoria',             icon: '🔒', title: 'Auditoria',                  description: 'Histórico completo de alterações — quem mudou, quando, antes/depois',         path: '/modulos/auditoria',             color: '#37474f' },
  { id: 'feriados',              icon: '🎉', title: 'Feriados',                   description: 'Configurar feriados (afeta cálculo da folha — cód.1311)',                          path: '/modulos/feriados',              color: '#fb8c00' },
];

export const Modules: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, user } = useAuth();
  const { temAcesso, loaded } = usePermissoes();

  const userRole = ((user as any)?.perfil || localStorage.getItem('user_role') || '').toLowerCase();

  // Exibe só os módulos que as permissões salvas liberam para este perfil
  const modules = ALL_MODULES.filter(m => temAcesso(userRole, m.id));

  // Badge de perfil
  const perfilLabel = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdminGerente = ['admin', 'administrador', 'gerente', 'manager'].includes(userRole);

  return (
    <div className="modules-container">
      <header className="modules-header">
        <div className="header-content">
          <h1>GIRES - Gestão Inteligente para Restaurantes</h1>
          <div className="user-info">
            <span style={{ fontSize: '13px' }}>
              {email}
              {perfilLabel && (
                <span style={{
                  marginLeft: '8px', padding: '2px 8px', borderRadius: '10px',
                  backgroundColor: isAdminGerente ? '#e8f5e9' : '#fff3e0',
                  color: isAdminGerente ? '#2e7d32' : '#e65100',
                  fontSize: '11px', fontWeight: 'bold',
                }}>
                  {perfilLabel}
                </span>
              )}
            </span>
            <button onClick={logout} className="logout-btn">Sair</button>
          </div>
        </div>
      </header>

      <main className="modules-main">
        <UnitSelector />

        {!loaded ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            Carregando permissões...
          </div>
        ) : modules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <p style={{ fontSize: '18px' }}>🔒 Nenhum módulo disponível para seu perfil.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Entre em contato com o administrador do sistema.</p>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  );
};
