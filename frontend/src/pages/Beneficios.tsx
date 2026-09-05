/**
 * Módulo de Benefícios — Vale Transporte
 *
 * Fluxo:
 *   1. Pagar VT (início do mês, dia 1~5) → gera payslip imediatamente
 *   2. Apurar consumo (ao longo/fim do mês) → conta dias via escalas
 *   3. Fechar mês → concilia crédito vs consumo, saldo vai pro próximo mês
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';

const API = import.meta.env.VITE_API_ENDPOINT || '';
const tk = () => localStorage.getItem('auth_token') || '';
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  presente: { bg: '#e8f5e9', color: '#2e7d32', label: '✅ Presente' },
  falta:    { bg: '#ffebee', color: '#c62828', label: '❌ Falta' },
  folga:    { bg: '#e3f2fd', color: '#1565c0', label: '😴 Folga' },
  atestado: { bg: '#fff3e0', color: '#e65100', label: '🏥 Atestado' },
  ferias:   { bg: '#f3e5f5', color: '#6a1b9a', label: '🏖️ Férias' },
  licenca:  { bg: '#fce4ec', color: '#880e4f', label: '📋 Licença' },
  ausente:  { bg: '#f5f5f5', color: '#999', label: '—' },
};

interface Colab {
  id: string; nome: string; tipoContrato: string; ativo: boolean;
  beneficioTransporte?: { tipo: string; valorMensal: number; valorDiario: number; diaCredito: number };
  valorTransporte: number;
}

interface Beneficio {
  id: string; colaboradorId: string; colaboradorNome: string; mes: string;
  tipoBeneficio: string;
  valorPago: number; valorDiario: number; valorApurado: number;
  diasPresentes: number; saldoAnterior: number; saldoFinal: number | null;
  status: 'pago' | 'fechado';
  dataPagamento: string; formaPagamento: string;
  ajustes?: { descricao: string; valor: number }[];
  totalAjustes?: number; obs?: string;
  fechadoEm?: string; pagoEm?: string;
}

interface Apuracao {
  colaboradorId: string; colaboradorNome: string; mes: string;
  beneficioTransporte: any; valorDiario: number;
  valorCreditado: number; valorApurado: number; saldo: number;
  saldoAnterior: number;
  diasPresentes: number; diasFalta: number; diasFolga: number;
  diasAtestado: number; diasFerias: number; totalEscalados: number;
  dias: { data: string; turno: string; status: string; valor: number }[];
  beneficioExistente: Beneficio | null;
}

export default function Beneficios() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const hoje = new Date();
  const mesDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const [mes, setMes] = useState(mesDefault);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedColab, setSelectedColab] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<Apuracao | null>(null);
  const [apurando, setApurando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [msg, setMsg] = useState('');
  const [valorPagoInput, setValorPagoInput] = useState('');
  const [ajustes, setAjustes] = useState<{ descricao: string; valor: string }[]>([]);
  const [obs, setObs] = useState('');

  const authFetch = useCallback(async (url: string, opts: any = {}) => {
    return fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${tk()}`, 'Content-Type': 'application/json' } });
  }, []);

  const carregar = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [rCol, rBen] = await Promise.all([
        authFetch(`${API}/colaboradores?unitId=${unitId}&incluirInativos=true`),
        authFetch(`${API}/beneficios?unitId=${unitId}&mes=${mes}`),
      ]);
      if (rCol.ok) setColabs(await rCol.json());
      if (rBen.ok) setBeneficios(await rBen.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [unitId, mes, authFetch]);

  useEffect(() => { carregar(); }, [carregar]);

  const colabsBeneficio = useMemo(() =>
    colabs.filter(c => c.ativo !== false && c.beneficioTransporte?.tipo && c.beneficioTransporte.tipo !== 'nenhum')
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colabs]
  );

  const benMap = useMemo(() => {
    const m = new Map<string, Beneficio>();
    beneficios.forEach(b => m.set(b.colaboradorId, b));
    return m;
  }, [beneficios]);

  const selecionarColab = async (colabId: string) => {
    setSelectedColab(colabId);
    setApuracao(null);
    setApurando(true);
    setMsg('');
    setAjustes([]);
    setObs('');
    const colab = colabs.find(c => c.id === colabId);
    setValorPagoInput(colab?.beneficioTransporte?.valorMensal?.toString().replace('.', ',') || '0');
    try {
      const r = await authFetch(`${API}/beneficios/apurar?unitId=${unitId}&mes=${mes}&colaboradorId=${colabId}`);
      if (r.ok) setApuracao(await r.json());
      else { const err = await r.json(); setMsg(`❌ ${err.error || 'Erro ao apurar'}`); }
    } catch (e) { setMsg('❌ Erro de conexão'); }
    finally { setApurando(false); }
  };

  const getUser = () => JSON.parse(localStorage.getItem('user_data') || '{}');

  const pagarVT = async () => {
    if (!apuracao) return;
    setProcessando(true); setMsg('');
    try {
      const user = getUser();
      const r = await authFetch(`${API}/beneficios/pagar`, {
        method: 'POST',
        body: JSON.stringify({
          unitId, mes, colaboradorId: apuracao.colaboradorId,
          valorPago: parseFloat(valorPagoInput.replace(',', '.')) || 0,
          dataPagamento: new Date().toISOString().split('T')[0],
          formaPagamento: 'PIX',
          obs, responsavelId: user.id || user.email || '', responsavelNome: user.nome || user.email || '',
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ VT pago para ${apuracao.colaboradorNome} — Payslip gerado`);
        await carregar();
        await selecionarColab(apuracao.colaboradorId);
      } else setMsg(`❌ ${data.error || 'Erro'}`);
    } catch (e) { setMsg('❌ Erro de conexão'); }
    finally { setProcessando(false); }
  };

  const fecharMes = async () => {
    if (!apuracao) return;
    setProcessando(true); setMsg('');
    try {
      const user = getUser();
      const ajustesNum = ajustes.filter(a => a.descricao.trim()).map(a => ({
        descricao: a.descricao, valor: parseFloat(a.valor.replace(',', '.')) || 0,
      }));
      const r = await authFetch(`${API}/beneficios/fechar`, {
        method: 'POST',
        body: JSON.stringify({
          unitId, mes, colaboradorId: apuracao.colaboradorId,
          ajustes: ajustesNum, obs,
          responsavelId: user.id || '', responsavelNome: user.nome || '',
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ Mês fechado para ${apuracao.colaboradorNome} — Saldo: ${fmt(data.beneficio.saldoFinal)}`);
        await carregar();
        await selecionarColab(apuracao.colaboradorId);
      } else setMsg(`❌ ${data.error || 'Erro'}`);
    } catch (e) { setMsg('❌ Erro de conexão'); }
    finally { setProcessando(false); }
  };

  const reabrir = async () => {
    if (!apuracao || !confirm('Reabrir fechamento? O saldo será zerado.')) return;
    setProcessando(true); setMsg('');
    try {
      const r = await authFetch(`${API}/beneficios/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ unitId, mes, colaboradorId: apuracao.colaboradorId }),
      });
      if (r.ok) {
        setMsg('🔓 Fechamento reaberto');
        await carregar();
        await selecionarColab(apuracao.colaboradorId);
      } else { const d = await r.json(); setMsg(`❌ ${d.error}`); }
    } catch (e) { setMsg('❌ Erro'); }
    finally { setProcessando(false); }
  };

  const mesLabel = (m: string) => {
    const [y, mm] = m.split('-');
    const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${nomes[parseInt(mm)]}/${y}`;
  };

  const ben = apuracao?.beneficioExistente;
  const isPago = ben?.status === 'pago' || ben?.status === 'fechado';
  const isFechado = ben?.status === 'fechado';
  const totalAjustesNum = ajustes.reduce((s, a) => s + (parseFloat(a.valor.replace(',', '.')) || 0), 0);

  // Totais do mês
  const totalPago = beneficios.reduce((s, b) => s + (b.valorPago || 0), 0);
  const totalFechados = beneficios.filter(b => b.status === 'fechado').length;
  const totalPagos = beneficios.filter(b => b.status === 'pago' || b.status === 'fechado').length;

  return (
    <div style={{ padding: '20px', maxWidth: '1300px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>🚌 Vale Transporte</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: '13px' }}>
            {mesLabel(mes)} — {totalPagos}/{colabsBeneficio.length} pagos • {totalFechados} fechados
            {totalPago > 0 && ` • Total: ${fmt(totalPago)}`}
          </p>
        </div>
        <input type="month" value={mes} onChange={e => { setMes(e.target.value); setSelectedColab(null); setApuracao(null); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', marginBottom: '12px', borderRadius: '6px',
          background: msg.startsWith('✅') || msg.startsWith('🔓') ? '#e8f5e9' : '#ffebee',
          color: msg.startsWith('✅') || msg.startsWith('🔓') ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
          {msg}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedColab ? '300px 1fr' : '1fr', gap: '16px' }}>
          {/* Lista colaboradores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {colabsBeneficio.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                Nenhum CLT com VT configurado.<br/>Configure em Colaboradores → Editar.
              </div>
            ) : colabsBeneficio.map(c => {
              const b = benMap.get(c.id);
              const isSelected = selectedColab === c.id;
              const bt = c.beneficioTransporte!;
              return (
                <div key={c.id} onClick={() => selecionarColab(c.id)} style={{
                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${isSelected ? '#1976d2' : b?.status === 'fechado' ? '#4caf50' : b?.status === 'pago' ? '#ff9800' : '#e0e0e0'}`,
                  background: isSelected ? '#e3f2fd' : '#fff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.nome}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{fmt(bt.valorMensal)}/mês</div>
                    </div>
                    {b?.status === 'fechado' ? (
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#e8f5e9', color: '#2e7d32' }}>✅ Fechado</span>
                    ) : b?.status === 'pago' ? (
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#fff3e0', color: '#e65100' }}>💰 Pago</span>
                    ) : (
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#f5f5f5', color: '#999' }}>⏳ Pendente</span>
                    )}
                  </div>
                  {b && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    Pago: {fmt(b.valorPago)} {b.saldoFinal != null && `• Saldo: ${fmt(b.saldoFinal)}`}
                  </div>}
                </div>
              );
            })}
          </div>

          {/* Painel direito */}
          {apuracao && (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px' }}>
              {apurando ? <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳ Apurando...</div> : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>{apuracao.colaboradorNome}</h2>
                      <p style={{ margin: '2px 0 0', color: '#888', fontSize: '12px' }}>
                        VT {mesLabel(mes)} • {fmt(apuracao.valorDiario)}/dia
                        {apuracao.saldoAnterior !== 0 && (
                          <span style={{ color: apuracao.saldoAnterior > 0 ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                            {' '}• Saldo anterior: {fmt(apuracao.saldoAnterior)}
                          </span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => { setApuracao(null); setSelectedColab(null); }}
                      style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#999' }}>✕</button>
                  </div>

                  {/* PASSO 1: Pagar */}
                  {!isPago && (
                    <div style={{ background: '#f0f7ff', border: '1px solid #bbdefb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1565c0', marginBottom: '10px' }}>💰 Pagar Vale Transporte</div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '3px' }}>Valor (R$)</label>
                          <input type="text" inputMode="decimal" value={valorPagoInput}
                            onChange={e => setValorPagoInput(e.target.value)}
                            onFocus={e => e.target.select()}
                            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '16px', fontWeight: 700, width: '140px', textAlign: 'right' as const }} />
                        </div>
                        <button onClick={pagarVT} disabled={processando}
                          style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', background: '#4caf50', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: processando ? 0.6 : 1 }}>
                          {processando ? '⏳...' : '💰 Pagar e gerar payslip'}
                        </button>
                      </div>
                      {apuracao.saldoAnterior !== 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: apuracao.saldoAnterior > 0 ? '#2e7d32' : '#c62828' }}>
                          {apuracao.saldoAnterior > 0
                            ? `ℹ️ Saldo positivo de ${fmt(apuracao.saldoAnterior)} do mês anterior será somado.`
                            : `⚠️ Excedente de ${fmt(Math.abs(apuracao.saldoAnterior))} do mês anterior será descontado.`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Info de pagamento já feito */}
                  {isPago && ben && (
                    <div style={{ background: '#f1f8e9', border: '1px solid #c5e1a5', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
                      <strong>💰 Pago em {ben.dataPagamento}</strong> — {fmt(ben.valorPago)} via {ben.formaPagamento}
                      {ben.saldoAnterior !== 0 && <span> (saldo anterior: {fmt(ben.saldoAnterior)})</span>}
                    </div>
                  )}

                  {/* Cards presença */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '16px' }}>
                    {[
                      { label: 'Presentes', value: apuracao.diasPresentes, color: '#2e7d32', bg: '#e8f5e9' },
                      { label: 'Faltas', value: apuracao.diasFalta, color: '#c62828', bg: '#ffebee' },
                      { label: 'Folgas', value: apuracao.diasFolga, color: '#1565c0', bg: '#e3f2fd' },
                      { label: 'Atestados', value: apuracao.diasAtestado, color: '#e65100', bg: '#fff3e0' },
                      { label: 'Férias', value: apuracao.diasFerias, color: '#6a1b9a', bg: '#f3e5f5' },
                    ].map(c => (
                      <div key={c.label} style={{ padding: '6px', borderRadius: '6px', background: c.bg, textAlign: 'center' }}>
                        <div style={{ fontSize: '9px', color: c.color, fontWeight: 700, textTransform: 'uppercase' as const }}>{c.label}</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: c.color }}>{c.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Resumo financeiro */}
                  {isPago && (
                    <div style={{ background: '#fafafa', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                      <table style={{ width: '100%', fontSize: '13px' }}>
                        <tbody>
                          <tr><td style={{ color: '#888' }}>Pago (crédito)</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: '#2e7d32' }}>{fmt(ben!.valorPago)}</td></tr>
                          {ben!.saldoAnterior !== 0 && (
                            <tr><td style={{ color: '#888' }}>Saldo mês anterior</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: ben!.saldoAnterior > 0 ? '#2e7d32' : '#c62828' }}>{fmt(ben!.saldoAnterior)}</td></tr>
                          )}
                          <tr><td style={{ color: '#888' }}>Consumo ({apuracao.diasPresentes}d × {fmt(apuracao.valorDiario)})</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: '#e65100' }}>- {fmt(apuracao.valorApurado)}</td></tr>
                          {totalAjustesNum !== 0 && <tr><td style={{ color: '#888' }}>Ajustes</td><td style={{ textAlign: 'right' as const, fontWeight: 600 }}>{fmt(totalAjustesNum)}</td></tr>}
                          <tr style={{ borderTop: '2px solid #ddd' }}>
                            <td style={{ fontWeight: 700, paddingTop: '6px' }}>
                              {isFechado ? 'Saldo final' : 'Saldo estimado'}
                            </td>
                            <td style={{ textAlign: 'right' as const, fontWeight: 800, fontSize: '16px', paddingTop: '6px',
                              color: isFechado
                                ? (ben!.saldoFinal! >= 0 ? '#2e7d32' : '#c62828')
                                : ((ben!.valorPago + ben!.saldoAnterior - apuracao.valorApurado + totalAjustesNum) >= 0 ? '#2e7d32' : '#c62828')
                            }}>
                              {isFechado ? fmt(ben!.saldoFinal!) : fmt(ben!.valorPago + ben!.saldoAnterior - apuracao.valorApurado + totalAjustesNum)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detalhamento dia a dia */}
                  <details style={{ marginBottom: '16px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#555' }}>
                      📅 Dias ({apuracao.totalEscalados} na escala)
                    </summary>
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px', marginTop: '6px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead><tr style={{ background: '#f5f5f5', position: 'sticky' as const, top: 0 }}>
                          <th style={{ padding: '5px 8px', textAlign: 'left' as const }}>Data</th>
                          <th style={{ padding: '5px 8px', textAlign: 'center' as const }}>Turno</th>
                          <th style={{ padding: '5px 8px', textAlign: 'center' as const }}>Status</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right' as const }}>Valor</th>
                        </tr></thead>
                        <tbody>{apuracao.dias.map(d => {
                          const sc = STATUS_COLORS[d.status] || STATUS_COLORS.ausente;
                          const ds = new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
                          return (<tr key={d.data} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '4px 8px' }}>{d.data.split('-').reverse().join('/')} <span style={{ color: '#bbb' }}>({ds})</span></td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' as const }}>{d.turno}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' as const }}>
                              <span style={{ padding: '2px 6px', borderRadius: '10px', background: sc.bg, color: sc.color, fontSize: '10px', fontWeight: 600 }}>{sc.label}</span>
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' as const, fontWeight: d.valor > 0 ? 600 : 400, color: d.valor > 0 ? '#2e7d32' : '#ccc' }}>
                              {d.valor > 0 ? fmt(d.valor) : '—'}
                            </td>
                          </tr>);
                        })}</tbody>
                      </table>
                    </div>
                  </details>

                  {/* Ajustes + Fechar (só se já pagou e ainda não fechou) */}
                  {isPago && !isFechado && (
                    <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#555' }}>⚙️ Ajustes (opcional)</span>
                        <button onClick={() => setAjustes([...ajustes, { descricao: '', valor: '' }])}
                          style={{ padding: '3px 10px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>+ Ajuste</button>
                      </div>
                      {ajustes.map((aj, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                          <input type="text" placeholder="Descrição" value={aj.descricao}
                            onChange={e => { const n = [...ajustes]; n[i].descricao = e.target.value; setAjustes(n); }}
                            style={{ flex: 1, padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                          <input type="text" inputMode="decimal" placeholder="0,00" value={aj.valor}
                            onChange={e => { const n = [...ajustes]; n[i].valor = e.target.value; setAjustes(n); }}
                            style={{ width: '90px', padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'right' as const }} />
                          <button onClick={() => setAjustes(ajustes.filter((_, j) => j !== i))}
                            style={{ padding: '3px 6px', border: 'none', background: '#ffebee', color: '#c62828', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                        </div>
                      ))}
                      <textarea placeholder="Obs (opcional)" value={obs} onChange={e => setObs(e.target.value)}
                        rows={2} style={{ width: '100%', padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', marginTop: '6px', resize: 'vertical' as const }} />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button onClick={fecharMes} disabled={processando}
                          style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', background: '#1976d2', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: processando ? 0.6 : 1 }}>
                          {processando ? '⏳...' : '🔒 Fechar mês'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Se fechado: reabrir */}
                  {isFechado && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                      <button onClick={reabrir} disabled={processando}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#ff9800', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
                        🔓 Reabrir fechamento
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
