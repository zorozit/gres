import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';

// ─── Mesma lista canônica de módulos ─────────────────────────────────────────
const ALL_MODULES = [
  { id: 'dashboard',             icon: '📊', title: 'Dashboard Operacional',    description: 'Visualize métricas e indicadores em tempo real',                                    path: '/modulos/dashboard',             color: '#667eea', group: 'operacional' },
  { id: 'caixa',                 icon: '💰', title: 'Controle de Caixa',         description: 'Gerencie aberturas, recebimentos e fechamentos',                                    path: '/modulos/caixa',                 color: '#f093fb', group: 'operacional' },
  { id: 'escalas',               icon: '📅', title: 'Gestão de Escalas',         description: 'Organize turnos e presenças de colaboradores',                                      path: '/modulos/escalas',               color: '#4facfe', group: 'operacional' },
  { id: 'saidas',                icon: '💸', title: 'Registro de Saídas',        description: 'Controle despesas e saídas operacionais',                                          path: '/modulos/saidas',                color: '#43e97b', group: 'operacional' },
  { id: 'motoboys',              icon: '🏍️', title: 'Gestão de Motoboys',        description: 'Administre entregas e comissões',                                                  path: '/modulos/motoboys',              color: '#fa709a', group: 'operacional' },
  { id: 'colaboradores',         icon: '👥', title: 'Gestão de Colaboradores',   description: 'Gerencie dados e históricos de funcionários',                                      path: '/modulos/colaboradores',         color: '#30cfd0', group: 'operacional' },
  { id: 'folha-pagamento',       icon: '💳', title: 'Folha CLT',                 description: 'Calcule e gerencie pagamentos de colaboradores CLT',                               path: '/modulos/folha-pagamento',       color: '#2e7d32', group: 'folha' },
  { id: 'freelancer-pagamento',  icon: '🎯', title: 'Pagamento Freelancers',     description: 'Auditoria e confirmação de pagamentos de freelancers por semana',                  path: '/modulos/freelancer-pagamento',  color: '#388e3c', group: 'folha' },
  { id: 'adiantamentos-saldos',  icon: '🧾', title: 'Adiantamentos e Saldos',   description: 'Controle adiantamentos especiais, parcelas e saldos em aberto',                   path: '/modulos/adiantamentos-saldos',  color: '#7b1fa2', group: 'folha' },
  { id: 'fechamento-dinheiro',   icon: '💵', title: 'Fechamento Dinheiro',       description: 'Batimento de sangrias × pagamentos em dinheiro',                                   path: '/modulos/fechamento-dinheiro',   color: '#f57f17', group: 'folha' },
  { id: 'extrato',               icon: '📋', title: 'Extrato de Pagamentos',     description: 'Histórico analítico de pagamentos e descontos',                                    path: '/modulos/extrato',               color: '#00838f', group: 'auditoria' },
  { id: 'motoboy-auditoria',     icon: '🔍', title: 'Auditoria de Motoboys',     description: 'Visão linha a linha de chegadas, entregas e descontos por semana',                 path: '/modulos/motoboy-auditoria',     color: '#1b5e20', group: 'auditoria' },
  { id: 'auditoria',             icon: '🔒', title: 'Auditoria Geral',           description: 'Histórico completo de alterações — quem mudou, quando, antes/depois',             path: '/modulos/auditoria',             color: '#37474f', group: 'auditoria' },
  { id: 'conciliacao-bancaria',  icon: '🏦', title: 'Conciliação Bancária',      description: 'Importe extrato Stone e concilie transações com saídas registradas',              path: '/modulos/conciliacao-bancaria',  color: '#0277bd', group: 'auditoria' },
  { id: 'despesas',              icon: '💸', title: 'Gestão de Despesas',        description: 'Registre despesas via formulário ou NF com status de pagamento',                  path: '/modulos/despesas',              color: '#c62828', group: 'financeiro' },
  { id: 'fornecedores',          icon: '🏪', title: 'Cadastro de Fornecedores',  description: 'Gerencie fornecedores, dados bancários, PIX e formas de pagamento',              path: '/modulos/fornecedores',          color: '#00695c', group: 'financeiro' },
  { id: 'importacoes-contabeis', icon: '📥', title: 'Importações Contábeis',     description: 'Importe PDFs da contabilidade e distribua para folha e saídas',                  path: '/modulos/importacoes-contabeis', color: '#6d4c41', group: 'financeiro' },
  { id: 'vagas',                 icon: '📢', title: 'Recrutamento de Vagas',     description: 'Publique vagas, gere link de formulário público e faça triagem',                  path: '/modulos/vagas',                 color: '#e67e22', group: 'rh' },
  { id: 'feriados',              icon: '🎉', title: 'Feriados',                  description: 'Configure feriados (afeta cálculo da folha — cód.1311)',                           path: '/modulos/feriados',              color: '#fb8c00', group: 'rh' },
  { id: 'unidades',              icon: '🏢', title: 'Cadastro de Unidades',      description: 'Gerencie as unidades de restaurante',                                              path: '/modulos/unidades',              color: '#ff6b9d', group: 'admin' },
  { id: 'usuarios',              icon: '🔐', title: 'Gestão de Usuários',        description: 'Controle de acesso e perfis',                                                      path: '/modulos/usuarios',              color: '#c44569', group: 'admin' },
  { id: 'permissoes',            icon: '🛡️', title: 'Config. de Permissões',     description: 'Defina quais módulos cada perfil pode acessar',                                   path: '/modulos/permissoes',            color: '#e53935', group: 'admin' },
];

const GROUPS = [
  { id: 'operacional', icon: '⚙️', label: 'Operacional',         color: '#1976d2' },
  { id: 'folha',       icon: '💳', label: 'Folha & Pagamento',    color: '#2e7d32' },
  { id: 'auditoria',  icon: '🔍', label: 'Auditoria & Extrato',  color: '#00838f' },
  { id: 'financeiro',  icon: '📊', label: 'Financeiro',           color: '#6d4c41' },
  { id: 'rh',          icon: '🧑‍💼', label: 'RH & Pessoas',        color: '#e67e22' },
  { id: 'admin',       icon: '🛡️', label: 'Administração',        color: '#7b1fa2' },
];

export const Modules: React.FC = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { temAcesso, loaded } = usePermissoes();

  const userRole   = ((user as any)?.perfil || localStorage.getItem('user_role') || '').toLowerCase();
  const perfilLabel = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const firstName  = ((user as any)?.nome || (user as any)?.email || '').split(/[\s@]/)[0];

  const accessible = ALL_MODULES.filter(m => temAcesso(userRole, m.id));

  const perfilColors: Record<string, { bg: string; color: string }> = {
    admin:         { bg: '#f3e5f5', color: '#7b1fa2' },
    administrador: { bg: '#f3e5f5', color: '#7b1fa2' },
    gerente:       { bg: '#e3f2fd', color: '#1565c0' },
    manager:       { bg: '#e3f2fd', color: '#1565c0' },
    operador:      { bg: '#e8f5e9', color: '#2e7d32' },
    rh:            { bg: '#fff3e0', color: '#e67e22' },
  };
  const pc = perfilColors[userRole] || { bg: '#f5f5f5', color: '#555' };

  return (
    <div style={s.page}>

      {/* ── Boas-vindas ── */}
      <div style={s.hero}>
        <div style={s.heroLeft}>
          <h1 style={s.heroTitle}>
            Olá{firstName ? `, ${firstName}` : ''}! 👋
          </h1>
          <p style={s.heroSub}>
            Selecione um módulo abaixo ou use o menu lateral para navegar.
          </p>
        </div>
        <div style={s.heroRight}>
          <span style={{ ...s.badge, backgroundColor: pc.bg, color: pc.color }}>
            {perfilLabel}
          </span>
          <span style={s.heroCount}>
            {accessible.length} módulo{accessible.length !== 1 ? 's' : ''} disponível{accessible.length !== 1 ? 'is' : ''}
          </span>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {!loaded ? (
        <div style={s.center}>Carregando permissões…</div>
      ) : accessible.length === 0 ? (
        <div style={s.center}>
          <p style={{ fontSize: '18px' }}>🔒 Nenhum módulo disponível para seu perfil.</p>
          <p style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>
            Entre em contato com o administrador do sistema.
          </p>
        </div>
      ) : (
        <div style={s.groups}>
          {GROUPS.map(grp => {
            const items = accessible.filter(m => m.group === grp.id);
            if (items.length === 0) return null;
            return (
              <section key={grp.id} style={s.section}>
                <div style={{ ...s.sectionHeader, borderLeftColor: grp.color }}>
                  <span style={s.sectionIcon}>{grp.icon}</span>
                  <h2 style={{ ...s.sectionTitle, color: grp.color }}>{grp.label}</h2>
                  <span style={s.sectionCount}>{items.length}</span>
                </div>
                <div style={s.grid}>
                  {items.map(mod => (
                    <button
                      key={mod.id}
                      style={{ ...s.card, borderTopColor: mod.color }}
                      onClick={() => navigate(mod.path)}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.13)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
                      }}
                    >
                      <span style={s.cardIcon}>{mod.icon}</span>
                      <span style={s.cardTitle}>{mod.title}</span>
                      <span style={s.cardDesc}>{mod.description}</span>
                      <span style={{ ...s.cardBtn, backgroundColor: mod.color }}>
                        Acessar →
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Estilos inline ───────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    padding: '28px 32px 48px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    minHeight: '100vh',
    background: '#f0f2f5',
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '32px',
    padding: '20px 28px',
    background: 'linear-gradient(135deg, #1a2236 0%, #243044 100%)',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  },
  heroLeft: {},
  heroTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: '#e8f0fe',
  },
  heroSub: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: '#8fa8c8',
  },
  heroRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
  },
  badge: {
    padding: '3px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 700,
  },
  heroCount: {
    fontSize: '11px',
    color: '#8fa8c8',
  },
  center: {
    textAlign: 'center',
    padding: '60px',
    color: '#888',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  section: {},
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
    paddingLeft: '12px',
    borderLeft: '4px solid #1976d2',
  },
  sectionIcon: {
    fontSize: '18px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  sectionCount: {
    background: '#e8eaf6',
    color: '#5c6bc0',
    borderRadius: '10px',
    padding: '1px 8px',
    fontSize: '11px',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#fff',
    borderRadius: '10px',
    padding: '20px 18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    borderTop: '4px solid #667eea',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    cursor: 'pointer',
    border: 'none',
    textAlign: 'left',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    outline: 'none',
  },
  cardIcon: {
    fontSize: '28px',
    lineHeight: 1,
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1a2236',
    lineHeight: 1.3,
  },
  cardDesc: {
    fontSize: '11.5px',
    color: '#7a90aa',
    lineHeight: 1.5,
    flexGrow: 1,
  },
  cardBtn: {
    marginTop: '4px',
    padding: '5px 14px',
    borderRadius: '5px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    background: '#667eea',
  },
};
