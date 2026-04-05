import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/* ─── Feriados Nacionais Brasil 2026 ─────────────────────────────────────── */
const FERIADOS_2026: Record<string, string> = {
  '2026-01-01': 'Confraternização Universal',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-02-18': 'Quarta-feira de Cinzas (meio dia)',
  '2026-04-03': 'Sexta-feira Santa',
  '2026-04-05': 'Páscoa',
  '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi',
  '2026-09-07': 'Independência do Brasil',
  '2026-10-12': 'Nossa Sra. Aparecida',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Dia da Consciência Negra',
  '2026-12-25': 'Natal',
};

/* ─── Regras padrão editáveis ────────────────────────────────────────────── */
interface RegraEscala {
  cargo: string;
  label: string;
  diasTrabalho: number[];   // 0=Dom … 6=Sáb
  turnoNoite: number[];     // dias com noite (dobra)
  cor: string;
}

const REGRAS_PADRAO: RegraEscala[] = [
  { cargo: 'pizzaiolo', label: 'Pizzaiolo', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [2, 3, 4, 5, 6], cor: '#e65100' },
  { cargo: 'motoboy',   label: 'Motoboy CLT', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [4, 5, 6], cor: '#1565c0' },
  { cargo: 'cozinheiro', label: 'Cozinheiro', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [4, 5, 6], cor: '#6a1b9a' },
  { cargo: 'atendente', label: 'Atendente', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [], cor: '#2e7d32' },
  { cargo: 'auxiliar',  label: 'Auxiliar', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [], cor: '#00838f' },
  { cargo: 'freelancer', label: 'Freelancer', diasTrabalho: [2, 3, 4, 5, 6], turnoNoite: [], cor: '#c2185b' },
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type TurnoPadrao = '' | 'Dia' | 'DiaNoite';

function matchRegraByLabel(regras: RegraEscala[], cargo: string): RegraEscala | undefined {
  const c = cargo.toLowerCase();
  return regras.find(r => c.includes(r.cargo));
}

function turnoEsperadoRegas(regras: RegraEscala[], cargo: string, dow: number): TurnoPadrao {
  const regra = matchRegraByLabel(regras, cargo);
  if (!regra) {
    // fallback: trabalha Ter–Sáb, sem noite
    if (dow === 0 || dow === 1) return '';
    return 'Dia';
  }
  if (!regra.diasTrabalho.includes(dow)) return '';
  if (regra.turnoNoite.includes(dow)) return 'DiaNoite';
  return 'Dia';
}

/* ─── Tipos ──────────────────────────────────────────────────────────────── */
interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  tipoContrato?: string;
  podeTrabalharNoite?: boolean;
  ativo?: boolean;
  unitId?: string;
  chavePix?: string;
  telefone?: string;
}

interface Escala {
  id: string;
  colaboradorId: string;
  colaboradorNome?: string;
  cargo?: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  observacao?: string;
  unitId?: string;
}

interface Freelancer {
  id: string;
  nome: string;
  chavePix?: string;
  telefone?: string;
  valorDobra?: number;   // R$ por dobra
  cargo?: string;        // função (ex: garçom, bartender)
  ativo: boolean;
  unitId?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function diasDoMes(ano: number, mes: number): Date[] {
  const dias: Date[] = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    dias.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

function fmtData(d: Date) {
  return d.toISOString().split('T')[0];
}


const BADGE_TURNO: Record<string, { bg: string; color: string; label: string }> = {
  Dia:      { bg: '#fff9c4', color: '#f57f17', label: '☀️ Dia' },
  Noite:    { bg: '#e8eaf6', color: '#3949ab', label: '🌙 Noite' },
  DiaNoite: { bg: '#e8f5e9', color: '#2e7d32', label: '☀️🌙 Dobra' },
  Folga:    { bg: '#fce4ec', color: '#c62828', label: '🏖 Folga' },
  '':       { bg: '#f5f5f5', color: '#9e9e9e', label: '—' },
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Escalas: React.FC = () => {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<'mensal' | 'freelancers' | 'editar' | 'regras'>('mensal');
  const [filtroFuncao, setFiltroFuncao] = useState('Todos');
  const [mostrarFolgas, setMostrarFolgas] = useState(false);

  // Regras editáveis (estado local, persistível futuramente)
  const [regras, setRegras] = useState<RegraEscala[]>(REGRAS_PADRAO);
  const [editandoRegra, setEditandoRegra] = useState<RegraEscala | null>(null);

  // Form edição manual
  const [formEscala, setFormEscala] = useState({
    colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '',
  });

  // Form freelancer
  const [formFreelancer, setFormFreelancer] = useState<Partial<Freelancer>>({
    nome: '', chavePix: '', telefone: '', valorDobra: 120, cargo: '', ativo: true,
  });
  const [editandoFreelancerId, setEditandoFreelancerId] = useState<string | null>(null);

  const [ano, mes] = mesAno.split('-').map(Number);
  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);

  useEffect(() => {
    if (unitId) { fetchColaboradores(); fetchEscalas(); fetchFreelancers(); }
  }, [unitId, mesAno]);

  /* ── Fetch ────────────────────────────────────────────────── */
  const fetchColaboradores = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setColaboradores((Array.isArray(d) ? d : []).filter((c: Colaborador) => c.ativo !== false));
    } catch (e) { console.error(e); }
  };

  const fetchEscalas = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setEscalas(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchFreelancers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/freelancers?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        setFreelancers(Array.isArray(d) ? d : []);
      }
    } catch (e) { console.error(e); }
  };

  /* ── Gerar automático ─────────────────────────────────────── */
  const gerarEscalaAutomatica = async () => {
    if (!window.confirm(`Gerar escala automática para ${mesAno}?\nEscalas existentes não serão sobrescritas.`)) return;
    setSalvando(true);
    const token = localStorage.getItem('auth_token');
    let criados = 0;
    for (const colab of colaboradores) {
      for (const dia of dias) {
        const dow = dia.getDay();
        const dataStr = fmtData(dia);
        const jaExiste = escalas.some(e => e.colaboradorId === colab.id && e.data === dataStr);
        if (jaExiste) continue;
        const turno = turnoEsperadoRegas(regras, colab.cargo, dow);
        if (!turno) continue;
        try {
          await fetch(`${apiUrl}/escalas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ unitId, colaboradorId: colab.id, data: dataStr, turno }),
          });
          criados++;
        } catch (e) { console.error(e); }
      }
    }
    alert(`✅ ${criados} turnos criados automaticamente.`);
    setSalvando(false);
    fetchEscalas();
  };

  /* ── Salvar turno manual ──────────────────────────────────── */
  const handleSalvarEscalaManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEscala.colaboradorId || !formEscala.data) { alert('Preencha colaborador e data.'); return; }
    setSalvando(true);
    try {
      const token = localStorage.getItem('auth_token');
      const existente = escalas.find(x => x.colaboradorId === formEscala.colaboradorId && x.data === formEscala.data);
      if (existente) {
        await fetch(`${apiUrl}/escalas/${existente.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      }
      if (formEscala.turno !== 'Folga') {
        await fetch(`${apiUrl}/escalas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...formEscala, unitId }),
        });
      }
      alert('✅ Escala salva!');
      setFormEscala({ colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '' });
      fetchEscalas();
    } catch { alert('Erro ao salvar escala'); }
    finally { setSalvando(false); }
  };

  /* ── CRUD Freelancers ─────────────────────────────────────── */
  const handleSalvarFreelancer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFreelancer.nome) { alert('Nome é obrigatório.'); return; }
    try {
      const token = localStorage.getItem('auth_token');
      const isEdit = !!editandoFreelancerId;
      const url = isEdit ? `${apiUrl}/freelancers/${editandoFreelancerId}` : `${apiUrl}/freelancers`;
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formFreelancer, unitId }),
      });
      if (r.ok) {
        alert(isEdit ? 'Freelancer atualizado!' : 'Freelancer cadastrado!');
        setFormFreelancer({ nome: '', chavePix: '', telefone: '', valorDobra: 120, cargo: '', ativo: true });
        setEditandoFreelancerId(null);
        fetchFreelancers();
      } else {
        const err = await r.json().catch(() => ({}));
        alert('Erro: ' + ((err as any).error || r.status));
      }
    } catch { alert('Erro ao salvar freelancer'); }
  };

  const handleDeletarFreelancer = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir ${nome}?`)) return;
    const token = localStorage.getItem('auth_token');
    await fetch(`${apiUrl}/freelancers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchFreelancers();
  };

  /* ── Mapa de escalas ──────────────────────────────────────── */
  const escalasMap = useMemo(() => {
    const m: Record<string, Record<string, Escala>> = {};
    for (const e of escalas) {
      if (!m[e.colaboradorId]) m[e.colaboradorId] = {};
      m[e.colaboradorId][e.data] = e;
    }
    return m;
  }, [escalas]);

  /* ── Resumo por colaborador ───────────────────────────────── */
  const resumos = useMemo(() => {
    return colaboradores.map(c => {
      let dia = 0, noite = 0, dobra = 0;
      for (const d of dias) {
        const esc = escalasMap[c.id]?.[fmtData(d)];
        if (esc?.turno === 'Dia') dia++;
        else if (esc?.turno === 'Noite') noite++;
        else if (esc?.turno === 'DiaNoite') dobra++;
      }
      return { id: c.id, nome: c.nome, cargo: c.cargo, dia, noite, dobra };
    });
  }, [colaboradores, dias, escalasMap]);

  /* ── Funções únicas para filtro ──────────────────────────── */
  const funcoes = useMemo(() => {
    const set = new Set(colaboradores.map(c => c.cargo).filter(Boolean));
    return ['Todos', ...Array.from(set)];
  }, [colaboradores]);

  const colaboradoresFiltrados = useMemo(() => {
    if (filtroFuncao === 'Todos') return colaboradores;
    return colaboradores.filter(c => c.cargo === filtroFuncao);
  }, [colaboradores, filtroFuncao]);

  /* ── (semanaDoMes used for potential future grouping) ─────── */

  /* ── Badge de célula ─────────────────────────────────────── */
  const badgeCell = useCallback((turno: string | undefined, dow: number, cargo: string, dataStr: string) => {
    const isFeriado = !!FERIADOS_2026[dataStr];
    const esperado = turnoEsperadoRegas(regras, cargo, dow);
    const real = turno || (dow === 0 || dow === 1 ? 'Folga' : '');
    const b = BADGE_TURNO[real] || BADGE_TURNO[''];
    const diverge = turno && turno !== esperado && esperado !== '';

    return (
      <span style={{
        display: 'inline-block', padding: '2px 5px', borderRadius: '9px',
        backgroundColor: isFeriado && !turno ? '#fce4ec' : b.bg,
        color: isFeriado && !turno ? '#c62828' : b.color,
        fontSize: '10px', fontWeight: 'bold',
        border: diverge ? '2px solid #e53935' : isFeriado ? '1px dashed #e53935' : 'none',
      }} title={isFeriado ? FERIADOS_2026[dataStr] : undefined}>
        {isFeriado && !turno ? '🎉' : b.label}
      </span>
    );
  }, [regras]);

  /* ── Estilos ─────────────────────────────────────────────── */
  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    tab: (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
      fontSize: '13px',
    }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '7px 5px', fontSize: '10px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td: { padding: '5px 3px', borderBottom: '1px solid #f0f0f0', fontSize: '10px', textAlign: 'center' as const, verticalAlign: 'middle' as const },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '9px 18px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📅 Gestão de Escalas" showBack={true} />
      <div style={{ flex: 1, padding: '20px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>

        {/* Controles */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '160px' }} />
          </div>
          <div>
            <label style={s.label}>Filtrar Função</label>
            <select value={filtroFuncao} onChange={e => setFiltroFuncao(e.target.value)} style={{ ...s.select, width: '170px' }}>
              {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', paddingBottom: '4px' }}>
            <input type="checkbox" checked={mostrarFolgas} onChange={e => setMostrarFolgas(e.target.checked)} />
            Mostrar Folgas
          </label>
          <button onClick={fetchEscalas} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={gerarEscalaAutomatica} disabled={salvando} style={s.btn('#43a047')}>
            {salvando ? '⏳...' : '⚡ Gerar Auto'}
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0' }}>
          <button style={s.tab(aba === 'mensal')} onClick={() => setAba('mensal')}>📋 Visão Mensal</button>
          <button style={s.tab(aba === 'freelancers')} onClick={() => setAba('freelancers')}>🎯 Freelancers</button>
          <button style={s.tab(aba === 'editar')} onClick={() => setAba('editar')}>✏️ Editar Turno</button>
          <button style={s.tab(aba === 'regras')} onClick={() => setAba('regras')}>📖 Regras</button>
        </div>

        {/* ── ABA MENSAL ────────────────────────────────────────── */}
        {aba === 'mensal' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '30px', color: '#999' }}>Carregando escalas...</p>
            ) : (
              <>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center', fontSize: '12px' }}>
                  {Object.entries(BADGE_TURNO).filter(([k]) => k).map(([k, v]) => (
                    <span key={k} style={{ backgroundColor: v.bg, color: v.color, padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {v.label}
                    </span>
                  ))}
                  <span style={{ backgroundColor: '#fce4ec', color: '#c62828', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', border: '1px dashed #e53935' }}>🎉 Feriado</span>
                  <span style={{ color: '#e53935', fontWeight: 'bold' }}>🔴 borda = diverge padrão</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, textAlign: 'left', minWidth: '130px', fontSize: '11px' }}>Colaborador</th>
                      <th style={{ ...s.th, textAlign: 'left', minWidth: '80px', fontSize: '11px' }}>Cargo</th>
                      {dias.map(d => {
                        const ds = fmtData(d);
                        const dow = d.getDay();
                        const isFeriado = !!FERIADOS_2026[ds];
                        const isWeekend = dow === 0 || dow === 6;
                        const isFolga = dow === 0 || dow === 1;
                        return (
                          <th key={ds} title={isFeriado ? FERIADOS_2026[ds] : DIAS_SEMANA_FULL[dow]} style={{
                            ...s.th,
                            backgroundColor: isFeriado ? '#b71c1c' : isFolga ? '#37474f' : isWeekend ? '#1976d2' : '#1565c0',
                            minWidth: '46px', padding: '5px 3px',
                          }}>
                            <div style={{ fontSize: '11px' }}>{d.getDate()}</div>
                            <div style={{ fontSize: '9px', opacity: 0.85 }}>{DIAS_SEMANA[dow]}</div>
                            {isFeriado && <div style={{ fontSize: '8px' }}>🎉</div>}
                          </th>
                        );
                      })}
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '34px' }}>☀️</th>
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '34px' }}>🌙</th>
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '34px' }}>2x</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradoresFiltrados.map((c, ci) => {
                      const r = resumos.find(x => x.id === c.id)!;
                      const corCargo = matchRegraByLabel(regras, c.cargo)?.cor || '#1976d2';
                      return (
                        <tr key={c.id} style={{ backgroundColor: ci % 2 === 0 ? '#fafafa' : 'white' }}>
                          <td style={{ ...s.td, textAlign: 'left', fontWeight: 'bold', paddingLeft: '8px', fontSize: '11px', borderLeft: `3px solid ${corCargo}` }}>
                            {c.nome.split(' ').slice(0, 2).join(' ')}
                          </td>
                          <td style={{ ...s.td, textAlign: 'left', fontSize: '10px', color: '#666' }}>{c.cargo}</td>
                          {dias.map(d => {
                            const ds = fmtData(d);
                            const esc = escalasMap[c.id]?.[ds];
                            const isFolga = !mostrarFolgas && !esc?.turno && (d.getDay() === 0 || d.getDay() === 1);
                            return (
                              <td key={ds} style={{
                                ...s.td,
                                backgroundColor: FERIADOS_2026[ds] ? '#fff3e0' : undefined,
                              }}>
                                {!isFolga && badgeCell(esc?.turno, d.getDay(), c.cargo, ds)}
                              </td>
                            );
                          })}
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#f57f17', fontSize: '11px' }}>{(r?.dia || 0) + (r?.dobra || 0)}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#3949ab', fontSize: '11px' }}>{(r?.noite || 0) + (r?.dobra || 0)}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32', fontSize: '11px' }}>{r?.dobra || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Resumo por função */}
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Resumo por Colaborador</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                    {resumos.filter(r => filtroFuncao === 'Todos' || colaboradores.find(c => c.id === r.id)?.cargo === filtroFuncao).map(r => {
                      const cor = matchRegraByLabel(regras, r.cargo)?.cor || '#1976d2';
                      return (
                        <div key={r.id} style={{ ...s.card, padding: '10px', borderLeft: `3px solid ${cor}` }}>
                          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>{r.nome.split(' ')[0]}</div>
                          <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>{r.cargo}</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#fff9c4', color: '#f57f17' }}>
                              ☀️{(r.dia || 0) + (r.dobra || 0)}d
                            </span>
                            <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8eaf6', color: '#3949ab' }}>
                              🌙{(r.noite || 0) + (r.dobra || 0)}n
                            </span>
                            <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                              2x{r.dobra || 0}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Feriados do mês */}
                {dias.some(d => FERIADOS_2026[fmtData(d)]) && (
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', borderLeft: '4px solid #e65100' }}>
                    <strong style={{ color: '#e65100', fontSize: '13px' }}>🎉 Feriados em {mesAno}:</strong>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {dias.filter(d => FERIADOS_2026[fmtData(d)]).map(d => {
                        const ds = fmtData(d);
                        return (
                          <span key={ds} style={{ fontSize: '12px', backgroundColor: 'white', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e65100' }}>
                            <strong>{d.getDate()}/{mes}</strong> – {FERIADOS_2026[ds]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ABA FREELANCERS ───────────────────────────────────── */}
        {aba === 'freelancers' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>🎯 Freelancers Cadastrados</h3>
              <button onClick={() => { setFormFreelancer({ nome: '', chavePix: '', telefone: '', valorDobra: 120, cargo: '', ativo: true }); setEditandoFreelancerId(null); }}
                style={s.btn('#1976d2')}>➕ Novo Freelancer</button>
            </div>

            {/* Tabela */}
            {freelancers.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Nome', 'Função', 'PIX', 'Telefone', 'Valor/Dobra', 'Status', 'Ações'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freelancers.map((f, i) => (
                      <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                        <td style={{ ...s.td, fontWeight: 'bold', fontSize: '12px', textAlign: 'left', paddingLeft: '10px' }}>{f.nome}</td>
                        <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo || '—'}</td>
                        <td style={{ ...s.td, fontSize: '11px' }}>{f.chavePix || '—'}</td>
                        <td style={{ ...s.td, fontSize: '11px' }}>{f.telefone || '—'}</td>
                        <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32' }}>R$ {(f.valorDobra || 0).toFixed(2)}</td>
                        <td style={s.td}>
                          <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: f.ativo ? '#e8f5e9' : '#fce4ec',
                            color: f.ativo ? '#2e7d32' : '#c62828' }}>
                            {f.ativo ? '● Ativo' : '○ Inativo'}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => { setFormFreelancer({ ...f }); setEditandoFreelancerId(f.id); }}
                              style={{ ...s.btn('#1976d2'), padding: '3px 8px', fontSize: '11px' }}>✏️</button>
                            <button onClick={() => handleDeletarFreelancer(f.id, f.nome)}
                              style={{ ...s.btn('#e53935'), padding: '3px 8px', fontSize: '11px' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulário */}
            <div style={{ ...s.card, borderTop: '3px solid #1976d2' }}>
              <h4 style={{ marginTop: 0, color: '#1976d2' }}>{editandoFreelancerId ? '✏️ Editar' : '➕ Cadastrar'} Freelancer</h4>
              <form onSubmit={handleSalvarFreelancer}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={s.label}>Nome *</label>
                    <input type="text" value={formFreelancer.nome || ''} onChange={e => setFormFreelancer({ ...formFreelancer, nome: e.target.value })} style={s.input} required />
                  </div>
                  <div>
                    <label style={s.label}>Função</label>
                    <input type="text" placeholder="Ex: Garçom, Bartender..." value={formFreelancer.cargo || ''} onChange={e => setFormFreelancer({ ...formFreelancer, cargo: e.target.value })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Chave PIX</label>
                    <input type="text" value={formFreelancer.chavePix || ''} onChange={e => setFormFreelancer({ ...formFreelancer, chavePix: e.target.value })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Telefone / WhatsApp</label>
                    <input type="tel" value={formFreelancer.telefone || ''} onChange={e => setFormFreelancer({ ...formFreelancer, telefone: e.target.value })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Valor por Dobra (R$)</label>
                    <input type="number" step="10" min="0" value={formFreelancer.valorDobra ?? 120} onChange={e => setFormFreelancer({ ...formFreelancer, valorDobra: parseFloat(e.target.value) || 0 })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Status</label>
                    <select value={formFreelancer.ativo ? 'true' : 'false'} onChange={e => setFormFreelancer({ ...formFreelancer, ativo: e.target.value === 'true' })} style={s.select}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                  <button type="submit" style={s.btn('#43a047')}>{editandoFreelancerId ? '💾 Salvar' : '✅ Cadastrar'}</button>
                  {editandoFreelancerId && (
                    <button type="button" onClick={() => { setFormFreelancer({ nome: '', chavePix: '', telefone: '', valorDobra: 120, cargo: '', ativo: true }); setEditandoFreelancerId(null); }}
                      style={s.btn('#9e9e9e')}>✕ Cancelar</button>
                  )}
                </div>
              </form>
            </div>

            {/* Tabela de escalas de freelancers para o mês */}
            {freelancers.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>📅 Escala de Freelancers — {mesAno}</h4>
                <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>
                  Código: <strong>D</strong>=Dia, <strong>N</strong>=Noite, <strong>DN</strong>=Dobra, <strong>—</strong>=Folga/não escalado
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, textAlign: 'left', minWidth: '120px' }}>Freelancer</th>
                        <th style={{ ...s.th, textAlign: 'left', minWidth: '80px' }}>Função</th>
                        {dias.map(d => {
                          const ds = fmtData(d);
                          const dow = d.getDay();
                          const isFeriado = !!FERIADOS_2026[ds];
                          const isWeekend = dow === 4 || dow === 5 || dow === 6;
                          return (
                            <th key={ds} title={isFeriado ? FERIADOS_2026[ds] : DIAS_SEMANA_FULL[dow]} style={{
                              ...s.th, minWidth: '38px',
                              backgroundColor: isFeriado ? '#b71c1c' : isWeekend ? '#1976d2' : dow === 0 || dow === 1 ? '#37474f' : '#1565c0',
                            }}>
                              <div style={{ fontSize: '10px' }}>{d.getDate()}</div>
                              <div style={{ fontSize: '8px', opacity: 0.85 }}>{DIAS_SEMANA[dow]}</div>
                            </th>
                          );
                        })}
                        <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '40px' }}>Dobras</th>
                        <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '70px' }}>Total R$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freelancers.filter(f => f.ativo).map((f, fi) => {
                        let dobras = 0;
                        const escalasFreel = escalasMap[f.id] || {};
                        return (
                          <tr key={f.id} style={{ backgroundColor: fi % 2 === 0 ? '#fafafa' : 'white' }}>
                            <td style={{ ...s.td, textAlign: 'left', fontWeight: 'bold', paddingLeft: '8px', borderLeft: '3px solid #c2185b' }}>
                              {f.nome.split(' ')[0]}
                            </td>
                            <td style={{ ...s.td, textAlign: 'left', fontSize: '10px', color: '#666' }}>{f.cargo || '—'}</td>
                            {dias.map(d => {
                              const ds = fmtData(d);
                              const esc = escalasFreel[ds];
                              if (esc?.turno === 'DiaNoite') dobras++;
                              else if (esc?.turno === 'Dia' || esc?.turno === 'Noite') dobras += 0.5;
                              const label = !esc?.turno ? '—' :
                                esc.turno === 'Dia' ? 'D' :
                                esc.turno === 'Noite' ? 'N' :
                                esc.turno === 'DiaNoite' ? 'DN' : 'F';
                              const bg = !esc?.turno ? 'transparent' :
                                esc.turno === 'DiaNoite' ? '#e8f5e9' :
                                esc.turno === 'Dia' ? '#fff9c4' :
                                esc.turno === 'Noite' ? '#e8eaf6' : '#fce4ec';
                              const color = !esc?.turno ? '#bbb' :
                                esc.turno === 'DiaNoite' ? '#2e7d32' :
                                esc.turno === 'Dia' ? '#f57f17' :
                                esc.turno === 'Noite' ? '#3949ab' : '#c62828';
                              return (
                                <td key={ds} style={{ ...s.td, backgroundColor: FERIADOS_2026[ds] ? '#fff3e0' : undefined }}>
                                  <span style={{ fontSize: '10px', fontWeight: 'bold', color, backgroundColor: bg, padding: '1px 4px', borderRadius: '4px' }}>
                                    {label}
                                  </span>
                                </td>
                              );
                            })}
                            <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32', fontSize: '11px' }}>{dobras}</td>
                            <td style={{ ...s.td, fontWeight: 'bold', color: '#1976d2', fontSize: '11px' }}>
                              R$ {((f.valorDobra || 120) * dobras).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA EDITAR TURNO ──────────────────────────────────── */}
        {aba === 'editar' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', maxWidth: '640px' }}>
            <h3 style={{ marginTop: 0 }}>✏️ Lançar / Editar Turno Manual</h3>
            <p style={{ color: '#666', fontSize: '13px' }}>
              Registre exceções: folga inesperada, turno extra ou troca de horário.
              Salvar como <strong>Folga</strong> remove o turno existente.
            </p>
            <form onSubmit={handleSalvarEscalaManual}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Colaborador / Freelancer *</label>
                  <select value={formEscala.colaboradorId} onChange={e => setFormEscala({ ...formEscala, colaboradorId: e.target.value })} style={s.select} required>
                    <option value="">Selecione...</option>
                    <optgroup label="— CLT —">
                      {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.cargo}</option>)}
                    </optgroup>
                    {freelancers.length > 0 && (
                      <optgroup label="— Freelancers —">
                        {freelancers.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome} (Freelancer)</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Data *</label>
                  <input type="date" value={formEscala.data} onChange={e => setFormEscala({ ...formEscala, data: e.target.value })} style={s.input} required />
                  {formEscala.data && (
                    <small style={{ color: '#666', fontSize: '11px' }}>
                      {DIAS_SEMANA_FULL[new Date(formEscala.data + 'T12:00:00').getDay()]}
                      {FERIADOS_2026[formEscala.data] && <span style={{ color: '#c62828' }}> 🎉 {FERIADOS_2026[formEscala.data]}</span>}
                    </small>
                  )}
                </div>
                <div>
                  <label style={s.label}>Turno *</label>
                  <select value={formEscala.turno} onChange={e => setFormEscala({ ...formEscala, turno: e.target.value })} style={s.select} required>
                    <option value="Dia">☀️ Dia</option>
                    <option value="Noite">🌙 Noite</option>
                    <option value="DiaNoite">☀️🌙 Dobra (Dia + Noite)</option>
                    <option value="Folga">🏖 Folga (remover turno)</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Observação</label>
                  <input type="text" placeholder="Ex: Folga por atestado, dobra extra, troca com colega..." value={formEscala.observacao} onChange={e => setFormEscala({ ...formEscala, observacao: e.target.value })} style={s.input} />
                </div>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={salvando} style={s.btn('#1976d2')}>
                  {salvando ? '⏳ Salvando...' : '💾 Salvar'}
                </button>
                <button type="button" onClick={() => setFormEscala({ colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '' })} style={s.btn('#9e9e9e')}>
                  ✕ Limpar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── ABA REGRAS ────────────────────────────────────────── */}
        {aba === 'regras' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>📖 Regras de Escala por Cargo</h3>
              <button onClick={() => setRegras(REGRAS_PADRAO)} style={s.btn('#9e9e9e')}>🔄 Restaurar Padrão</button>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cargo</th>
                    {DIAS_SEMANA_FULL.map(d => <th key={d} style={{ padding: '8px 8px', textAlign: 'center' }}>{d}</th>)}
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {regras.map((regra, i) => (
                    <tr key={regra.cargo} style={{ backgroundColor: i % 2 === 0 ? '#f5f5f5' : 'white' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 'bold', borderLeft: `4px solid ${regra.cor}` }}>{regra.label}</td>
                      {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                        const trabalha = regra.diasTrabalho.includes(dow);
                        const noite = regra.turnoNoite.includes(dow);
                        const turno = !trabalha ? '' : noite ? 'DiaNoite' : 'Dia';
                        const b = BADGE_TURNO[turno] || BADGE_TURNO[''];
                        return (
                          <td key={dow} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{ backgroundColor: turno ? b.bg : '#f5f5f5', color: turno ? b.color : '#bbb', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                              {!turno ? '🏖 Folga' : b.label}
                            </span>
                          </td>
                        );
                      })}
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button onClick={() => setEditandoRegra({ ...regra })} style={{ ...s.btn('#1976d2'), padding: '4px 10px', fontSize: '11px' }}>✏️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Editar regra inline */}
            {editandoRegra && (
              <div style={{ ...s.card, borderTop: '3px solid #1976d2', marginTop: '10px' }}>
                <h4 style={{ marginTop: 0, color: '#1976d2' }}>✏️ Editando Regra: {editandoRegra.label}</h4>
                <div style={{ marginBottom: '12px' }}>
                  <label style={s.label}>Dias que trabalha (clique para alternar):</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {DIAS_SEMANA_FULL.map((d, dow) => (
                      <button key={dow} type="button" onClick={() => {
                        const dt = editandoRegra.diasTrabalho.includes(dow)
                          ? editandoRegra.diasTrabalho.filter(x => x !== dow)
                          : [...editandoRegra.diasTrabalho, dow].sort();
                        setEditandoRegra({ ...editandoRegra, diasTrabalho: dt });
                      }} style={{
                        padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                        backgroundColor: editandoRegra.diasTrabalho.includes(dow) ? '#1976d2' : '#f5f5f5',
                        color: editandoRegra.diasTrabalho.includes(dow) ? 'white' : '#666',
                      }}>
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Dias com turno noite/dobra (clique para alternar):</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {DIAS_SEMANA_FULL.map((d, dow) => (
                      <button key={dow} type="button" onClick={() => {
                        const tn = editandoRegra.turnoNoite.includes(dow)
                          ? editandoRegra.turnoNoite.filter(x => x !== dow)
                          : [...editandoRegra.turnoNoite, dow].sort();
                        setEditandoRegra({ ...editandoRegra, turnoNoite: tn });
                      }} style={{
                        padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                        backgroundColor: editandoRegra.turnoNoite.includes(dow) ? '#3949ab' : '#f5f5f5',
                        color: editandoRegra.turnoNoite.includes(dow) ? 'white' : '#666',
                      }}>
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => {
                    setRegras(prev => prev.map(r => r.cargo === editandoRegra.cargo ? editandoRegra : r));
                    setEditandoRegra(null);
                    alert('✅ Regra salva! (válida apenas nesta sessão – será persistida em breve)');
                  }} style={s.btn('#43a047')}>💾 Salvar Regra</button>
                  <button onClick={() => setEditandoRegra(null)} style={s.btn('#9e9e9e')}>✕ Cancelar</button>
                </div>
              </div>
            )}

            {/* Política de folgas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '20px' }}>
              <div style={{ ...s.card, borderLeft: '4px solid #c62828' }}>
                <h4 style={{ marginTop: 0, color: '#c62828' }}>🏖 Política de Folgas</h4>
                <ul style={{ fontSize: '13px', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
                  <li><strong>Segunda-feira:</strong> folga geral (todos)</li>
                  <li><strong>Domingo:</strong> folga planejada – pode ser trocada para outro dia para colaboradores CLT</li>
                  <li>Exceções lançadas manualmente na aba "Editar Turno"</li>
                </ul>
              </div>
              <div style={{ ...s.card, borderLeft: '4px solid #f57f17' }}>
                <h4 style={{ marginTop: 0, color: '#f57f17' }}>📋 Regras Gerais</h4>
                <ul style={{ fontSize: '13px', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
                  <li><strong>Ter e Qua:</strong> todos exceto Pizzaiolo trabalham só Dia</li>
                  <li><strong>Qui a Dom:</strong> todos que têm noite fazem dobra</li>
                  <li><strong>Freelancers:</strong> são escalados manualmente via aba "Editar Turno"</li>
                  <li>Feriados destacados em <span style={{ color: '#b71c1c' }}>vermelho</span> no calendário</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};
