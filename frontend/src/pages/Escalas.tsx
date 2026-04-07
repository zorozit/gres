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

/* ─── Tipos ──────────────────────────────────────────────────────────────── */
interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  funcao?: string;    // função na escala (personalizável)
  area?: string;      // área de trabalho
  tipoContrato?: string;
  podeTrabalharNoite?: boolean;
  ativo?: boolean;
  unitId?: string;
  chavePix?: string;
  telefone?: string;
}

interface FuncaoEscala {
  id: string;
  nome: string;
  area?: string;
  cor: string;
  diasTrabalho: number[];
  turnoNoite: number[];
}

interface Escala {
  id: string;
  colaboradorId: string;
  colaboradorNome?: string;
  cargo?: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  observacao?: string;
  presenca?: 'presente' | 'falta' | 'falta_justificada';
  unitId?: string;
}

interface Freelancer {
  id: string;
  nome: string;
  chavePix?: string;
  telefone?: string;
  valorDobra?: number;
  cargo?: string;
  funcao?: string;
  area?: string;
  ativo: boolean;
  unitId?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function diasDoMes(ano: number, mes: number): Date[] {
  const dias: Date[] = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) { dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}

function fmtData(d: Date) { return d.toISOString().split('T')[0]; }

const DIAS_SEMANA       = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DIAS_SEMANA_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const BADGE_TURNO: Record<string, { bg: string; color: string; label: string }> = {
  Dia:      { bg: '#fff9c4', color: '#f57f17', label: '☀️ Dia' },
  Noite:    { bg: '#e8eaf6', color: '#3949ab', label: '🌙 Noite' },
  DiaNoite: { bg: '#e8f5e9', color: '#2e7d32', label: '☀️🌙 Dobra' },
  Folga:    { bg: '#fce4ec', color: '#c62828', label: '🏖 Folga' },
  '':       { bg: '#f5f5f5', color: '#9e9e9e', label: '—' },
};

const PRESENCA_BADGE: Record<string, { bg: string; color: string; icon: string }> = {
  presente:         { bg: '#e8f5e9', color: '#2e7d32', icon: '✅' },
  falta:            { bg: '#fce4ec', color: '#c62828', icon: '❌' },
  falta_justificada:{ bg: '#fff3e0', color: '#e65100', icon: '⚠️' },
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Escalas: React.FC = () => {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const hoje = new Date();
  const [mesAno, setMesAno]   = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [freelancers, setFreelancers]     = useState<Freelancer[]>([]);
  const [escalas, setEscalas]             = useState<Escala[]>([]);
  const [funcoes, setFuncoes]             = useState<FuncaoEscala[]>([]);
  const [loading, setLoading]             = useState(false);
  const [salvando, setSalvando]           = useState(false);

  type AbaType = 'mensal' | 'presencas' | 'editar';
  const [aba, setAba]                     = useState<AbaType>('mensal');
  const [filtroArea, setFiltroArea]       = useState('Todos');
  const [filtroFuncao, setFiltroFuncao]   = useState('Todos');
  const [mostrarFolgas, setMostrarFolgas] = useState(false);

  // Form edição manual
  const [formEscala, setFormEscala] = useState({
    colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '',
  });

  // Presenças — mapa local: colaboradorId → data → presenca
  const [presencaMap, setPresencaMap] = useState<Record<string, Record<string, string>>>({});
  const [salvandoPresenca, setSalvandoPresenca] = useState(false);

  const [ano, mes] = mesAno.split('-').map(Number);
  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);

  useEffect(() => {
    if (unitId) { fetchColaboradores(); fetchEscalas(); fetchFreelancers(); fetchFuncoes(); }
  }, [unitId, mesAno]);

  /* ── Fetch ──────────────────────────────────────────────── */
  const token = () => localStorage.getItem('auth_token');

  const fetchColaboradores = async () => {
    try {
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      setColaboradores((Array.isArray(d) ? d : []).filter((c: Colaborador) => c.ativo !== false));
    } catch (e) { console.error(e); }
  };

  const fetchEscalas = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      const lista: Escala[] = Array.isArray(d) ? d : [];
      setEscalas(lista);
      // Reconstituir mapa de presenças das escalas salvas
      const pm: Record<string, Record<string, string>> = {};
      for (const e of lista) {
        if (e.presenca) {
          if (!pm[e.colaboradorId]) pm[e.colaboradorId] = {};
          pm[e.colaboradorId][e.data] = e.presenca;
        }
      }
      setPresencaMap(pm);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchFreelancers = async () => {
    try {
      const r = await fetch(`${apiUrl}/freelancers?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) { const d = await r.json(); setFreelancers(Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
  };

  const fetchFuncoes = async () => {
    try {
      const r = await fetch(`${apiUrl}/funcoes-escala?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) { const d = await r.json(); setFuncoes(Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
  };

  /* ── Helpers de função/regra ─────────────────────────────── */
  const funcaoDe = (c: Colaborador) => c.funcao || c.cargo || '';
  const areaDe   = (c: Colaborador) => c.area || '';

  const regraByFuncao = useCallback((funcaoNome: string): FuncaoEscala | undefined => {
    return funcoes.find(f => f.nome.toLowerCase() === funcaoNome.toLowerCase())
      || funcoes.find(f => funcaoNome.toLowerCase().includes(f.nome.toLowerCase()));
  }, [funcoes]);

  const turnoEsperado = useCallback((c: Colaborador, dow: number): string => {
    const regra = regraByFuncao(funcaoDe(c));
    if (!regra) {
      if (dow === 0 || dow === 1) return '';
      return 'Dia';
    }
    if (!(regra.diasTrabalho || []).includes(dow)) return '';
    if ((regra.turnoNoite || []).includes(dow)) return 'DiaNoite';
    return 'Dia';
  }, [regraByFuncao]);

  const corFuncao = useCallback((c: Colaborador): string => {
    const regra = regraByFuncao(funcaoDe(c));
    return regra?.cor || '#1976d2';
  }, [regraByFuncao]);

  /* ── Gerar automático ────────────────────────────────────── */
  const gerarEscalaAutomatica = async () => {
    if (!window.confirm(`Gerar escala automática para ${mesAno}?\nEscalas existentes não serão sobrescritas.`)) return;
    setSalvando(true);
    let criados = 0;
    const todosColabs = [
      ...colaboradores,
      ...freelancers.filter(f => f.ativo).map(f => ({
        id: f.id, nome: f.nome, cargo: f.cargo || '', funcao: f.funcao || f.cargo || '',
        area: (f as any).area || '', tipoContrato: 'Freelancer', ativo: true,
      } as Colaborador)),
    ];
    for (const colab of todosColabs) {
      for (const dia of dias) {
        const dow = dia.getDay();
        const dataStr = fmtData(dia);
        if (escalas.some(e => e.colaboradorId === colab.id && e.data === dataStr)) continue;
        const turno = turnoEsperado(colab, dow);
        if (!turno) continue;
        try {
          await fetch(`${apiUrl}/escalas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
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

  /* ── Salvar turno manual ─────────────────────────────────── */
  const handleSalvarEscalaManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEscala.colaboradorId || !formEscala.data) { alert('Preencha colaborador e data.'); return; }
    setSalvando(true);
    try {
      const existente = escalas.find(x => x.colaboradorId === formEscala.colaboradorId && x.data === formEscala.data);
      if (existente) {
        await fetch(`${apiUrl}/escalas/${existente.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      }
      if (formEscala.turno !== 'Folga') {
        await fetch(`${apiUrl}/escalas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ ...formEscala, unitId }),
        });
      }
      alert('✅ Escala salva!');
      setFormEscala({ colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '' });
      fetchEscalas();
    } catch { alert('Erro ao salvar escala'); }
    finally { setSalvando(false); }
  };

  /* ── Pontuar presença ────────────────────────────────────── */
  const handlePresenca = useCallback(async (colaboradorId: string, data: string, valor: string) => {
    // Atualiza localmente imediato
    setPresencaMap(prev => ({
      ...prev,
      [colaboradorId]: { ...(prev[colaboradorId] || {}), [data]: valor },
    }));
    // Persiste na escala correspondente
    setSalvandoPresenca(true);
    try {
      const escala = escalas.find(e => e.colaboradorId === colaboradorId && e.data === data);
      if (escala) {
        await fetch(`${apiUrl}/escalas/${escala.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ ...escala, presenca: valor }),
        });
      } else if (valor !== '') {
        // Cria escala de presença sem turno definido
        await fetch(`${apiUrl}/escalas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ unitId, colaboradorId, data, turno: 'Dia', presenca: valor }),
        });
      }
    } catch (e) { console.error('Erro ao salvar presença:', e); }
    finally { setSalvandoPresenca(false); }
  }, [escalas, apiUrl, unitId]);

  /* ── Mapas memoizados ────────────────────────────────────── */
  const escalasMap = useMemo(() => {
    const m: Record<string, Record<string, Escala>> = {};
    for (const e of escalas) {
      if (!m[e.colaboradorId]) m[e.colaboradorId] = {};
      m[e.colaboradorId][e.data] = e;
    }
    return m;
  }, [escalas]);

  // Todos os colaboradores (CLT + Freelancers) para o grid
  const todosColaboradores = useMemo<Colaborador[]>(() => [
    ...colaboradores,
    ...freelancers.filter(f => f.ativo).map(f => ({
      id: f.id, nome: f.nome, cargo: f.cargo || '', funcao: f.funcao || f.cargo || '',
      area: (f as any).area || '', tipoContrato: 'Freelancer', ativo: true,
    } as Colaborador)),
  ], [colaboradores, freelancers]);

  // Agrupado por Área
  const colabsPorArea = useMemo(() => {
    const areas: Record<string, Colaborador[]> = {};
    for (const c of todosColaboradores) {
      const a = areaDe(c) || 'Sem Área';
      if (!areas[a]) areas[a] = [];
      areas[a].push(c);
    }
    return areas;
  }, [todosColaboradores]);

  const areasOrdenadas = useMemo(() => Object.keys(colabsPorArea).sort(), [colabsPorArea]);

  // Filtro de área e função
  const colaboradoresFiltrados = useMemo(() => {
    return todosColaboradores.filter(c => {
      const matchArea   = filtroArea   === 'Todos' || (areaDe(c) || 'Sem Área') === filtroArea;
      const matchFuncao = filtroFuncao === 'Todos' || funcaoDe(c) === filtroFuncao;
      return matchArea && matchFuncao;
    });
  }, [todosColaboradores, filtroArea, filtroFuncao]);

  // Resumos
  const resumos = useMemo(() => {
    return todosColaboradores.map(c => {
      let dia = 0, noite = 0, dobra = 0, presentes = 0, faltas = 0, faltasJ = 0;
      for (const d of dias) {
        const ds  = fmtData(d);
        const esc = escalasMap[c.id]?.[ds];
        if (esc?.turno === 'Dia') dia++;
        else if (esc?.turno === 'Noite') noite++;
        else if (esc?.turno === 'DiaNoite') dobra++;
        const p = presencaMap[c.id]?.[ds];
        if (p === 'presente') presentes++;
        else if (p === 'falta') faltas++;
        else if (p === 'falta_justificada') faltasJ++;
      }
      return { id: c.id, nome: c.nome, dia, noite, dobra, presentes, faltas, faltasJ };
    });
  }, [todosColaboradores, dias, escalasMap, presencaMap]);

  // Funções únicas para filtro
  const funcoesUnicas = useMemo(() => {
    const s = new Set(todosColaboradores.map(c => funcaoDe(c)).filter(Boolean));
    return ['Todos', ...Array.from(s).sort()];
  }, [todosColaboradores]);

  /* ── Badge de célula ─────────────────────────────────────── */
  const badgeCell = useCallback((
    turno: string | undefined,
    presenca: string | undefined,
    dow: number,
    c: Colaborador,
    dataStr: string,
  ) => {
    const isFeriado = !!FERIADOS_2026[dataStr];
    const esperado  = turnoEsperado(c, dow);
    const real      = turno || (dow === 0 || dow === 1 ? 'Folga' : '');
    const b         = BADGE_TURNO[real] || BADGE_TURNO[''];
    const diverge   = turno && turno !== esperado && esperado !== '';
    const pb        = presenca ? PRESENCA_BADGE[presenca] : null;

    return (
      <span style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
        padding: '2px 4px', borderRadius: '6px',
        backgroundColor: isFeriado && !turno ? '#fce4ec' : b.bg,
        color: isFeriado && !turno ? '#c62828' : b.color,
        fontSize: '9px', fontWeight: 'bold',
        border: diverge ? '2px solid #e53935' : isFeriado ? '1px dashed #e53935' : 'none',
        minWidth: '30px',
      }} title={isFeriado ? FERIADOS_2026[dataStr] : undefined}>
        {isFeriado && !turno ? '🎉' : b.label.split(' ')[0]}
        {pb && <span style={{ fontSize: '8px', marginTop: '1px' }}>{pb.icon}</span>}
      </span>
    );
  }, [turnoEsperado]);

  /* ── Estilos ─────────────────────────────────────────────── */
  const s = {
    card:   { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    tab:    (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
      fontSize: '13px',
    }),
    th:     { backgroundColor: '#1565c0', color: 'white', padding: '7px 5px', fontSize: '10px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td:     { padding: '4px 2px', borderBottom: '1px solid #f0f0f0', fontSize: '10px', textAlign: 'center' as const, verticalAlign: 'middle' as const },
    label:  { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input:  { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn:    (bg: string) => ({ padding: '9px 18px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📅 Gestão de Escalas" showBack={true} />
      <div style={{ flex: 1, padding: '20px', maxWidth: '1700px', margin: '0 auto', width: '100%' }}>

        {/* Controles */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
              style={{ ...s.input, width: '160px' }} />
          </div>
          <div>
            <label style={s.label}>Área</label>
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
              style={{ ...s.select, width: '150px' }}>
              <option value="Todos">Todas as áreas</option>
              {areasOrdenadas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Função</label>
            <select value={filtroFuncao} onChange={e => setFiltroFuncao(e.target.value)}
              style={{ ...s.select, width: '160px' }}>
              {funcoesUnicas.map(f => <option key={f} value={f}>{f}</option>)}
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
          {salvandoPresenca && (
            <span style={{ fontSize: '12px', color: '#1976d2', paddingBottom: '6px' }}>💾 Salvando presença...</span>
          )}
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0', flexWrap: 'wrap' }}>
          <button style={s.tab(aba === 'mensal')}   onClick={() => setAba('mensal')}>📋 Visão Mensal</button>
          <button style={s.tab(aba === 'presencas')} onClick={() => setAba('presencas')}>✅ Presenças / Faltas</button>
          <button style={s.tab(aba === 'editar')}   onClick={() => setAba('editar')}>✏️ Lançar Turno</button>
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
                  <span style={{ color: '#e53935', fontWeight: 'bold', fontSize: '11px' }}>🔴 borda = diverge padrão</span>
                </div>

                {/* Grid agrupado por Área */}
                {areasOrdenadas
                  .filter(area => filtroArea === 'Todos' || area === filtroArea)
                  .map(area => {
                    const colabsArea = colaboradoresFiltrados.filter(c => (areaDe(c) || 'Sem Área') === area);
                    if (colabsArea.length === 0) return null;
                    return (
                      <div key={area} style={{ marginBottom: '28px' }}>
                        {/* Header da área */}
                        <div style={{
                          backgroundColor: '#1565c0', color: 'white',
                          padding: '8px 14px', borderRadius: '6px 6px 0 0',
                          fontWeight: 'bold', fontSize: '13px',
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                          📍 {area}
                          <span style={{ fontSize: '11px', opacity: 0.8 }}>({colabsArea.length} colaboradores)</span>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                          <thead>
                            <tr>
                              <th style={{ ...s.th, textAlign: 'left', minWidth: '120px', fontSize: '11px', backgroundColor: '#1565c0' }}>Nome</th>
                              <th style={{ ...s.th, textAlign: 'left', minWidth: '60px', fontSize: '10px', backgroundColor: '#1565c0' }}>Tipo</th>
                              <th style={{ ...s.th, textAlign: 'left', minWidth: '80px', fontSize: '10px', backgroundColor: '#1565c0' }}>Função</th>
                              {dias.map(d => {
                                const ds  = fmtData(d);
                                const dow = d.getDay();
                                const isFeriado  = !!FERIADOS_2026[ds];
                                const isWeekend  = dow === 0 || dow === 6;
                                const isFolgaDia = dow === 0 || dow === 1;
                                return (
                                  <th key={ds} title={isFeriado ? FERIADOS_2026[ds] : DIAS_SEMANA_FULL[dow]} style={{
                                    ...s.th, minWidth: '38px', padding: '4px 2px',
                                    backgroundColor: isFeriado ? '#b71c1c' : isFolgaDia ? '#37474f' : isWeekend ? '#1976d2' : '#1565c0',
                                  }}>
                                    <div style={{ fontSize: '10px' }}>{d.getDate()}</div>
                                    <div style={{ fontSize: '8px', opacity: 0.85 }}>{DIAS_SEMANA[dow]}</div>
                                    {isFeriado && <div style={{ fontSize: '7px' }}>🎉</div>}
                                  </th>
                                );
                              })}
                              <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '9px' }}>☀️</th>
                              <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '9px' }}>🌙</th>
                              <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '9px' }}>2x</th>
                            </tr>
                          </thead>
                          <tbody>
                            {colabsArea.map((c, ci) => {
                              const r  = resumos.find(x => x.id === c.id);
                              const cor = corFuncao(c);
                              const tipo = c.tipoContrato || 'CLT';
                              return (
                                <tr key={c.id} style={{ backgroundColor: ci % 2 === 0 ? '#fafafa' : 'white' }}>
                                  <td style={{ ...s.td, textAlign: 'left', fontWeight: 'bold', paddingLeft: '8px', fontSize: '11px', borderLeft: `3px solid ${cor}` }}>
                                    {c.nome.split(' ').slice(0, 2).join(' ')}
                                  </td>
                                  <td style={{ ...s.td, textAlign: 'left', fontSize: '10px' }}>
                                    <span style={{
                                      padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 'bold',
                                      backgroundColor: tipo === 'CLT' ? '#e8f5e9' : '#fff3e0',
                                      color: tipo === 'CLT' ? '#2e7d32' : '#e65100',
                                    }}>{tipo === 'CLT' ? 'CLT' : 'Free'}</span>
                                  </td>
                                  <td style={{ ...s.td, textAlign: 'left', fontSize: '10px', color: '#555' }}>
                                    {funcaoDe(c)}
                                  </td>
                                  {dias.map(d => {
                                    const ds  = fmtData(d);
                                    const esc = escalasMap[c.id]?.[ds];
                                    const presenca = presencaMap[c.id]?.[ds];
                                    const isFolga  = !mostrarFolgas && !esc?.turno && (d.getDay() === 0 || d.getDay() === 1);
                                    return (
                                      <td key={ds} style={{
                                        ...s.td,
                                        backgroundColor: FERIADOS_2026[ds] ? '#fff3e0' : undefined,
                                      }}>
                                        {!isFolga && badgeCell(esc?.turno, presenca, d.getDay(), c, ds)}
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
                      </div>
                    );
                  })}

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

                {/* Resumo por colaborador */}
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Resumo por Colaborador</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                    {resumos.filter(r => {
                      const c = todosColaboradores.find(x => x.id === r.id);
                      if (!c) return false;
                      const matchArea   = filtroArea   === 'Todos' || (areaDe(c) || 'Sem Área') === filtroArea;
                      const matchFuncao = filtroFuncao === 'Todos' || funcaoDe(c) === filtroFuncao;
                      return matchArea && matchFuncao;
                    }).map(r => {
                      const c   = todosColaboradores.find(x => x.id === r.id)!;
                      const cor = corFuncao(c);
                      return (
                        <div key={r.id} style={{ ...s.card, padding: '10px', borderLeft: `3px solid ${cor}` }}>
                          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>{r.nome.split(' ')[0]}</div>
                          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>{funcaoDe(c)}</div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#fff9c4', color: '#f57f17' }}>
                              ☀️{(r.dia || 0) + (r.dobra || 0)}
                            </span>
                            <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8eaf6', color: '#3949ab' }}>
                              🌙{(r.noite || 0) + (r.dobra || 0)}
                            </span>
                            <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                              2x{r.dobra || 0}
                            </span>
                          </div>
                          {(r.presentes > 0 || r.faltas > 0 || r.faltasJ > 0) && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {r.presentes > 0  && <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>✅{r.presentes}</span>}
                              {r.faltas   > 0  && <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#fce4ec', color: '#c62828' }}>❌{r.faltas}</span>}
                              {r.faltasJ  > 0  && <span style={{ padding: '1px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#fff3e0', color: '#e65100' }}>⚠️{r.faltasJ}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA PRESENÇAS / FALTAS ─────────────────────────────── */}
        {aba === 'presencas' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>✅ Controle de Presenças — {mesAno}</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', alignItems: 'center' }}>
                <span style={{ backgroundColor: PRESENCA_BADGE.presente.bg, color: PRESENCA_BADGE.presente.color, padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>✅ Presente</span>
                <span style={{ backgroundColor: PRESENCA_BADGE.falta.bg, color: PRESENCA_BADGE.falta.color, padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>❌ Falta</span>
                <span style={{ backgroundColor: PRESENCA_BADGE.falta_justificada.bg, color: PRESENCA_BADGE.falta_justificada.color, padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>⚠️ Falta Justificada</span>
                <span style={{ color: '#999', fontSize: '11px' }}>— = não marcado</span>
              </div>
            </div>

            <p style={{ color: '#666', fontSize: '12px', margin: '0 0 14px 0' }}>
              Clique em uma célula de dia para alternar: <strong>— → ✅ Presente → ❌ Falta → ⚠️ Justificada → —</strong>
            </p>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999' }}>Carregando...</p>
            ) : (
              <>
                {areasOrdenadas
                  .filter(area => filtroArea === 'Todos' || area === filtroArea)
                  .map(area => {
                    const colabsArea = colaboradoresFiltrados.filter(c => (areaDe(c) || 'Sem Área') === area);
                    if (colabsArea.length === 0) return null;

                    // Dias do mês que têm pelo menos 1 escala nessa área (ou todos os dias do mês)
                    return (
                      <div key={area} style={{ marginBottom: '28px' }}>
                        <div style={{
                          backgroundColor: '#2e7d32', color: 'white',
                          padding: '8px 14px', borderRadius: '6px 6px 0 0',
                          fontWeight: 'bold', fontSize: '13px',
                        }}>
                          📍 {area}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                          <thead>
                            <tr>
                              <th style={{ ...s.th, textAlign: 'left', minWidth: '130px', backgroundColor: '#2e7d32' }}>Nome</th>
                              <th style={{ ...s.th, textAlign: 'left', minWidth: '70px', backgroundColor: '#2e7d32' }}>Função</th>
                              {dias.map(d => {
                                const ds  = fmtData(d);
                                const dow = d.getDay();
                                const isFeriado = !!FERIADOS_2026[ds];
                                const isWeekend = dow === 0 || dow === 6;
                                return (
                                  <th key={ds} style={{
                                    ...s.th, minWidth: '34px', padding: '4px 2px',
                                    backgroundColor: isFeriado ? '#b71c1c' : isWeekend ? '#388e3c' : '#2e7d32',
                                  }}>
                                    <div style={{ fontSize: '10px' }}>{d.getDate()}</div>
                                    <div style={{ fontSize: '8px', opacity: 0.85 }}>{DIAS_SEMANA[dow]}</div>
                                  </th>
                                );
                              })}
                              <th style={{ ...s.th, backgroundColor: '#1b5e20', minWidth: '30px', fontSize: '9px' }}>✅</th>
                              <th style={{ ...s.th, backgroundColor: '#1b5e20', minWidth: '30px', fontSize: '9px' }}>❌</th>
                              <th style={{ ...s.th, backgroundColor: '#1b5e20', minWidth: '30px', fontSize: '9px' }}>⚠️</th>
                            </tr>
                          </thead>
                          <tbody>
                            {colabsArea.map((c, ci) => {
                              const r = resumos.find(x => x.id === c.id);
                              return (
                                <tr key={c.id} style={{ backgroundColor: ci % 2 === 0 ? '#fafafa' : 'white' }}>
                                  <td style={{ ...s.td, textAlign: 'left', fontWeight: 'bold', paddingLeft: '8px', fontSize: '11px', borderLeft: `3px solid ${corFuncao(c)}` }}>
                                    {c.nome.split(' ').slice(0, 2).join(' ')}
                                  </td>
                                  <td style={{ ...s.td, textAlign: 'left', fontSize: '10px', color: '#555' }}>
                                    {funcaoDe(c)}
                                  </td>
                                  {dias.map(d => {
                                    const ds  = fmtData(d);
                                    const esc = escalasMap[c.id]?.[ds];
                                    const p   = presencaMap[c.id]?.[ds] || '';
                                    const temEscala = !!esc?.turno && esc.turno !== 'Folga';
                                    // Só pode pontuar dias com escala
                                    const ciclo: string[] = ['', 'presente', 'falta', 'falta_justificada'];
                                    const next = ciclo[(ciclo.indexOf(p) + 1) % ciclo.length];

                                    const pb = p ? PRESENCA_BADGE[p] : null;
                                    return (
                                      <td key={ds} style={{
                                        ...s.td,
                                        cursor: temEscala ? 'pointer' : 'default',
                                        backgroundColor: FERIADOS_2026[ds] ? '#fff3e0' : pb ? pb.bg : undefined,
                                        opacity: temEscala ? 1 : 0.35,
                                      }}
                                        title={temEscala ? `${esc?.turno || ''} — clique para pontuar` : 'Sem escala neste dia'}
                                        onClick={() => { if (temEscala) handlePresenca(c.id, ds, next); }}
                                      >
                                        {pb ? (
                                          <span style={{ fontSize: '11px', color: pb.color, fontWeight: 'bold' }}>{pb.icon}</span>
                                        ) : temEscala ? (
                                          <span style={{ fontSize: '9px', color: '#bbb' }}>—</span>
                                        ) : null}
                                      </td>
                                    );
                                  })}
                                  <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32', fontSize: '11px' }}>{r?.presentes || 0}</td>
                                  <td style={{ ...s.td, fontWeight: 'bold', color: '#c62828', fontSize: '11px' }}>{r?.faltas || 0}</td>
                                  <td style={{ ...s.td, fontWeight: 'bold', color: '#e65100', fontSize: '11px' }}>{r?.faltasJ || 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        )}

        {/* ── ABA EDITAR TURNO ──────────────────────────────────── */}
        {aba === 'editar' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', maxWidth: '700px' }}>
            <h3 style={{ marginTop: 0 }}>✏️ Lançar / Editar Turno Manual</h3>
            <p style={{ color: '#666', fontSize: '13px' }}>
              Registre exceções: folga inesperada, turno extra ou troca de horário.
              Salvar como <strong>Folga</strong> remove o turno existente.
            </p>
            <form onSubmit={handleSalvarEscalaManual}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Colaborador / Freelancer *</label>
                  <select value={formEscala.colaboradorId}
                    onChange={e => setFormEscala({ ...formEscala, colaboradorId: e.target.value })}
                    style={s.select} required>
                    <option value="">Selecione...</option>
                    {areasOrdenadas.map(area => {
                      const colabsArea = todosColaboradores.filter(c => (areaDe(c) || 'Sem Área') === area);
                      if (colabsArea.length === 0) return null;
                      return (
                        <optgroup key={area} label={`— ${area} —`}>
                          {colabsArea.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.nome} — {funcaoDe(c)} ({c.tipoContrato || 'CLT'})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Data *</label>
                  <input type="date" value={formEscala.data}
                    onChange={e => setFormEscala({ ...formEscala, data: e.target.value })}
                    style={s.input} required />
                  {formEscala.data && (
                    <small style={{ color: '#666', fontSize: '11px' }}>
                      {DIAS_SEMANA_FULL[new Date(formEscala.data + 'T12:00:00').getDay()]}
                      {FERIADOS_2026[formEscala.data] && <span style={{ color: '#c62828' }}> 🎉 {FERIADOS_2026[formEscala.data]}</span>}
                    </small>
                  )}
                </div>
                <div>
                  <label style={s.label}>Turno *</label>
                  <select value={formEscala.turno}
                    onChange={e => setFormEscala({ ...formEscala, turno: e.target.value })}
                    style={s.select} required>
                    <option value="Dia">☀️ Dia</option>
                    <option value="Noite">🌙 Noite</option>
                    <option value="DiaNoite">☀️🌙 Dobra (Dia + Noite)</option>
                    <option value="Folga">🏖 Folga (remover turno)</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Observação</label>
                  <input type="text" placeholder="Ex: Folga por atestado, dobra extra..." value={formEscala.observacao}
                    onChange={e => setFormEscala({ ...formEscala, observacao: e.target.value })}
                    style={s.input} />
                </div>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={salvando} style={s.btn('#1976d2')}>
                  {salvando ? '⏳ Salvando...' : '💾 Salvar'}
                </button>
                <button type="button"
                  onClick={() => setFormEscala({ colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '' })}
                  style={s.btn('#9e9e9e')}>
                  ✕ Limpar
                </button>
              </div>
            </form>

            {/* Info: Regras de função disponíveis */}
            {funcoes.length > 0 && (
              <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #1976d2' }}>
                <strong style={{ color: '#1565c0', fontSize: '13px' }}>📖 Funções configuradas ({funcoes.length}):</strong>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {funcoes.map(f => (
                    <span key={f.id} style={{
                      padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                      backgroundColor: f.cor + '22', color: f.cor, border: `1px solid ${f.cor}`,
                    }}>
                      {f.nome} {f.area ? `(${f.area})` : ''}
                    </span>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Para editar as regras de função, acesse <strong>Gestão de Colaboradores → Funções/Regras</strong>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};
