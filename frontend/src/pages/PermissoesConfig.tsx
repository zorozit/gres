import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissoes } from '../contexts/PermissoesContext';
import { Footer } from '../components/Footer';

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
  { id: 'adiantamentos-saldos',  icon: '🧾', title: 'Empréstimos e Saldos' },
  { id: 'fechamento-dinheiro',   icon: '💵', title: 'Fechamento Dinheiro' },
  { id: 'importacoes-contabeis', icon: '📥', title: 'Importações Contábeis' },
  { id: 'unidades',              icon: '🏢', title: 'Cadastro de Unidades' },
  { id: 'usuarios',              icon: '🔐', title: 'Gestão de Usuários' },
  { id: 'permissoes',            icon: '🛡️', title: 'Config. de Permissões' },
  { id: 'auditoria',             icon: '🔒', title: 'Auditoria' },
  { id: 'feriados',              icon: '🎉', title: 'Feriados' },
];

// ─── Perfis do sistema ───────────────────────────────────────────────────────
const PERFIS = [
  { key: 'operador', label: 'Operador',      icon: '👤', color: '#2e7d32', bg: '#e8f5e9',
    desc: 'Acesso básico — cadastro de presença, caixa, escalas' },
  { key: 'gerente',  label: 'Gerente',       icon: '🏅', color: '#1565c0', bg: '#e3f2fd',
    desc: 'Acesso intermediário — operações + financeiro do restaurante' },
  { key: 'admin',    label: 'Administrador', icon: '👑', color: '#7b1fa2', bg: '#f3e5f5',
    desc: 'Acesso completo — gestão total da plataforma' },
];

// Tudo bloqueado por padrão — admin configura explicitamente, sem fallbacks
const DEFAULT_PERMISSOES: Record<string, Record<string, boolean>> = {
  operador: Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
  gerente:  Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
  admin:    Object.fromEntries(TODOS_MODULOS.map(m => [m.id, false])),
};

// ─── Componente principal ────────────────────────────────────────────────────
export const PermissoesConfig: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const { recarregar: recarregarContexto } = usePermissoes();
  const [permissoes, setPermissoes] = useState<Record<string, Record<string, boolean>>>(DEFAULT_PERMISSOES);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [perfilAtivo, setPerfilAtivo] = useState<string>('operador');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT;
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // ─── Carregar permissões salvas ─────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/perfis-permissoes`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const data = await r.json();
        if (data.permissoes) {
          // Sem merge com defaults: o que está salvo é a única fonte de verdade.
          // Garante apenas que novos módulos adicionados após o último save aparecem como false.
          const normalizado: Record<string, Record<string, boolean>> = {};
          for (const perfil of PERFIS) {
            const salvo = data.permissoes[perfil.key] || {};
            normalizado[perfil.key] = Object.fromEntries(
              TODOS_MODULOS.map(m => [m.id, salvo[m.id] === true])
            );
          }
          setPermissoes(normalizado);
          setUpdatedAt(data.updatedAt);
        }
        // Se data.permissoes é null (nunca salvo), mantém DEFAULT_PERMISSOES (tudo false)
      }
    } catch (err) {
      console.error('Erro ao carregar permissões:', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Toggle de permissão ────────────────────────────────────────────────
  const toggle = (perfilKey: string, moduloId: string) => {
    setPermissoes(prev => ({
      ...prev,
      [perfilKey]: { ...prev[perfilKey], [moduloId]: !prev[perfilKey]?.[moduloId] },
    }));
    setDirty(true);
  };

  // ─── Salvar ─────────────────────────────────────────────────────────────
  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await fetch(`${apiUrl}/perfis-permissoes`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ permissoes }),
      });
      if (r.ok) {
        const data = await r.json();
        setUpdatedAt(data.updatedAt);
        setDirty(false);
        await recarregarContexto(); // atualiza o contexto global para efeito imediato
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

  // ─── Resetar para defaults ──────────────────────────────────────────────
  const resetarDefaults = () => {
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
        </div>
        <div style={s.hRight}>
          <span>{email}</span>
          <button onClick={logout} style={s.btn('rgba(255,255,255,0.2)')}>🚪 Sair</button>
        </div>
      </div>

      <div style={s.body}>
        {/* Cabeçalho da página */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#333' }}>🔑 Permissões por Perfil</h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#888' }}>
              Configure quais módulos cada perfil pode acessar. Mudanças têm efeito imediato após salvar.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: updatedAt ? '#4caf50' : '#aaa' }}>
              {updatedAt ? `✅ Última atualização: ${formatDate(updatedAt)}` : '⚠️ Usando permissões padrão (nunca foram salvas)'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={resetarDefaults} style={s.btn('#eee', '#555')}>🔄 Restaurar Padrão</button>
            <button
              onClick={salvar}
              disabled={salvando || !dirty}
              style={{ ...s.btn(dirty ? '#4caf50' : '#aaa'), opacity: !dirty ? 0.7 : 1 }}
            >
              {salvando ? '⏳ Salvando...' : '💾 Salvar Permissões'}
            </button>
          </div>
        </div>

        {dirty && (
          <div style={{ padding: '10px 16px', background: '#fff3e0', border: '1px solid #ffcc02', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#e65100', fontWeight: 600 }}>
            ⚠️ Há alterações não salvas. Clique em "Salvar Permissões" para aplicar.
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
            <div style={{ padding: '10px 20px', background: '#fafafa', borderBottom: '1px solid #eee', display: 'flex', gap: '8px' }}>
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
            </div>

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
                      cursor: 'pointer',
                      transition: 'background .1s',
                    }}
                    onClick={() => toggle(perfilAtivo, modulo.id)}
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
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#333' }}>📊 Resumo — Todos os Perfis</h3>
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
                          style={{ padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eee', cursor: 'pointer' }}
                          onClick={() => { toggle(p.key, m.id); setPerfilAtivo(p.key); }}
                          title={`${ok ? 'Bloquear' : 'Liberar'} ${m.title} para ${p.label}`}
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
            💡 Clique em qualquer célula na tabela para alternar o acesso. Não esqueça de salvar.
          </p>
        </div>

        {/* Botão salvar fixo na parte inferior (quando há alterações) */}
        {dirty && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 100 }}>
            <button
              onClick={salvar}
              disabled={salvando}
              style={{ padding: '12px 24px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '15px', boxShadow: '0 4px 16px rgba(76,175,80,.5)' }}
            >
              {salvando ? '⏳ Salvando...' : '💾 Salvar Permissões'}
            </button>
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};
