import React, { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Tipos ─────────────────────────────────────────────────────────────── */
interface ExtratoItem {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  tipoContrato?: string;
  cargo?: string;
  area?: string;
  mes: string;
  semana?: string;
  tipo: 'pagamento' | 'desconto' | 'saida' | 'adiantamento' | 'inss' | 'transporte' | 'variavel';
  descricao: string;
  valor: number;
  sinal: 1 | -1;  // 1=crédito, -1=débito
  pago: boolean;
  dataPagamento?: string;
  obs?: string;
  createdAt?: string;
}

interface Colaborador {
  id: string;
  nome: string;
  cargo?: string;
  funcao?: string;
  area?: string;
  tipoContrato?: string;
  chavePix?: string;
}

interface FolhaDB {
  id: string;
  colaboradorId: string;
  mes: string;
  semana?: string;
  pago: boolean;
  dataPagamento?: string;
  saldoFinal?: number;
  valorBruto?: number;
  valorTransporte?: number;
  totalFinal?: number;
  obs?: string;
  updatedAt?: string;
  createdAt?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);
const fmtMoedaAbs = (v: number) => 'R$ ' + fmt(Math.abs(v));

/* ─── Component ─────────────────────────────────────────────────────────── */
export const Extrato: React.FC = () => {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || (user as any)?.unitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [folhasDB, setFolhasDB] = useState<FolhaDB[]>([]);
  const [saidas, setSaidas] = useState<any[]>([]);

  const [filtroColab, setFiltroColab] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroContrato, setFiltroContrato] = useState('todos');

  const token = () => localStorage.getItem('auth_token');

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

      const [rC, rF, rS] = await Promise.all([
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
      ]);

      const dC = await rC.json();
      setColaboradores(Array.isArray(dC) ? dC.filter((c: Colaborador) => c.nome) : []);

      if (rF?.ok) {
        const dF = await rF.json();
        setFolhasDB(Array.isArray(dF) ? dF : []);
      } else {
        setFolhasDB([]);
      }

      if (rS?.ok) {
        const dS = await rS.json();
        setSaidas(Array.isArray(dS) ? dS : []);
      } else {
        setSaidas([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Build extrato items from folhasDB + saidas
  const extratoItems = useMemo((): ExtratoItem[] => {
    const colabMap: Record<string, Colaborador> = {};
    for (const c of colaboradores) colabMap[c.id] = c;

    const items: ExtratoItem[] = [];

    // From folha-pagamento records
    for (const f of folhasDB) {
      const colab = colabMap[f.colaboradorId];
      const nome = colab?.nome || f.colaboradorId;
      const base: Omit<ExtratoItem, 'id' | 'tipo' | 'descricao' | 'valor' | 'sinal'> = {
        colaboradorId: f.colaboradorId,
        colaboradorNome: nome,
        tipoContrato: colab?.tipoContrato,
        cargo: colab?.cargo || colab?.funcao,
        area: colab?.area,
        mes: f.mes,
        semana: f.semana,
        pago: f.pago || false,
        dataPagamento: f.dataPagamento,
        obs: f.obs,
        createdAt: f.updatedAt || f.createdAt,
      };

      // Pagamento principal
      const total = R(f.totalFinal || f.saldoFinal || 0);
      if (total !== 0) {
        items.push({
          ...base,
          id: `${f.id}_pgto`,
          tipo: 'pagamento',
          descricao: f.semana
            ? `Pagamento semanal — semana ${f.semana}`
            : `Folha mensal — ${f.mes}`,
          valor: total,
          sinal: 1,
        });
      }

      // Transporte
      if (R(f.valorTransporte) > 0) {
        items.push({
          ...base,
          id: `${f.id}_transp`,
          tipo: 'transporte',
          descricao: `Transporte — ${f.semana ? 'semana ' + f.semana : f.mes}`,
          valor: R(f.valorTransporte),
          sinal: 1,
        });
      }
    }

    // From saidas
    for (const s of saidas) {
      const colab = colabMap[s.colaboradorId];
      const nome = colab?.nome || s.colaborador || s.favorecido || s.colaboradorId;
      items.push({
        id: s.id,
        colaboradorId: s.colaboradorId,
        colaboradorNome: nome,
        tipoContrato: colab?.tipoContrato,
        cargo: colab?.cargo || colab?.funcao,
        area: colab?.area,
        mes: mesAno,
        tipo: 'saida',
        descricao: s.descricao || s.tipo || 'Saída',
        valor: R(s.valor),
        sinal: -1,  // saídas são débitos / pagamentos realizados
        pago: !!s.dataPagamento,
        dataPagamento: s.dataPagamento,
        obs: s.observacao,
        createdAt: s.createdAt || s.timestamp,
      });
    }

    return items.sort((a, b) => {
      // Sort: by date desc, then by name
      const da = a.dataPagamento || a.createdAt || a.mes;
      const db = b.dataPagamento || b.createdAt || b.mes;
      if (da !== db) return db.localeCompare(da);
      return a.colaboradorNome.localeCompare(b.colaboradorNome);
    });
  }, [folhasDB, saidas, colaboradores, mesAno]);

  const filtered = useMemo(() => {
    return extratoItems.filter(item => {
      if (filtroColab !== 'todos' && item.colaboradorId !== filtroColab) return false;
      if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false;
      if (filtroStatus === 'pago' && !item.pago) return false;
      if (filtroStatus === 'pendente' && item.pago) return false;
      if (filtroContrato !== 'todos' && item.tipoContrato !== filtroContrato) return false;
      return true;
    });
  }, [extratoItems, filtroColab, filtroTipo, filtroStatus, filtroContrato]);

  // Summary by collaborator
  const resumoPorColab = useMemo(() => {
    const map: Record<string, { nome: string; tipoContrato?: string; cargo?: string; creditos: number; debitos: number; saldo: number; pago: number; pendente: number }> = {};
    for (const item of filtered) {
      if (!map[item.colaboradorId]) {
        map[item.colaboradorId] = { nome: item.colaboradorNome, tipoContrato: item.tipoContrato, cargo: item.cargo, creditos: 0, debitos: 0, saldo: 0, pago: 0, pendente: 0 };
      }
      const v = item.valor * item.sinal;
      if (v >= 0) map[item.colaboradorId].creditos += v;
      else map[item.colaboradorId].debitos += Math.abs(v);
      map[item.colaboradorId].saldo += v;
      if (item.pago) map[item.colaboradorId].pago += Math.abs(v);
      else map[item.colaboradorId].pendente += Math.abs(v);
    }
    return Object.entries(map).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtered]);

  const totalCreditos = filtered.filter(i => i.sinal > 0).reduce((s, i) => s + i.valor, 0);
  const totalDebitos = filtered.filter(i => i.sinal < 0).reduce((s, i) => s + i.valor, 0);
  const totalPago = filtered.filter(i => i.pago).reduce((s, i) => s + i.valor * i.sinal, 0);
  const totalPendente = filtered.filter(i => !i.pago).reduce((s, i) => s + Math.abs(i.valor), 0);

  const tipoLabel: Record<string, { label: string; cor: string; bg: string }> = {
    pagamento:    { label: 'Pagamento',    cor: '#2e7d32', bg: '#e8f5e9' },
    desconto:     { label: 'Desconto',     cor: '#c62828', bg: '#fce4ec' },
    saida:        { label: 'Saída',        cor: '#e65100', bg: '#fff3e0' },
    adiantamento: { label: 'Adiantamento', cor: '#f57f17', bg: '#fff9c4' },
    inss:         { label: 'INSS',         cor: '#6a1b9a', bg: '#f3e5f5' },
    transporte:   { label: 'Transporte',   cor: '#1565c0', bg: '#e3f2fd' },
    variavel:     { label: 'Variável',     cor: '#00838f', bg: '#e0f7fa' },
  };

  const exportarXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      'Colaborador': i.colaboradorNome,
      'Tipo Contrato': i.tipoContrato || '',
      'Cargo/Função': i.cargo || '',
      'Área': i.area || '',
      'Mês': i.mes,
      'Semana': i.semana || '',
      'Tipo': tipoLabel[i.tipo]?.label || i.tipo,
      'Descrição': i.descricao,
      'Valor (R$)': i.valor,
      'C/D': i.sinal === 1 ? 'Crédito' : 'Débito',
      'Status': i.pago ? 'Pago' : 'Pendente',
      'Data Pgto': i.dataPagamento || '',
      'Obs': i.obs || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Extrato ${mesAno}`);
    XLSX.writeFile(wb, `extrato-pagamentos-${mesAno}.xlsx`);
  };

  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdR: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
  };

  const colabsUnicos = useMemo(() => {
    const seen = new Set<string>();
    return extratoItems
      .filter(i => { if (seen.has(i.colaboradorId)) return false; seen.add(i.colaboradorId); return true; })
      .map(i => ({ id: i.colaboradorId, nome: i.colaboradorNome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [extratoItems]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📋 Extrato de Pagamentos" showBack={true} />

      <div style={{ flex: 1, padding: '20px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>

        {/* Filtros */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <div>
            <label style={s.label}>Colaborador</label>
            <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)} style={{ ...s.select, width: '200px' }}>
              <option value="todos">Todos</option>
              {colabsUnicos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Tipo Lançamento</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...s.select, width: '150px' }}>
              <option value="todos">Todos</option>
              {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Contrato</label>
            <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="CLT">CLT</option>
              <option value="Freelancer">Freelancer</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
            </select>
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={filtered.length === 0} style={s.btn('#7b1fa2')}>📥 XLSX</button>
        </div>

        {/* Cards resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'Total Créditos', val: fmtMoeda(totalCreditos), cor: '#2e7d32' },
            { label: 'Total Débitos', val: fmtMoeda(totalDebitos), cor: '#c62828' },
            { label: 'Saldo', val: fmtMoeda(totalCreditos - totalDebitos), cor: totalCreditos - totalDebitos >= 0 ? '#1976d2' : '#c62828' },
            { label: 'Pago', val: fmtMoeda(Math.abs(totalPago)), cor: '#43a047' },
            { label: 'Pendente', val: fmtMoeda(totalPendente), cor: '#f57f17' },
            { label: 'Lançamentos', val: `${filtered.length}`, cor: '#6a1b9a' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando dados...</div>
        ) : (
          <>
            {/* Resumo por colaborador */}
            {resumoPorColab.length > 0 && (
              <div style={{ ...s.card, marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#1565c0', fontSize: '14px' }}>📊 Resumo por Colaborador</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Colaborador</th>
                        <th style={s.thC}>Tipo</th>
                        <th style={s.th}>Cargo / Função</th>
                        <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#2e7d32' }}>Créditos</th>
                        <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>Débitos</th>
                        <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0d47a1' }}>Saldo</th>
                        <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Pago</th>
                        <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#f57f17' }}>Pendente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoPorColab.map((r, i) => (
                        <tr key={r.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                          <td style={{ ...s.td, fontWeight: 'bold' }}>{r.nome}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                              backgroundColor: r.tipoContrato === 'CLT' ? '#e8f5e9' : '#fff3e0',
                              color: r.tipoContrato === 'CLT' ? '#2e7d32' : '#e65100' }}>
                              {r.tipoContrato || '—'}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{r.cargo || '—'}</td>
                          <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{fmtMoeda(r.creditos)}</td>
                          <td style={{ ...s.tdR, color: '#c62828' }}>{r.debitos > 0 ? fmtMoeda(r.debitos) : '—'}</td>
                          <td style={{ ...s.tdR, fontWeight: 'bold', color: r.saldo >= 0 ? '#1976d2' : '#c62828' }}>{fmtMoeda(r.saldo)}</td>
                          <td style={{ ...s.tdR, color: '#43a047' }}>{r.pago > 0 ? fmtMoeda(r.pago) : '—'}</td>
                          <td style={{ ...s.tdR, color: r.pendente > 0 ? '#f57f17' : '#bbb', fontWeight: r.pendente > 0 ? 'bold' : 'normal' }}>
                            {r.pendente > 0 ? fmtMoeda(r.pendente) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px' }} colSpan={3}>TOTAIS</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totalCreditos)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ef9a9a' }}>{fmtMoeda(totalDebitos)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#90caf9' }}>{fmtMoeda(totalCreditos - totalDebitos)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(Math.abs(totalPago))}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totalPendente)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Lançamentos detalhados */}
            <div style={{ ...s.card }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#1565c0', fontSize: '14px' }}>
                📋 Lançamentos Detalhados — {filtered.length} registros
              </h4>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                  Nenhum lançamento encontrado para os filtros selecionados.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Colaborador</th>
                        <th style={s.thC}>Contrato</th>
                        <th style={s.th}>Cargo</th>
                        <th style={s.th}>Mês</th>
                        <th style={s.th}>Semana</th>
                        <th style={s.thC}>Tipo</th>
                        <th style={s.th}>Descrição</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Valor</th>
                        <th style={s.thC}>C/D</th>
                        <th style={s.thC}>Status</th>
                        <th style={s.th}>Data Pgto</th>
                        <th style={s.th}>Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item, idx) => {
                        const tl = tipoLabel[item.tipo] || { label: item.tipo, cor: '#666', bg: '#f5f5f5' };
                        return (
                          <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fafafa' : 'white')}>
                            <td style={{ ...s.td, fontWeight: 'bold' }}>{item.colaboradorNome}</td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                backgroundColor: item.tipoContrato === 'CLT' ? '#e8f5e9' : '#fff3e0',
                                color: item.tipoContrato === 'CLT' ? '#2e7d32' : '#e65100' }}>
                                {item.tipoContrato || '—'}
                              </span>
                            </td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{item.cargo || '—'}</td>
                            <td style={{ ...s.td, fontSize: '11px' }}>{item.mes}</td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{item.semana || '—'}</td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                backgroundColor: tl.bg, color: tl.cor }}>
                                {tl.label}
                              </span>
                            </td>
                            <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.descricao}
                            </td>
                            <td style={{ ...s.tdR, fontWeight: 'bold', color: item.sinal > 0 ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                              {item.sinal > 0 ? '+' : '−'} {fmtMoedaAbs(item.valor)}
                            </td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                                backgroundColor: item.sinal > 0 ? '#e8f5e9' : '#fce4ec',
                                color: item.sinal > 0 ? '#2e7d32' : '#c62828' }}>
                                {item.sinal > 0 ? 'CR' : 'DB'}
                              </span>
                            </td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                                color: item.pago ? '#2e7d32' : '#f57f17' }}>
                                {item.pago ? '✅ Pago' : '⏳ Pendente'}
                              </span>
                            </td>
                            <td style={{ ...s.td, fontSize: '11px', color: item.dataPagamento ? '#2e7d32' : '#bbb' }}>
                              {item.dataPagamento || '—'}
                            </td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#666', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.obs || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px' }} colSpan={7}>TOTAL</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                          {fmtMoeda(filtered.reduce((s, i) => s + i.valor * i.sinal, 0))}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Legend */}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px' }}>
              {Object.entries(tipoLabel).map(([k, v]) => (
                <span key={k} style={{ padding: '3px 8px', borderRadius: '10px', backgroundColor: v.bg, color: v.cor, fontWeight: 'bold', border: `1px solid ${v.cor}` }}>
                  {v.label}
                </span>
              ))}
              <span style={{ color: '#666', marginLeft: '8px' }}>CR = Crédito (a pagar) · DB = Débito (já pago / descontado)</span>
            </div>
          </>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
};

export default Extrato;
