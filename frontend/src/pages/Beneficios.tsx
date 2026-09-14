/**
 * Módulo de Benefícios — Vale Transporte
 *
 * Fluxo:
 *   1. Pagar VT (início do mês) → individual ou em lote → gera payslip(s)
 *   2. Apurar consumo (ao longo/fim do mês via escalas)
 *   3. Fechar mês (conciliação: crédito - consumo = saldo → próximo mês)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

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
  tipoBeneficio: string; valorPago: number; valorDiario: number; valorApurado: number;
  diasPresentes: number; saldoAnterior: number; saldoFinal: number | null;
  status: 'pago' | 'fechado'; dataPagamento: string; formaPagamento: string;
  ajustes?: { descricao: string; valor: number }[]; totalAjustes?: number; obs?: string;
}
interface Apuracao {
  colaboradorId: string; colaboradorNome: string; mes: string;
  beneficioTransporte: any; valorDiario: number;
  valorCreditado: number; valorApurado: number; saldo: number; saldoAnterior: number;
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
  // Lote
  const [selecionadosLote, setSelecionadosLote] = useState<Set<string>>(new Set());
  const [modeLote, setModeLote] = useState(false);

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

  // Pendentes (não pagos neste mês)
  const pendentes = useMemo(() => colabsBeneficio.filter(c => !benMap.has(c.id)), [colabsBeneficio, benMap]);

  const selecionarColab = async (colabId: string) => {
    if (modeLote) return; // em modo lote não abre detalhe
    setSelectedColab(colabId);
    setApuracao(null); setApurando(true); setMsg(''); setAjustes([]); setObs('');
    const colab = colabs.find(c => c.id === colabId);
    setValorPagoInput(colab?.beneficioTransporte?.valorMensal?.toString().replace('.', ',') || '0');
    try {
      const r = await authFetch(`${API}/beneficios/apurar?unitId=${unitId}&mes=${mes}&colaboradorId=${colabId}`);
      if (r.ok) setApuracao(await r.json());
      else { const err = await r.json(); setMsg(`❌ ${err.error || 'Erro'}`); }
    } catch (e) { setMsg('❌ Erro de conexão'); }
    finally { setApurando(false); }
  };

  const getUser = () => JSON.parse(localStorage.getItem('user_data') || '{}');

  // Pagar individual
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
          formaPagamento: 'PIX', obs,
          responsavelId: user.id || user.email || '', responsavelNome: user.nome || user.email || '',
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ VT pago para ${apuracao.colaboradorNome} — Payslip gerado`);
        await carregar(); await selecionarColab(apuracao.colaboradorId);
      } else setMsg(`❌ ${data.error || 'Erro'}`);
    } catch (e) { setMsg('❌ Erro'); }
    finally { setProcessando(false); }
  };

  // Pagar em lote
  const pagarLote = async () => {
    if (selecionadosLote.size === 0) return;
    setProcessando(true); setMsg('');
    try {
      const user = getUser();
      const r = await authFetch(`${API}/beneficios/pagar`, {
        method: 'POST',
        body: JSON.stringify({
          unitId, mes, colaboradorIds: Array.from(selecionadosLote),
          dataPagamento: new Date().toISOString().split('T')[0],
          formaPagamento: 'PIX',
          responsavelId: user.id || user.email || '', responsavelNome: user.nome || user.email || '',
        }),
      });
      const data = await r.json();
      if (r.ok) {
        const total = (data.resultados || []).reduce((s: number, r: any) => s + (r.valorPago || 0), 0);
        setMsg(`✅ ${data.pagos} VT(s) pago(s) — Total: ${fmt(total)} — Payslips gerados`);
        setSelecionadosLote(new Set()); setModeLote(false);
        await carregar();
      } else setMsg(`❌ ${data.error || 'Erro'}`);
    } catch (e) { setMsg('❌ Erro'); }
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
        body: JSON.stringify({ unitId, mes, colaboradorId: apuracao.colaboradorId, ajustes: ajustesNum, obs, responsavelId: user.id || '', responsavelNome: user.nome || '' }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ Mês fechado — Saldo: ${fmt(data.beneficio.saldoFinal)}`);
        await carregar(); await selecionarColab(apuracao.colaboradorId);
      } else setMsg(`❌ ${data.error || 'Erro'}`);
    } catch (e) { setMsg('❌ Erro'); }
    finally { setProcessando(false); }
  };

  const reabrir = async () => {
    if (!apuracao || !confirm('Reabrir fechamento?')) return;
    setProcessando(true);
    try {
      const r = await authFetch(`${API}/beneficios/reabrir`, { method: 'POST', body: JSON.stringify({ unitId, mes, colaboradorId: apuracao.colaboradorId }) });
      if (r.ok) { setMsg('🔓 Reaberto'); await carregar(); await selecionarColab(apuracao.colaboradorId); }
    } catch (e) { setMsg('❌ Erro'); }
    finally { setProcessando(false); }
  };

  const mesLabel = (m: string) => {
    const [y, mm] = m.split('-');
    const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${nomes[parseInt(mm)]}/${y}`;
  };

  const toggleLoteColab = (id: string) => {
    const n = new Set(selecionadosLote);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelecionadosLote(n);
  };
  const selecionarTodosPendentes = () => {
    setSelecionadosLote(new Set(pendentes.map(c => c.id)));
  };

  const ben = apuracao?.beneficioExistente;
  const isPago = ben?.status === 'pago' || ben?.status === 'fechado';
  const isFechado = ben?.status === 'fechado';
  const totalAjustesNum = ajustes.reduce((s, a) => s + (parseFloat(a.valor.replace(',', '.')) || 0), 0);
  const totalPago = beneficios.reduce((s, b) => s + (b.valorPago || 0), 0);

  const totalPendente = pendentes.reduce((s, c) => s + (c.beneficioTransporte?.valorMensal || 0), 0);
  const totalFechados = beneficios.filter(b => b.status === 'fechado').length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fb' }}>
      <Header title="Vale Transporte" />
      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 20px 40px' }}>

      {/* Cabeçalho */}
      <div style={{ padding: '4px 4px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 24, fontWeight: 800 }}>🚌 Vale Transporte</h2>
            <div style={{ fontSize: 13, color: '#64748b', maxWidth: 720 }}>
              Crédito mensal por colaborador com apuração automática a partir das escalas.
              Fluxo: <strong>Pagar VT</strong> → <strong>Apurar consumo</strong> → <strong>Fechar mês</strong>.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="month" value={mes} onChange={e => { setMes(e.target.value); setSelectedColab(null); setApuracao(null); setModeLote(false); setSelecionadosLote(new Set()); }}
              style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: 'white' }} />
            {pendentes.length > 0 && !modeLote && (
              <button onClick={() => { setModeLote(true); setSelectedColab(null); setApuracao(null); selecionarTodosPendentes(); }}
                style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                💳 Pagar em lote ({pendentes.length})
              </button>
            )}
            <button onClick={carregar}
              style={{ padding: '9px 12px', border: 'none', borderRadius: 8, background: '#f1f5f9', color: '#334155', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              🔄 Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        {[
          { label: 'Colaboradores com VT', value: String(colabsBeneficio.length), color: '#0284c7', bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', icon: '👥', accent: '#0284c7' },
          { label: 'Total pago no mês', value: fmt(totalPago), color: '#7c3aed', bg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', icon: '💰', accent: '#7c3aed' },
          { label: 'Pendentes', value: `${pendentes.length}${totalPendente > 0 ? ` • ${fmt(totalPendente)}` : ''}`, color: '#dc2626', bg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', icon: '⏳', accent: '#dc2626' },
          { label: 'Fechados', value: String(totalFechados), color: '#059669', bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', icon: '✅', accent: '#059669' },
        ].map(k => (
          <div key={k.label} style={{ borderRadius: 14, padding: '16px 18px', background: k.bg, border: `1px solid ${k.accent}20`, boxShadow: '0 2px 6px rgba(15,23,42,0.04)', position: 'relative' as const, overflow: 'hidden' as const }}>
            <div style={{ position: 'absolute' as const, top: 10, right: 12, fontSize: 22, opacity: 0.45 }}>{k.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{mesLabel(mes)}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ padding: '8px 14px', marginBottom: '10px', borderRadius: '6px',
          background: msg.startsWith('✅') || msg.startsWith('🔓') ? '#e8f5e9' : '#ffebee',
          color: msg.startsWith('✅') || msg.startsWith('🔓') ? '#2e7d32' : '#c62828', fontSize: '13px' }}>{msg}</div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: (selectedColab && apuracao) ? '300px 1fr' : '1fr', gap: '16px' }}>
          {/* Lista */}
          <div>
            {/* Modo lote */}
            {modeLote && (
              <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1565c0', marginBottom: '6px' }}>
                  💳 Pagamento em Lote — {selecionadosLote.size} selecionado(s)
                </div>
                <div style={{ fontSize: '12px', color: '#555', marginBottom: '8px' }}>
                  Cada CLT será pago com o valor mensal do seu cadastro. Payslips gerados automaticamente.
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={pagarLote} disabled={processando || selecionadosLote.size === 0}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#4caf50', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: processando ? 0.6 : 1 }}>
                    {processando ? '⏳...' : `💰 Pagar ${selecionadosLote.size} VT(s)`}
                  </button>
                  <button onClick={() => selecionarTodosPendentes()}
                    style={{ padding: '6px 12px', border: '1px solid #90caf9', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                    Selecionar todos
                  </button>
                  <button onClick={() => { setModeLote(false); setSelecionadosLote(new Set()); }}
                    style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {colabsBeneficio.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                  Nenhum CLT com VT configurado.<br/>Configure em Colaboradores → Editar.
                </div>
              ) : colabsBeneficio.map(c => {
                const b = benMap.get(c.id);
                const isSelected = selectedColab === c.id;
                const isLoteSel = selecionadosLote.has(c.id);
                const bt = c.beneficioTransporte!;
                const jaTemPgto = !!b;
                return (
                  <div key={c.id}
                    onClick={() => modeLote ? (!jaTemPgto && toggleLoteColab(c.id)) : selecionarColab(c.id)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px', cursor: modeLote && jaTemPgto ? 'default' : 'pointer',
                      border: `2px solid ${isSelected ? '#1976d2' : isLoteSel ? '#4caf50' : b?.status === 'fechado' ? '#4caf50' : b?.status === 'pago' ? '#ff9800' : '#e0e0e0'}`,
                      background: isSelected ? '#e3f2fd' : isLoteSel ? '#e8f5e9' : '#fff',
                      opacity: modeLote && jaTemPgto ? 0.5 : 1,
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {modeLote && !jaTemPgto && (
                          <input type="checkbox" checked={isLoteSel} readOnly style={{ width: '16px', height: '16px' }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.nome}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{fmt(bt.valorMensal)}/mês • {fmt(bt.valorDiario || c.valorTransporte)}/dia</div>
                        </div>
                      </div>
                      {b?.status === 'fechado' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#e8f5e9', color: '#2e7d32' }}>✅ Fechado</span>
                      ) : b?.status === 'pago' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#fff3e0', color: '#e65100' }}>💰 Pago</span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#f5f5f5', color: '#999' }}>⏳</span>
                      )}
                    </div>
                    {b && <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
                      {fmt(b.valorPago)} {b.saldoFinal != null && `• Saldo: ${fmt(b.saldoFinal)}`}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel detalhe */}
          {apuracao && !modeLote && (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px' }}>
              {apurando ? <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳</div> : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>{apuracao.colaboradorNome}</h2>
                      <p style={{ margin: '2px 0 0', color: '#888', fontSize: '12px' }}>
                        VT {mesLabel(mes)} • {fmt(apuracao.valorDiario)}/dia
                        {apuracao.saldoAnterior !== 0 && (
                          <span style={{ color: apuracao.saldoAnterior > 0 ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                            {' '}• Saldo ant: {fmt(apuracao.saldoAnterior)}
                          </span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => { setApuracao(null); setSelectedColab(null); }}
                      style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#999' }}>✕</button>
                  </div>

                  {/* PAGAR */}
                  {!isPago && (
                    <div style={{ background: '#f0f7ff', border: '1px solid #bbdefb', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1565c0', marginBottom: '8px' }}>💰 Pagar Vale Transporte</div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '2px' }}>Valor (R$)</label>
                          <input type="text" inputMode="decimal" value={valorPagoInput}
                            onChange={e => setValorPagoInput(e.target.value)} onFocus={e => e.target.select()}
                            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '16px', fontWeight: 700, width: '130px', textAlign: 'right' as const }} />
                        </div>
                        <button onClick={pagarVT} disabled={processando}
                          style={{ padding: '10px 18px', border: 'none', borderRadius: '6px', background: '#4caf50', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: processando ? 0.6 : 1 }}>
                          {processando ? '⏳...' : '💰 Pagar e gerar payslip'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Info pagamento */}
                  {isPago && ben && (
                    <div style={{ background: '#f1f8e9', border: '1px solid #c5e1a5', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px' }}>
                      <strong>💰 Pago em {ben.dataPagamento}</strong> — {fmt(ben.valorPago)} via {ben.formaPagamento}
                      {ben.saldoAnterior !== 0 && <span> (saldo ant: {fmt(ben.saldoAnterior)})</span>}
                    </div>
                  )}

                  {/* Cards presença */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '5px', marginBottom: '14px' }}>
                    {[
                      { l: 'Presentes', v: apuracao.diasPresentes, c: '#2e7d32', b: '#e8f5e9' },
                      { l: 'Faltas', v: apuracao.diasFalta, c: '#c62828', b: '#ffebee' },
                      { l: 'Folgas', v: apuracao.diasFolga, c: '#1565c0', b: '#e3f2fd' },
                      { l: 'Atestados', v: apuracao.diasAtestado, c: '#e65100', b: '#fff3e0' },
                      { l: 'Férias', v: apuracao.diasFerias, c: '#6a1b9a', b: '#f3e5f5' },
                    ].map(x => (
                      <div key={x.l} style={{ padding: '5px', borderRadius: '6px', background: x.b, textAlign: 'center' }}>
                        <div style={{ fontSize: '9px', color: x.c, fontWeight: 700 }}>{x.l}</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: x.c }}>{x.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Resumo financeiro */}
                  {isPago && ben && (
                    <div style={{ background: '#fafafa', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
                      <table style={{ width: '100%', fontSize: '13px' }}><tbody>
                        <tr><td style={{ color: '#888' }}>Pago</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: '#2e7d32' }}>{fmt(ben.valorPago)}</td></tr>
                        {ben.saldoAnterior !== 0 && <tr><td style={{ color: '#888' }}>Saldo anterior</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: ben.saldoAnterior > 0 ? '#2e7d32' : '#c62828' }}>{fmt(ben.saldoAnterior)}</td></tr>}
                        <tr><td style={{ color: '#888' }}>Consumo ({apuracao.diasPresentes}d × {fmt(apuracao.valorDiario)})</td><td style={{ textAlign: 'right' as const, fontWeight: 600, color: '#e65100' }}>- {fmt(apuracao.valorApurado)}</td></tr>
                        {totalAjustesNum !== 0 && <tr><td style={{ color: '#888' }}>Ajustes</td><td style={{ textAlign: 'right' as const, fontWeight: 600 }}>{fmt(totalAjustesNum)}</td></tr>}
                        <tr style={{ borderTop: '2px solid #ddd' }}>
                          <td style={{ fontWeight: 700, paddingTop: '5px' }}>{isFechado ? 'Saldo final' : 'Saldo estimado'}</td>
                          <td style={{ textAlign: 'right' as const, fontWeight: 800, fontSize: '15px', paddingTop: '5px',
                            color: (() => { const s = isFechado ? ben.saldoFinal! : (ben.valorPago + ben.saldoAnterior - apuracao.valorApurado + totalAjustesNum); return s >= 0 ? '#2e7d32' : '#c62828'; })()
                          }}>{fmt(isFechado ? ben.saldoFinal! : (ben.valorPago + ben.saldoAnterior - apuracao.valorApurado + totalAjustesNum))}</td>
                        </tr>
                      </tbody></table>
                    </div>
                  )}

                  {/* Dias */}
                  <details style={{ marginBottom: '14px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#555' }}>📅 Dias ({apuracao.totalEscalados})</summary>
                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px', marginTop: '4px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead><tr style={{ background: '#f5f5f5', position: 'sticky' as const, top: 0 }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left' as const }}>Data</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center' as const }}>Turno</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center' as const }}>Status</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' as const }}>R$</th>
                        </tr></thead>
                        <tbody>{apuracao.dias.map(d => {
                          const sc = STATUS_COLORS[d.status] || STATUS_COLORS.ausente;
                          return (<tr key={d.data} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '3px 6px' }}>{d.data.split('-').reverse().join('/')}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center' as const }}>{d.turno}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center' as const }}><span style={{ padding: '1px 5px', borderRadius: '8px', background: sc.bg, color: sc.color, fontSize: '10px', fontWeight: 600 }}>{sc.label}</span></td>
                            <td style={{ padding: '3px 6px', textAlign: 'right' as const, color: d.valor > 0 ? '#2e7d32' : '#ccc' }}>{d.valor > 0 ? fmt(d.valor) : '—'}</td>
                          </tr>);
                        })}</tbody>
                      </table>
                    </div>
                  </details>

                  {/* Fechar mês */}
                  {isPago && !isFechado && (
                    <div style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '12px', color: '#555' }}>⚙️ Ajustes</span>
                        <button onClick={() => setAjustes([...ajustes, { descricao: '', valor: '' }])}
                          style={{ padding: '2px 8px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>+</button>
                      </div>
                      {ajustes.map((aj, i) => (
                        <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                          <input type="text" placeholder="Descrição" value={aj.descricao}
                            onChange={e => { const n = [...ajustes]; n[i].descricao = e.target.value; setAjustes(n); }}
                            style={{ flex: 1, padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                          <input type="text" inputMode="decimal" placeholder="0,00" value={aj.valor}
                            onChange={e => { const n = [...ajustes]; n[i].valor = e.target.value; setAjustes(n); }}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'right' as const }} />
                          <button onClick={() => setAjustes(ajustes.filter((_, j) => j !== i))}
                            style={{ padding: '2px 5px', border: 'none', background: '#ffebee', color: '#c62828', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <button onClick={fecharMes} disabled={processando}
                          style={{ padding: '9px 18px', border: 'none', borderRadius: '6px', background: '#1976d2', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: processando ? 0.6 : 1 }}>
                          {processando ? '⏳...' : '🔒 Fechar mês'}
                        </button>
                      </div>
                    </div>
                  )}

                  {isFechado && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                      <button onClick={reabrir} disabled={processando}
                        style={{ padding: '7px 14px', border: 'none', borderRadius: '6px', background: '#ff9800', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
                        🔓 Reabrir
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
      <Footer />
    </div>
  );
}
