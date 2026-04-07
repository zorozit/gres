import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ExtratoItem {
  id: string;
  colaboradorId: string;
  nomeColaborador?: string;
  mes: string;
  semana?: string;
  tipoContrato?: string;
  tipo: 'credito' | 'debito';
  descricao: string;
  valor: number;
  pago: boolean;
  dataPagamento?: string;
  valorBruto?: number;
  valorTransporte?: number;
  totalFinal?: number;
  saldoFinal?: number;
  obs?: string;
  updatedAt?: string;
  unitId?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Extrato: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExtratoItem[]>([]);
  const [detalheItem, setDetalheItem] = useState<ExtratoItem | null>(null);

  // Filters
  const [filtroColaborador, setFiltroColaborador] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'credito' | 'debito'>('todos');
  const [filtroContrato, setFiltroContrato] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');

  const token = () => localStorage.getItem('auth_token');

  useEffect(() => {
    if (unitId) carregarDados();
  }, [unitId, mesAno]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [rF, rC] = await Promise.all([
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
      ]);

      let colabs: any[] = [];
      if (rC?.ok) {
        const d = await rC.json();
        colabs = Array.isArray(d) ? d : [];
      }

      if (rF?.ok) {
        const dF = await rF.json();
        const rawItems: any[] = Array.isArray(dF) ? dF : [];

        // Enrich with colaborador info and build extrato items
        const enriched: ExtratoItem[] = rawItems.map(item => {
          const colab = colabs.find((c: any) => c.id === item.colaboradorId);
          const nome = colab?.nome || item.colaboradorId;
          const tipoContrato = colab?.tipoContrato || (item.semana ? 'Freelancer' : 'CLT');
          const valorPagar = R(item.totalFinal) || R(item.saldoFinal) || 0;

          return {
            id: item.id,
            colaboradorId: item.colaboradorId,
            nomeColaborador: nome,
            mes: item.mes,
            semana: item.semana || undefined,
            tipoContrato,
            tipo: 'credito' as const,
            descricao: item.semana
              ? `Dobras semanais ${item.semana} (${tipoContrato})`
              : `Pagamento mensal CLT – ${item.mes}`,
            valor: valorPagar,
            pago: item.pago === true,
            dataPagamento: item.dataPagamento || undefined,
            valorBruto: R(item.valorBruto),
            valorTransporte: R(item.valorTransporte),
            totalFinal: R(item.totalFinal),
            saldoFinal: R(item.saldoFinal),
            obs: item.obs || '',
            updatedAt: item.updatedAt,
            unitId: item.unitId,
          };
        });

        setItems(enriched.sort((a, b) => {
          // Sort by name then mes desc
          const nameComp = (a.nomeColaborador || '').localeCompare(b.nomeColaborador || '');
          if (nameComp !== 0) return nameComp;
          return (b.mes || '').localeCompare(a.mes || '');
        }));
      } else {
        setItems([]);
      }
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
    return true;
  }), [items, filtroColaborador, filtroTipo, filtroContrato, filtroStatus]);

  /* ── Summary per collaborator ───────────────────────────── */
  const summaryByColab = useMemo(() => {
    const map: Record<string, {
      nome: string; tipoContrato: string;
      creditos: number; debitos: number; saldo: number;
      pago: number; pendente: number; count: number;
    }> = {};
    for (const item of filteredItems) {
      const id = item.colaboradorId;
      if (!map[id]) {
        map[id] = {
          nome: item.nomeColaborador || id,
          tipoContrato: item.tipoContrato || '—',
          creditos: 0, debitos: 0, saldo: 0, pago: 0, pendente: 0, count: 0,
        };
      }
      const v = item.valor;
      if (item.tipo === 'credito') { map[id].creditos += v; map[id].saldo += v; }
      else { map[id].debitos += v; map[id].saldo -= v; }
      if (item.pago) map[id].pago += v; else map[id].pendente += v;
      map[id].count++;
    }
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredItems]);

  /* ── Totals ─────────────────────────────────────────────── */
  const totals = useMemo(() => ({
    totalCreditos: filteredItems.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalDebitos: filteredItems.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0),
    totalPago: filteredItems.filter(i => i.pago).reduce((s, i) => s + i.valor, 0),
    totalPendente: filteredItems.filter(i => !i.pago).reduce((s, i) => s + i.valor, 0),
  }), [filteredItems]);

  /* ── Export XLSX ────────────────────────────────────────── */
  const exportarXLSX = () => {
    const data = filteredItems.map(i => ({
      'Colaborador': i.nomeColaborador,
      'Tipo Contrato': i.tipoContrato,
      'Mês': i.mes,
      'Semana': i.semana || '—',
      'Tipo': i.tipo === 'credito' ? 'Crédito' : 'Débito',
      'Descrição': i.descricao,
      'Valor (R$)': i.valor,
      'Bruto (R$)': i.valorBruto || 0,
      'Transporte (R$)': i.valorTransporte || 0,
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
      <div style={{ ...s.card, maxWidth: '480px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
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
              { label: 'Mês', value: item.mes },
              { label: 'Semana', value: item.semana || 'Mensal' },
              { label: 'Tipo', value: item.tipo === 'credito' ? '📈 Crédito' : '📉 Débito' },
              { label: 'Descrição', value: item.descricao },
              { label: 'Valor Total', value: fmtMoeda(item.valor) },
              { label: 'Bruto', value: item.valorBruto ? fmtMoeda(item.valorBruto) : '—' },
              { label: 'Transporte', value: item.valorTransporte ? fmtMoeda(item.valorTransporte) : '—' },
              { label: 'Status', value: item.pago ? '✅ Pago' : '⏳ Pendente' },
              { label: 'Data Pagamento', value: item.dataPagamento || '—' },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📋 Extrato de Pagamentos" showBack={true} />
      {detalheItem && <ModalDetalhe item={detalheItem} onClose={() => setDetalheItem(null)} />}

      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* ── Filtros ──────────────────────────────────────── */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={s.label}>Colaborador</label>
            <input type="text" placeholder="Buscar por nome..." value={filtroColaborador}
              onChange={e => setFiltroColaborador(e.target.value)} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="credito">Crédito</option>
              <option value="debito">Débito</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Contrato</label>
            <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="CLT">CLT</option>
              <option value="Freelancer">Freelancer</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
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
            { label: 'Total Créditos', val: fmtMoeda(totals.totalCreditos), cor: '#2e7d32' },
            { label: 'Total Débitos', val: fmtMoeda(totals.totalDebitos), cor: '#c62828' },
            { label: 'Total Pago', val: fmtMoeda(totals.totalPago), cor: '#1565c0' },
            { label: 'Total Pendente', val: fmtMoeda(totals.totalPendente), cor: '#f57f17' },
            { label: 'Lançamentos', val: `${filteredItems.length}`, cor: '#6a1b9a' },
            { label: 'Colaboradores', val: `${summaryByColab.length}`, cor: '#00838f' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: c.cor, marginTop: '2px' }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* ── Summary per collaborator ─────────────────────── */}
        {summaryByColab.length > 0 && (
          <div style={{ ...s.card, marginBottom: '18px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#1565c0', fontSize: '14px' }}>📊 Resumo por Colaborador</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Colaborador</th>
                  <th style={s.thC}>Contrato</th>
                  <th style={s.thR}>Créditos</th>
                  <th style={s.thR}>Débitos</th>
                  <th style={s.thR}>Saldo</th>
                  <th style={s.thR}>✅ Pago</th>
                  <th style={s.thR}>⏳ Pendente</th>
                  <th style={s.thC}>Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {summaryByColab.map((row, i) => (
                  <tr key={row.nome + i} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                    <td style={{ ...s.td, fontWeight: 'bold' }}>{row.nome}</td>
                    <td style={s.tdC}>
                      <span style={row.tipoContrato === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                        {row.tipoContrato}
                      </span>
                    </td>
                    <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{fmtMoeda(row.creditos)}</td>
                    <td style={{ ...s.tdR, color: '#c62828' }}>{row.debitos > 0 ? fmtMoeda(row.debitos) : '—'}</td>
                    <td style={{ ...s.tdR, fontWeight: 'bold', color: row.saldo >= 0 ? '#1565c0' : '#c62828' }}>{fmtMoeda(row.saldo)}</td>
                    <td style={{ ...s.tdR, color: '#1565c0' }}>{row.pago > 0 ? fmtMoeda(row.pago) : '—'}</td>
                    <td style={{ ...s.tdR, color: '#f57f17' }}>{row.pendente > 0 ? fmtMoeda(row.pendente) : '—'}</td>
                    <td style={{ ...s.tdC, color: '#666' }}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                  <td style={{ padding: '8px 10px' }} colSpan={2}>TOTAIS ({summaryByColab.length} colaboradores)</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(summaryByColab.reduce((s, r) => s + r.creditos, 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ef9a9a' }}>{fmtMoeda(summaryByColab.reduce((s, r) => s + r.debitos, 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#90caf9' }}>{fmtMoeda(summaryByColab.reduce((s, r) => s + r.saldo, 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totals.totalPago)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totals.totalPendente)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{filteredItems.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Detailed table ───────────────────────────────── */}
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1565c0', fontSize: '14px' }}>
            📄 Lançamentos Detalhados
            {filteredItems.length > 0 && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>({filteredItems.length} registros)</span>}
          </h4>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <p style={{ margin: 0 }}>Nenhum lançamento encontrado para o período.</p>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#bbb' }}>
                Os registros aparecem aqui quando pagamentos são marcados na <strong>Folha de Pagamento</strong>.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Colaborador</th>
                  <th style={s.thC}>Contrato</th>
                  <th style={s.thC}>Mês</th>
                  <th style={s.thC}>Semana</th>
                  <th style={s.thC}>Tipo</th>
                  <th style={s.th}>Descrição</th>
                  <th style={s.thR}>Bruto</th>
                  <th style={s.thR}>Transp.</th>
                  <th style={s.thR}>Total</th>
                  <th style={s.thC}>Status</th>
                  <th style={s.thC}>Data Pgto</th>
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
                    <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>{item.mes}</td>
                    <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>{item.semana || '—'}</td>
                    <td style={s.tdC}>
                      <span style={item.tipo === 'credito' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fce4ec', '#c62828')}>
                        {item.tipo === 'credito' ? '📈 C' : '📉 D'}
                      </span>
                    </td>
                    <td style={{ ...s.td, maxWidth: '200px', fontSize: '11px', color: '#555' }}>{item.descricao}</td>
                    <td style={{ ...s.tdR, color: '#1976d2' }}>{item.valorBruto ? fmtMoeda(item.valorBruto) : '—'}</td>
                    <td style={{ ...s.tdR, color: '#1565c0' }}>{item.valorTransporte ? fmtMoeda(item.valorTransporte) : '—'}</td>
                    <td style={{ ...s.tdR, fontWeight: 'bold', color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                      {fmtMoeda(item.valor)}
                    </td>
                    <td style={s.tdC}>
                      <span style={item.pago ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff9c4', '#f57f17')}>
                        {item.pago ? '✅ Pago' : '⏳ Pend.'}
                      </span>
                    </td>
                    <td style={{ ...s.tdC, fontSize: '11px', color: item.dataPagamento ? '#2e7d32' : '#bbb' }}>
                      {item.dataPagamento || '—'}
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
                  <td colSpan={8} style={{ padding: '8px 10px', fontSize: '13px' }}>
                    TOTAIS ({filteredItems.length} lançamentos)
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7' }}>
                    {fmtMoeda(filteredItems.reduce((s, i) => s + i.valor, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ marginTop: '12px', fontSize: '11px', color: '#888', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
          ℹ️ <strong>Nota:</strong> O Extrato registra automaticamente os pagamentos lançados na <strong>Folha de Pagamento</strong> (abas CLT, Dobras Semanais e Freelancers).
          Para ver pagamentos, acesse a Folha e marque os pagamentos como <em>Pago</em>.
        </div>
      </div>

      <Footer showLinks={true} />
    </div>
  );
};
