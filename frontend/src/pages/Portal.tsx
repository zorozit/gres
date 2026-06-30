import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ColaboradorData {
  id?: string;
  nome?: string;
  cpf?: string;
  celular?: string;
  email?: string;
  cargo?: string;
  funcao?: string;
  tipoContrato?: string;
  dataAdmissao?: string;
  unidadeNome?: string;
  chavePix?: string;
  area?: string;
  salarioBase?: number;
  diasDisponiveis?: string[];
  tipoAcordo?: string;
  valorDia?: number;
  valorNoite?: number;
  [key: string]: any;
}

interface Payslip {
  id: string;
  periodoInicio: string;
  periodoFim: string;
  bruto: number;
  transporte: number;
  descontos: number;
  liquido: number;
  status: string;
  [key: string]: any;
}

interface Comunicado {
  id: string;
  titulo: string;
  conteudo: string;
  createdAt: string;
  [key: string]: any;
}

interface VagaPortal {
  id: string;
  titulo: string;
  descricao?: string;
  requisitos?: string;
  unidadeNome?: string;
  [key: string]: any;
}

type TabId = 'dados' | 'recebimentos' | 'contrato' | 'comunicados' | 'vagas';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getToken(): string {
  return localStorage.getItem('portal_token') || '';
}

function getUser(): ColaboradorData | null {
  try {
    const raw = localStorage.getItem('portal_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function portalFetch(path: string, opts?: RequestInit): Promise<Response> {
  const headers: any = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...(opts?.headers || {}),
  };
  return fetch(`${apiUrl}${path}`, { ...opts, headers });
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function formatCurrency(v?: number): string {
  if (v == null) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCPF(cpf?: string): string {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function isNew(dateStr?: string): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 3 * 24 * 60 * 60 * 1000;
}

/* ─── Tabs Config ────────────────────────────────────────────────────────── */
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'dados', icon: '📋', label: 'Meus Dados' },
  { id: 'recebimentos', icon: '💰', label: 'Recebimentos' },
  { id: 'contrato', icon: '📄', label: 'Contrato' },
  { id: 'comunicados', icon: '📢', label: 'Comunicados' },
  { id: 'vagas', icon: '💼', label: 'Vagas' },
];

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Portal() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('dados');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Data states
  const [dados, setDados] = useState<ColaboradorData | null>(null);
  const [dadosLoading, setDadosLoading] = useState(true);
  const [dadosError, setDadosError] = useState('');

  const [recebimentos, setRecebimentos] = useState<Payslip[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState('');
  const [recMeses, setRecMeses] = useState(3);

  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [comLoading, setComLoading] = useState(false);
  const [comError, setComError] = useState('');

  const [vagas, setVagas] = useState<VagaPortal[]>([]);
  const [vagasLoading, setVagasLoading] = useState(false);
  const [vagasError, setVagasError] = useState('');

  // Alterar senha modal
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaError, setSenhaError] = useState('');
  const [senhaSuccess, setSenhaSuccess] = useState('');

  const user = getUser();

  /* ─── Resize ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  /* ─── Auth check ─────────────────────────────────────────────────────── */
  const handle401 = useCallback(() => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_user');
    navigate('/portal/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!getToken()) {
      handle401();
    }
  }, [handle401]);

  /* ─── Fetch: Meus Dados ─────────────────────────────────────────────── */
  const fetchDados = useCallback(async () => {
    setDadosLoading(true);
    setDadosError('');
    try {
      const res = await portalFetch('/portal/meus-dados');
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      setDados(data);
      // Update cached user
      localStorage.setItem('portal_user', JSON.stringify(data));
    } catch {
      setDadosError('Não foi possível carregar seus dados.');
    } finally {
      setDadosLoading(false);
    }
  }, [handle401]);

  /* ─── Fetch: Recebimentos ───────────────────────────────────────────── */
  const fetchRecebimentos = useCallback(async (meses: number) => {
    setRecLoading(true);
    setRecError('');
    try {
      const res = await portalFetch(`/portal/recebimentos?meses=${meses}`);
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      setRecebimentos(Array.isArray(data) ? data : data.recebimentos || data.payslips || []);
    } catch {
      setRecError('Não foi possível carregar recebimentos.');
    } finally {
      setRecLoading(false);
    }
  }, [handle401]);

  /* ─── Fetch: Comunicados ────────────────────────────────────────────── */
  const fetchComunicados = useCallback(async () => {
    setComLoading(true);
    setComError('');
    try {
      const res = await portalFetch('/portal/comunicados');
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      setComunicados(Array.isArray(data) ? data : data.comunicados || []);
    } catch {
      setComError('Não foi possível carregar comunicados.');
    } finally {
      setComLoading(false);
    }
  }, [handle401]);

  /* ─── Fetch: Vagas ──────────────────────────────────────────────────── */
  const fetchVagas = useCallback(async () => {
    setVagasLoading(true);
    setVagasError('');
    try {
      const res = await portalFetch('/portal/vagas');
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      setVagas(Array.isArray(data) ? data : data.vagas || []);
    } catch {
      setVagasError('Não foi possível carregar vagas.');
    } finally {
      setVagasLoading(false);
    }
  }, [handle401]);

  /* ─── Initial Load ──────────────────────────────────────────────────── */
  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  useEffect(() => {
    if (activeTab === 'recebimentos') fetchRecebimentos(recMeses);
  }, [activeTab, recMeses, fetchRecebimentos]);

  useEffect(() => {
    if (activeTab === 'comunicados') fetchComunicados();
  }, [activeTab, fetchComunicados]);

  useEffect(() => {
    if (activeTab === 'vagas') fetchVagas();
  }, [activeTab, fetchVagas]);

  /* ─── Alterar Senha ─────────────────────────────────────────────────── */
  const handleAlterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaError('');
    setSenhaSuccess('');

    if (novaSenha.length < 6) { setSenhaError('Mínimo 6 caracteres'); return; }
    if (novaSenha !== confirmarSenha) { setSenhaError('Senhas não coincidem'); return; }

    setSenhaLoading(true);
    try {
      const colaboradorId = dados?.id || user?.id;
      const res = await portalFetch('/portal/trocar-senha', {
        method: 'POST',
        body: JSON.stringify({ colaboradorId, senhaAtual, novaSenha }),
      });
      if (res.status === 401) { handle401(); return; }
      const data = await res.json();
      if (!res.ok) { setSenhaError(data.error || data.message || 'Erro ao trocar senha'); return; }
      if (data.token) localStorage.setItem('portal_token', data.token);
      setSenhaSuccess('Senha alterada com sucesso!');
      setTimeout(() => { setShowSenhaModal(false); setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha(''); setSenhaSuccess(''); }, 1500);
    } catch {
      setSenhaError('Erro de conexão');
    } finally {
      setSenhaLoading(false);
    }
  };

  /* ─── Logout ────────────────────────────────────────────────────────── */
  const handleLogout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_user');
    navigate('/portal/login', { replace: true });
  };

  const displayName = dados?.nome || user?.nome || 'Colaborador';
  const tipoContrato = (dados?.tipoContrato || user?.tipoContrato || '').toLowerCase();
  const isCLT = tipoContrato.includes('clt');

  /* ─── Render Helpers ────────────────────────────────────────────────── */
  const renderLoading = () => (
    <div style={sx.loadingWrap}>
      <div style={sx.spinner} />
      <span style={{ color: '#90a4ae', fontSize: '14px', marginTop: '12px' }}>Carregando...</span>
    </div>
  );

  const renderError = (msg: string, retry: () => void) => (
    <div style={sx.errorWrap}>
      <span style={{ fontSize: '32px' }}>😕</span>
      <p style={{ color: '#e53935', margin: '8px 0', fontWeight: 600 }}>{msg}</p>
      <button onClick={retry} style={sx.retryBtn}>Tentar novamente</button>
    </div>
  );

  const renderDataRow = (label: string, value: React.ReactNode) => (
    <div style={sx.dataRow} key={label}>
      <span style={sx.dataLabel}>{label}</span>
      <span style={sx.dataValue}>{value || '—'}</span>
    </div>
  );

  /* ─── Tab: Meus Dados ───────────────────────────────────────────────── */
  const renderDados = () => {
    if (dadosLoading) return renderLoading();
    if (dadosError) return renderError(dadosError, fetchDados);
    if (!dados) return <p style={{ textAlign: 'center', color: '#999' }}>Nenhum dado encontrado.</p>;

    return (
      <div>
        <div style={sx.sectionTitle}>📋 Meus Dados</div>
        <div style={sx.dataCard}>
          {renderDataRow('Nome', dados.nome)}
          {renderDataRow('CPF', formatCPF(dados.cpf))}
          {renderDataRow('Celular', dados.celular)}
          {renderDataRow('Email', dados.email)}
          {renderDataRow('Cargo', dados.cargo)}
          {renderDataRow('Tipo de Contrato', dados.tipoContrato)}
          {renderDataRow('Data de Admissão', formatDate(dados.dataAdmissao))}
          {renderDataRow('Unidade', dados.unidadeNome)}
          {dados.chavePix && renderDataRow('Chave PIX', dados.chavePix)}
        </div>
        <button
          style={sx.alterarSenhaBtn}
          onClick={() => { setShowSenhaModal(true); setSenhaError(''); setSenhaSuccess(''); }}
        >
          🔒 Alterar Senha
        </button>
      </div>
    );
  };

  /* ─── Tab: Recebimentos ─────────────────────────────────────────────── */
  const renderRecebimentos = () => {
    const titulo = isCLT ? 'Holerites' : 'Recebimentos';

    return (
      <div>
        <div style={sx.sectionTitle}>💰 {titulo}</div>

        {/* Filtro */}
        <div style={sx.filterRow}>
          {[1, 3, 6, 12].map(m => (
            <button
              key={m}
              onClick={() => setRecMeses(m)}
              style={{
                ...sx.filterBtn,
                ...(recMeses === m ? sx.filterBtnActive : {}),
              }}
            >
              {m} {m === 1 ? 'mês' : 'meses'}
            </button>
          ))}
        </div>

        {recLoading ? renderLoading() : recError ? renderError(recError, () => fetchRecebimentos(recMeses)) : (
          recebimentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>Nenhum recebimento encontrado no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recebimentos.map((p, i) => (
                <div key={p.id || i} style={sx.payslipCard}>
                  <div style={sx.payslipHeader}>
                    <span style={sx.payslipPeriodo}>
                      {formatDate(p.periodoInicio)} — {formatDate(p.periodoFim)}
                    </span>
                    <span style={{
                      ...sx.statusBadge,
                      ...(p.status?.toLowerCase() === 'pago' ? sx.statusPago : sx.statusPendente),
                    }}>
                      {p.status?.toLowerCase() === 'pago' ? '✅ Pago' : '⏳ Pendente'}
                    </span>
                  </div>
                  <div style={sx.payslipGrid}>
                    <div style={sx.payslipItem}>
                      <span style={sx.payslipLabel}>Bruto</span>
                      <span style={sx.payslipValue}>{formatCurrency(p.bruto)}</span>
                    </div>
                    <div style={sx.payslipItem}>
                      <span style={sx.payslipLabel}>Transporte</span>
                      <span style={sx.payslipValue}>{formatCurrency(p.transporte)}</span>
                    </div>
                    <div style={sx.payslipItem}>
                      <span style={sx.payslipLabel}>Descontos</span>
                      <span style={{ ...sx.payslipValue, color: '#e53935' }}>-{formatCurrency(p.descontos)}</span>
                    </div>
                    <div style={sx.payslipItem}>
                      <span style={sx.payslipLabel}>Líquido</span>
                      <span style={{ ...sx.payslipValue, fontWeight: 700, color: '#2e7d32', fontSize: '16px' }}>{formatCurrency(p.liquido)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    );
  };

  /* ─── Tab: Contrato ─────────────────────────────────────────────────── */
  const renderContrato = () => {
    if (dadosLoading) return renderLoading();
    if (dadosError) return renderError(dadosError, fetchDados);
    if (!dados) return <p style={{ textAlign: 'center', color: '#999' }}>Nenhum dado encontrado.</p>;

    return (
      <div>
        <div style={sx.sectionTitle}>📄 Dados do Contrato</div>
        <div style={sx.dataCard}>
          {renderDataRow('Tipo de Contrato', dados.tipoContrato)}
          {isCLT ? (
            <>
              {renderDataRow('Salário Base', formatCurrency(dados.salarioBase))}
              {renderDataRow('Cargo', dados.cargo)}
              {renderDataRow('Função', dados.funcao)}
              {renderDataRow('Data de Admissão', formatDate(dados.dataAdmissao))}
              {renderDataRow('Área', dados.area)}
              {renderDataRow('Dias Disponíveis', dados.diasDisponiveis?.join(', '))}
            </>
          ) : (
            <>
              {renderDataRow('Tipo de Acordo', dados.tipoAcordo)}
              {renderDataRow('Valor Dia', formatCurrency(dados.valorDia))}
              {renderDataRow('Valor Noite', formatCurrency(dados.valorNoite))}
              {renderDataRow('Cargo', dados.cargo)}
              {renderDataRow('Área', dados.area)}
            </>
          )}
        </div>
      </div>
    );
  };

  /* ─── Tab: Comunicados ──────────────────────────────────────────────── */
  const renderComunicados = () => {
    if (comLoading) return renderLoading();
    if (comError) return renderError(comError, fetchComunicados);

    return (
      <div>
        <div style={sx.sectionTitle}>📢 Comunicados</div>
        {comunicados.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>Nenhum comunicado no momento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {comunicados.map((c, i) => (
              <div key={c.id || i} style={sx.comunicadoCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a237e' }}>{c.titulo}</span>
                  {isNew(c.createdAt) && <span style={sx.badgeNovo}>Novo</span>}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.conteudo}</p>
                <span style={{ fontSize: '11px', color: '#b0bec5', marginTop: '8px', display: 'block' }}>
                  Publicado em {formatDate(c.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ─── Tab: Vagas ────────────────────────────────────────────────────── */
  const renderVagas = () => {
    if (vagasLoading) return renderLoading();
    if (vagasError) return renderError(vagasError, fetchVagas);

    return (
      <div>
        <div style={sx.sectionTitle}>💼 Vagas Abertas</div>
        {vagas.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>Nenhuma vaga aberta no momento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {vagas.map((v, i) => (
              <div key={v.id || i} style={sx.vagaCard}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a237e' }}>{v.titulo}</span>
                {v.descricao && <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#555', lineHeight: 1.5 }}>{v.descricao}</p>}
                {v.requisitos && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#78909c' }}>
                    <strong>Requisitos:</strong> {v.requisitos}
                  </p>
                )}
                {v.unidadeNome && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#78909c' }}>
                    📍 {v.unidadeNome}
                  </p>
                )}
                <a
                  href={`/vaga/${v.id}`}
                  onClick={e => { e.preventDefault(); navigate(`/vaga/${v.id}`); }}
                  style={sx.candidatarBtn}
                >
                  Me candidatar →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ─── Tab Content Switch ────────────────────────────────────────────── */
  const renderContent = () => {
    switch (activeTab) {
      case 'dados': return renderDados();
      case 'recebimentos': return renderRecebimentos();
      case 'contrato': return renderContrato();
      case 'comunicados': return renderComunicados();
      case 'vagas': return renderVagas();
      default: return null;
    }
  };

  /* ─── Main Render ───────────────────────────────────────────────────── */
  return (
    <div style={sx.page}>
      {/* Header */}
      <header style={sx.header}>
        <div style={sx.headerInner}>
          <span style={sx.headerUser}>👤 {displayName}</span>
          <button onClick={handleLogout} style={sx.logoutBtn}>Sair</button>
        </div>
      </header>

      <div style={sx.body}>
        {/* Sidebar (desktop) */}
        {!isMobile && (
          <nav style={sx.sidebar}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...sx.sidebarItem,
                  ...(activeTab === tab.id ? sx.sidebarItemActive : {}),
                }}
              >
                <span style={sx.sidebarIcon}>{tab.icon}</span>
                <span style={sx.sidebarLabel}>{tab.label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Main Content */}
        <main style={{ ...sx.main, ...(isMobile ? { paddingBottom: '80px' } : {}) }}>
          {renderContent()}
        </main>
      </div>

      {/* Bottom Nav (mobile) */}
      {isMobile && (
        <nav style={sx.bottomNav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...sx.bottomItem,
                ...(activeTab === tab.id ? sx.bottomItemActive : {}),
              }}
            >
              <span style={{ fontSize: '20px' }}>{tab.icon}</span>
              <span style={{
                fontSize: '10px',
                marginTop: '2px',
                color: activeTab === tab.id ? '#1a237e' : '#90a4ae',
                fontWeight: activeTab === tab.id ? 700 : 400,
              }}>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Modal Alterar Senha */}
      {showSenhaModal && (
        <div style={sx.overlay}>
          <div style={sx.modal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#1a237e' }}>🔒 Alterar Senha</h2>
              <button
                onClick={() => setShowSenhaModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}
              >✕</button>
            </div>

            {senhaSuccess && <div style={sx.successBox}>{senhaSuccess}</div>}
            {senhaError && <div style={sx.errorBoxInline}>{senhaError}</div>}

            <form onSubmit={handleAlterarSenha} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              <div style={sx.field}>
                <label style={sx.fieldLabel}>Senha atual</label>
                <input style={sx.fieldInput} type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} />
              </div>
              <div style={sx.field}>
                <label style={sx.fieldLabel}>Nova senha</label>
                <input style={sx.fieldInput} type="password" placeholder="Mínimo 6 caracteres" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
              </div>
              <div style={sx.field}>
                <label style={sx.fieldLabel}>Confirmar nova senha</label>
                <input style={sx.fieldInput} type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
              </div>
              <button type="submit" style={sx.submitBtn} disabled={senhaLoading}>
                {senhaLoading ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const sx: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f0f2f5',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },

  /* Header */
  header: {
    background: '#1a237e',
    color: '#fff',
    padding: '0 20px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    zIndex: 100,
    position: 'sticky' as const,
    top: 0,
  },
  headerInner: {
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerUser: {
    fontWeight: 600,
    fontSize: '15px',
    letterSpacing: '0.2px',
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },

  /* Body Layout */
  body: {
    display: 'flex',
    flex: 1,
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  },

  /* Sidebar */
  sidebar: {
    width: '220px',
    minWidth: '220px',
    background: '#fff',
    borderRight: '1px solid #e0e0e0',
    padding: '16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#546e7a',
    textAlign: 'left' as const,
    transition: 'background 0.15s, color 0.15s',
    borderLeft: '3px solid transparent',
  },
  sidebarItemActive: {
    background: '#e8eaf6',
    color: '#1a237e',
    fontWeight: 700,
    borderLeftColor: '#1a237e',
  },
  sidebarIcon: {
    fontSize: '18px',
    width: '24px',
    textAlign: 'center' as const,
  },
  sidebarLabel: {
    fontSize: '13px',
  },

  /* Main */
  main: {
    flex: 1,
    padding: '24px',
    minHeight: 'calc(100vh - 56px)',
    overflowY: 'auto' as const,
  },

  /* Bottom Nav (mobile) */
  bottomNav: {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    background: '#fff',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 100,
    boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
  },
  bottomItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '6px 8px',
    flex: 1,
  },
  bottomItemActive: {
    borderTop: '2px solid #1a237e',
  },

  /* Section Title */
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1a237e',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '2px solid #e8eaf6',
  },

  /* Data Card */
  dataCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  dataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f5f5f5',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  dataLabel: {
    fontSize: '13px',
    color: '#78909c',
    fontWeight: 500,
    minWidth: '120px',
  },
  dataValue: {
    fontSize: '14px',
    color: '#263238',
    fontWeight: 600,
    textAlign: 'right' as const,
    wordBreak: 'break-word' as const,
  },

  /* Alterar Senha Btn */
  alterarSenhaBtn: {
    marginTop: '16px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1.5px solid #1a237e',
    background: '#fff',
    color: '#1a237e',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  /* Payslip Card */
  payslipCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  payslipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  payslipPeriodo: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#37474f',
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
  },
  statusPago: {
    background: '#e8f5e9',
    color: '#2e7d32',
  },
  statusPendente: {
    background: '#fff8e1',
    color: '#f57f17',
  },
  payslipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
  },
  payslipItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  payslipLabel: {
    fontSize: '11px',
    color: '#90a4ae',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  payslipValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#263238',
  },

  /* Filter Row */
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  filterBtn: {
    padding: '7px 14px',
    borderRadius: '20px',
    border: '1.5px solid #cfd8dc',
    background: '#fff',
    color: '#546e7a',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: '#1a237e',
    color: '#fff',
    borderColor: '#1a237e',
  },

  /* Comunicado Card */
  comunicadoCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    borderLeft: '4px solid #1565c0',
  },
  badgeNovo: {
    background: '#e53935',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },

  /* Vaga Card */
  vagaCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  candidatarBtn: {
    display: 'inline-block',
    marginTop: '10px',
    padding: '8px 18px',
    borderRadius: '6px',
    background: '#1a237e',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    alignSelf: 'flex-start',
    cursor: 'pointer',
  },

  /* Loading / Error */
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#1a237e',
    borderRadius: '50%',
    animation: 'portal-spin 0.8s linear infinite',
  },
  errorWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    textAlign: 'center' as const,
  },
  retryBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    background: '#1a237e',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  /* Modal */
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    padding: '28px 24px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#37474f',
  },
  fieldInput: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1.5px solid #cfd8dc',
    fontSize: '14px',
    outline: 'none',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  submitBtn: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #1a237e, #1565c0)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '4px',
  },
  successBox: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    marginTop: '12px',
    border: '1px solid #a5d6a7',
  },
  errorBoxInline: {
    background: '#ffebee',
    color: '#c62828',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    marginTop: '12px',
    border: '1px solid #ef9a9a',
  },
};

/* ─── Inject keyframes for spinner ────────────────────────────────────── */
if (typeof document !== 'undefined') {
  const styleId = 'portal-spinner-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@keyframes portal-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}
