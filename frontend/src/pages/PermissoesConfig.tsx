import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';
import { useUnit } from '../contexts/UnitContext';
import { Footer } from '../components/Footer';
import { fetchAuth } from '../utils/fetchAuth';


// ─── Definição canônica dos módulos do sistema ───────────────────────────────
const TODOS_MODULOS = [
  { id: 'dashboard',             icon: '📊', title: 'Dashboard Operacional' },
  { id: 'caixa',                 icon: '💰', title: 'Controle de Caixa' },
  { id: 'escalas',               icon: '📅', title: 'Gestão de Escalas' },
  { id: 'saidas',                icon: '💸', title: 'Registro de Saídas' },
  { id: 'motoboys',              icon: '🏍️', title: 'Gestão de Motoboys' },
  { id: 'colaboradores',         icon: '👥', title: 'Gestão de Colaboradores' },
  { id: 'folha-pagamento',       icon: '💳', title: 'Folha de Pagamento' },
  { id: 'extrato',               icon: '📋', title: 'Extrato de Pagamentos' },
  { id: 'adiantamentos-saldos',  icon: '🧾', title: 'Adiantamentos e Saldos' },
  { id: 'fechamento-dinheiro',   icon: '💵', title: 'Fechamento Dinheiro' },
  { id: 'importacoes-contabeis', icon: '📥', title: 'Importações Contábeis' },
  { id: 'unidades',              icon: '🏢', title: 'Cadastro de Unidades' },
  { id: 'usuarios',              icon: '🔐', title: 'Gestão de Usuários' },
  { id: 'permissoes',            icon: '🛡️', title: 'Config. de Permissões' },
  { id: 'auditoria',             icon: '🔒', title: 'Auditoria' },
  { id: 'feriados',              icon: '🎉', title: 'Feriados' },
  { id: 'vagas',                 icon: '📢', title: 'Recrutamento de Vagas' },
  { id: 'conciliacao-bancaria',  icon: '🏦', title: 'Conciliação Bancária' },
  { id: 'despesas',              icon: '💸', title: 'Gestão de Despesas' },
  { id: 'fornecedores',          icon: '🏪', title: 'Cadastro de Fornecedores' },
  { id: 'freelancer-pagamento',  icon: '🎯', title: 'Pagamento de Freelancers' },
  { id: 'motoboy-auditoria',     icon: '🔍', title: 'Auditoria de Motoboys' },
];

// ─── Perfis do sistema ───────────────────────────────────────────────────────
const PERFIS = [
  { key: 'operador', label: 'Operador',      icon: '👤', color: '#2e7d32', bg: '#e8f5e9',
    desc: 'Acesso básico — cadastro de presença, caixa, escalas' },
  { key: 'gerente',  label: 'Gerente',       icon: '🏅', color: '#1565c0', bg: '#e3f2fd',
    desc: 'Acesso intermediário — operações + financeiro do restaurante' },
  { key: 'admin',    label: 'Administrador', icon: '👑', color: '#7b1fa2', bg: '#f3e5f5',
    desc: 'Acesso completo — gestão total da plataforma' },
  { key: 'rh',       label: 'RH',            icon: '🧑‍💼', color: '#e67e22', bg: '#fff3e0',
    desc: 'Acesso exclusivo ao módulo de recrutamento e triagem de vagas' },
];

// Tudo bloqueado por padrão
const DEFAULT_PERMISSOES: Record<string, Record<string, boolean>> = {
  operador: Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
  gerente:  Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
  admin:    Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
  rh:       Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
};

// ─── Preset recomendado por perfil ──────────────────────────────────────────
const PRESET_RECOMENDADO: Record<string, string[]> = {
  operador: ['dashboard', 'caixa', 'escalas', 'motoboys'],
  gerente:  [
    'dashboard', 'caixa', 'escalas', 'saidas', 'motoboys',
    'colaboradores', 'folha-pagamento', 'extrato',
    'adiantamentos-saldos', 'fechamento-dinheiro',
    'importacoes-contabeis', 'conciliacao-bancaria',
    'despesas', 'fornecedores', 'freelancer-pagamento',
  ],
  admin: TODOS_MODULOS.map(m => m.id),
  rh:    ['vagas'],
};

// ─── Componente principal ────────────────────────────────────────────────────
export const PermissoesConfig: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, isMaster } = useAuth();
  const { recarregar: recarregarContexto } = usePermissoes();
  const { userUnits } = useUnit();
  const [permissoes, setPermissoes] = useState<Record<string, Record<string, boolean>>>(DEFAULT_PERMISSOES);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [perfilAtivo, setPerfilAtivo] = useState<string>('operador');
  const [escopoSelecionado, setEscopoSelecionado] = useState<string>('global'); // 'global' ou CNPJ da unidade
  const [isOverrideAtivo, setIsOverrideAtivo] = useState(false); // true se carregou um override existente

  const apiUrl = import.meta.env.VITE_API_ENDPOINT;
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const userRole = localStorage.getItem('user_role') || '';
  const isAdmin = ['admin', 'Admin', 'Administrador', 'ADMIN'].includes(userRole);
  const canEdit = isMaster || isAdmin;

  // ─── Carregar permissões por escopo ─────────────────────────────────
  const carregar = useCallback(async (escopo?: string) => {
    const esc = escopo ?? escopoSelecionado;
    setLoading(true);
    try {
      const url = esc === 'global'
        ? `${apiUrl}/perfis-permissoes`
        : `${apiUrl}/perfis-permissoes?unitId=${esc}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const data = await r.json();
        if (data.permissoes) {
          const normalizado: Record<string, Record<string, boolean>> = {};
          for (const perfil of PERFIS) {
            const salvo = data.permissoes[perfil.key] || {};
            normalizado[perfil.key] = Object.fromEntries(
              TODOS_MODULOS.map(m => [m.id, salvo[m.id] === true])
            );
          }
          setPermissoes(normalizado);
          setUpdatedAt(data.updatedAt);
          setIsOverrideAtivo(!!data.isOverride);
        } else if (esc !== 'global') {
          // Unidade sem override — carregar global como base
          const rGlobal = await fetchAuth(`${apiUrl}/perfis-permissoes`, { headers: { Authorization: `Bearer ${token}` } });
          if (rGlobal.ok) {
            const dataGlobal = await rGlobal.json();
            if (dataGlobal.permissoes) {
              const normalizado: Record<string, Record<string, boolean>> = {};
              for (const perfil of PERFIS) {
                const salvo = dataGlobal.permissoes[perfil.key] || {};
                normalizado[perfil.key] = Object.fromEntries(
                  TODOS_MODULOS.map(m => [m.id, salvo[m.id] === true])
                );
              }
              setPermissoes(normalizado);
              setUpdatedAt(dataGlobal.updatedAt);
            } else {
              setPermissoes(DEFAULT_PERMISSOES);
              setUpdatedAt(null);
            }
          }
          setIsOverrideAtivo(false);
        } else {
          setPermissoes(DEFAULT_PERMISSOES);
          setUpdatedAt(null);
          setIsOverrideAtivo(false);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar permissões:', err);
    } finally {
      setLoading(false);
      setDirty(false);
    }
  }, [apiUrl, token, escopoSelecionado]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quando muda escopo, recarrega
  const handleEscopoChange = (novoEscopo: string) => {
    if (dirty && !window.confirm('Há alterações não salvas. Deseja descartar e trocar de escopo?')) return;
    setEscopoSelecionado(novoEscopo);
    setDirty(false);
    carregar(novoEscopo);
  };

  // ─── Toggle de permissão ────────────────────────────────────────────────
  const toggle = (perfilKey: string, moduloId: string) => {
    if (!canEdit) return;
    setPermissoes(prev => ({
      ...prev,
      [perfilKey]: { ...prev[perfilKey], [moduloId]: !prev[perfilKey]?.[moduloId] },
    }));
    setDirty(true);
  };

  // ─── Salvar ─────────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!canEdit) return;
    setSalvando(true);
    try {
      const payload: any = { permissoes };
      if (escopoSelecionado !== 'global') {
        payload.unitId = escopoSelecionado;
      }
      const r = await fetchAuth(`${apiUrl}/perfis-permissoes`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const data = await r.json();
        setUpdatedAt(data.updatedAt);
        setDirty(false);
        if (escopoSelecionado !== 'global') {
          setIsOverrideAtivo(true);
        }
        await recarregarContexto();
        alert('✅ Permissões salvas com sucesso!');
      } else {
        alert('Erro ao salvar permissões');
      }
    } catch (err) {
      alert('Erro de conexão ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  // ─── Remover override da unidade ────────────────────────────────────────
  const removerOverride = async () => {
    if (escopoSelecionado === 'global') return;
    if (!canEdit) return;
    const nomeUnidade = userUnits.find(u => u.id === escopoSelecionado)?.nome || escopoSelecionado;
    if (!window.confirm(`Remover override de "${nomeUnidade}"?\nA unidade voltará a usar o padrão global.`)) return;
    setRemovendo(true);
    try {
      const r = await fetchAuth(`${apiUrl}/perfis-permissoes?unitId=${escopoSelecionado}`, {
        method: 'DELETE',
        headers,
      });
      if (r.ok) {
        setIsOverrideAtivo(false);
        await carregar(escopoSelecionado);
        await recarregarContexto();
        alert('✅ Override removido. Usando padrão global.');
      } else {
        alert('Erro ao remover override');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setRemovendo(false);
    }
  };

  // ─── Resetar para defaults ──────────────────────────────────────────────
  const resetarDefaults = () => {
    if (!canEdit) return;
    if (!window.confirm('Bloquear todos os acessos de todos os perfis? Isso removerá todas as permissões configuradas.')) return;
    setPermissoes(DEFAULT_PERMISSOES);
    setDirty(true);
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  const perfilInfo = PERFIS.find(p => p.key === perfilAtivo)!;
  const qtdAcesso = TODOS_MODULOS.filter(m => permissoes[perfilAtivo]?.[m.id]).length;
  const pct = Math.round((qtdAcesso / TODOS_MODULOS.length) * 100);

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nunca salvo — usando defaults';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  const escopoLabel = escopoSelecionado === 'global'
    ? '🌐 Padrão Global'
    : `🏢 ${userUnits.find(u => u.id === escopoSelecionado)?.nome || escopoSelecionado}`;

  // ─── Styles ──────────────────────────────────────────────────────────────
  const s = {
    page:    { minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: 'Segoe UI, sans-serif' },
    header:  { background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    hTitle:  { margin: 0, fontSize: '20px' } as React.CSSProperties,
    hRight:  { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' } as React.CSSProperties,
    btn:     (bg: string, color = '#fff'): React.CSSProperties => ({ padding: '7px 16px', background: bg, color, border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }),
    body:    { padding: '28px', maxWidth: '1100px', margin: '0 auto' } as React.CSSProperties,
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.hTitle}>🛡️ Config. de Permissões</h1>
        </div>
        <div style={{ padding: '60px', textAlign: 'center', color: '#888' }}>Carregando configurações...</div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/modulos')} style={s.btn('rgba(255,255,255,0.2)')}>← Módulos</button>
          <h1 style={s.hTitle}>🛡️ Config. de Permissões</h1>
          {isMaster && (
            <span style={{ background: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
              👑 MASTER
            </span>
          )}
        </div>
        <div style={s.hRight}>
          <span>{email}</span>
          <button onClick={logout} style={s.btn('rgba(255,255,255,0.2)')}>🚪 Sair</button>
        </div>
      </div>

      <div style={s.body}>
        {/* ── Seletor de escopo (global vs unidade) ── */}
        {canEdit && (
          <div style={{
            marginBottom: '20px', padding: '16px 20px', background: '#fff',
            borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
          }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#333' }}>📍 Escopo:</div>
            <select
              value={escopoSelecionado}
              onChange={e => handleEscopoChange(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: '8px', border: '2px solid #667eea',
                fontSize: '14px', fontWeight: 600, minWidth: '280px', cursor: 'pointer',
                background: escopoSelecionado === 'global' ? '#f0f4ff' : '#fff8e1'
              }}
            >
              <option value="global">🌐 Padrão Global</option>
              {userUnits.map(u => (
                <option key={u.id} value={u.id}>🏢 {u.nome}</option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: '#888', flex: 1 }}>
              {escopoSelecionado === 'global'
                ? 'Permissões aplicadas a todas as unidades que NÃO têm override.'
                : isOverrideAtivo
                  ? '⚡ Esta unidade tem override customizado.'
                  : '📋 Usando padrão global (sem override). Ao salvar, criará um override para esta unidade.'
              }
            </div>
            {escopoSelecionado !== 'global' && isOverrideAtivo && (
              <button
                onClick={removerOverride}
                disabled={removendo}
                style={s.btn('#ff5722')}
                title="Remove o override e volta a usar o padrão global"
              >
                {removendo ? '⏳...' : '🗑️ Remover override'}
              </button>
            )}
          </div>
        )}

        {/* Cabeçalho da página */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#333' }}>
              🔑 Permissões por Perfil {escopoSelecionado !== 'global' && (
                <span style={{ fontSize: '14px', color: '#e67e22' }}>
                  — {userUnits.find(u => u.id === escopoSelecionado)?.nome}
                </span>
              )}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#888' }}>
              {canEdit
                ? 'Configure quais módulos cada perfil pode acessar. Mudanças têm efeito imediato após salvar.'
                : '🔒 Somente o admin master pode alterar permissões.'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: updatedAt ? '#4caf50' : '#aaa' }}>
              {updatedAt ? `✅ Última atualização: ${formatDate(updatedAt)}` : '⚠️ Usando permissões padrão (nunca foram salvas)'}
            </p>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={resetarDefaults} style={s.btn('#eee', '#555')}>🔄 Restaurar Padrão</button>
              <button
                onClick={salvar}
                disabled={salvando || !dirty}
                style={{ ...s.btn(dirty ? '#4caf50' : '#aaa'), opacity: !dirty ? 0.7 : 1 }}
              >
                {salvando ? '⏳ Salvando...' : escopoSelecionado === 'global' ? '💾 Salvar Permissões' : '💾 Salvar Override'}
              </button>
            </div>
          )}
        </div>

        {dirty && (
          <div style={{ padding: '10px 16px', background: '#fff3e0', border: '1px solid #ffcc02', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#e65100', fontWeight: 600 }}>
            ⚠️ Há alterações não salvas. Clique em "{escopoSelecionado === 'global' ? 'Salvar Permissões' : 'Salvar Override'}" para aplicar.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Painel lateral — seleção de perfil */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
              Perfis de Acesso
            </div>
            {PERFIS.map(perfil => {
              const nAcesso = TODOS_MODULOS.filter(m => permissoes[perfil.key]?.[m.id]).length;
              const isActive = perfilAtivo === perfil.key;
              return (
                <div
                  key={perfil.key}
                  onClick={() => setPerfilAtivo(perfil.key)}
                  style={{
                    padding: '14px 16px', borderRadius: '10px', marginBottom: '10px', cursor: 'pointer',
                    border: `2px solid ${isActive ? perfil.color : '#e0e0e0'}`,
                    background: isActive ? perfil.bg : '#fff',
                    transition: 'all .15s',
                    boxShadow: isActive ? `0 0 0 3px ${perfil.color}22` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '22px' }}>{perfil.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: perfil.color, fontSize: '14px' }}>{perfil.label}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{nAcesso}/{TODOS_MODULOS.length} módulos</div>
                    </div>
                  </div>
                  <div style={{ height: '4px', background: '#eee', borderRadius: '2px' }}>
                    <div style={{ height: '4px', background: perfil.color, borderRadius: '2px', width: `${Math.round((nAcesso / TODOS_MODULOS.length) * 100)}%`, transition: 'width .3s' }} />
                  </div>
                  {isActive && <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>{perfil.desc}</div>}
                </div>
              );
            })}
          </div>

          {/* Painel direito — lista de módulos com toggles */}
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', overflow: 'hidden' }}>
            {/* Cabeçalho do perfil ativo */}
            <div style={{ padding: '16px 20px', background: perfilInfo.bg, borderBottom: `3px solid ${perfilInfo.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>{perfilInfo.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: perfilInfo.color, fontSize: '16px' }}>{perfilInfo.label}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{perfilInfo.desc}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '22px', color: perfilInfo.color }}>{pct}%</div>
                <div style={{ fontSize: '12px', color: '#888' }}>{qtdAcesso} de {TODOS_MODULOS.length} módulos</div>
              </div>
            </div>

            {/* Ações rápidas */}
            {canEdit && (
              <div style={{ padding: '10px 20px', background: '#fafafa', borderBottom: '1px solid #eee', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    const tudo: Record<string, boolean> = {};
                    TODOS_MODULOS.forEach(m => { tudo[m.id] = true; });
                    setPermissoes(prev => ({ ...prev, [perfilAtivo]: tudo }));
                    setDirty(true);
                  }}
                  style={s.btn('#e3f2fd', '#1565c0')}
                >✅ Liberar todos</button>
                <button
                  onClick={() => {
                    const nada: Record<string, boolean> = {};
                    TODOS_MODULOS.forEach(m => { nada[m.id] = false; });
                    setPermissoes(prev => ({ ...prev, [perfilAtivo]: nada }));
                    setDirty(true);
                  }}
                  style={s.btn('#ffebee', '#c62828')}
                >🔒 Bloquear todos</button>
                <button
                  onClick={() => {
                    setPermissoes(prev => ({ ...prev, [perfilAtivo]: { ...DEFAULT_PERMISSOES[perfilAtivo] } }));
                    setDirty(true);
                  }}
                  style={s.btn('#f3e5f5', '#7b1fa2')}
                >🔄 Padrão deste perfil</button>
                <button
                  title={`Aplica conjunto de módulos recomendados para o perfil ${perfilInfo.label}`}
                  onClick={() => {
                    const preset = PRESET_RECOMENDADO[perfilAtivo] || [];
                    const novas: Record<string, boolean> = {};
                    TODOS_MODULOS.forEach(m => { novas[m.id] = preset.includes(m.id); });
                    setPermissoes(prev => ({ ...prev, [perfilAtivo]: novas }));
                    setDirty(true);
                  }}
                  style={s.btn('#e8f5e9', '#2e7d32')}
                >⭐ Preset recomendado</button>
              </div>
            )}

            {/* Lista de módulos */}
            <div style={{ padding: '8px 0' }}>
              {TODOS_MODULOS.map((modulo, idx) => {
                const ativo = permissoes[perfilAtivo]?.[modulo.id] ?? false;
                return (
                  <div
                    key={modulo.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: canEdit ? 'pointer' : 'default',
                      transition: 'background .1s',
                    }}
                    onClick={() => canEdit && toggle(perfilAtivo, modulo.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '20px', minWidth: '24px', textAlign: 'center' }}>{modulo.icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: ativo ? 600 : 400, color: ativo ? '#222' : '#aaa' }}>
                        {modulo.title}
                      </span>
                    </div>

                    {/* Toggle switch */}
                    <div style={{
                      width: '46px', height: '24px', borderRadius: '12px',
                      background: ativo ? perfilInfo.color : '#ccc',
                      position: 'relative', transition: 'background .2s', flexShrink: 0,
                    }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: '2px', left: ativo ? '24px' : '2px',
                        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tabela resumo de todos os perfis */}
        <div style={{ marginTop: '32px', background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#333' }}>
            📊 Resumo — Todos os Perfis
            {escopoSelecionado !== 'global' && (
              <span style={{ fontSize: '13px', color: '#888', fontWeight: 400, marginLeft: '8px' }}>
                ({escopoLabel})
              </span>
            )}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #e0e0e0', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Módulo
                  </th>
                  {PERFIS.map(p => (
                    <th key={p.key} style={{ padding: '10px 16px', textAlign: 'center', background: p.bg, borderBottom: `2px solid ${p.color}`, fontWeight: 700, color: p.color, whiteSpace: 'nowrap' }}>
                      {p.icon} {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TODOS_MODULOS.map((m, idx) => (
                  <tr key={m.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #eee' }}>
                      <span style={{ fontSize: '16px', marginRight: '8px' }}>{m.icon}</span>
                      <span style={{ fontWeight: 500, color: '#333' }}>{m.title}</span>
                    </td>
                    {PERFIS.map(p => {
                      const ok = permissoes[p.key]?.[m.id] ?? false;
                      return (
                        <td
                          key={p.key}
                          style={{ padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eee', cursor: canEdit ? 'pointer' : 'default' }}
                          onClick={() => { if (canEdit) { toggle(p.key, m.id); setPerfilAtivo(p.key); } }}
                          title={canEdit ? `${ok ? 'Bloquear' : 'Liberar'} ${m.title} para ${p.label}` : ''}
                        >
                          <span style={{ fontSize: '18px' }}>{ok ? '✅' : '🔒'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Linha de totais */}
                <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                  <td style={{ padding: '10px 12px', borderTop: '2px solid #e0e0e0' }}>Total com acesso</td>
                  {PERFIS.map(p => {
                    const n = TODOS_MODULOS.filter(m => permissoes[p.key]?.[m.id]).length;
                    return (
                      <td key={p.key} style={{ padding: '10px 16px', textAlign: 'center', borderTop: '2px solid #e0e0e0', color: p.color }}>
                        {n}/{TODOS_MODULOS.length}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>
            💡 {canEdit ? 'Clique em qualquer célula na tabela para alternar o acesso. Não esqueça de salvar.' : 'Somente admin master pode alterar permissões.'}
          </p>
        </div>

        {/* Botão salvar fixo na parte inferior (quando há alterações) */}
        {dirty && canEdit && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 100 }}>
            <button
              onClick={salvar}
              disabled={salvando}
              style={{ padding: '12px 24px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '15px', boxShadow: '0 4px 16px rgba(76,175,80,.5)' }}
            >
              {salvando ? '⏳ Salvando...' : escopoSelecionado === 'global' ? '💾 Salvar Permissões' : '💾 Salvar Override'}
            </button>
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};
