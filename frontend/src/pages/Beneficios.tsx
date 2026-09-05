/**
 * Módulo de Benefícios — Controle individualizado de benefício transporte
 *
 * Fluxo: Selecionar colaborador → Apurar dias (via escalas) → Ajustar → Fechar (gera payslip)
 * Cada fechamento é individual, gera payslip em gres-prod-payslips.
 * ZERO writes em gres-prod-saidas ou gres-prod-folha-pagamento.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';

const API = import.meta.env.VITE_API_ENDPOINT || '';
const tk = () => localStorage.getItem('auth_token') || '';
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDia = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

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
  valorCreditado: number; valorApurado: number; valorDiario: number;
  diasPresentes: number; saldo: number; status: string;
  ajustes?: { descricao: string; valor: number }[];
  totalAjustes?: number; obs?: string;
  fechadoEm?: string; fechadoPor?: string;
  composicao?: any[];
}

interface Apuracao {
  colaboradorId: string; colaboradorNome: string; mes: string;
  beneficioTransporte: any; valorDiario: number;
  valorCreditado: number; valorApurado: number; saldo: number;
  diasPresentes: number; diasFalta: number; diasFolga: number;
  diasAtestado: number; diasFerias: number; totalEscalados: number;
  dias: { data: string; turno: string; status: string; valor: number; presencaDia: string; presencaNoite: string }[];
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
  const [fechando, setFechando] = useState(false);
  const [msg, setMsg] = useState('');
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

  // CLTs com benefício configurado
  const colabsBeneficio = useMemo(() =>
    colabs.filter(c =>
      c.ativo !== false &&
      c.beneficioTransporte &&
      c.beneficioTransporte.tipo &&
      c.beneficioTransporte.tipo !== 'nenhum'
    ).sort((a, b) => a.nome.localeCompare(b.nome)),
    [colabs]
  );

  // Map benefício existente por colaboradorId
  const benMap = useMemo(() => {
    const m = new Map<string, Beneficio>();
    beneficios.forEach(b => m.set(b.colaboradorId, b));
    return m;
  }, [beneficios]);

  const apurar = async (colabId: string) => {
    setSelectedColab(colabId);
    setApuracao(null);
    setApurando(true);
    setMsg('');
    setAjustes([]);
    setObs('');
    try {
      const r = await authFetch(`${API}/beneficios/apurar?unitId=${unitId}&mes=${mes}&colaboradorId=${colabId}`);
      if (r.ok) {
        setApuracao(await r.json());
      } else {
        const err = await r.json();
        setMsg(`❌ ${err.error || 'Erro ao apurar'}`);
      }
    } catch (e) { setMsg('❌ Erro de conexão ao apurar'); }
    finally { setApurando(false); }
  };

  const fechar = async () => {
    if (!apuracao) return;
    setFechando(true);
    setMsg('');
    try {
      const ajustesNum = ajustes.filter(a => a.descricao.trim()).map(a => ({
        descricao: a.descricao,
        valor: parseFloat(a.valor.replace(',', '.')) || 0,
      }));
      const user = JSON.parse(localStorage.getItem('user_data') || '{}');
      const r = await authFetch(`${API}/beneficios/fechar`, {
        method: 'POST',
        body: JSON.stringify({
          unitId, mes,
          colaboradorId: apuracao.colaboradorId,
          valorCreditado: apuracao.valorCreditado,
          valorApurado: apuracao.valorApurado,
          diasPresentes: apuracao.diasPresentes,
          valorDiario: apuracao.valorDiario,
          ajustes: ajustesNum,
          obs,
          responsavelId: user.id || user.email || '',
          responsavelNome: user.nome || user.email || '',
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ Benefício fechado para ${apuracao.colaboradorNome} — Payslip gerado`);
        setApuracao(null);
        setSelectedColab(null);
        await carregar();
      } else {
        setMsg(`❌ ${data.error || 'Erro ao fechar'}`);
      }
    } catch (e) { setMsg('❌ Erro de conexão'); }
    finally { setFechando(false); }
  };

  const reabrir = async (colabId: string) => {
    if (!confirm('Reabrir benefício? O payslip será removido.')) return;
    setMsg('');
    try {
      const r = await authFetch(`${API}/beneficios/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ unitId, mes, colaboradorId: colabId }),
      });
      if (r.ok) {
        setMsg('🔓 Benefício reaberto');
        await carregar();
      } else {
        const data = await r.json();
        setMsg(`❌ ${data.error || 'Erro'}`);
      }
    } catch (e) { setMsg('❌ Erro de conexão'); }
  };

  const mesLabel = (m: string) => {
    const [y, mm] = m.split('-');
    const nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${nomes[parseInt(mm)]} ${y}`;
  };

  const totalAjustesNum = ajustes.reduce((s, a) => s + (parseFloat(a.valor.replace(',', '.')) || 0), 0);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>🎁 Benefícios</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
            Controle individual de benefício transporte — {mesLabel(mes)}
          </p>
        </div>
        <input type="month" value={mes} onChange={e => { setMes(e.target.value); setSelectedColab(null); setApuracao(null); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', borderRadius: '6px', background: msg.startsWith('✅') || msg.startsWith('🔓') ? '#e8f5e9' : '#ffebee', color: msg.startsWith('✅') || msg.startsWith('🔓') ? '#2e7d32' : '#c62828', fontSize: '14px' }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳ Carregando...</div>
      ) : colabsBeneficio.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff8e1', borderRadius: '10px', border: '1px solid #ffe082' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>⚠️</div>
          <div style={{ fontSize: '16px', color: '#f57f17', fontWeight: 600 }}>Nenhum CLT com benefício transporte configurado</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
            Configure em: Colaboradores → Editar → "🎁 Benefício Transporte Mensal"
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: apuracao ? '320px 1fr' : '1fr', gap: '20px' }}>
          {/* Lista de colaboradores */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#555', marginBottom: '8px', textTransform: 'uppercase' as const }}>
              Colaboradores ({colabsBeneficio.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {colabsBeneficio.map(c => {
                const ben = benMap.get(c.id);
                const isFechado = ben?.status === 'fechado';
                const isSelected = selectedColab === c.id;
                const bt = c.beneficioTransporte!;
                return (
                  <div key={c.id}
                    onClick={() => apurar(c.id)}
                    style={{
                      padding: '12px', borderRadius: '8px', cursor: 'pointer',
                      border: `2px solid ${isSelected ? '#1976d2' : isFechado ? '#4caf50' : '#e0e0e0'}`,
                      background: isSelected ? '#e3f2fd' : isFechado ? '#f1f8e9' : '#fff',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.nome}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {bt.tipo === 'mensal_fixo' ? `${fmt(bt.valorMensal)}/mês` : 'Por dia'} • {fmtDia(bt.valorDiario || c.valorTransporte)}/dia
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {isFechado ? (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#e8f5e9', color: '#2e7d32' }}>
                            ✅ Fechado
                          </span>
                        ) : ben ? (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#fff3e0', color: '#e65100' }}>
                            🔓 Reaberto
                          </span>
                        ) : (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#f5f5f5', color: '#999' }}>
                            ⏳ Pendente
                          </span>
                        )}
                      </div>
                    </div>
                    {isFechado && ben && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#666', display: 'flex', gap: '12px' }}>
                        <span>Crédito: {fmt(ben.valorCreditado)}</span>
                        <span>Consumo: {fmt(ben.valorApurado)}</span>
                        <span style={{ fontWeight: 700, color: ben.saldo >= 0 ? '#2e7d32' : '#c62828' }}>Saldo: {fmt(ben.saldo)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel de apuração */}
          {apuracao && (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px' }}>
              {apurando ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳ Apurando...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>{apuracao.colaboradorNome}</h2>
                      <p style={{ margin: '4px 0 0', color: '#888', fontSize: '13px' }}>
                        {mesLabel(mes)} • {fmtDia(apuracao.valorDiario)}/dia
                        {apuracao.beneficioTransporte?.tipo === 'mensal_fixo' && ` • Crédito: ${fmt(apuracao.valorCreditado)}`}
                      </p>
                    </div>
                    <button onClick={() => { setApuracao(null); setSelectedColab(null); }}
                      style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>✕</button>
                  </div>

                  {/* Cards resumo */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                    {[
                      { label: 'Presentes', value: apuracao.diasPresentes, color: '#2e7d32', bg: '#e8f5e9' },
                      { label: 'Faltas', value: apuracao.diasFalta, color: '#c62828', bg: '#ffebee' },
                      { label: 'Folgas', value: apuracao.diasFolga, color: '#1565c0', bg: '#e3f2fd' },
                      { label: 'Atestados', value: apuracao.diasAtestado, color: '#e65100', bg: '#fff3e0' },
                      { label: 'Férias', value: apuracao.diasFerias, color: '#6a1b9a', bg: '#f3e5f5' },
                    ].map(c => (
                      <div key={c.label} style={{ padding: '8px', borderRadius: '8px', background: c.bg, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: c.color, fontWeight: 700, textTransform: 'uppercase' as const }}>{c.label}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Resumo financeiro */}
                  <div style={{ background: '#fafafa', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '14px' }}>
                      {apuracao.beneficioTransporte?.tipo === 'mensal_fixo' && (
                        <div><span style={{ color: '#888' }}>Crédito:</span> <strong style={{ color: '#2e7d32' }}>{fmt(apuracao.valorCreditado)}</strong></div>
                      )}
                      <div><span style={{ color: '#888' }}>Consumo ({apuracao.diasPresentes}d):</span> <strong style={{ color: '#e65100' }}>{fmt(apuracao.valorApurado)}</strong></div>
                      {ajustes.length > 0 && totalAjustesNum !== 0 && (
                        <div><span style={{ color: '#888' }}>Ajustes:</span> <strong style={{ color: totalAjustesNum >= 0 ? '#2e7d32' : '#c62828' }}>{fmt(totalAjustesNum)}</strong></div>
                      )}
                      <div>
                        <span style={{ color: '#888' }}>Saldo:</span>{' '}
                        <strong style={{ color: (apuracao.saldo + totalAjustesNum) >= 0 ? '#2e7d32' : '#c62828', fontSize: '16px' }}>
                          {fmt(apuracao.saldo + totalAjustesNum)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Detalhamento dia a dia — colapsável */}
                  <details style={{ marginBottom: '16px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#555', marginBottom: '8px' }}>
                      📅 Detalhamento dia a dia ({apuracao.totalEscalados} dias na escala)
                    </summary>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f5f5f5', position: 'sticky' as const, top: 0 }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left' as const }}>Data</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center' as const }}>Turno</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center' as const }}>Status</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' as const }}>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apuracao.dias.map(d => {
                            const sc = STATUS_COLORS[d.status] || STATUS_COLORS.ausente;
                            const diaSemana = new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
                            return (
                              <tr key={d.data} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '5px 8px' }}>{d.data.split('-').reverse().join('/')} <span style={{ color: '#aaa' }}>({diaSemana})</span></td>
                                <td style={{ padding: '5px 8px', textAlign: 'center' as const }}>{d.turno}</td>
                                <td style={{ padding: '5px 8px', textAlign: 'center' as const }}>
                                  <span style={{ padding: '2px 6px', borderRadius: '10px', background: sc.bg, color: sc.color, fontSize: '11px', fontWeight: 600 }}>
                                    {sc.label}
                                  </span>
                                </td>
                                <td style={{ padding: '5px 8px', textAlign: 'right' as const, fontWeight: d.valor > 0 ? 600 : 400, color: d.valor > 0 ? '#2e7d32' : '#ccc' }}>
                                  {d.valor > 0 ? fmtDia(d.valor) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  {/* Ajustes manuais */}
                  {(!apuracao.beneficioExistente || apuracao.beneficioExistente.status !== 'fechado') && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#555' }}>⚙️ Ajustes manuais</span>
                        <button onClick={() => setAjustes([...ajustes, { descricao: '', valor: '' }])}
                          style={{ padding: '4px 10px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                          + Ajuste
                        </button>
                      </div>
                      {ajustes.map((aj, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                          <input type="text" placeholder="Descrição (ex: Diferença mês anterior)" value={aj.descricao}
                            onChange={e => { const n = [...ajustes]; n[i].descricao = e.target.value; setAjustes(n); }}
                            style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }} />
                          <input type="text" inputMode="decimal" placeholder="0,00" value={aj.valor}
                            onChange={e => { const n = [...ajustes]; n[i].valor = e.target.value; setAjustes(n); }}
                            style={{ width: '100px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', textAlign: 'right' as const }} />
                          <button onClick={() => setAjustes(ajustes.filter((_, j) => j !== i))}
                            style={{ padding: '4px 8px', border: 'none', background: '#ffebee', color: '#c62828', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ))}
                      <div style={{ marginTop: '8px' }}>
                        <textarea placeholder="Observações (opcional)" value={obs} onChange={e => setObs(e.target.value)}
                          rows={2} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', resize: 'vertical' as const }} />
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {apuracao.beneficioExistente?.status === 'fechado' ? (
                      <button onClick={() => reabrir(apuracao.colaboradorId)}
                        style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', background: '#ff9800', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                        🔓 Reabrir
                      </button>
                    ) : (
                      <button onClick={fechar} disabled={fechando}
                        style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', background: '#4caf50', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: fechando ? 0.6 : 1 }}>
                        {fechando ? '⏳ Fechando...' : '✅ Fechar e gerar payslip'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
