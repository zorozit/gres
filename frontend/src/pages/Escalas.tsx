import React, { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/* ─── Regras de escala por cargo ────────────────────────────────────────────
  · Terça (2) e Quarta (3): trabalham de DIA apenas (exceto pizzaiolo)
  · Quinta (4) a Domingo (7): todos trabalham de DIA
  · Noite: trabalham os que "dobram" — motoboys CLT, pizzaiolo, e quem for
    escalado manualmente como noite
  · Segunda (1): FOLGA para todos (exceto exceções manuais)
─────────────────────────────────────────────────────────────────────────── */

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// day-of-week (0=dom, 1=seg … 6=sáb) → turno padrão
// retorna '' = folga, 'Dia' = só dia, 'DiaNoite' = dobra
type TurnoPadrao = '' | 'Dia' | 'DiaNoite';

function turnoEsperado(cargo: string, dow: number, podeNoite: boolean): TurnoPadrao {
  const c = cargo.toLowerCase();
  const isPizzaiolo = c.includes('pizzaiolo');
  const isMotoboy   = c.includes('motoboy');

  // Domingo (0) / Segunda (1) → folga geral
  if (dow === 0 || dow === 1) return '';

  // Terça (2) / Quarta (3) → só dia (exceto pizzaiolo que dobra)
  if (dow === 2 || dow === 3) {
    if (isPizzaiolo) return 'DiaNoite';
    return 'Dia';
  }

  // Quinta (4) → Sábado (6) → trabalha, noite para quem dobra
  if (podeNoite || isPizzaiolo || isMotoboy) return 'DiaNoite';
  return 'Dia';
}

interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  tipoContrato?: string;
  podeTrabalharDia?: boolean;
  podeTrabalharNoite?: boolean;
  ativo?: boolean;
  unitId?: string;
}

interface Escala {
  id: string;
  colaboradorId: string;
  colaboradorNome?: string;
  cargo?: string;
  data: string; // YYYY-MM-DD
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  observacao?: string;
  unitId?: string;
  createdAt?: string;
}

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

export const Escalas: React.FC = () => {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<'mensal' | 'editar' | 'regras'>('mensal');

  // Form para edição manual
  const [formEscala, setFormEscala] = useState<{
    colaboradorId: string;
    data: string;
    turno: string;
    observacao: string;
  }>({ colaboradorId: '', data: fmtData(hoje), turno: 'Dia', observacao: '' });

  const [ano, mes] = mesAno.split('-').map(Number);
  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);

  useEffect(() => { if (unitId) { fetchColaboradores(); fetchEscalas(); } }, [unitId, mesAno]);

  const fetchColaboradores = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setColaboradores((Array.isArray(d) ? d : []).filter((c: Colaborador) => c.ativo !== false));
    } catch (e) { console.error(e); }
  };

  const fetchEscalas = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setEscalas(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Gerar escala automaticamente para o mês inteiro com base nas regras de cargo
  const gerarEscalaAutomatica = async () => {
    if (!window.confirm(`Gerar escala automática para ${mesAno} com base nas regras de cargo?\nEscalas manuais existentes serão mantidas.`)) return;
    setSalvando(true);

    const token = localStorage.getItem('auth_token');
    let criados = 0;
    for (const colab of colaboradores) {
      for (const dia of dias) {
        const dow = dia.getDay();
        const dataStr = fmtData(dia);

        // Pular se já existe escala manual para esse colaborador/dia
        const jaExiste = escalas.some(e => e.colaboradorId === colab.id && e.data === dataStr);
        if (jaExiste) continue;

        const podeNoite = colab.podeTrabalharNoite || false;
        const turno = turnoEsperado(colab.cargo, dow, podeNoite);
        if (!turno) continue; // folga: não cria registro

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

  const handleSalvarEscalaManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEscala.colaboradorId || !formEscala.data) { alert('Preencha colaborador e data.'); return; }
    setSalvando(true);
    try {
      const token = localStorage.getItem('auth_token');
      // Remover escala existente desse dia/colaborador antes de criar nova
      const existente = escalas.find(e => e.colaboradorId === formEscala.colaboradorId && e.data === formEscala.data);
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
    } catch (err) { alert('Erro ao salvar escala'); }
    finally { setSalvando(false); }
  };

  // Mapa: colaboradorId → data → Escala
  const escalasMap = useMemo(() => {
    const m: Record<string, Record<string, Escala>> = {};
    for (const e of escalas) {
      if (!m[e.colaboradorId]) m[e.colaboradorId] = {};
      m[e.colaboradorId][e.data] = e;
    }
    return m;
  }, [escalas]);

  // Resumo por colaborador
  const resumos = useMemo(() => {
    return colaboradores.map(c => {
      let dia = 0, noite = 0, dobra = 0, folgas = 0;
      for (const d of dias) {
        const dataStr = fmtData(d);
        const esc = escalasMap[c.id]?.[dataStr];
        const turno = esc?.turno;
        if (turno === 'Dia') dia++;
        else if (turno === 'Noite') noite++;
        else if (turno === 'DiaNoite') dobra++;
        else {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 1) {
            // sem escala em dia que deveria trabalhar = ausência
          } else folgas++;
        }
      }
      return { id: c.id, nome: c.nome, cargo: c.cargo, dia, noite, dobra, folgas };
    });
  }, [colaboradores, dias, escalasMap]);

  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    tab: (a: boolean) => ({
      padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
    }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px 6px', fontSize: '11px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td: { padding: '6px 4px', borderBottom: '1px solid #f0f0f0', fontSize: '11px', textAlign: 'center' as const, verticalAlign: 'middle' as const },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '10px 20px', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
  };

  const badgeCell = (turno: string | undefined, dow: number, cargo: string, podeNoite: boolean) => {
    const esperado = turnoEsperado(cargo, dow, podeNoite);
    const real = turno || (dow === 0 || dow === 1 ? 'Folga' : '');
    const b = BADGE_TURNO[real] || BADGE_TURNO[''];
    const diverge = turno && turno !== esperado && esperado !== '';
    return (
      <span style={{
        display: 'inline-block', padding: '2px 6px', borderRadius: '10px',
        backgroundColor: b.bg, color: b.color, fontSize: '10px', fontWeight: 'bold',
        border: diverge ? '2px solid #e53935' : 'none'
      }}>
        {b.label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📅 Gestão de Escalas" showBack={true} />
      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* Cabeçalho + controles */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '160px' }} />
          </div>
          <button onClick={fetchEscalas} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={gerarEscalaAutomatica} disabled={salvando} style={s.btn('#43a047')}>
            {salvando ? '⏳ Gerando...' : '⚡ Gerar Escala Automática'}
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e0e0e0', marginBottom: '0' }}>
          <button style={s.tab(aba === 'mensal')} onClick={() => setAba('mensal')}>📋 Visão Mensal</button>
          <button style={s.tab(aba === 'editar')} onClick={() => setAba('editar')}>✏️ Editar Turno</button>
          <button style={s.tab(aba === 'regras')} onClick={() => setAba('regras')}>📖 Regras de Escala</button>
        </div>

        {/* ── ABA MENSAL ─────────────────────────────────────────────── */}
        {aba === 'mensal' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '30px', color: '#999' }}>Carregando escalas...</p>
            ) : (
              <>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px' }}>
                  {Object.entries(BADGE_TURNO).filter(([k]) => k).map(([k, v]) => (
                    <span key={k} style={{ backgroundColor: v.bg, color: v.color, padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {v.label}
                    </span>
                  ))}
                  <span style={{ color: '#e53935' }}>🔴 = diverge do padrão</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, textAlign: 'left', minWidth: '140px' }}>Colaborador</th>
                      <th style={{ ...s.th, textAlign: 'left', minWidth: '90px' }}>Cargo</th>
                      {dias.map(d => (
                        <th key={fmtData(d)} style={{
                          ...s.th,
                          backgroundColor: d.getDay() === 0 || d.getDay() === 1 ? '#37474f' : '#1565c0',
                          minWidth: '54px'
                        }}>
                          <div>{d.getDate()}</div>
                          <div style={{ fontSize: '9px', opacity: 0.8 }}>{DIAS_SEMANA[d.getDay()]}</div>
                        </th>
                      ))}
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '40px' }}>☀️</th>
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '40px' }}>🌙</th>
                      <th style={{ ...s.th, backgroundColor: '#0d47a1', minWidth: '40px' }}>2x</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradores.map((c, ci) => {
                      const r = resumos.find(x => x.id === c.id)!;
                      return (
                        <tr key={c.id} style={{ backgroundColor: ci % 2 === 0 ? '#fafafa' : 'white' }}>
                          <td style={{ ...s.td, textAlign: 'left', fontWeight: 'bold', paddingLeft: '8px' }}>{c.nome.split(' ').slice(0, 2).join(' ')}</td>
                          <td style={{ ...s.td, textAlign: 'left', fontSize: '10px', color: '#666' }}>{c.cargo}</td>
                          {dias.map(d => {
                            const dataStr = fmtData(d);
                            const esc = escalasMap[c.id]?.[dataStr];
                            return (
                              <td key={dataStr} style={s.td}>
                                {badgeCell(esc?.turno, d.getDay(), c.cargo, c.podeTrabalharNoite || false)}
                              </td>
                            );
                          })}
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#f57f17' }}>{r?.dia + (r?.dobra || 0)}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#3949ab' }}>{r?.noite + (r?.dobra || 0)}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32' }}>{r?.dobra}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Resumo totais */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '16px' }}>
                  {resumos.map(r => (
                    <div key={r.id} style={{ ...s.card, padding: '10px', borderLeft: '3px solid #1976d2' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{r.nome.split(' ')[0]}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{r.cargo}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <span style={{ ...BADGE_TURNO.Dia, padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', backgroundColor: BADGE_TURNO.Dia.bg, color: BADGE_TURNO.Dia.color }}>
                          ☀️ {r.dia + r.dobra}d
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8eaf6', color: '#3949ab' }}>
                          🌙 {r.noite + r.dobra}n
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                          2x {r.dobra}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA EDITAR TURNO ──────────────────────────────────────── */}
        {aba === 'editar' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', maxWidth: '600px' }}>
            <h3 style={{ marginTop: 0 }}>✏️ Editar / Lançar Turno Manual</h3>
            <p style={{ color: '#666', fontSize: '13px' }}>
              Use para registrar exceções: folga inesperada, turno extra ou troca de horário.
              Ao salvar <strong>Folga</strong>, o turno existente é removido.
            </p>
            <form onSubmit={handleSalvarEscalaManual}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Colaborador *</label>
                  <select value={formEscala.colaboradorId} onChange={e => setFormEscala({ ...formEscala, colaboradorId: e.target.value })} style={s.select} required>
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.cargo}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Data *</label>
                  <input type="date" value={formEscala.data} onChange={e => setFormEscala({ ...formEscala, data: e.target.value })} style={s.input} required />
                  {formEscala.data && (
                    <small style={{ color: '#666' }}>
                      {DIAS_SEMANA_FULL[new Date(formEscala.data + 'T12:00:00').getDay()]}
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
                  <input type="text" placeholder="Ex: Folga por atestado, dobra extra..." value={formEscala.observacao} onChange={e => setFormEscala({ ...formEscala, observacao: e.target.value })} style={s.input} />
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

        {/* ── ABA REGRAS ────────────────────────────────────────────── */}
        {aba === 'regras' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <h3 style={{ marginTop: 0 }}>📖 Regras de Escala</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              <div style={{ ...s.card, borderLeft: '4px solid #f57f17' }}>
                <h4 style={{ marginTop: 0, color: '#f57f17' }}>☀️ Turno de Dia</h4>
                <ul style={{ fontSize: '14px', lineHeight: 1.8, paddingLeft: '18px' }}>
                  <li><strong>Terça e Quarta:</strong> todos exceto pizzaiolo</li>
                  <li><strong>Quinta a Domingo:</strong> todos os colaboradores</li>
                  <li><strong>Exceções:</strong> editadas manualmente</li>
                </ul>
              </div>
              <div style={{ ...s.card, borderLeft: '4px solid #3949ab' }}>
                <h4 style={{ marginTop: 0, color: '#3949ab' }}>🌙 Turno de Noite (dobra)</h4>
                <ul style={{ fontSize: '14px', lineHeight: 1.8, paddingLeft: '18px' }}>
                  <li><strong>Pizzaiolo:</strong> todos os dias que trabalha</li>
                  <li><strong>Motoboys CLT:</strong> previsto em contrato, Qui–Dom</li>
                  <li><strong>Demais com podeTrabalharNoite=true:</strong> Qui–Dom</li>
                  <li><strong>Terça/Quarta:</strong> apenas pizzaiolo dobra</li>
                </ul>
              </div>
              <div style={{ ...s.card, borderLeft: '4px solid #c62828' }}>
                <h4 style={{ marginTop: 0, color: '#c62828' }}>🏖 Folgas Automáticas</h4>
                <ul style={{ fontSize: '14px', lineHeight: 1.8, paddingLeft: '18px' }}>
                  <li><strong>Domingo:</strong> folga geral</li>
                  <li><strong>Segunda:</strong> folga geral</li>
                  <li>Exceções manuais podem ser lançadas na aba "Editar Turno"</li>
                </ul>
              </div>
              <div style={{ ...s.card, borderLeft: '4px solid #2e7d32' }}>
                <h4 style={{ marginTop: 0, color: '#2e7d32' }}>⚡ Geração Automática</h4>
                <ul style={{ fontSize: '14px', lineHeight: 1.8, paddingLeft: '18px' }}>
                  <li>Clique em <strong>"Gerar Escala Automática"</strong> para preencher o mês inteiro pelas regras acima.</li>
                  <li>Lançamentos manuais existentes NÃO são sobrescritos.</li>
                  <li>Após gerar, use "Editar Turno" para exceções pontuais.</li>
                </ul>
              </div>
            </div>

            {/* Tabela de cargos e turnos esperados */}
            <h4 style={{ marginTop: '20px' }}>Resumo por Cargo</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cargo</th>
                    {DIAS_SEMANA_FULL.map(d => <th key={d} style={{ padding: '8px 8px' }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { cargo: 'Pizzaiolo', podeNoite: true },
                    { cargo: 'Motoboy CLT', podeNoite: true },
                    { cargo: 'Cozinheiro', podeNoite: false },
                    { cargo: 'Atendente', podeNoite: false },
                    { cargo: 'Auxiliar', podeNoite: false },
                  ].map((row, i) => (
                    <tr key={row.cargo} style={{ backgroundColor: i % 2 === 0 ? '#f5f5f5' : 'white' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>{row.cargo}</td>
                      {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                        const t = turnoEsperado(row.cargo, dow, row.podeNoite);
                        const b = BADGE_TURNO[t] || BADGE_TURNO['Folga'];
                        return (
                          <td key={dow} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{ backgroundColor: b.bg, color: b.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                              {t === '' ? '🏖 Folga' : b.label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};
