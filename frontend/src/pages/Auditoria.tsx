import { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

interface LogItem {
  id: string;
  entidadeId?: string;
  colaboradorId?: string;
  escalaId?: string;
  timestamp: string;
  evento: string;
  valoresAntes?: any;
  valoresDepois?: any;
  usuarioId?: string;
  usuarioNome?: string;
  usuarioEmail?: string;
  unitId?: string;
  userAgent?: string;
  observacao?: string;
  tabela?: string;
}

const TABELAS = [
  { id: 'colaboradores',     label: '👥 Colaboradores',       cor: '#1565c0' },
  { id: 'folha-pagamento',   label: '💰 Folha de Pagamento',  cor: '#2e7d32' },
  { id: 'saidas',            label: '💸 Saídas',              cor: '#c62828' },
  { id: 'controle-motoboy',  label: '🛵 Controle Motoboys',   cor: '#e65100' },
  { id: 'escalas',           label: '📅 Escalas',             cor: '#7b1fa2' },
];

const EVENTOS_LABEL: Record<string, { icon: string; label: string; cor: string }> = {
  criado:                { icon: '🆕', label: 'Criado',                cor: '#2e7d32' },
  alterado:              { icon: '✏️', label: 'Alterado',               cor: '#1565c0' },
  deletado:              { icon: '🗑️', label: 'Deletado',               cor: '#c62828' },
  pago:                  { icon: '💸', label: 'Pago',                   cor: '#2e7d32' },
  desfeito:              { icon: '↩️', label: 'Pgto. desfeito',         cor: '#e65100' },
  remuneracao_alterada:  { icon: '💰', label: 'Remuneração alterada',   cor: '#e65100' },
  cargo_alterado:        { icon: '👔', label: 'Cargo / função alterado', cor: '#6a1b9a' },
  contrato_alterado:     { icon: '📜', label: 'Tipo contrato alterado', cor: '#c62828' },
  transferido:           { icon: '🔄', label: 'Transferido de unidade', cor: '#f57f17' },
  desativado:            { icon: '🚪', label: 'Desligamento',           cor: '#c62828' },
  reativado:             { icon: '♻️', label: 'Reativação',              cor: '#2e7d32' },
  confirmado:            { icon: '✅', label: 'Presença confirmada',    cor: '#2e7d32' },
  desconfirmado:         { icon: '❌', label: 'Presença removida',      cor: '#e65100' },
};

const fmt = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? '✅' : '❌';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 80);
};

const fmtDataHora = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

export default function Auditoria() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const token = () => localStorage.getItem('auth_token');

  // Filtros
  const hoje = new Date();
  const inicio30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [tabela, setTabela] = useState('colaboradores');
  const [dataIni, setDataIni] = useState(inicio30.toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(hoje.toISOString().split('T')[0]);
  const [filtroEvento, setFiltroEvento] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroEntidade, setFiltroEntidade] = useState('');
  const [filtroColaborador, setFiltroColaborador] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const buscar = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tabela,
        dataIni,
        dataFim,
        ...(unitId ? { unitId } : {}),
        ...(filtroEvento ? { evento: filtroEvento } : {}),
        ...(filtroUsuario ? { usuarioId: filtroUsuario } : {}),
        ...(filtroEntidade ? { entidadeId: filtroEntidade } : {}),
        limit: '500',
      });
      const r = await fetch(`${apiUrl}/auditoria?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        const d = await r.json();
        setLogs(Array.isArray(d.items) ? d.items : []);
        setTotal(d.total || 0);
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch (e) {
      console.error(e);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { buscar(); }, [tabela, dataIni, dataFim]);

  // Filtro local por nome de colaborador (busca no entidadeId e nos valoresDepois/Antes)
  const logsFiltrados = filtroColaborador.trim() === '' ? logs : logs.filter(l => {
    const q = filtroColaborador.trim().toLowerCase();
    const entidade = (l.entidadeId || l.colaboradorId || '').toLowerCase();
    const depois = JSON.stringify(l.valoresDepois || '').toLowerCase();
    const antes  = JSON.stringify(l.valoresAntes  || '').toLowerCase();
    return entidade.includes(q) || depois.includes(q) || antes.includes(q);
  });

  const exportarCSV = () => {
    const linhas = [['Data/Hora', 'Tabela', 'Evento', 'Entidade', 'Usuário', 'Email', 'Unidade', 'Observação', 'Antes', 'Depois']];
    for (const l of logs) {
      linhas.push([
        fmtDataHora(l.timestamp),
        l.tabela || tabela,
        l.evento,
        l.entidadeId || l.colaboradorId || l.escalaId || '',
        l.usuarioNome || '',
        l.usuarioEmail || '',
        l.unitId || '',
        l.observacao || '',
        JSON.stringify(l.valoresAntes || ''),
        JSON.stringify(l.valoresDepois || ''),
      ]);
    }
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-${tabela}-${dataIni}-${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabelaCfg = TABELAS.find(t => t.id === tabela)!;

  // Diff: campos que mudaram
  const calcDiff = (antes: any, depois: any) => {
    if (!antes && !depois) return [];
    const a = antes || {};
    const d = depois || {};
    const todos = new Set([...Object.keys(a), ...Object.keys(d)]);
    const diffs: Array<{ campo: string; antes: any; depois: any }> = [];
    const ignorar = new Set(['updatedAt', 'createdAt', 'timestamp']);
    for (const c of todos) {
      if (ignorar.has(c)) continue;
      if (JSON.stringify(a[c]) !== JSON.stringify(d[c])) {
        diffs.push({ campo: c, antes: a[c], depois: d[c] });
      }
    }
    return diffs;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f4f6f9' }}>
      <Header title="🔒 Auditoria" showBack={true} />
      <div style={{ flex: 1, padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>

        <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e0e0e0' }}>
          <h3 style={{ margin: '0 0 12px', color: '#1565c0' }}>Filtros</h3>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {TABELAS.map(t => (
              <button key={t.id} onClick={() => setTabela(t.id)}
                style={{
                  padding: '8px 14px',
                  border: tabela === t.id ? `2px solid ${t.cor}` : '1px solid #ddd',
                  backgroundColor: tabela === t.id ? `${t.cor}11` : 'white',
                  color: tabela === t.id ? t.cor : '#555',
                  borderRadius: 6, cursor: 'pointer', fontWeight: tabela === t.id ? 700 : 500, fontSize: 13,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>De</label>
              <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Evento</label>
              <input type="text" placeholder="ex: pago, alterado..." value={filtroEvento}
                onChange={e => setFiltroEvento(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block', width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Usuário (id ou email)</label>
              <input type="text" placeholder="user_id" value={filtroUsuario}
                onChange={e => setFiltroUsuario(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block', width: 200 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Entidade ID</label>
              <input type="text" placeholder="col-xxxx, saida-xxxx..." value={filtroEntidade}
                onChange={e => setFiltroEntidade(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block', width: 200 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Colaborador (nome)</label>
              <input type="text" placeholder="ex: daniela, mirela..." value={filtroColaborador}
                onChange={e => setFiltroColaborador(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4, display: 'block', width: 180 }} />
            </div>
            <button onClick={buscar} disabled={loading}
              style={{ padding: '8px 16px', backgroundColor: tabelaCfg.cor, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {loading ? '⏳' : '🔍'} Buscar
            </button>
            <button onClick={exportarCSV} disabled={logs.length === 0}
              style={{ padding: '8px 16px', backgroundColor: '#7b1fa2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              📥 CSV
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, border: '1px solid #e0e0e0' }}>
          <div style={{ marginBottom: 10, fontSize: 13, color: '#666' }}>
            📋 {logsFiltrados.length} registro{logsFiltrados.length !== 1 ? 's' : ''}
            {filtroColaborador.trim() !== '' && logs.length !== logsFiltrados.length && (
              <span style={{ color: '#e65100' }}> (filtrado de {logs.length})</span>
            )}
            {total > logs.length && ` de ${total} (limite 500)`}
            {' • '}
            <span style={{ color: tabelaCfg.cor, fontWeight: 600 }}>{tabelaCfg.label}</span>
          </div>

          {logs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
              {loading ? 'Carregando…' : 'Nenhum registro de auditoria encontrado para os filtros aplicados.'}
            </div>
          ) : (
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' as const }}>Data/Hora</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Evento</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Entidade</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Usuário</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Unidade</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {logsFiltrados.map((l, i) => {
                    const meta = EVENTOS_LABEL[l.evento] || { icon: '✏️', label: l.evento, cor: '#666' };
                    const diffs = calcDiff(l.valoresAntes, l.valoresDepois);
                    const exp = !!expandido[l.id];
                    // Campos chave extraídos do valoresDepois/Antes para mostrar no Detalhe sem expandir
                    const dep = l.valoresDepois || {};
                    const ant = l.valoresAntes  || {};
                    const nomeColab = dep.nomeColaborador || dep.colaborador || dep.nome
                                   || ant.nomeColaborador || ant.colaborador || ant.nome || '';
                    const vlLiquido = dep.valorLiquido   ?? ant.valorLiquido;
                    const vlBruto   = dep.valorBruto     ?? ant.valorBruto;
                    const vlDesc    = dep.valorDescSaidas ?? ant.valorDescSaidas;
                    const vlAbat    = dep.valorAbatEsp   ?? ant.valorAbatEsp;
                    const semana    = dep.semana || ant.semana || '';
                    const forma     = dep.formaPagamento || ant.formaPagamento || '';
                    const obsLog    = dep.obs || ant.obs || l.observacao || '';
                    const fmtR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    return (
                      <>
                        <tr key={l.id} style={{ borderBottom: '1px solid #eee', backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' as const, fontFamily: 'monospace', fontSize: 11 }}>
                            {fmtDataHora(l.timestamp)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ color: meta.cor, fontWeight: 600 }}>{meta.icon} {meta.label}</span>
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 11 }}>
                            {/* Mostra nome do colaborador se disponível, ID técnico abaixo */}
                            {nomeColab && (
                              <div style={{ fontWeight: 700, color: '#1565c0', fontSize: 12 }}>👤 {nomeColab}</div>
                            )}
                            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#999', marginTop: nomeColab ? 2 : 0 }}>
                              {l.entidadeId || l.colaboradorId || l.escalaId || '—'}
                            </div>
                            {semana && (
                              <div style={{ fontSize: 10, color: '#888' }}>sem. {semana.substring(0, 10)}</div>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <div>{l.usuarioNome || '—'}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>{l.usuarioEmail || ''}</div>
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{l.unitId || '—'}</td>
                          <td style={{ padding: '6px 8px', minWidth: 200 }}>
                            {/* Detecta pagamento: evento 'pago' explícito OU evento 'alterado' com pagoVariavel=true nos valoresDepois */}
                            {(() => {
                              const ehPagamento = l.evento === 'pago'
                                || (l.evento === 'alterado' && (
                                  dep.pagoVariavel === true || dep.pagoVariavel === 'True' ||
                                  dep.pago === true || dep.pago === 'True' ||
                                  (dep.logPagamentos && dep.logPagamentos !== (ant.logPagamentos || null))
                                ));
                              if (!ehPagamento) return null;
                              // Extrai forma de pagamento — pode estar no logPagamentos mais recente
                              const logPgtos: any[] = Array.isArray(dep.logPagamentos) ? dep.logPagamentos
                                : (typeof dep.logPagamentos === 'string' ? JSON.parse(dep.logPagamentos) : []);
                              const ultimoPgto = logPgtos[logPgtos.length - 1];
                              const formaEfetiva = forma || ultimoPgto?.tipo || '';
                              // Valor: tenta vlLiquido, depois saldoFinal do antes (pagamento = bruto - saldo)
                              const vlPago = vlLiquido != null ? Number(vlLiquido)
                                : (ultimoPgto?.value != null ? Number(ultimoPgto.value) : null);
                              return (
                                <div style={{ marginBottom: diffs.length > 0 ? 6 : 0 }}>
                                  {formaEfetiva && (
                                    <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                      backgroundColor: formaEfetiva === 'PIX' ? '#e3f2fd' : formaEfetiva === 'Adiantamento' ? '#fff8e1' : '#e8f5e9',
                                      color: formaEfetiva === 'PIX' ? '#1565c0' : formaEfetiva === 'Adiantamento' ? '#f57f17' : '#2e7d32', marginRight: 6 }}>
                                      {formaEfetiva === 'PIX' ? '📱 PIX' : formaEfetiva === 'Dinheiro' ? '💵 Dinheiro' : formaEfetiva === 'Adiantamento' ? '⏩ Adto.' : formaEfetiva}
                                    </span>
                                  )}
                                  {vlPago != null ? (
                                    <span style={{ fontWeight: 700, color: '#1b5e20', fontSize: 14 }}>
                                      R$ {fmtR(vlPago)}
                                    </span>
                                  ) : vlBruto != null ? (
                                    <span style={{ fontWeight: 700, color: '#2e7d32', fontSize: 14 }}>
                                      R$ {fmtR(Number(vlBruto))}
                                    </span>
                                  ) : null}
                                  {/* Breakdown: bruto → descontos → líquido */}
                                  {vlPago != null && vlBruto != null && Number(vlBruto) !== vlPago && (
                                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                                      bruto R${fmtR(Number(vlBruto))}
                                      {vlDesc != null && Number(vlDesc) > 0 && (
                                        <span style={{ color: '#c62828' }}> −R${fmtR(Number(vlDesc))} desc.</span>
                                      )}
                                      {vlAbat != null && Number(vlAbat) > 0 && (
                                        <span style={{ color: '#7b1fa2' }}> −R${fmtR(Number(vlAbat))} adto.esp.</span>
                                      )}
                                    </div>
                                  )}
                                  {/* Fallback: obs legado com "Líquido" */}
                                  {vlPago == null && /L[íi]quido|Desc\. sa/i.test(obsLog) && (
                                    <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic', marginTop: 3 }}>
                                      📝 {obsLog.slice(0, 130)}
                                    </div>
                                  )}
                                  {/* Saldo devedor após pagamento (se houver) */}
                                  {dep.saldoFinal != null && Number(dep.saldoFinal) > 0 && (
                                    <div style={{ fontSize: 10, color: '#e65100', marginTop: 2 }}>
                                      saldo restante R${fmtR(Number(dep.saldoFinal))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {diffs.length > 0 && (
                              <button onClick={() => setExpandido(prev => ({ ...prev, [l.id]: !prev[l.id] }))}
                                style={{ background: 'none', border: '1px solid #bbb', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
                                {exp ? '▼' : '▶'} {diffs.length} campo{diffs.length > 1 ? 's' : ''} alterado{diffs.length > 1 ? 's' : ''}
                              </button>
                            )}
                            {l.evento !== 'pago' && l.evento !== 'alterado' && l.observacao && (
                              <span style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginLeft: 4 }}>"{l.observacao}"</span>
                            )}
                          </td>
                        </tr>
                        {exp && diffs.length > 0 && (
                          <tr key={l.id + '-d'}>
                            <td colSpan={6} style={{ padding: '8px 16px', backgroundColor: '#fffde7' }}>
                              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#fff' }}>
                                    <th style={{ textAlign: 'left', padding: 4, fontSize: 11 }}>Campo</th>
                                    <th style={{ textAlign: 'left', padding: 4, color: '#c62828' }}>Antes</th>
                                    <th style={{ textAlign: 'left', padding: 4, color: '#2e7d32' }}>Depois</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {diffs.map(d => (
                                    <tr key={d.campo}>
                                      <td style={{ padding: 4, fontWeight: 600 }}>{d.campo}</td>
                                      <td style={{ padding: 4, color: '#c62828', textDecoration: 'line-through' }}>{fmt(d.antes)}</td>
                                      <td style={{ padding: 4, color: '#2e7d32', fontWeight: 600 }}>{fmt(d.depois)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Footer showLinks={true} />
    </div>
  );
}
