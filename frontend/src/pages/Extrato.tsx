import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ExtratoItem {
  id: string;
  colaboradorId: string;
  nomeColaborador?: string;
  tipoContrato?: string;
  origem: 'folha' | 'saida' | 'escala';
  mes: string;
  semana?: string;
  // folha fields
  tipo: 'credito' | 'debito';
  descricao: string;
  valor: number;
  pago: boolean;
  dataPagamento?: string;
  valorBruto?: number;
  valorTransporte?: number;
  desconto?: number;
  totalFinal?: number;
  saldoFinal?: number;
  obs?: string;
  updatedAt?: string;
  unitId?: string;
  // saída fields
  tipoSaida?: string;
  // raw reference
  raw?: any;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);
const fmtDataBR = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Extrato: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExtratoItem[]>([]);
  const [detalheItem, setDetalheItem] = useState<ExtratoItem | null>(null);
  const [viewMode, setViewMode] = useState<'resumo' | 'detalhado' | 'colaborador'>('resumo');
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<string | null>(null);

  // Filters
  const [filtroColaborador, setFiltroColaborador] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'credito' | 'debito'>('todos');
  const [filtroContrato, setFiltroContrato] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'folha' | 'saida'>('todos');

  const token = () => localStorage.getItem('auth_token');

  useEffect(() => {
    if (unitId) carregarDados();
  }, [unitId, mesAno]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Get first and last day of month for saidas query
      const [ano, mes] = mesAno.split('-');
      const dataIni = `${mesAno}-01`;
      const lastDay = new Date(parseInt(ano), parseInt(mes), 0).getDate();
      const dataFim = `${mesAno}-${String(lastDay).padStart(2, '0')}`;

      const [rF, rC, rS] = await Promise.all([
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataIni}&dataFim=${dataFim}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
      ]);

      let colabs: any[] = [];
      if (rC?.ok) {
        const d = await rC.json();
        colabs = Array.isArray(d) ? d : [];
      }

      const allItems: ExtratoItem[] = [];

      // ── Folha de pagamento items ─────────────────────────────────────────
      if (rF?.ok) {
        const dF = await rF.json();
        const rawItems: any[] = Array.isArray(dF) ? dF : [];
        for (const item of rawItems) {
          const colab = colabs.find((c: any) => c.id === item.colaboradorId);
          const nome = colab?.nome || item.colaboradorId;
          const tipoContrato = colab?.tipoContrato || (item.semana ? 'Freelancer' : 'CLT');
          const valorPagar = R(item.totalFinal) || R(item.saldoFinal) || 0;
          allItems.push({
            id: item.id || `folha_${item.colaboradorId}_${item.mes}_${item.semana || ''}`,
            colaboradorId: item.colaboradorId,
            nomeColaborador: nome,
            tipoContrato,
            origem: 'folha',
            mes: item.mes,
            semana: item.semana || undefined,
            tipo: 'credito',
            descricao: item.semana
              ? `Dobras semanais ${fmtDataBR(item.semana)} (${tipoContrato})`
              : `Pagamento mensal CLT – ${item.mes}`,
            valor: valorPagar,
            pago: item.pago === true,
            dataPagamento: item.dataPagamento || undefined,
            valorBruto: R(item.valorBruto),
            valorTransporte: R(item.valorTransporte),
            desconto: R(item.desconto),
            totalFinal: R(item.totalFinal),
            saldoFinal: R(item.saldoFinal),
            obs: item.obs || '',
            updatedAt: item.updatedAt,
            unitId: item.unitId,
            raw: item,
          });
        }
      }

      // ── Saídas items ─────────────────────────────────────────────────────
      if (rS?.ok) {
        const dS = await rS.json();
        const rawSaidas: any[] = Array.isArray(dS) ? dS : [];
        for (const saida of rawSaidas) {
          // Only include saídas linked to a collaborator
          if (!saida.colaboradorId && !saida.colabId) continue;
          const colabId = saida.colaboradorId || saida.colabId;
          const colab = colabs.find((c: any) => c.id === colabId);
          const nome = colab?.nome || saida.colaborador || saida.favorecido || colabId;
          const tipoContrato = colab?.tipoContrato || '—';
          const tipo = saida.tipo || saida.origem || saida.referencia || 'A pagar';
          // Use dataPagamento OR data (creation date) to determine month
          const saidaDataEfetiva = saida.dataPagamento || saida.data || '';
          const saidaMes = saidaDataEfetiva.substring(0, 7);
          if (saidaMes !== mesAno) continue;
          // Tipos que são débito (colaborador deve ao restaurante)
          const TIPOS_DEBITO = ['A receber', 'Caixinha', 'Consumo Interno'];
          const isDebito = TIPOS_DEBITO.includes(tipo);

          allItems.push({
            id: saida.id || `saida_${colabId}_${saida.dataPagamento}`,
            colaboradorId: colabId,
            nomeColaborador: nome,
            tipoContrato,
            origem: 'saida',
            mes: saidaMes || mesAno,
            semana: undefined,
            tipo: isDebito ? 'debito' : 'credito',
            descricao: saida.descricao || tipo || 'Saída',
            valor: R(saida.valor),
            pago: true, // saídas are always already recorded/paid
            dataPagamento: saidaDataEfetiva,
            tipoSaida: tipo,
            obs: saida.observacao || '',
            updatedAt: saida.updatedAt || saida.dataPagamento,
            unitId: saida.unitId,
            raw: saida,
          });
        }
      }

      // Sort: by name then by date desc
      allItems.sort((a, b) => {
        const nameComp = (a.nomeColaborador || '').localeCompare(b.nomeColaborador || '');
        if (nameComp !== 0) return nameComp;
        const dateA = a.dataPagamento || a.semana || a.mes || '';
        const dateB = b.dataPagamento || b.semana || b.mes || '';
        return dateB.localeCompare(dateA);
      });

      setItems(allItems);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Filtered items ─────────────────────────────────────── */
  const filteredItems = useMemo(() => items.filter(item => {
    if (filtroColaborador && !item.nomeColaborador?.toLowerCase().includes(filtroColaborador.toLowerCase())) return false;
    if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false;
    if (filtroContrato !== 'todos' && item.tipoContrato !== filtroContrato) return false;
    if (filtroStatus === 'pago' && !item.pago) return false;
    if (filtroStatus === 'pendente' && item.pago) return false;
    if (filtroOrigem !== 'todos' && item.origem !== filtroOrigem) return false;
    return true;
  }), [items, filtroColaborador, filtroTipo, filtroContrato, filtroStatus, filtroOrigem]);

  /* ── Summary per collaborator ───────────────────────────── */
  const summaryByColab = useMemo(() => {
    const map: Record<string, {
      id: string; nome: string; tipoContrato: string;
      creditos: number; debitos: number; saldo: number;
      pago: number; pendente: number; count: number;
      folhaItems: ExtratoItem[]; saidaItems: ExtratoItem[];
    }> = {};
    for (const item of filteredItems) {
      const id = item.colaboradorId;
      if (!map[id]) {
        map[id] = {
          id,
          nome: item.nomeColaborador || id,
          tipoContrato: item.tipoContrato || '—',
          creditos: 0, debitos: 0, saldo: 0, pago: 0, pendente: 0, count: 0,
          folhaItems: [], saidaItems: [],
        };
      }
      const v = item.valor;
      if (item.tipo === 'credito') { map[id].creditos += v; map[id].saldo += v; }
      else { map[id].debitos += v; map[id].saldo -= v; }
      if (item.pago) map[id].pago += v; else map[id].pendente += v;
      map[id].count++;
      if (item.origem === 'folha') map[id].folhaItems.push(item);
      else map[id].saidaItems.push(item);
    }
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredItems]);

  /* ── Totals ─────────────────────────────────────────────── */
  const totals = useMemo(() => ({
    totalCreditos: filteredItems.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalDebitos: filteredItems.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0),
    totalPago: filteredItems.filter(i => i.pago && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalPendente: filteredItems.filter(i => !i.pago && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalDescontos: filteredItems.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0),
    totalFolha: filteredItems.filter(i => i.origem === 'folha').reduce((s, i) => s + i.valor, 0),
    totalSaidas: filteredItems.filter(i => i.origem === 'saida' && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
  }), [filteredItems]);

  /* ── Export XLSX ────────────────────────────────────────── */
  const exportarXLSX = () => {
    const data = filteredItems.map(i => ({
      'Colaborador': i.nomeColaborador,
      'Tipo Contrato': i.tipoContrato,
      'Origem': i.origem === 'folha' ? 'Folha Pagamento' : 'Saída',
      'Mês': i.mes,
      'Semana': i.semana || '—',
      'Tipo': i.tipo === 'credito' ? 'Crédito' : 'Débito',
      'Tipo Saída': i.tipoSaida || '—',
      'Descrição': i.descricao,
      'Valor (R$)': i.valor,
      'Bruto (R$)': i.valorBruto || 0,
      'Transporte (R$)': i.valorTransporte || 0,
      'Desconto (R$)': i.desconto || 0,
      'Status': i.pago ? 'Pago' : 'Pendente',
      'Data Pgto': i.dataPagamento || '—',
      'Observação': i.obs || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Extrato ${mesAno}`);

    // Summary sheet
    const wsSumm = XLSX.utils.json_to_sheet(summaryByColab.map(s => ({
      'Colaborador': s.nome,
      'Tipo Contrato': s.tipoContrato,
      'Total Créditos': s.creditos,
      'Total Débitos': s.debitos,
      'Saldo': s.saldo,
      'Pago': s.pago,
      'Pendente': s.pendente,
      'Lançamentos': s.count,
    })));
    XLSX.utils.book_append_sheet(wb, wsSumm, 'Resumo');
    XLSX.writeFile(wb, `extrato-pagamentos-${mesAno}.xlsx`);
  };

  /* ── Styles ─────────────────────────────────────────────── */
  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '100%' },
    select: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '100%' },
    btn: (bg: string) => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
    tab: (a: boolean) => ({ padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const, borderRadius: '4px 4px 0 0', backgroundColor: a ? '#1976d2' : '#e0e0e0', color: a ? 'white' : '#333', fontSize: '13px' }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC: { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    thR: { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'right' as const },
    td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdR: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
    tdC: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'center' as const },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const }),
  };

  /* ── Modal Detalhe ─────────────────────────────────────── */
  const ModalDetalhe = ({ item, onClose }: { item: ExtratoItem; onClose: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ ...s.card, maxWidth: '500px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#1565c0' }}>📋 Detalhes do Lançamento</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <tbody>
            {[
              { label: 'Colaborador', value: item.nomeColaborador },
              { label: 'Tipo Contrato', value: item.tipoContrato },
              { label: 'Origem', value: item.origem === 'folha' ? '💰 Folha de Pagamento' : '📤 Saída' },
              { label: 'Mês', value: item.mes },
              { label: 'Semana', value: item.semana ? fmtDataBR(item.semana) : 'Mensal' },
              { label: 'Tipo', value: item.tipo === 'credito' ? '📈 Crédito' : '📉 Débito' },
              ...(item.tipoSaida ? [{ label: 'Tipo Saída', value: item.tipoSaida }] : []),
              { label: 'Descrição', value: item.descricao },
              { label: 'Valor Total', value: fmtMoeda(item.valor) },
              ...(item.valorBruto ? [{ label: 'Bruto (dobras)', value: fmtMoeda(item.valorBruto) }] : []),
              ...(item.valorTransporte ? [{ label: 'Transporte', value: fmtMoeda(item.valorTransporte) }] : []),
              ...(item.desconto ? [{ label: 'Desconto (saídas)', value: fmtMoeda(item.desconto) }] : []),
              { label: 'Status', value: item.pago ? '✅ Pago' : '⏳ Pendente' },
              { label: 'Data Pagamento', value: item.dataPagamento ? fmtDataBR(item.dataPagamento) : '—' },
              { label: 'Observação', value: item.obs || '—' },
              { label: 'Atualizado em', value: item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : '—' },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                <td style={{ padding: '7px 10px', fontWeight: 'bold', color: '#555', width: '40%' }}>{row.label}</td>
                <td style={{ padding: '7px 10px', color: '#333' }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '14px', textAlign: 'right' }}>
          <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
        </div>
      </div>
    </div>
  );

  /* ── Modal Analítico por Colaborador ──────────────────── */
  const ModalColaborador = ({ colabId, onClose }: { colabId: string; onClose: () => void }) => {
    const colabItems = items.filter(i => i.colaboradorId === colabId).sort((a, b) => {
      const dateA = a.dataPagamento || a.semana || a.mes || '';
      const dateB = b.dataPagamento || b.semana || b.mes || '';
      return dateB.localeCompare(dateA);
    });
    const nome = colabItems[0]?.nomeColaborador || colabId;
    const folhaTotal = colabItems.filter(i => i.origem === 'folha').reduce((s, i) => s + i.valor, 0);
    const saidaCredito = colabItems.filter(i => i.origem === 'saida' && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0);
    const saidaDebito = colabItems.filter(i => i.origem === 'saida' && i.tipo === 'debito').reduce((s, i) => s + i.valor, 0);
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClose}>
        <div style={{ ...s.card, maxWidth: '700px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>📊 Analítico — {nome} ({mesAno})</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[
              { label: 'Folha / Dobras', val: fmtMoeda(folhaTotal), bg: '#e8f5e9', color: '#2e7d32' },
              { label: 'Adiantamentos', val: fmtMoeda(saidaCredito), bg: '#fff3e0', color: '#e65100' },
              { label: 'Descontos (A receber)', val: fmtMoeda(saidaDebito), bg: '#fce4ec', color: '#c62828' },
              { label: 'Líquido estimado', val: fmtMoeda(folhaTotal + saidaCredito - saidaDebito), bg: '#e3f2fd', color: '#1565c0' },
            ].map(c => (
              <div key={c.label} style={{ padding: '8px 12px', backgroundColor: c.bg, borderRadius: '8px', minWidth: '120px' }}>
                <div style={{ fontSize: '10px', color: c.color, fontWeight: 'bold' }}>{c.label}</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: c.color }}>{c.val}</div>
              </div>
            ))}
          </div>

          {colabItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999' }}>Nenhum lançamento encontrado.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                    {['Origem', 'Data', 'Semana', 'Tipo', 'Descrição', 'Valor', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colabItems.map((item, i) => (
                    <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : 'white', borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: item.origem === 'folha' ? '#e8f5e9' : '#fff3e0',
                          color: item.origem === 'folha' ? '#2e7d32' : '#e65100',
                        }}>
                          {item.origem === 'folha' ? '💰 Folha' : '📤 Saída'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px' }}>
                        {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#666', fontSize: '11px' }}>
                        {item.semana ? fmtDataBR(item.semana) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: item.tipo === 'credito' ? '#e8f5e9' : '#fce4ec',
                          color: item.tipo === 'credito' ? '#2e7d32' : '#c62828',
                        }}>
                          {item.tipoSaida || (item.tipo === 'credito' ? 'Crédito' : 'Débito')}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', maxWidth: '200px', fontSize: '11px', color: '#444' }}>
                        {item.descricao}
                        {item.obs && <div style={{ color: '#888', fontSize: '10px' }}>Obs: {item.obs}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold',
                        color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                        {item.tipo === 'debito' ? '−' : '+'}{fmtMoeda(item.valor)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                          color: item.pago ? '#2e7d32' : '#f57f17',
                        }}>
                          {item.pago ? '✅ Pago' : '⏳ Pend.'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={5} style={{ padding: '8px' }}>TOTAL DO MÊS</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7', fontSize: '13px' }}>
                      {fmtMoeda(folhaTotal + saidaCredito - saidaDebito)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div style={{ marginTop: '14px', textAlign: 'right' }}>
            <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📋 Extrato de Pagamentos" showBack={true} />
      {detalheItem && <ModalDetalhe item={detalheItem} onClose={() => setDetalheItem(null)} />}
      {colaboradorSelecionado && (
        <ModalColaborador colabId={colaboradorSelecionado} onClose={() => setColaboradorSelecionado(null)} />
      )}

      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* ── Info banner ──────────────────────────────────── */}
        <div style={{ backgroundColor: '#e3f2fd', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#1565c0', borderLeft: '4px solid #1976d2' }}>
          <strong>ℹ️ Extrato Analítico:</strong> Consolida <strong>Folha de Pagamento</strong> (dobras, CLT), <strong>Saídas</strong> (adiantamentos, descontos) e <strong>Motoboys</strong> para todos os colaboradores do mês.
          Clique em <strong>"📊 Ver"</strong> no resumo por colaborador para o analítico individual completo.
        </div>

        {/* ── Filtros ──────────────────────────────────────── */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={s.label}>Colaborador</label>
            <input type="text" placeholder="Buscar por nome..." value={filtroColaborador}
              onChange={e => setFiltroColaborador(e.target.value)} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Origem</label>
            <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="folha">💰 Folha</option>
              <option value="saida">📤 Saídas</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="credito">Crédito</option>
              <option value="debito">Débito</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Contrato</label>
            <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="CLT">CLT</option>
              <option value="Freelancer">Freelancer</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
            </select>
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={filteredItems.length === 0} style={s.btn('#7b1fa2')}>📥 XLSX</button>
          <button onClick={() => navigate('/modulos/folha-pagamento')} style={s.btn('#00838f')}>💳 Folha</button>
        </div>

        {/* ── Summary Cards ────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'Total Folha', val: fmtMoeda(totals.totalFolha), cor: '#2e7d32' },
            { label: 'Adiantamentos (saídas)', val: fmtMoeda(totals.totalSaidas), cor: '#e65100' },
            { label: 'Descontos (A receber)', val: fmtMoeda(totals.totalDescontos), cor: '#c62828' },
            { label: '✅ Total Pago', val: fmtMoeda(totals.totalPago), cor: '#1565c0' },
            { label: '⏳ Pendente', val: fmtMoeda(totals.totalPendente), cor: '#f57f17' },
            { label: 'Lançamentos', val: `${filteredItems.length}`, cor: '#6a1b9a' },
            { label: 'Colaboradores', val: `${summaryByColab.length}`, cor: '#00838f' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor, marginTop: '2px' }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* ── View mode tabs ───────────────────────────────── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '0', borderBottom: '2px solid #1976d2' }}>
          {([
            { key: 'resumo', label: '📊 Resumo por Colaborador' },
            { key: 'detalhado', label: '📄 Lançamentos Detalhados' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setViewMode(t.key)} style={s.tab(viewMode === t.key)}>{t.label}</button>
          ))}
        </div>

        {/* ── Summary per collaborator ─────────────────────── */}
        {viewMode === 'resumo' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : summaryByColab.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                <p style={{ margin: 0 }}>Nenhum lançamento encontrado para o período.</p>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#bbb' }}>
                  Verifique se há saídas ou pagamentos registrados na <strong>Folha de Pagamento</strong>.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Contrato</th>
                    <th style={s.thR}>💰 Folha</th>
                    <th style={s.thR}>📤 Adiant.</th>
                    <th style={s.thR}>🔴 Desconto</th>
                    <th style={s.thR}>Saldo</th>
                    <th style={s.thR}>✅ Pago</th>
                    <th style={s.thR}>⏳ Pendente</th>
                    <th style={s.thC}>Lançs.</th>
                    <th style={s.thC}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryByColab.map((row, i) => {
                    const adiantamentos = row.saidaItems.filter(x => x.tipo === 'credito').reduce((s, x) => s + x.valor, 0);
                    const descontos = row.saidaItems.filter(x => x.tipo === 'debito').reduce((s, x) => s + x.valor, 0);
                    const folhaVal = row.folhaItems.reduce((s, x) => s + x.valor, 0);
                    return (
                      <tr key={row.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>{row.nome}</td>
                        <td style={s.tdC}>
                          <span style={row.tipoContrato === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                            {row.tipoContrato}
                          </span>
                        </td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{folhaVal > 0 ? fmtMoeda(folhaVal) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#e65100' }}>{adiantamentos > 0 ? fmtMoeda(adiantamentos) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{descontos > 0 ? fmtMoeda(descontos) : '—'}</td>
                        <td style={{ ...s.tdR, fontWeight: 'bold', color: row.saldo >= 0 ? '#1565c0' : '#c62828' }}>{fmtMoeda(row.saldo)}</td>
                        <td style={{ ...s.tdR, color: '#1565c0' }}>{row.pago > 0 ? fmtMoeda(row.pago) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#f57f17' }}>{row.pendente > 0 ? fmtMoeda(row.pendente) : '—'}</td>
                        <td style={{ ...s.tdC, color: '#666' }}>{row.count}</td>
                        <td style={s.tdC}>
                          <button onClick={() => setColaboradorSelecionado(row.id)}
                            style={{ ...s.btn('#6a1b9a'), padding: '3px 8px', fontSize: '11px' }}
                            title="Ver analítico completo">
                            📊 Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                    <td style={{ padding: '8px 10px' }} colSpan={2}>TOTAIS ({summaryByColab.length} colaboradores)</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totals.totalFolha)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totals.totalSaidas)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ef9a9a' }}>{fmtMoeda(totals.totalDescontos)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#90caf9' }}>{fmtMoeda(totals.totalCreditos - totals.totalDebitos)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totals.totalPago)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totals.totalPendente)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{filteredItems.length}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── Detailed table ───────────────────────────────── */}
        {viewMode === 'detalhado' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
                <p style={{ margin: 0 }}>Nenhum lançamento encontrado para o período.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Contrato</th>
                    <th style={s.thC}>Origem</th>
                    <th style={s.thC}>Data</th>
                    <th style={s.thC}>Semana</th>
                    <th style={s.th}>Descrição / Tipo</th>
                    <th style={s.thR}>Bruto</th>
                    <th style={s.thR}>Transp.</th>
                    <th style={s.thR}>Valor</th>
                    <th style={s.thC}>Status</th>
                    <th style={s.thC}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, i) => (
                    <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'white')}>
                      <td style={{ ...s.td, fontWeight: 'bold' }}>{item.nomeColaborador}</td>
                      <td style={s.tdC}>
                        <span style={item.tipoContrato === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                          {item.tipoContrato || '—'}
                        </span>
                      </td>
                      <td style={s.tdC}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold',
                          backgroundColor: item.origem === 'folha' ? '#e8f5e9' : '#fff3e0',
                          color: item.origem === 'folha' ? '#2e7d32' : '#e65100',
                        }}>
                          {item.origem === 'folha' ? '💰' : '📤'} {item.origem === 'folha' ? 'Folha' : 'Saída'}
                        </span>
                      </td>
                      <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>
                        {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                      </td>
                      <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                        {item.semana ? fmtDataBR(item.semana) : '—'}
                      </td>
                      <td style={{ ...s.td, maxWidth: '200px', fontSize: '11px' }}>
                        <div style={{ color: '#333' }}>{item.descricao}</div>
                        {item.tipoSaida && <div style={{ color: '#888', fontSize: '10px' }}>{item.tipoSaida}</div>}
                        {item.obs && <div style={{ color: '#aaa', fontSize: '10px', fontStyle: 'italic' }}>{item.obs}</div>}
                      </td>
                      <td style={{ ...s.tdR, color: '#1976d2', fontSize: '11px' }}>{item.valorBruto ? fmtMoeda(item.valorBruto) : '—'}</td>
                      <td style={{ ...s.tdR, color: '#1565c0', fontSize: '11px' }}>{item.valorTransporte ? fmtMoeda(item.valorTransporte) : '—'}</td>
                      <td style={{ ...s.tdR, fontWeight: 'bold', color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                        {item.tipo === 'debito' ? '−' : '+'}{fmtMoeda(item.valor)}
                      </td>
                      <td style={s.tdC}>
                        <span style={item.pago ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff9c4', '#f57f17')}>
                          {item.pago ? '✅ Pago' : '⏳ Pend.'}
                        </span>
                      </td>
                      <td style={s.tdC}>
                        <button onClick={() => setDetalheItem(item)}
                          style={{ ...s.btn('#1976d2'), padding: '3px 8px', fontSize: '11px' }}
                          title="Ver detalhes">
                          📋
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={8} style={{ padding: '8px 10px', fontSize: '12px' }}>
                      TOTAIS ({filteredItems.length} lançamentos)
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7' }}>
                      {fmtMoeda(filteredItems.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        <div style={{ marginTop: '12px', fontSize: '11px', color: '#888', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
          ℹ️ <strong>Como usar:</strong> O Extrato consolida automaticamente a <strong>Folha de Pagamento</strong> e as <strong>Saídas</strong> vinculadas a colaboradores.
          Para marcar pagamentos, acesse a <strong>Folha de Pagamento</strong>.
          Saídas do tipo <em>"A receber"</em> aparecem como débito; adiantamentos e pagamentos avulsos aparecem como crédito.
        </div>
      </div>

      <Footer showLinks={true} />
    </div>
  );
};
