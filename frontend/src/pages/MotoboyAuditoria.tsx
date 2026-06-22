/**
 * MotoboyAuditoria.tsx
 *
 * Módulo dedicado de auditoria de Motoboys (CLT e Freelancer).
 * Exibe grupos semanais expansíveis estilo Extrato com sub-linhas:
 *
 *  [1] Verde claro    — dias trabalhados (entradas Dia + Noite + Chegadas)
 *  [2] Verde médio    — transporte dia a dia (calculado por presenças)
 *  [3] Vermelho       — descontos de saídas (consumo, pendências)
 *  [3b] Roxo          — abatimento adiantamento especial
 *  [3c] Azul royal    — log de pagamento PIX/Dinheiro
 *  [4] Verde escuro   — subtotal do período com divergência ⚠️
 *
 * Rota: /modulos/motoboy-auditoria
 * Proteção: moduloId="folha-pagamento"
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { fetchAuth } from '../utils/fetchAuth';


/* ─── Helpers ────────────────────────────────────────────────────────────── */
const R = (v: any): number => {
  const n = parseFloat(String(v ?? 0).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const fmtMoeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataBR = (iso: string): string => {
  if (!iso) return '—';
  try {
    return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
      .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
};
const fmtDiaMes = (iso: string): string => {
  if (!iso || iso.length < 10) return iso;
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
};
const fmtDiaSemana = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
  } catch { return ''; }
};

/* ─── Semanas de um mês (segunda a domingo) ──────────────────────────────── */
function semanasMes(mesAno: string): { inicio: string; fim: string; label: string }[] {
  const [ano, mes] = mesAno.split('-').map(Number);
  const d1 = new Date(ano, mes - 1, 1);
  const d2 = new Date(ano, mes, 0);
  const semanas: { inicio: string; fim: string; label: string }[] = [];
  let cur = new Date(d1);
  const dow0 = cur.getDay();
  if (dow0 !== 1) {
    const diff = dow0 === 0 ? -6 : 1 - dow0;
    cur.setDate(cur.getDate() + diff);
  }
  while (cur <= d2) {
    const ini = new Date(cur);
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + 6);
    const mesStr = String(mes).padStart(2, '0');
    semanas.push({
      inicio: ini.toISOString().split('T')[0],
      fim: fim.toISOString().split('T')[0],
      label: `${String(ini.getDate()).padStart(2, '0')}/${mesStr} – ${String(Math.min(fim.getDate(), d2.getDate())).padStart(2, '0')}/${mesStr}`,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return semanas;
}

/* ─── Interfaces ────────────────────────────────────────────────────────── */
interface Motoboy {
  id: string;
  colaboradorId?: string;
  nome: string;
  chavePix?: string;
  telefone?: string;
  vinculo: 'CLT' | 'Freelancer';
  salario?: number;
  periculosidade?: number;
  valorChegadaDia?: number;
  valorChegadaNoite?: number;
  valorEntrega?: number;
  valorTransporte?: number;
  ativo: boolean;
}

interface ControleDia {
  id?: string;
  motoboyId: string;
  data: string;
  salDia: number;
  entDia: number;
  caixinhaDia: number;
  chegadaDia: number;
  entNoite: number;
  caixinhaNoite: number;
  chegadaNoite: number;
  vlVariavel: number;
  pgto: number;
  variavel: number;
}

interface PagamentoLog {
  id: string;
  data: string;
  valor: number;
  forma: 'PIX' | 'Dinheiro' | 'Misto';
  valorPix?: number;
  valorDinheiro?: number;
  tipo?: string;
  obs?: string;
}

interface GrupoSemana {
  id: string;
  motoboyId: string;
  motoboyNome: string;
  chavePix?: string;
  vinculo: 'CLT' | 'Freelancer';
  semanaIni: string;
  semanaFim: string;
  semanaLabel: string;
  linhas: ControleDia[];         // dias do controle nesta semana
  saidasDesconto: any[];         // saídas de consumo (vermelho)
  saidasAbat: any[];             // abatimento adto especial (roxo)
  logPagamentos: PagamentoLog[]; // log de pagamento (azul)
  totalChegada: number;
  totalEntregas: number;
  totalCaixinha: number;
  totalBruto: number;
  totalTransp: number;
  totalDesc: number;
  totalAbat: number;
  totalPgto: number;
  liquidoEfetivo: number;
  pago: boolean;
}

/* ─── Excluir das saídas de consumo (são lançamentos auto) ──────────────── */
const EXCLUIR_DO_DESC = new Set(['Desconto Transporte', 'Desconto Adiantamento Especial']);

/* ─── Component ─────────────────────────────────────────────────────────── */
const MotoboyAuditoria: React.FC = () => {
  const navigate   = useNavigate();
  const { activeUnit } = useUnit();
  const { user }   = useAuth();
  const unitId     = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const apiUrl     = import.meta.env.VITE_API_ENDPOINT || '';
  const token      = () => localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
  const auth       = { headers: { Authorization: `Bearer ${token()}` } };

  /* ── State ── */
  const hoje = new Date();
  const [mesAno, setMesAno]           = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading]         = useState(false);
  const [motoboys, setMotoboys]       = useState<Motoboy[]>([]);
  const [motoboyId, setMotoboyId]     = useState('');
  const [grupos, setGrupos]           = useState<GrupoSemana[]>([]);
  const [expandidos, setExpandidos]   = useState<Set<string>>(new Set());
  const [filtroVinculo, setFiltroVinculo] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');

  /* ── Carregar lista de motoboys ── */
  useEffect(() => {
    if (!unitId) return;
    fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, auth)
      .then(r => r.ok ? r.json() : [])
      .then((colabs: any[]) => {
        const motos: Motoboy[] = colabs
          .filter(c => c.ativo !== false && (c.isMotoboy === true || (c.cargo || '').toLowerCase() === 'motoboy'))
          .map(c => ({
            id: c.id,
            colaboradorId: c.id,
            nome: c.nome,
            chavePix: c.chavePix,
            telefone: c.telefone || c.celular,
            vinculo: c.tipoContrato === 'CLT' ? 'CLT' : 'Freelancer',
            salario: R(c.salario),
            periculosidade: R(c.periculosidade),
            valorChegadaDia:   R(c.valorDia)        || 0,
            valorChegadaNoite: R(c.valorNoite)      || 0,
            valorEntrega:      R(c.valorEntrega)    || R(c.valorTransporte) || 0,
            valorTransporte:   R(c.valorTransporte) || 0,
            ativo: c.ativo !== false,
          }));
        setMotoboys(motos);
      })
      .catch(console.error);
  }, [unitId]);

  /* ── Carregar dados do motoboy selecionado ── */
  const carregar = useCallback(async () => {
    if (!motoboyId || !unitId) return;
    setLoading(true);
    setExpandidos(new Set());
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${mesAno}-01`;
      const dataFim    = new Date(ano, mes, 0).toISOString().split('T')[0];

      const [rCtrl, rSaidas] = await Promise.all([
        fetchAuth(`${apiUrl}/controle-motoboy?motoboyId=${motoboyId}&mes=${mesAno}&unitId=${unitId}`, auth),
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, auth),
      ]);

      const controle: ControleDia[] = rCtrl.ok ? (await rCtrl.json()) : [];
      const saidas:   any[]         = rSaidas.ok ? (await rSaidas.json()) : [];

      const motoboy = motoboys.find(m => m.id === motoboyId);
      if (!motoboy) return;

      /* IDs relevantes para este motoboy */
      const idSet = new Set([motoboyId, motoboy.colaboradorId].filter(Boolean) as string[]);

      /* Saídas filtradas para este motoboy */
      const saidasMoto = saidas.filter(s => idSet.has(s.colaboradorId));
      const saidasDesc = saidasMoto.filter(s => !EXCLUIR_DO_DESC.has(s.tipo || s.origem || ''));
      const saidasAbat = saidasMoto.filter(s => (s.tipo || s.origem || '') === 'Desconto Adiantamento Especial');

      /* Semanas do mês */
      const semanas = semanasMes(mesAno);
      const grups: GrupoSemana[] = [];

      for (const sem of semanas) {
        const linhasSem = controle.filter(l => l.data >= sem.inicio && l.data <= sem.fim);
        if (linhasSem.length === 0) continue;

        /* Calcular totais */
        const valorEntrega = R(motoboy.valorEntrega);
        const totalChegada = linhasSem.reduce((s, l) => s + R(l.chegadaDia) + R(l.chegadaNoite), 0);
        const totalViagsN  = linhasSem.reduce((s, l) => s + R(l.entDia) + R(l.entNoite), 0);
        const totalEntregas = parseFloat((valorEntrega * totalViagsN).toFixed(2));
        const totalCaixinha = linhasSem.reduce((s, l) => s + R(l.caixinhaDia) + R(l.caixinhaNoite), 0);
        const totalPgto    = linhasSem.reduce((s, l) => s + R(l.pgto), 0);

        /* Para CLT: bruto = salDia * dias com presença + variável */
        const isCLT = motoboy.vinculo === 'CLT';
        const totalSalario = isCLT ? linhasSem.reduce((s, l) => s + R(l.salDia), 0) : 0;
        const totalVariavel = isCLT ? linhasSem.reduce((s, l) => s + R(l.vlVariavel), 0) : 0;
        const totalBruto = isCLT
          ? parseFloat((totalSalario + totalVariavel).toFixed(2))
          : parseFloat((totalChegada + totalEntregas + totalCaixinha).toFixed(2));

        /* Transporte (para CLT: valeTransporte fixo mensal / 4; para Freelancer: valorTransporte × dias presença) */
        const diasComDados = linhasSem.filter(l =>
          R(l.entDia) > 0 || R(l.entNoite) > 0 || R(l.chegadaDia) > 0 || R(l.chegadaNoite) > 0 || R(l.vlVariavel) > 0
        ).length;
        const vtDia = R(motoboy.valorTransporte);
        const totalTransp = parseFloat((vtDia * diasComDados).toFixed(2));

        /* Saídas de desconto e abatimento no intervalo */
        const sDescSem = saidasDesc.filter(s => {
          const d = s.dataPagamento || s.data || '';
          return d >= sem.inicio && d <= sem.fim;
        });
        const sAbatSem = saidasAbat.filter(s => {
          const d = s.dataPagamento || s.data || '';
          return d >= sem.inicio && d <= sem.fim;
        });
        const totalDesc = sDescSem.reduce((s, x) => s + R(x.valor), 0);
        const totalAbat = sAbatSem.reduce((s, x) => s + R(x.valor), 0);

        /* Líquido */
        const liquidoEfetivo = Math.max(0, totalBruto + totalTransp - totalDesc - totalAbat);

        /* Log de pagamentos: saídas com valor > 0 marcadas como pagas */
        const logsRaw = saidasMoto.filter(s => {
          const d = s.dataPagamento || s.data || '';
          return R(s.valor) > 0 && s.pago === true && d >= sem.inicio && d <= sem.fim;
        });
        const logPagamentos: PagamentoLog[] = logsRaw.map(s => ({
          id: s.id,
          data: s.dataPagamento || s.data || '',
          valor: R(s.valor),
          forma: s.formaPagamento || 'PIX',
          valorPix: s.valorPix,
          valorDinheiro: s.valorDinheiro,
          obs: s.descricao || s.obs,
        }));

        const pago = totalPgto > 0 || logsRaw.length > 0;

        grups.push({
          id: `${motoboyId}_${sem.inicio}`,
          motoboyId,
          motoboyNome: motoboy.nome,
          chavePix: motoboy.chavePix,
          vinculo: motoboy.vinculo,
          semanaIni: sem.inicio,
          semanaFim: sem.fim,
          semanaLabel: sem.label,
          linhas: linhasSem,
          saidasDesconto: sDescSem,
          saidasAbat: sAbatSem,
          logPagamentos,
          totalChegada: parseFloat(totalChegada.toFixed(2)),
          totalEntregas,
          totalCaixinha: parseFloat(totalCaixinha.toFixed(2)),
          totalBruto,
          totalTransp,
          totalDesc: parseFloat(totalDesc.toFixed(2)),
          totalAbat: parseFloat(totalAbat.toFixed(2)),
          totalPgto: parseFloat(totalPgto.toFixed(2)),
          liquidoEfetivo,
          pago,
        });
      }

      setGrupos(grups);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [motoboyId, mesAno, unitId, motoboys]);

  useEffect(() => { if (motoboyId) carregar(); }, [carregar]);

  /* ── Toggle expand ── */
  const toggleExp = (id: string) =>
    setExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Filtro de vínculo ── */
  const motoboysFiltrados = motoboys.filter(m =>
    m.ativo && (filtroVinculo === 'todos' || m.vinculo === filtroVinculo)
  );

  /* ── Styles ── */
  const s = {
    card:  { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,.06)' },
    th:    { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC:   { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    thR:   { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'right' as const },
    td:    { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdC:   { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'center' as const },
    tdR:   { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
    input: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' },
    select:{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' },
    btn:   (bg: string) => ({ padding: '7px 14px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
  };

  /* ── KPIs ── */
  const totalBrutoMes  = grupos.reduce((s, g) => s + g.totalBruto, 0);
  const totalDescMes   = grupos.reduce((s, g) => s + g.totalDesc + g.totalAbat, 0);
  const totalLiqMes    = grupos.reduce((s, g) => s + g.liquidoEfetivo, 0);
  const totalPgtoMes   = grupos.reduce((s, g) => s + g.totalPgto, 0);

  /* ─── RENDER ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <Header title="🏍️ Auditoria de Motoboys" />
      <main style={{ flex: 1, maxWidth: '1400px', margin: '0 auto', padding: '20px 16px', width: '100%' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/modulos')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1976d2', fontSize: '20px' }} title="Voltar">←</button>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#1565c0' }}>🏍️ Auditoria de Motoboys</h2>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              Visão linha a linha dos dias trabalhados, chegadas, entregas, transporte e descontos — estilo Extrato
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
              style={{ ...s.input, fontWeight: 'bold', color: '#1565c0' }} />
            <button onClick={() => navigate('/modulos/motoboys')}
              style={{ ...s.btn('#1976d2') }}>🏍️ Controle Diário</button>
            <button onClick={() => navigate('/modulos/folha-pagamento')}
              style={{ ...s.btn('#455a64') }}>🧾 Folha Pagamento</button>
          </div>
        </div>

        {/* Seleção de motoboy + filtro vínculo */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>Vínculo</div>
            <select value={filtroVinculo} onChange={e => setFiltroVinculo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="CLT">CLT</option>
              <option value="Freelancer">Freelancer</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>Motoboy</div>
            <select value={motoboyId} onChange={e => setMotoboyId(e.target.value)} style={{ ...s.select, width: '260px' }}>
              <option value="">Selecione o motoboy...</option>
              {motoboysFiltrados.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.vinculo})
                </option>
              ))}
            </select>
          </div>
          <button onClick={carregar} disabled={!motoboyId || loading} style={s.btn('#1976d2')}>
            {loading ? '⏳' : '🔄'} Carregar
          </button>
          {motoboyId && grupos.length > 0 && (
            <button onClick={() => setExpandidos(new Set(grupos.map(g => g.id)))}
              style={{ ...s.btn('#2e7d32') }}>▼ Expandir Todos</button>
          )}
          {expandidos.size > 0 && (
            <button onClick={() => setExpandidos(new Set())}
              style={{ ...s.btn('#757575') }}>▲ Recolher Todos</button>
          )}
        </div>

        {/* KPIs */}
        {grupos.length > 0 && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { label: 'Semanas', val: grupos.length, cor: '#1976d2' },
              { label: 'Total Bruto', val: fmtMoeda(totalBrutoMes), cor: '#2e7d32' },
              { label: 'Descontos', val: fmtMoeda(totalDescMes), cor: '#c62828' },
              { label: 'Líquido Mês', val: fmtMoeda(totalLiqMes), cor: '#1b5e20' },
              { label: 'Total Pgto Registrado', val: fmtMoeda(totalPgtoMes), cor: '#00897b' },
            ].map(c => (
              <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}`, minWidth: '140px', flex: '1' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
                <div style={{ fontSize: '17px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabela de grupos */}
        {!motoboyId ? (
          <div style={{ ...s.card, textAlign: 'center', padding: '60px', color: '#999' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏍️</div>
            <p>Selecione um motoboy para ver a auditoria semanal.</p>
          </div>
        ) : loading ? (
          <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
        ) : grupos.length === 0 ? (
          <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            <p>Nenhum dado encontrado para {mesAno}.</p>
            <p style={{ fontSize: '12px' }}>Salve o controle diário em <strong>🏍️ Gestão de Motoboys</strong> para que os dados apareçam aqui.</p>
          </div>
        ) : (
          <div style={{ ...s.card, borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={s.th}>▶</th>
                  <th style={s.th}>Semana</th>
                  <th style={s.thC}>Dias c/ dados</th>
                  <th style={s.thC}>Vínculo</th>
                  <th style={s.thR}>Chegada / Sal.</th>
                  <th style={s.thR}>Entregas</th>
                  <th style={s.thR}>Caixinha</th>
                  <th style={s.thR}>Transporte</th>
                  <th style={s.thR}>Descontos</th>
                  <th style={s.thR}>💳 Líquido</th>
                  <th style={s.thC}>Status</th>
                </tr>
              </thead>
              <tbody>
                {grupos.flatMap(g => {
                  const exp = expandidos.has(g.id);
                  const bgMae = g.pago ? '#f0fdf4' : '#fffde7';
                  const motoboy = motoboys.find(m => m.id === g.motoboyId);
                  const valorEntrega = R(motoboy?.valorEntrega);
                  const rows: React.ReactElement[] = [];

                  /* ── Linha-mãe ── */
                  rows.push(
                    <tr key={g.id} style={{ backgroundColor: bgMae, borderLeft: '3px solid #43a047', borderBottom: exp ? 'none' : '1px solid #c8e6c9' }}>
                      <td style={{ ...s.td, width: '32px', textAlign: 'center' }}>
                        <button onClick={() => toggleExp(g.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1b5e20', fontWeight: 'bold', padding: '0 2px' }}>
                          {exp ? '▼' : '▶'}
                        </button>
                      </td>
                      <td style={{ ...s.td, fontWeight: 'bold', color: '#1565c0', whiteSpace: 'nowrap' }}>
                        <div>{g.semanaLabel}</div>
                        <div style={{ fontSize: '10px', color: '#888' }}>{g.semanaIni} → {g.semanaFim}</div>
                      </td>
                      <td style={s.tdC}>
                        {(() => {
                          const diasComDados = g.linhas.filter(l =>
                            R(l.entDia) > 0 || R(l.entNoite) > 0 || R(l.chegadaDia) > 0 || R(l.chegadaNoite) > 0 || R(l.vlVariavel) > 0
                          );
                          return (
                            <div>
                              <span style={{ fontWeight: 'bold', color: '#1b5e20' }}>{diasComDados.length}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', marginTop: '2px' }}>
                                {diasComDados.map(l => (
                                  <span key={l.data} style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 4px', borderRadius: '5px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                    {fmtDiaSemana(l.data)} {fmtDiaMes(l.data)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={s.tdC}>
                        <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold',
                          backgroundColor: g.vinculo === 'CLT' ? '#e3f2fd' : '#fff8e1',
                          color: g.vinculo === 'CLT' ? '#1565c0' : '#f57f17' }}>
                          {g.vinculo}
                        </span>
                      </td>
                      <td style={{ ...s.tdR, fontWeight: 'bold', color: '#e65100' }}>
                        {g.totalChegada > 0 ? fmtMoeda(g.totalChegada) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...s.tdR, color: '#43a047' }}>
                        {g.totalEntregas > 0 ? `+${fmtMoeda(g.totalEntregas)}` : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...s.tdR, color: '#00838f' }}>
                        {g.totalCaixinha > 0 ? `+${fmtMoeda(g.totalCaixinha)}` : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...s.tdR, color: '#2e7d32' }}>
                        {g.totalTransp > 0 ? `+${fmtMoeda(g.totalTransp)}` : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...s.tdR, color: '#c62828' }}>
                        {(g.totalDesc + g.totalAbat) > 0 ? `−${fmtMoeda(g.totalDesc + g.totalAbat)}` : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...s.tdR }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1b5e20' }}>
                          {fmtMoeda(g.liquidoEfetivo)}
                        </div>
                      </td>
                      <td style={s.tdC}>
                        <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                          backgroundColor: g.pago ? '#e8f5e9' : '#fff9c4',
                          color: g.pago ? '#2e7d32' : '#f57f17' }}>
                          {g.pago ? '✅ Pago' : '⏳ Pendente'}
                        </span>
                      </td>
                    </tr>
                  );

                  if (!exp) return rows;

                  /* ── [1] Sub-linhas: Dias trabalhados (verde claro) ── */
                  const linhasComDados = g.linhas.filter(l =>
                    R(l.entDia) > 0 || R(l.entNoite) > 0 || R(l.chegadaDia) > 0 || R(l.chegadaNoite) > 0 ||
                    R(l.caixinhaDia) > 0 || R(l.caixinhaNoite) > 0 || R(l.vlVariavel) > 0
                  );

                  for (const l of linhasComDados) {
                    const chegadaDia   = R(l.chegadaDia);
                    const chegadaNoite = R(l.chegadaNoite);
                    const entDia       = R(l.entDia);
                    const entNoite     = R(l.entNoite);
                    const caixinha     = R(l.caixinhaDia) + R(l.caixinhaNoite);
                    const vEntDia      = parseFloat((valorEntrega * entDia).toFixed(2));
                    const vEntNoite    = parseFloat((valorEntrega * entNoite).toFixed(2));
                    const vlVar        = R(l.vlVariavel);
                    const totalLinha   = chegadaDia + chegadaNoite + vEntDia + vEntNoite + caixinha;
                    const diaBR = new Date(l.data + 'T12:00:00')
                      .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

                    rows.push(
                      <tr key={`${g.id}_d_${l.data}`}
                        style={{ backgroundColor: '#f1f8e9', borderBottom: '1px dashed #dcedc8', borderLeft: '6px solid #81c784' }}>
                        <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#555' }}>
                          ↳ <span style={{ color: '#888', marginRight: 4 }}>dia</span>
                          <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#f1f8e9', color: '#2e7d32', fontWeight: 'bold' }}>
                            🏍️
                          </span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{diaBR}</td>
                        <td style={{ ...s.td, fontSize: '11px' }}>
                          {chegadaDia > 0   && <span style={{ marginRight: '6px', color: '#e65100' }}>☀️ Ch {fmtMoeda(chegadaDia)}</span>}
                          {chegadaNoite > 0 && <span style={{ marginRight: '6px', color: '#7b1fa2' }}>🌙 Ch {fmtMoeda(chegadaNoite)}</span>}
                          {entDia > 0       && <span style={{ marginRight: '6px', color: '#1976d2' }}>☀️ {entDia} ent. (+{fmtMoeda(vEntDia)})</span>}
                          {entNoite > 0     && <span style={{ marginRight: '6px', color: '#7b1fa2' }}>🌙 {entNoite} ent. (+{fmtMoeda(vEntNoite)})</span>}
                          {caixinha > 0     && <span style={{ marginRight: '6px', color: '#00838f' }}>🪙 Caix {fmtMoeda(caixinha)}</span>}
                          {g.vinculo === 'CLT' && vlVar > 0 && (entDia === 0 && entNoite === 0) &&
                            <span style={{ color: '#43a047' }}>Variável {fmtMoeda(vlVar)}</span>}
                        </td>
                        <td colSpan={5} style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>
                          +{fmtMoeda(totalLinha)}
                        </td>
                        <td colSpan={2} style={s.tdC} />
                      </tr>
                    );
                  }

                  /* ── [2] Transporte dia a dia (verde médio) ── */
                  if (g.totalTransp > 0 && motoboy) {
                    const vtDia = R(motoboy.valorTransporte);
                    const diasPresenca = linhasComDados;
                    if (vtDia > 0) {
                      diasPresenca.forEach(l => {
                        const diaBR = new Date(l.data + 'T12:00:00')
                          .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                        rows.push(
                          <tr key={`${g.id}_tr_${l.data}`}
                            style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #a5d6a7', borderLeft: '6px solid #66bb6a' }}>
                            <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#2e7d32' }}>
                              ↳ <span style={{ marginRight: 4 }}>🚗</span>
                              <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#c8e6c9', color: '#1b5e20', fontWeight: 'bold' }}>
                                Transporte
                              </span>
                            </td>
                            <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{diaBR}</td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#555' }}>
                              {fmtDiaMes(l.data)} · vale-transporte
                            </td>
                            <td colSpan={5} style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(vtDia)}</td>
                            <td colSpan={2} style={s.tdC} />
                          </tr>
                        );
                      });
                    }
                  }

                  /* ── [3] Descontos de saídas (vermelho) ── */
                  g.saidasDesconto.forEach(saida => {
                    rows.push(
                      <tr key={`${g.id}_desc_${saida.id}`}
                        style={{ backgroundColor: '#fff8f8', borderBottom: '1px dashed #ffcdd2', borderLeft: '6px solid #ef9a9a' }}>
                        <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#c62828' }}>
                          ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#ffebee', color: '#c62828', fontWeight: 'bold' }}>📉 desc.</span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {saida.dataPagamento ? fmtDataBR(saida.dataPagamento) : '—'}
                        </td>
                        <td style={{ ...s.td, fontSize: '11px' }}>
                          <div style={{ color: '#c62828', fontWeight: 'bold' }}>{saida.descricao || saida.tipo || 'Desconto'}</div>
                          {saida.obs && <div style={{ color: '#999', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>}
                        </td>
                        <td colSpan={5} style={{ ...s.tdR, fontWeight: 'bold', color: '#c62828' }}>
                          −{fmtMoeda(R(saida.valor))}
                        </td>
                        <td style={s.tdC}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
                            backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4',
                            color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                            {saida.pago ? '✅' : '⏳'}
                          </span>
                        </td>
                        <td style={s.tdC} />
                      </tr>
                    );
                  });

                  /* ── [3b] Abatimento Adiantamento Especial (roxo) ── */
                  g.saidasAbat.forEach(saida => {
                    rows.push(
                      <tr key={`${g.id}_abat_${saida.id}`}
                        style={{ backgroundColor: '#f3e5f5', borderBottom: '1px dashed #ce93d8', borderLeft: '6px solid #9c27b0' }}>
                        <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#6a1b9a' }}>
                          ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#9c27b0', color: 'white', fontWeight: 'bold' }}>⏩ adto.esp.</span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {saida.dataPagamento ? fmtDataBR(saida.dataPagamento) : '—'}
                        </td>
                        <td style={{ ...s.td, fontSize: '11px' }}>
                          <div style={{ color: '#6a1b9a', fontWeight: 'bold' }}>{saida.descricao || 'Abatimento Adiantamento Especial'}</div>
                          {saida.obs && <div style={{ color: '#ab47bc', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>}
                        </td>
                        <td colSpan={5} style={{ ...s.tdR, fontWeight: 'bold', color: '#6a1b9a' }}>
                          −{fmtMoeda(R(saida.valor))}
                        </td>
                        <td style={s.tdC}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
                            backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4',
                            color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                            {saida.pago ? '✅' : '⏳'}
                          </span>
                        </td>
                        <td style={s.tdC} />
                      </tr>
                    );
                  });

                  /* ── [3c] Log de Pagamento (azul royal) ── */
                  g.logPagamentos.forEach((log, idx) => {
                    rows.push(
                      <tr key={`${g.id}_pix_${idx}`}
                        style={{ backgroundColor: '#e3f2fd', borderBottom: '1px dashed #90caf9', borderLeft: '6px solid #1565c0' }}>
                        <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#1565c0' }}>
                          ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>📱 pgto.</span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {log.data ? fmtDataBR(log.data) : '—'}
                        </td>
                        <td style={{ ...s.td, fontSize: '11px', color: '#1565c0' }}>
                          {log.forma === 'Misto'
                            ? `📱 PIX ${fmtMoeda(log.valorPix || 0)} + 💵 Dinheiro ${fmtMoeda(log.valorDinheiro || 0)}`
                            : log.forma === 'Dinheiro'
                            ? '💵 Dinheiro — registro de pagamento'
                            : '📱 PIX — registro de pagamento'}
                          {log.obs && <span style={{ color: '#777', marginLeft: '8px', fontSize: '10px' }}>({log.obs})</span>}
                        </td>
                        <td colSpan={5} style={{ ...s.tdR, fontWeight: 'bold', color: '#1565c0' }}>
                          📱 {fmtMoeda(log.valor)}
                        </td>
                        <td colSpan={2} style={s.tdC} />
                      </tr>
                    );
                  });

                  /* ── [4] Subtotal da semana (fundo verde escuro) ── */
                  const totalLogPgto = g.logPagamentos.reduce((s, l) => s + R(l.valor), 0);
                  const divergencia = Math.abs(totalLogPgto - g.liquidoEfetivo);
                  const temDiv = totalLogPgto > 0 && divergencia > 0.01;

                  rows.push(
                    <tr key={`${g.id}_sub`}
                      style={{ backgroundColor: '#1b5e20', borderBottom: '2px solid #43a047' }}>
                      <td colSpan={11} style={{ padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: 'white' }}>
                          <tbody>
                            <tr>
                              <td style={{ padding: '6px 14px', width: '55%' }}>
                                {/* Resumo dias */}
                                {linhasComDados.map(l => {
                                  const vlDia = R(l.chegadaDia) + R(l.chegadaNoite) +
                                    parseFloat((valorEntrega * (R(l.entDia) + R(l.entNoite))).toFixed(2)) +
                                    R(l.caixinhaDia) + R(l.caixinhaNoite);
                                  return (
                                    <span key={l.data} style={{ marginRight: '8px', color: '#a5d6a7' }}>
                                      🏍️ {fmtDiaMes(l.data)} +{fmtMoeda(vlDia)}
                                    </span>
                                  );
                                })}
                                {g.totalTransp > 0 && (
                                  <span style={{ marginRight: '8px', color: '#80cbc4' }}>
                                    🚗 +{fmtMoeda(g.totalTransp)}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '6px 14px', textAlign: 'right', width: '45%' }}>
                                <span style={{ color: '#a5d6a7' }}>= Bruto </span>
                                <strong>{fmtMoeda(g.totalBruto)}</strong>
                                {g.totalTransp > 0 && (
                                  <span style={{ marginLeft: '10px', color: '#80cbc4' }}>
                                    🚗 +{fmtMoeda(g.totalTransp)}
                                  </span>
                                )}
                                {g.totalDesc > 0 && (
                                  <span style={{ marginLeft: '10px', color: '#ef9a9a' }}>
                                    📉 Desc. −{fmtMoeda(g.totalDesc)}
                                  </span>
                                )}
                                {g.totalAbat > 0 && (
                                  <span style={{ marginLeft: '10px', color: '#ce93d8' }}>
                                    ⏩ Adto.esp. −{fmtMoeda(g.totalAbat)}
                                  </span>
                                )}
                                {totalLogPgto > 0 ? (
                                  <>
                                    <span style={{ marginLeft: '12px', borderLeft: '1px dashed #1976d2', paddingLeft: '12px', color: '#90caf9' }}>
                                      📱 Pago: {fmtMoeda(totalLogPgto)}
                                    </span>
                                    {temDiv && (
                                      <span style={{ marginLeft: '8px', color: '#ffcc02', fontWeight: 'bold' }}>
                                        ⚠️ Divergência {fmtMoeda(divergencia)}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ marginLeft: '12px', color: '#90caf9', fontWeight: 'bold', fontSize: '13px' }}>
                                    💳 Líquido: {fmtMoeda(g.liquidoEfetivo)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
};

export default MotoboyAuditoria;
