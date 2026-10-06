/**
 * HistoricoFeriasView.tsx — Visualização detalhada do histórico de férias
 *
 * Mostra, para cada período de férias pago:
 * - Cabeçalho: período aquisitivo, gozo, data pagamento
 * - Composição por competência: Férias, 1/3, INSS, IRRF (clicável pra expandir)
 * - Totais consolidados
 * - Afastamentos relevantes como contexto
 */

import { useEffect, useState } from 'react';
import { fetchAuth } from '../utils/fetchAuth';

const fmtMoeda = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(v || 0);
  if (isNaN(n)) return 'R$ 0,00';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDataBR = (iso: string) => iso ? iso.split('-').reverse().join('/') : '—';

const diasEntre = (a: string, b: string) => {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000) + 1;
};

const TIPO_AFAST_LABEL: Record<string, string> = {
  licenca_medica: '🩺 Licença Médica',
  licenca_maternidade: '🤱 Licença Maternidade',
  licenca_paternidade: '👶 Licença Paternidade',
  auxilio_doenca: '🏥 Auxílio-Doença (INSS)',
  acidente_trabalho: '⚠️ Acidente de Trabalho',
  outros: '📋 Outro',
};

interface Props {
  colaboradorId: string;
  apiUrl: string;
  token: string;
}

export const HistoricoFeriasView: React.FC<Props> = ({ colaboradorId, apiUrl, token }) => {
  const [historico, setHistorico] = useState<any[]>([]);
  const [afastamentos, setAfastamentos] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    Promise.all([
      fetchAuth(`${apiUrl}/colaboradores?incluirInativos=true`, auth).then(r => r.ok ? r.json() : []).catch(() => []),
      fetchAuth(`${apiUrl}/afastamentos?colaboradorId=${colaboradorId}`, auth).then(r => r.ok ? r.json() : []).catch(() => []),
      fetchAuth(`${apiUrl}/payslips`, auth).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([colabList, afast, ps]: any) => {
      const colab = Array.isArray(colabList) ? colabList.find((c: any) => c.id === colaboradorId) : null;
      setHistorico(Array.isArray(colab?.historicoFerias) ? colab.historicoFerias : []);
      setAfastamentos(Array.isArray(afast) ? afast : []);
      const psList = Array.isArray(ps) ? ps : [];
      setPayslips(psList.filter((p: any) =>
        p.colaboradorId === colaboradorId &&
        (p.tipoPagamento === 'ferias' || (p.periodo || '').startsWith('ferias-'))
      ));
    }).finally(() => setLoading(false));
  }, [colaboradorId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando férias…</div>;

  // Agrupa payslips de férias por aquisitivo
  // Chave = aquisitivoInicio da entrada do histórico correspondente
  // Fallback: agrupa por data de pagamento próxima
  const agruparPayslipsPorHistorico = (hist: any) => {
    return payslips.filter(p => {
      // Match por dataPagamento ou período próximo
      if (hist.dataPagamento && p.dataPagamento === hist.dataPagamento) return true;
      if (hist.gozoInicio && hist.gozoFim) {
        const psMes = p.mes || '';
        const giniMes = hist.gozoInicio.slice(0, 7);
        const gfimMes = hist.gozoFim.slice(0, 7);
        return psMes === giniMes || psMes === gfimMes;
      }
      return false;
    });
  };

  const total = historico.length;

  return (
    <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 14, fontSize: 13, color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>🏖️ <strong>{total}</strong> período(s) de férias registrado(s)</div>
        {payslips.length > 0 && <div style={{ color: '#1565c0' }}>🧾 {payslips.length} payslip(s)</div>}
      </div>

      {total === 0 && (
        <div style={{ padding: 20, color: '#888', textAlign: 'center', background: '#f9f9f9', borderRadius: 8 }}>
          Nenhuma férias registrada ainda. Use o módulo <strong>🏖️ Férias CLT</strong> para lançar.
        </div>
      )}

      {/* Cards de férias (um por período) */}
      {historico.map((h: any, i: number) => {
        const chave = `${h.aquisitivoInicio}-${h.gozoInicio}`;
        const aberto = expandido[chave];
        const diasGozo = diasEntre(h.gozoInicio, h.gozoFim);
        const psDesse = agruparPayslipsPorHistorico(h);
        const brutoTotal   = psDesse.reduce((s, p) => s + (parseFloat(p.bruto) || 0), 0);
        const descTotal    = psDesse.reduce((s, p) => s + (parseFloat(p.descontos) || 0), 0);
        const liquidoTotal = psDesse.reduce((s, p) => s + (parseFloat(p.liquido) || 0), 0);

        return (
          <div key={i} style={{
            border: '1px solid #c8e6c9', borderLeft: '4px solid #2e7d32',
            borderRadius: 8, padding: 14, marginBottom: 12, background: '#fafff9',
          }}>
            {/* Cabeçalho do card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1b5e20' }}>
                  🏖️ Período aquisitivo {fmtDataBR(h.aquisitivoInicio)} → {fmtDataBR(h.aquisitivoFim)}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
                  Gozo: <strong>{fmtDataBR(h.gozoInicio)} → {fmtDataBR(h.gozoFim)}</strong>
                  <span style={{ marginLeft: 8, color: '#999' }}>({diasGozo} dias)</span>
                  {h.diasAbono > 0 && <span style={{ marginLeft: 8, color: '#f57f17' }}>• 💰 Abono {h.diasAbono}d</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  💳 Pago em <strong>{fmtDataBR(h.dataPagamento)}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {liquidoTotal > 0 ? (
                  <>
                    <div style={{ fontSize: 11, color: '#888' }}>Líquido total</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1b5e20' }}>{fmtMoeda(liquidoTotal)}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>Bruto {fmtMoeda(brutoTotal)} • Desc. {fmtMoeda(descTotal)}</div>
                  </>
                ) : h.obs?.match(/R\$\s?[\d.,]+/) && (
                  <div style={{ fontSize: 12, color: '#1565c0', fontStyle: 'italic' }}>
                    {h.obs.match(/R\$\s?[\d.,]+/)[0]} (do histórico)
                  </div>
                )}
              </div>
            </div>

            {h.obs && <div style={{ fontSize: 11, color: '#777', marginTop: 8, fontStyle: 'italic' }}>📝 {h.obs}</div>}

            {/* Detalhes expansíveis */}
            {psDesse.length > 0 && (
              <>
                <button
                  onClick={() => setExpandido(e => ({ ...e, [chave]: !e[chave] }))}
                  style={{
                    marginTop: 10, background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32',
                    padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}>
                  {aberto ? '▲ Ocultar rubricas detalhadas' : `▼ Ver rubricas por competência (${psDesse.length})`}
                </button>

                {aberto && (
                  <div style={{ marginTop: 10, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: 10 }}>
                    {psDesse.map((p: any) => (
                      <div key={p.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed #eee' }}>
                        <div style={{ fontWeight: 600, color: '#1565c0', marginBottom: 6, fontSize: 13 }}>
                          Competência {p.mes || p.periodo}
                        </div>
                        {p.composicao && Array.isArray(p.composicao) && p.composicao.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#f5f5f5' }}>
                                <th style={{ padding: '4px 6px', textAlign: 'left' }}>Rubrica</th>
                                <th style={{ padding: '4px 6px', textAlign: 'center' }}>Cód.</th>
                                <th style={{ padding: '4px 6px', textAlign: 'center' }}>Ref.</th>
                                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.composicao.map((c: any, idx: number) => {
                                const valor = parseFloat(c.valor) || 0;
                                const neg = valor < 0;
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                    <td style={{ padding: '4px 6px' }}>{c.descricao}</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'center', color: '#999' }}>{c.codigo || '—'}</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'center', color: '#999' }}>{c.referencia || '—'}</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'right', color: neg ? '#c62828' : '#1b5e20', fontWeight: 600 }}>
                                      {fmtMoeda(Math.abs(valor))}{neg ? ' (−)' : ''}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#f0f7f0', fontWeight: 700 }}>
                                <td colSpan={3} style={{ padding: '6px 6px', textAlign: 'right' }}>Líquido competência:</td>
                                <td style={{ padding: '6px 6px', textAlign: 'right', color: '#1b5e20' }}>{fmtMoeda(parseFloat(p.liquido) || 0)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : (
                          <div style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                            Sem rubricas detalhadas. Bruto {fmtMoeda(parseFloat(p.bruto) || 0)} • Descontos {fmtMoeda(parseFloat(p.descontos) || 0)} • Líquido {fmtMoeda(parseFloat(p.liquido) || 0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {psDesse.length === 0 && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 8, fontStyle: 'italic' }}>
                ℹ️ Payslip não disponível (lançamento feito antes do módulo oficial de Férias CLT).
              </div>
            )}
          </div>
        );
      })}

      {/* Afastamentos */}
      {afastamentos.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
            🏥 <strong>Afastamentos registrados</strong> (contexto para cálculo de aquisitivo)
          </div>
          {afastamentos.map((a: any) => {
            const fim = a.dataFimReal || a.dataFimPrevista || '';
            const dias = diasEntre(a.dataInicio, fim);
            const label = TIPO_AFAST_LABEL[a.tipo] || a.tipo;
            return (
              <div key={a.id} style={{
                background: '#fff3e0', borderLeft: '3px solid #e65100', borderRadius: 4,
                padding: '8px 12px', marginBottom: 6, fontSize: 12,
              }}>
                <strong>{label}</strong> • {fmtDataBR(a.dataInicio)} → {fmtDataBR(fim)}
                <span style={{ color: '#888', marginLeft: 8 }}>({dias} dias)</span>
                {a.motivo && <div style={{ color: '#666', marginTop: 2, fontSize: 11 }}>Motivo: {a.motivo}</div>}
                {a.cidMedico && <div style={{ color: '#888', fontSize: 11 }}>CID: {a.cidMedico} • CRM {a.crm}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
