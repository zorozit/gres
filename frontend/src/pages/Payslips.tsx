import React, { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
// useAuth not needed
import { Header } from '../components/Header';
import { fetchAuth } from '../utils/fetchAuth';

const apiUrl = (import.meta as any).env?.VITE_API_ENDPOINT || '';
const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Payslip {
  id: string;
  colaboradorId: string;
  nomeColaborador: string;
  unitId: string;
  periodo: string;
  periodoInicio: string;
  periodoFim: string;
  mes: string;
  bruto: number;
  transporte: number;
  descontos: number;
  adiantamentos: number;
  liquido: number;
  status: string;
  pagamentos: string[];
  criadoEm: string;
  atualizadoEm: string;
}

export default function Payslips() {
  const { activeUnit } = useUnit();
  // const { user } = useAuth();
  const unitId = activeUnit?.id || '';
  const token = () => localStorage.getItem('auth_token') || '';

  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [mesAno, setMesAno] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [detalhe, setDetalhe] = useState<Payslip | null>(null);

  const carregarPayslips = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const r = await fetchAuth(`${apiUrl}/payslips?unitId=${unitId}&mes=${mesAno}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const data = await r.json();
      setPayslips(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error('Erro ao carregar payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarPayslips(); }, [unitId, mesAno]);

  const q = busca.toLowerCase();
  const filtrados = useMemo(() => {
    return payslips.filter(p => {
      const matchBusca = !busca || (p.nomeColaborador || '').toLowerCase().includes(q) || p.colaboradorId.includes(q);
      const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
      return matchBusca && matchStatus;
    });
  }, [payslips, busca, filtroStatus]);

  // Agrupado por colaborador
  const porColaborador = useMemo(() => {
    const map: Record<string, { nome: string; payslips: Payslip[]; totalLiquido: number; totalBruto: number }> = {};
    filtrados.forEach(p => {
      if (!map[p.colaboradorId]) {
        map[p.colaboradorId] = { nome: p.nomeColaborador, payslips: [], totalLiquido: 0, totalBruto: 0 };
      }
      map[p.colaboradorId].payslips.push(p);
      map[p.colaboradorId].totalLiquido += p.liquido || 0;
      map[p.colaboradorId].totalBruto += p.bruto || 0;
    });
    return Object.entries(map).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [filtrados]);

  const totalGeral = useMemo(() => ({
    bruto: filtrados.reduce((s, p) => s + (p.bruto || 0), 0),
    descontos: filtrados.reduce((s, p) => s + (p.descontos || 0), 0),
    liquido: filtrados.reduce((s, p) => s + (p.liquido || 0), 0),
    count: filtrados.length,
  }), [filtrados]);

  const statusBadge = (status: string) => {
    const cores: Record<string, { bg: string; fg: string }> = {
      pago: { bg: '#e8f5e9', fg: '#2e7d32' },
      pendente: { bg: '#fff3e0', fg: '#e65100' },
      parcial: { bg: '#e3f2fd', fg: '#1565c0' },
    };
    const c = cores[status] || { bg: '#f5f5f5', fg: '#616161' };
    return <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
      {status === 'pago' ? '✅' : status === 'pendente' ? '⏳' : '🔄'} {status}
    </span>;
  };

  const s = {
    card: { background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } as React.CSSProperties,
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' } as React.CSSProperties,
    stat: (cor: string) => ({ background: cor + '15', border: `1px solid ${cor}40`, borderRadius: '8px', padding: '12px', textAlign: 'center' as const }),
    input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' } as React.CSSProperties,
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <Header title="🧾 Payslips — Resumos de Pagamento" showBack={true} />

      {/* Filtros */}
      <div style={{ ...s.card, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Mês/Ano</label>
          <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={s.input} />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Buscar colaborador</label>
          <input type="text" placeholder="Nome..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.input, width: '100%' }} />
        </div>
        <div>
          <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={s.input}>
            <option value="todos">Todos</option>
            <option value="pago">✅ Pago</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="parcial">🔄 Parcial</option>
          </select>
        </div>
        <button onClick={carregarPayslips} style={{ ...s.input, cursor: 'pointer', background: '#1976d2', color: 'white', border: 'none', fontWeight: 'bold' }}>
          🔄 Atualizar
        </button>
      </div>

      {/* Totalizadores */}
      <div style={{ ...s.card, ...s.grid }}>
        <div style={s.stat('#2e7d32')}>
          <div style={{ fontSize: '11px', color: '#666' }}>Payslips</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2e7d32' }}>{totalGeral.count}</div>
        </div>
        <div style={s.stat('#1565c0')}>
          <div style={{ fontSize: '11px', color: '#666' }}>Total Bruto</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1565c0' }}>{fmtMoeda(totalGeral.bruto)}</div>
        </div>
        <div style={s.stat('#e65100')}>
          <div style={{ fontSize: '11px', color: '#666' }}>Total Descontos</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#e65100' }}>{fmtMoeda(totalGeral.descontos)}</div>
        </div>
        <div style={s.stat('#2e7d32')}>
          <div style={{ fontSize: '11px', color: '#666' }}>Total Líquido</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(totalGeral.liquido)}</div>
        </div>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>⏳ Carregando...</div>}

      {/* Lista vazia */}
      {!loading && filtrados.length === 0 && (
        <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🧾</div>
          <div>Nenhum payslip encontrado para {mesAno}</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Payslips são gerados automaticamente ao confirmar pagamentos.</div>
        </div>
      )}

      {/* Lista por colaborador */}
      {porColaborador.map(([colabId, grupo]) => (
        <div key={colabId} style={{ ...s.card, borderLeft: '4px solid #1976d2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>👤 {grupo.nome}</strong>
              <span style={{ fontSize: '11px', color: '#999', marginLeft: '8px' }}>{colabId}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#666' }}>Total líquido mês</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(grupo.totalLiquido)}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Período</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Bruto</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Transporte</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Descontos</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Líquido</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {grupo.payslips.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <div>{p.periodo}</div>
                    <div style={{ fontSize: '10px', color: '#999' }}>{p.periodoInicio} → {p.periodoFim}</div>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(p.bruto)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1565c0' }}>{p.transporte > 0 ? fmtMoeda(p.transporte) : '-'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>{p.descontos > 0 ? `-${fmtMoeda(p.descontos)}` : '-'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(p.liquido)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{statusBadge(p.status)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button onClick={() => setDetalhe(p)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>
                      📋 Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Modal detalhe */}
      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setDetalhe(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              🧾 Detalhe do Payslip
              <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
              <div><span style={{ color: '#666' }}>Colaborador:</span><br /><strong>{detalhe.nomeColaborador}</strong></div>
              <div><span style={{ color: '#666' }}>Período:</span><br /><strong>{detalhe.periodo}</strong></div>
              <div><span style={{ color: '#666' }}>Início:</span><br />{detalhe.periodoInicio}</div>
              <div><span style={{ color: '#666' }}>Fim:</span><br />{detalhe.periodoFim}</div>
            </div>

            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

            <div style={{ fontSize: '14px', lineHeight: '2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>💰 Bruto (dobras)</span> <strong>{fmtMoeda(detalhe.bruto)}</strong>
              </div>
              {detalhe.transporte > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1565c0' }}>
                  <span>🚗 Transporte</span> <strong>+{fmtMoeda(detalhe.transporte)}</strong>
                </div>
              )}
              {detalhe.adiantamentos > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7b1fa2' }}>
                  <span>📥 Adiantamentos</span> <strong>-{fmtMoeda(detalhe.adiantamentos)}</strong>
                </div>
              )}
              {detalhe.descontos > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                  <span>📉 Descontos</span> <strong>-{fmtMoeda(detalhe.descontos)}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #333', paddingTop: '8px', marginTop: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>✅ Líquido</span>
                <strong style={{ fontSize: '18px', color: '#2e7d32' }}>{fmtMoeda(detalhe.liquido)}</strong>
              </div>
            </div>

            <div style={{ marginTop: '12px', fontSize: '11px', color: '#999' }}>
              <div>Status: {statusBadge(detalhe.status)}</div>
              <div>Criado: {detalhe.criadoEm ? new Date(detalhe.criadoEm).toLocaleString('pt-BR') : '-'}</div>
              <div>Atualizado: {detalhe.atualizadoEm ? new Date(detalhe.atualizadoEm).toLocaleString('pt-BR') : '-'}</div>
              {detalhe.pagamentos?.length > 0 && <div>IDs: {detalhe.pagamentos.join(', ')}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
