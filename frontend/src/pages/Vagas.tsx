import React, { useState, useEffect, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
const FORM_BASE = 'https://www.gires.com.br/vaga';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Vaga {
  id: string;
  unitId: string;
  titulo: string;
  descricao?: string;
  tipo: string;
  status: 'aberta' | 'fechada';
  createdAt: string;
  updatedAt: string;
  totalCandidatos?: number;
}

interface Candidato {
  id: string;
  unitId: string;
  status: string;
  nome: string;
  email: string;
  celular: string;
  cidadeBairro: string;
  vagasInteresse: string[];
  tipoContratacao: string;
  pretensaoGanho: string;
  tempoExperiencia: string;
  transporteProprio: string;
  gastoTransporte: number;
  referencia: string;
  idade: number;
  quandoComeca: string;
  trabalhouBuffet: string;
  turnoPref: string;
  diasDisponiveis: string[];
  trabalhaFds: string;
  fazDobras: string;
  lidarPressao: string;
  curriculo: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  novo:          { label: 'Novo',           color: '#1565c0', bg: '#e3f2fd' },
  em_triagem:    { label: 'Em triagem',     color: '#f57f17', bg: '#fffde7' },
  selecionado:   { label: 'Selecionado',    color: '#2e7d32', bg: '#e8f5e9' },
  contato_feito: { label: 'Contato feito',  color: '#e65100', bg: '#fff3e0' },
  entrevistado:  { label: 'Entrevistado',   color: '#6a1b9a', bg: '#f3e5f5' },
  aprovado:      { label: 'Aprovado',       color: '#1b5e20', bg: '#c8e6c9' },
  reprovado:     { label: 'Reprovado',      color: '#b71c1c', bg: '#ffcdd2' },
  arquivado:     { label: 'Arquivado',      color: '#616161', bg: '#f5f5f5' },
};

const ALL_STATUS = Object.keys(STATUS_CONFIG);

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function token() {
  return localStorage.getItem('auth_token') || '';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#666', bg: '#eee' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
      color: cfg.color, backgroundColor: cfg.bg, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Vagas() {
  const { activeUnit } = useUnit();
  const { user } = useAuth() as any;
  const unitId = activeUnit?.id || (user as any)?.unitId || '';

  const [aba, setAba] = useState<'vagas' | 'candidatos'>('vagas');

  // ── Vagas ──
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [loadingVagas, setLoadingVagas] = useState(false);
  const [showModalVaga, setShowModalVaga] = useState(false);
  const [novaVaga, setNovaVaga] = useState({ titulo: '', tipo: 'Ambos', descricao: '' });
  const [salvandoVaga, setSalvandoVaga] = useState(false);

  // ── Candidatos ──
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loadingCand, setLoadingCand] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroVaga, setFiltroVaga] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [candidatoAberto, setCandidatoAberto] = useState<Candidato | null>(null);
  const [notas, setNotas] = useState('');
  const [salvandoCand, setSalvandoCand] = useState(false);
  const [novoStatusLote, setNovoStatusLote] = useState('');

  // ── Copiar link ──
  const [copiado, setCopiado] = useState('');

  /* ── Fetch Vagas ── */
  const fetchVagas = useCallback(async () => {
    if (!unitId) return;
    setLoadingVagas(true);
    try {
      const r = await fetch(`${API_URL}/vagas?unitId=${unitId}`, { headers: authHeaders() });
      const d = await r.json();
      setVagas(d.vagas || []);
    } finally {
      setLoadingVagas(false);
    }
  }, [unitId]);

  /* ── Fetch Candidatos ── */
  const fetchCandidatos = useCallback(async () => {
    if (!unitId) return;
    setLoadingCand(true);
    try {
      let url = `${API_URL}/candidatos?unitId=${unitId}`;
      if (filtroStatus) url += `&status=${filtroStatus}`;
      if (filtroVaga) url += `&vagaTitulo=${encodeURIComponent(filtroVaga)}`;
      const r = await fetch(url, { headers: authHeaders() });
      const d = await r.json();
      setCandidatos(d.candidatos || []);
    } finally {
      setLoadingCand(false);
    }
  }, [unitId, filtroStatus, filtroVaga]);

  useEffect(() => { fetchVagas(); }, [fetchVagas]);
  useEffect(() => { if (aba === 'candidatos') fetchCandidatos(); }, [aba, fetchCandidatos]);

  /* ── Criar Vaga ── */
  const criarVaga = async () => {
    if (!novaVaga.titulo.trim()) return;
    setSalvandoVaga(true);
    try {
      await fetch(`${API_URL}/vagas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...novaVaga, unitId }),
      });
      setShowModalVaga(false);
      setNovaVaga({ titulo: '', tipo: 'Ambos', descricao: '' });
      fetchVagas();
    } finally {
      setSalvandoVaga(false);
    }
  };

  /* ── Toggle status da vaga ── */
  const toggleVaga = async (vaga: Vaga) => {
    const newStatus = vaga.status === 'aberta' ? 'fechada' : 'aberta';
    await fetch(`${API_URL}/vagas/${vaga.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: newStatus }),
    });
    fetchVagas();
  };

  /* ── Copiar link do formulário ── */
  const copiarLink = (uid: string) => {
    const link = `${FORM_BASE}/${uid}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(uid);
      setTimeout(() => setCopiado(''), 2000);
    });
  };

  /* ── Candidato: salvar status/notas ── */
  const salvarCandidato = async (candidato: Candidato, updates: Partial<Candidato>) => {
    await fetch(`${API_URL}/candidatos/${candidato.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });
    fetchCandidatos();
    if (candidatoAberto?.id === candidato.id) {
      setCandidatoAberto(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  /* ── Salvar notas do candidato aberto ── */
  const salvarNotas = async () => {
    if (!candidatoAberto) return;
    setSalvandoCand(true);
    await salvarCandidato(candidatoAberto, { notas });
    setSalvandoCand(false);
  };

  /* ── Alterar status em lote ── */
  const aplicarStatusLote = async () => {
    if (!novoStatusLote || selecionados.size === 0) return;
    await Promise.all([...selecionados].map(id =>
      fetch(`${API_URL}/candidatos/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: novoStatusLote }),
      })
    ));
    setSelecionados(new Set());
    setNovoStatusLote('');
    fetchCandidatos();
  };

  /* ── Filtro local por tipo ── */
  const candidatosFiltrados = filtroTipo
    ? candidatos.filter(c => c.tipoContratacao === filtroTipo)
    : candidatos;

  /* ── Abrir painel candidato ── */
  const abrirCandidato = (c: Candidato) => {
    setCandidatoAberto(c);
    setNotas(c.notas || '');
  };

  if (!unitId) {
    return (
      <div style={styles.emptyBox}>
        <p>Selecione uma unidade para visualizar as vagas.</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <h2 style={styles.pageTitle}>📢 Recrutamento de Vagas</h2>
        <p style={styles.pageSubtitle}>
          Link do formulário público:&nbsp;
          <a href={`${FORM_BASE}/${unitId}`} target="_blank" rel="noopener noreferrer" style={styles.linkText}>
            {FORM_BASE}/{unitId}
          </a>
          &nbsp;
          <button style={styles.copyBtn} onClick={() => copiarLink(unitId)}>
            {copiado === unitId ? '✅ Copiado!' : '📋 Copiar'}
          </button>
        </p>
      </div>

      {/* Abas */}
      <div style={styles.tabs}>
        <button style={aba === 'vagas' ? styles.tabActive : styles.tab} onClick={() => setAba('vagas')}>
          💼 Vagas ({vagas.length})
        </button>
        <button style={aba === 'candidatos' ? styles.tabActive : styles.tab} onClick={() => setAba('candidatos')}>
          👤 Candidatos
        </button>
      </div>

      {/* ══ ABA VAGAS ══ */}
      {aba === 'vagas' && (
        <div>
          <div style={styles.toolbar}>
            <button style={styles.primaryBtn} onClick={() => setShowModalVaga(true)}>+ Nova Vaga</button>
          </div>

          {loadingVagas ? (
            <div style={styles.loadingText}>Carregando vagas...</div>
          ) : vagas.length === 0 ? (
            <div style={styles.emptyBox}>Nenhuma vaga cadastrada. Clique em "+ Nova Vaga" para começar.</div>
          ) : (
            <div style={styles.vagasGrid}>
              {vagas.map(v => (
                <div key={v.id} style={{ ...styles.vagaCard, opacity: v.status === 'fechada' ? 0.6 : 1 }}>
                  <div style={styles.vagaHeader}>
                    <span style={styles.vagaTitulo}>{v.titulo}</span>
                    <StatusBadge status={v.status === 'aberta' ? 'selecionado' : 'arquivado'} />
                  </div>
                  <div style={styles.vagaMeta}>
                    <span>🏷 {v.tipo}</span>
                    {v.descricao && <span>· {v.descricao}</span>}
                    <span>· 👤 {v.totalCandidatos ?? 0} candidatos</span>
                  </div>
                  <div style={styles.vagaActions}>
                    <button style={styles.smallBtn} onClick={() => copiarLink(unitId)}>
                      {copiado === unitId ? '✅ Copiado!' : '📋 Copiar link'}
                    </button>
                    <button
                      style={{ ...styles.smallBtn, color: v.status === 'aberta' ? '#c62828' : '#2e7d32' }}
                      onClick={() => toggleVaga(v)}
                    >
                      {v.status === 'aberta' ? '🔒 Fechar' : '🔓 Reabrir'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ ABA CANDIDATOS ══ */}
      {aba === 'candidatos' && (
        <div>
          {/* Filtros */}
          <div style={styles.filtros}>
            <select style={styles.filtroSelect} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {ALL_STATUS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
            <select style={styles.filtroSelect} value={filtroVaga} onChange={e => setFiltroVaga(e.target.value)}>
              <option value="">Todas as vagas</option>
              {vagas.map(v => <option key={v.id} value={v.titulo}>{v.titulo}</option>)}
            </select>
            <select style={styles.filtroSelect} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="">Todos os tipos</option>
              {['CLT', 'Freelancer', 'Ambos'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button style={styles.smallBtn} onClick={fetchCandidatos}>🔄 Atualizar</button>
          </div>

          {/* Ações em lote */}
          {selecionados.size > 0 && (
            <div style={styles.loteBar}>
              <span>{selecionados.size} selecionado(s)</span>
              <select style={styles.filtroSelect} value={novoStatusLote} onChange={e => setNovoStatusLote(e.target.value)}>
                <option value="">Alterar status para...</option>
                {ALL_STATUS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
              <button style={styles.primaryBtn} onClick={aplicarStatusLote} disabled={!novoStatusLote}>Aplicar</button>
              <button style={styles.smallBtn} onClick={() => setSelecionados(new Set())}>Limpar</button>
            </div>
          )}

          {loadingCand ? (
            <div style={styles.loadingText}>Carregando candidatos...</div>
          ) : candidatosFiltrados.length === 0 ? (
            <div style={styles.emptyBox}>Nenhum candidato encontrado com os filtros aplicados.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      <input type="checkbox"
                        checked={selecionados.size === candidatosFiltrados.length}
                        onChange={e => setSelecionados(e.target.checked ? new Set(candidatosFiltrados.map(c => c.id)) : new Set())}
                      />
                    </th>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>Celular</th>
                    <th style={styles.th}>Vagas Interesse</th>
                    <th style={styles.th}>Tipo</th>
                    <th style={styles.th}>Experiência</th>
                    <th style={styles.th}>Turno</th>
                    <th style={styles.th}>Disponibilidade</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatosFiltrados.map(c => (
                    <tr
                      key={c.id}
                      style={{ cursor: 'pointer', backgroundColor: selecionados.has(c.id) ? '#fff8f0' : 'transparent' }}
                      onClick={() => abrirCandidato(c)}
                    >
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selecionados.has(c.id)}
                          onChange={e => {
                            const s = new Set(selecionados);
                            e.target.checked ? s.add(c.id) : s.delete(c.id);
                            setSelecionados(s);
                          }}
                        />
                      </td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{c.nome}</td>
                      <td style={styles.td}>{c.celular}</td>
                      <td style={styles.td}>{(c.vagasInteresse || []).join(', ')}</td>
                      <td style={styles.td}>{c.tipoContratacao}</td>
                      <td style={styles.td}>{c.tempoExperiencia}</td>
                      <td style={styles.td}>{c.turnoPref}</td>
                      <td style={styles.td}>{(c.diasDisponiveis || []).join(', ')}</td>
                      <td style={styles.td}><StatusBadge status={c.status} /></td>
                      <td style={styles.td}>{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL NOVA VAGA ══ */}
      {showModalVaga && (
        <div style={styles.overlay} onClick={() => setShowModalVaga(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Nova Vaga</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={styles.label}>Título da vaga *</label>
              <input style={styles.input} value={novaVaga.titulo} onChange={e => setNovaVaga(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Garçom, Caixa, Cozinheiro..." autoFocus />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={styles.label}>Tipo de contratação</label>
              <select style={styles.input} value={novaVaga.tipo} onChange={e => setNovaVaga(p => ({ ...p, tipo: e.target.value }))}>
                {['CLT', 'Freelancer', 'Ambos'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={styles.label}>Descrição (opcional)</label>
              <textarea style={{ ...styles.input, minHeight: '70px' }} value={novaVaga.descricao} onChange={e => setNovaVaga(p => ({ ...p, descricao: e.target.value }))} placeholder="Breve descrição da vaga..." />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button style={styles.smallBtn} onClick={() => setShowModalVaga(false)}>Cancelar</button>
              <button style={styles.primaryBtn} onClick={criarVaga} disabled={salvandoVaga || !novaVaga.titulo.trim()}>
                {salvandoVaga ? 'Salvando...' : 'Criar Vaga'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DRAWER CANDIDATO ══ */}
      {candidatoAberto && (
        <div style={styles.drawerOverlay} onClick={() => setCandidatoAberto(null)}>
          <div style={styles.drawer} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={{ margin: 0 }}>{candidatoAberto.nome}</h3>
              <button style={styles.closeBtn} onClick={() => setCandidatoAberto(null)}>✕</button>
            </div>

            <div style={styles.drawerBody}>
              {/* Status */}
              <div style={styles.drawerSection}>
                <label style={styles.label}>Status</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {ALL_STATUS.map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const ativo = candidatoAberto.status === s;
                    return (
                      <button
                        key={s}
                        style={{
                          padding: '5px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer', border: ativo ? '2px solid #333' : '1px solid #ddd',
                          color: cfg.color, backgroundColor: cfg.bg, transition: 'all 0.15s',
                        }}
                        onClick={() => {
                          salvarCandidato(candidatoAberto, { status: s });
                          setCandidatoAberto(p => p ? { ...p, status: s } : null);
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dados principais */}
              <div style={styles.drawerSection}>
                <InfoRow label="E-mail" value={candidatoAberto.email} />
                <InfoRow label="Celular" value={candidatoAberto.celular} />
                <InfoRow label="Cidade/Bairro" value={candidatoAberto.cidadeBairro} />
                <InfoRow label="Idade" value={candidatoAberto.idade ? `${candidatoAberto.idade} anos` : '—'} />
                <InfoRow label="Vagas de interesse" value={(candidatoAberto.vagasInteresse || []).join(', ')} />
                <InfoRow label="Tipo contratação" value={candidatoAberto.tipoContratacao} />
                <InfoRow label="Pretensão" value={candidatoAberto.pretensaoGanho} />
                <InfoRow label="Experiência" value={candidatoAberto.tempoExperiencia} />
                <InfoRow label="Turno" value={candidatoAberto.turnoPref} />
                <InfoRow label="Dias disponíveis" value={(candidatoAberto.diasDisponiveis || []).join(', ')} />
                <InfoRow label="Trabalha FDS/feriados" value={candidatoAberto.trabalhaFds} />
                <InfoRow label="Faz dobras" value={candidatoAberto.fazDobras} />
                <InfoRow label="Transporte próprio" value={candidatoAberto.transporteProprio} />
                <InfoRow label="Gasto transporte/dia" value={candidatoAberto.gastoTransporte ? `R$ ${candidatoAberto.gastoTransporte}` : '—'} />
                <InfoRow label="Trabalhou buffet/pizzaria" value={candidatoAberto.trabalhouBuffet} />
                <InfoRow label="Quando pode começar" value={candidatoAberto.quandoComeca} />
                <InfoRow label="Referência" value={candidatoAberto.referencia || '—'} />
                {candidatoAberto.curriculo && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={styles.infoLabel}>Currículo</span>
                    <a href={candidatoAberto.curriculo} target="_blank" rel="noopener noreferrer" style={{ color: '#e67e22', fontSize: '13px' }}>
                      Abrir link ↗
                    </a>
                  </div>
                )}
                {candidatoAberto.lidarPressao && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={styles.infoLabel}>Como lida com pressão</span>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#555', lineHeight: '1.5' }}>{candidatoAberto.lidarPressao}</p>
                  </div>
                )}
                <InfoRow label="Candidatura em" value={fmtDate(candidatoAberto.createdAt)} />
              </div>

              {/* Notas internas */}
              <div style={styles.drawerSection}>
                <label style={styles.label}>Notas internas</label>
                <textarea
                  style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Anotações sobre o candidato..."
                />
                <button style={{ ...styles.primaryBtn, marginTop: '8px', width: '100%' }} onClick={salvarNotas} disabled={salvandoCand}>
                  {salvandoCand ? 'Salvando...' : '💾 Salvar notas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ marginBottom: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '12px', color: '#888', minWidth: '140px' }}>{label}:</span>
      <span style={{ fontSize: '13px', color: '#333', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  pageHeader: { marginBottom: '20px' },
  pageTitle: { fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: '#2c2c2c' },
  pageSubtitle: { fontSize: '13px', color: '#666', margin: 0 },
  linkText: { color: '#e67e22', fontWeight: 600 },
  tabs: { display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '0' },
  tab: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#888', borderBottom: '2px solid transparent', marginBottom: '-2px' },
  tabActive: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 700, color: '#e67e22', borderBottom: '2px solid #e67e22', marginBottom: '-2px' },
  toolbar: { display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' },
  filtros: { display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' },
  filtroSelect: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff', color: '#333' },
  loteBar: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px', backgroundColor: '#fff8f0', borderRadius: '8px', marginBottom: '12px', flexWrap: 'wrap' },
  primaryBtn: { padding: '9px 18px', backgroundColor: '#e67e22', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' },
  smallBtn: { padding: '7px 14px', backgroundColor: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' },
  copyBtn: { padding: '4px 10px', backgroundColor: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  vagasGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' },
  vagaCard: { backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  vagaHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
  vagaTitulo: { fontSize: '15px', fontWeight: 700, color: '#2c2c2c' },
  vagaMeta: { fontSize: '12px', color: '#888', display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' },
  vagaActions: { display: 'flex', gap: '8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: '#fff' },
  th: { padding: '10px 12px', textAlign: 'left', backgroundColor: '#f5f5f5', borderBottom: '2px solid #eee', fontSize: '12px', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle', color: '#333' },
  emptyBox: { textAlign: 'center', padding: '60px 20px', color: '#aaa', fontSize: '15px' },
  loadingText: { padding: '40px', textAlign: 'center', color: '#aaa' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' },
  drawerOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#fff', width: '480px', maxWidth: '95vw', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' },
  drawerHeader: { padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafafa', position: 'sticky', top: 0, zIndex: 1 },
  drawerBody: { padding: '20px 24px', flex: 1 },
  drawerSection: { marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #f0f0f0' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' },
  label: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  infoLabel: { display: 'block', fontSize: '12px', color: '#888', marginBottom: '2px' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', color: '#333', backgroundColor: '#fafafa', boxSizing: 'border-box' },
};
