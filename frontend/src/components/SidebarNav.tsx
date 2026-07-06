import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';
import { useUnit } from '../contexts/UnitContext';
import './SidebarNav.css';

// ─── Definição dos grupos e módulos ──────────────────────────────────────────
interface ModuleItem {
  id: string;
  icon: string;
  title: string;
  path: string;
}

interface ModuleGroup {
  id: string;
  icon: string;
  label: string;
  color: string;       // cor do grupo (borda lateral + destaque ativo)
  modules: ModuleItem[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'operacional',
    icon: '⚙️',
    label: 'Operacional',
    color: '#1976d2',
    modules: [
      { id: 'dashboard',   icon: '📊', title: 'Dashboard',         path: '/modulos/dashboard' },
      { id: 'caixa',       icon: '💰', title: 'Caixa',             path: '/modulos/caixa' },
      { id: 'escalas',     icon: '📅', title: 'Escalas',           path: '/modulos/escalas' },
      { id: 'motoboys',    icon: '🏍️', title: 'Motoboys',          path: '/modulos/motoboys' },
      { id: 'colaboradores', icon: '👥', title: 'Colaboradores',   path: '/modulos/colaboradores' },
      { id: 'saidas',      icon: '💸', title: 'Saídas',            path: '/modulos/saidas' },
    ],
  },
  {
    id: 'folha',
    icon: '💳',
    label: 'Folha & Pagamento',
    color: '#2e7d32',
    modules: [
      { id: 'folha-pagamento',      icon: '💳', title: 'Folha CLT',           path: '/modulos/folha-pagamento' },
      { id: 'conferencia-folha',    icon: '📋', title: 'Conferência Folha',    path: '/modulos/conferencia-folha' },
      { id: 'freelancer-pagamento', icon: '🎯', title: 'Freelancers',         path: '/modulos/freelancer-pagamento' },
      { id: 'adiantamentos-saldos', icon: '🧾', title: 'Adiantamentos',       path: '/modulos/adiantamentos-saldos' },
      { id: 'fechamento-dinheiro',  icon: '💵', title: 'Fechamento Dinheiro', path: '/modulos/fechamento-dinheiro' },
      { id: 'payslips',             icon: '🧾', title: 'Payslips',            path: '/modulos/payslips' },
    ],
  },
  {
    id: 'auditoria',
    icon: '🔍',
    label: 'Auditoria & Extrato',
    color: '#00838f',
    modules: [
      { id: 'extrato',          icon: '📋', title: 'Extrato',              path: '/modulos/extrato' },
      { id: 'motoboy-auditoria', icon: '🔍', title: 'Audit. Motoboys',    path: '/modulos/motoboy-auditoria' },
      { id: 'auditoria',        icon: '🔒', title: 'Auditoria Geral',     path: '/modulos/auditoria' },
      { id: 'conciliacao-bancaria', icon: '🏦', title: 'Conc. Bancária', path: '/modulos/conciliacao-bancaria' },
    ],
  },
  {
    id: 'financeiro',
    icon: '📊',
    label: 'Financeiro',
    color: '#6d4c41',
    modules: [
      { id: 'despesas',              icon: '💸', title: 'Despesas',           path: '/modulos/despesas' },
      { id: 'fornecedores',          icon: '🏪', title: 'Fornecedores',       path: '/modulos/fornecedores' },
      { id: 'importacoes-contabeis', icon: '📥', title: 'Imp. Contábeis',     path: '/modulos/importacoes-contabeis' },
    ],
  },
  {
    id: 'rh',
    icon: '🧑‍💼',
    label: 'RH & Pessoas',
    color: '#e67e22',
    modules: [
      { id: 'vagas', icon: '📢', title: 'Recrutamento', path: '/modulos/vagas' },
      { id: 'historico-remuneracoes', icon: '📊', title: 'Remunerações',        path: '/modulos/historico-remuneracoes' },
      { id: 'feriados', icon: '🎉', title: 'Feriados', path: '/modulos/feriados' },
    ],
  },
  {
    id: 'admin',
    icon: '🛡️',
    label: 'Administração',
    color: '#7b1fa2',
    modules: [
      { id: 'unidades',   icon: '🏢', title: 'Unidades',    path: '/modulos/unidades' },
      { id: 'usuarios',   icon: '🔐', title: 'Usuários',    path: '/modulos/usuarios' },
      { id: 'permissoes', icon: '🛡️', title: 'Permissões',  path: '/modulos/permissoes' },
      { id: 'regras-sistema', icon: '📖', title: 'Regras do Sistema', path: '/modulos/regras-sistema' },
    ],
  },
];

// ─── Componente principal ─────────────────────────────────────────────────────
export const SidebarNav: React.FC = () => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user, logout, isMaster } = useAuth();
  const { temAcesso, loaded } = usePermissoes();
  const { activeUnit, userUnits, setActiveUnit, isLoadingUnits } = useUnit();

  const userRole = ((user as any)?.perfil || localStorage.getItem('user_role') || '').toLowerCase();
  const perfilLabel = (user as any)?.perfil || localStorage.getItem('user_role') || '';

  // Grupos colapsados — persiste no localStorage
  const storageKey = 'sidebar_collapsed_groups';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Sidebar mobile aberta/fechada
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sidebar compacta (só ícones) no desktop
  const [compact, setCompact] = useState(() => {
    return localStorage.getItem('sidebar_compact') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_compact', String(compact));
  }, [compact]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
  }, [collapsed]);

  // Fechar mobile ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleGroup = (groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const isActive = (path: string) => location.pathname === path;

  // Filtra apenas módulos com acesso (master vê tudo)
  const visibleGroups = loaded || isMaster
    ? MODULE_GROUPS
        .map(g => ({
          ...g,
          modules: isMaster ? g.modules : g.modules.filter(m => temAcesso(userRole, m.id)),
        }))
        .filter(g => g.modules.length > 0)
    : [];

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
    <>
      {/* ── Botão hamburguer mobile ── */}
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="Abrir menu"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* ── Overlay mobile ── */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <nav className={`sidebar${compact ? ' sidebar--compact' : ''}${mobileOpen ? ' sidebar--open' : ''}`}>

        {/* Cabeçalho */}
        <div className="sidebar-header">
          {!compact && (
            <div className="sidebar-logo">
              <span className="sidebar-logo-icon">⚙️</span>
              <div className="sidebar-logo-text">
                <span className="sidebar-logo-title">GIRES</span>
                <span className="sidebar-logo-sub">Gestão Integrada</span>
              </div>
            </div>
          )}
          {compact && (
            <div className="sidebar-logo sidebar-logo--compact">
              <span className="sidebar-logo-icon">⚙️</span>
            </div>
          )}

          {/* Botão compactar (desktop) */}
          <button
            className="sidebar-compact-btn"
            onClick={() => setCompact(v => !v)}
            title={compact ? 'Expandir menu' : 'Compactar menu'}
          >
            {compact ? '»' : '«'}
          </button>
        </div>

        {/* Seletor de unidade */}
        {!compact && (
          <div className="sidebar-unit">
            {isLoadingUnits ? (
              <div className="sidebar-unit-name" style={{ color: '#5a7a9a', fontStyle: 'italic' }}>
                🏢 Carregando…
              </div>
            ) : userUnits.length > 1 ? (
              <select
                className="sidebar-unit-select"
                value={activeUnit?.id || ''}
                onChange={e => {
                  const u = userUnits.find(u => u.id === e.target.value);
                  if (u) setActiveUnit(u);
                }}
              >
                {userUnits.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            ) : (
              <div className="sidebar-unit-name">
                🏢 {activeUnit?.nome || userUnits[0]?.nome || '—'}
              </div>
            )}
          </div>
        )}
        {compact && (
          <div
            className="sidebar-unit-compact"
            title={activeUnit?.nome || (isLoadingUnits ? 'Carregando…' : 'Sem unidade')}
          >
            🏢
          </div>
        )}

        {/* Navegação por grupos */}
        <div className="sidebar-nav">
          {!loaded && (
            <div className="sidebar-loading">Carregando…</div>
          )}

          {loaded && visibleGroups.length === 0 && (
            <div className="sidebar-empty">🔒 Sem acesso</div>
          )}

          {visibleGroups.map(group => {
            const isCollapsed = collapsed.has(group.id);
            return (
              <div key={group.id} className="sidebar-group">
                {/* Cabeçalho do grupo */}
                <button
                  className="sidebar-group-header"
                  style={{ '--group-color': group.color } as React.CSSProperties}
                  onClick={() => !compact && toggleGroup(group.id)}
                  title={compact ? group.label : undefined}
                >
                  <span className="sidebar-group-icon">{group.icon}</span>
                  {!compact && (
                    <>
                      <span className="sidebar-group-label">{group.label}</span>
                      <span className="sidebar-group-chevron">
                        {isCollapsed ? '▶' : '▾'}
                      </span>
                    </>
                  )}
                </button>

                {/* Itens do grupo */}
                {(!isCollapsed || compact) && (
                  <ul className="sidebar-group-items">
                    {group.modules.map(mod => (
                      <li key={mod.id}>
                        <button
                          className={`sidebar-item${isActive(mod.path) ? ' sidebar-item--active' : ''}`}
                          style={isActive(mod.path)
                            ? { '--item-color': group.color } as React.CSSProperties
                            : undefined}
                          onClick={() => navigate(mod.path)}
                          title={compact ? mod.title : undefined}
                        >
                          <span className="sidebar-item-icon">{mod.icon}</span>
                          {!compact && (
                            <span className="sidebar-item-title">{mod.title}</span>
                          )}
                          {isActive(mod.path) && !compact && (
                            <span className="sidebar-item-dot" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé do sidebar */}
        <div className="sidebar-footer">
          {!compact && (
            <div className="sidebar-user">
              <div className="sidebar-user-email" title={(user as any)?.email}>
                {(user as any)?.email || '—'}
              </div>
              <span
                className="sidebar-user-badge"
                style={{ backgroundColor: pc.bg, color: pc.color }}
              >
                {perfilLabel}
              </span>
            </div>
          )}
          <button
            className="sidebar-logout"
            onClick={() => {
              if (confirm('Deseja sair do sistema?')) {
                logout();
                navigate('/login');
              }
            }}
            title="Sair"
          >
            <span>🚪</span>
            {!compact && <span>Sair</span>}
          </button>
        </div>
      </nav>
    </>
  );
};
