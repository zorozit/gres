import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { Footer } from '../components/Footer';

const API = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
const R = (v: any) => parseFloat(v) || 0;
const fmtMoeda = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

interface RegistroCaixa {
  id: string; data: string; periodo: string; responsavelNome: string; sangria: number;
}
interface Saida {
  id: string; data: string; colaborador: string; favorecido: string;
  descricao: string; valor: number; tipo: string; origem: string;
  formaPagamento?: string; observacao?: string;
}
interface ManualItem { id: string; nome: string; valor: number; }

function hoje() { return new Date().toISOString().split('T')[0]; }
function inicioMes() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}

export const FechamentoCaixaDinheiro: React.FC = () => {
  const navigate   = useNavigate();
  const { activeUnit } = useUnit();
  const token      = () => localStorage.getItem('auth_token') || '';

  const [dataInicio, setDataInicio] = useState(inicioMes());
  const [dataFim,    setDataFim]    = useState(hoje());
  const [loading,    setLoading]    = useState(false);
  const [caixaRows,  setCaixaRows]  = useState<RegistroCaixa[]>([]);
  const [saidasRows, setSaidasRows] = useState<Saida[]>([]);
  const [carregado,  setCarregado]  = useState(false);

  // Itens manuais
  const [manualNome,  setManualNome]  = useState('');
  const [manualValor, setManualValor] = useState('');
  const [manuais,     setManuais]     = useState<ManualItem[]>([]);

  const unitId = activeUnit?.id || '';

  const carregar = async () => {
    if (!unitId) { alert('Selecione uma unidade primeiro.'); return; }
    setLoading(true);
    try {
      const h = { Authorization: `Bearer ${token()}` };
      const [rC, rS] = await Promise.all([
        fetch(`${API}/caixa?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }),
        fetch(`${API}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }),
      ]);
      const caixaJson = rC.ok ? await rC.json() : [];
      const saidasJson = rS.ok ? await rS.json() : [];
      setCaixaRows(Array.isArray(caixaJson) ? caixaJson.sort((a: any, b: any) => a.data.localeCompare(b.data)) : []);
      setSaidasRows(Array.isArray(saidasJson) ? saidasJson.sort((a: any, b: any) => a.data.localeCompare(b.data)) : []);
      setCarregado(true);
    } catch(e) { console.error(e); alert('Erro ao carregar dados.'); }
    finally { setLoading(false); }
  };

  const adicionarManual = () => {
    const v = parseFloat(manualValor.replace(',','.'));
    if (!manualNome.trim() || isNaN(v) || v <= 0) return;
    setManuais(prev => [...prev, { id: Date.now().toString(), nome: manualNome.trim(), valor: v }]);
    setManualNome(''); setManualValor('');
  };

  const removerManual = (id: string) => setManuais(prev => prev.filter(m => m.id !== id));

  // Identificar saídas em dinheiro
  const isDinheiro = (s: Saida) => {
    const forma = (s.formaPagamento || '').toLowerCase();
    const tipo  = (s.tipo || s.origem || '').toLowerCase();
    const desc  = (s.descricao || '').toLowerCase();
    return forma.includes('dinheiro') || tipo.includes('dinheiro') || desc.includes('dinheiro');
  };

  const totalSangria     = caixaRows.reduce((s, c) => s + R(c.sangria), 0);
  const saidasDinheiro   = saidasRows.filter(isDinheiro);
  const totalSaidasSist  = saidasDinheiro.reduce((s, x) => s + R(x.valor), 0);
  const totalManual      = manuais.reduce((s, m) => s + m.valor, 0);
  const sobra            = totalSangria - totalSaidasSist - totalManual;

  const exportarCSV = () => {
    const linhas = [
      ['FECHAMENTO CAIXA EM DINHEIRO'],
      [`Período: ${fmtData(dataInicio)} a ${fmtData(dataFim)}`],
      [`Unidade: ${activeUnit?.nome || unitId}`],
      [],
      ['SANGRIAS'],
      ['Data','Período','Conferência','Sangria (R$)'],
      ...caixaRows.filter(c => c.sangria > 0).map(c => [fmtData(c.data), c.periodo, c.responsavelNome, c.sangria.toFixed(2)]),
      ['','','TOTAL', totalSangria.toFixed(2)],
      [],
      ['SAÍDAS EM DINHEIRO (sistema)'],
      ['Data','Colaborador','Descrição','Valor (R$)'],
      ...saidasDinheiro.map(s => [fmtData(s.data), s.colaborador || s.favorecido, s.descricao, s.valor.toFixed(2)]),
      ['','','TOTAL', totalSaidasSist.toFixed(2)],
      [],
      ['SAÍDAS EM DINHEIRO (manual)'],
      ['Descrição','Valor (R$)'],
      ...manuais.map(m => [m.nome, m.valor.toFixed(2)]),
      ['TOTAL', totalManual.toFixed(2)],
      [],
      ['RESUMO'],
      ['Total Sangrias', totalSangria.toFixed(2)],
      ['Total Saídas Sistema', totalSaidasSist.toFixed(2)],
      ['Total Saídas Manual', totalManual.toFixed(2)],
      ['SOBRA EM CAIXA', sobra.toFixed(2)],
    ];
    const csv = linhas.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fechamento_dinheiro_${dataInicio}_${dataFim}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Estilos ─── */
  const S = {
    page: { display:'flex', flexDirection:'column' as const, minHeight:'100vh', background:'#f5f7fa', fontFamily:'Segoe UI,sans-serif' },
    header: { background:'linear-gradient(135deg,#1b5e20,#388e3c)', color:'#fff', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'56px', boxShadow:'0 2px 8px rgba(0,0,0,.2)' },
    main: { flex:1, padding:'24px', maxWidth:'1300px', margin:'0 auto', width:'100%' },
    card: { background:'#fff', border:'1px solid #e0e0e0', borderRadius:'10px', padding:'20px', marginBottom:'20px' },
    sectionTitle: { fontSize:'16px', fontWeight:700, color:'#333', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' },
    table: { width:'100%', borderCollapse:'collapse' as const, fontSize:'13px' },
    th: { background:'#f0f4f8', padding:'10px 10px', textAlign:'left' as const, fontWeight:700, color:'#444', borderBottom:'2px solid #d0d0d0' },
    td: { padding:'9px 10px', borderBottom:'1px solid #f0f0f0', color:'#333' },
    summaryGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'14px', marginBottom:'20px' },
    summaryCard: (color: string) => ({ background:'#fff', border:`2px solid ${color}`, borderRadius:'10px', padding:'16px', textAlign:'center' as const }),
    summaryLabel: { fontSize:'12px', color:'#666', marginBottom:'6px', textTransform:'uppercase' as const, fontWeight:600 },
    summaryValue: (color: string) => ({ fontSize:'22px', fontWeight:700, color }),
    filterRow: { display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap' as const, marginBottom:'20px' },
    label: { fontSize:'12px', fontWeight:600, color:'#555', display:'block', marginBottom:'4px' },
    input: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:'6px', fontSize:'13px' },
    btn: (bg: string) => ({ padding:'9px 18px', background:bg, color:'#fff', border:'none', borderRadius:'6px', fontWeight:700, fontSize:'13px', cursor:'pointer' }),
    manualRow: { display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' },
    tag: (color: string) => ({ display:'inline-block', padding:'2px 8px', borderRadius:'10px', background:color+'22', color, fontSize:'11px', fontWeight:700 }),
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={() => navigate('/modulos')} style={{ padding:'6px 14px', background:'rgba(255,255,255,.18)', color:'#fff', border:'1px solid rgba(255,255,255,.35)', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
            ← Módulos
          </button>
          <span style={{ fontSize:'18px', fontWeight:700 }}>💵 Fechamento Caixa — Dinheiro</span>
        </div>
        <span style={{ fontSize:'13px', opacity:.8 }}>{activeUnit?.nome || 'Nenhuma unidade selecionada'}</span>
      </header>

      <main style={S.main}>

        {/* Filtros */}
        <div style={S.card}>
          <div style={S.sectionTitle}>🔍 Filtros</div>
          <div style={S.filterRow}>
            <div>
              <label style={S.label}>Data Início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Data Fim</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.input} />
            </div>
            <button onClick={carregar} disabled={loading || !unitId} style={S.btn('#388e3c')}>
              {loading ? '⏳ Carregando...' : '🔄 Carregar'}
            </button>
            {carregado && (
              <button onClick={exportarCSV} style={S.btn('#1565c0')}>📥 Exportar CSV</button>
            )}
          </div>
          {!unitId && <p style={{ color:'#e53935', fontSize:'13px', margin:0 }}>⚠️ Selecione uma unidade no menu principal para continuar.</p>}
        </div>

        {carregado && (
          <>
            {/* Cards resumo */}
            <div style={S.summaryGrid}>
              <div style={S.summaryCard('#388e3c')}>
                <div style={S.summaryLabel}>Total Sangrias</div>
                <div style={S.summaryValue('#388e3c')}>{fmtMoeda(totalSangria)}</div>
              </div>
              <div style={S.summaryCard('#e65100')}>
                <div style={S.summaryLabel}>Saídas Sistema (Dinheiro)</div>
                <div style={S.summaryValue('#e65100')}>{fmtMoeda(totalSaidasSist)}</div>
              </div>
              <div style={S.summaryCard('#6a1b9a')}>
                <div style={S.summaryLabel}>Saídas Manual</div>
                <div style={S.summaryValue('#6a1b9a')}>{fmtMoeda(totalManual)}</div>
              </div>
              <div style={{ ...S.summaryCard(sobra >= 0 ? '#1b5e20' : '#b71c1c'), background: sobra >= 0 ? '#e8f5e9' : '#ffebee' }}>
                <div style={S.summaryLabel}>Sobra em Caixa</div>
                <div style={S.summaryValue(sobra >= 0 ? '#1b5e20' : '#b71c1c')}>{fmtMoeda(sobra)}</div>
                <div style={{ fontSize:'11px', color: sobra >= 0 ? '#388e3c' : '#e53935', marginTop:'4px' }}>
                  {sobra >= 0 ? '✅ Positivo' : '❌ Negativo'}
                </div>
              </div>
            </div>

            {/* Seção 1 — Sangrias */}
            <div style={S.card}>
              <div style={S.sectionTitle}>🏦 Sangrias do Período <span style={{ fontSize:'13px', fontWeight:400, color:'#888' }}>({caixaRows.filter(c=>c.sangria>0).length} registros)</span></div>
              <div style={{ overflowX:'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Data</th>
                      <th style={S.th}>Período</th>
                      <th style={S.th}>Conferência</th>
                      <th style={{ ...S.th, textAlign:'right' }}>Sangria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caixaRows.filter(c => c.sangria > 0).map(c => (
                      <tr key={c.id}>
                        <td style={S.td}>{fmtData(c.data)}</td>
                        <td style={S.td}><span style={S.tag(c.periodo==='Dia'?'#f57c00':'#1565c0')}>{c.periodo}</span></td>
                        <td style={S.td}>{c.responsavelNome || '—'}</td>
                        <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#388e3c' }}>{fmtMoeda(R(c.sangria))}</td>
                      </tr>
                    ))}
                    {caixaRows.filter(c=>c.sangria>0).length === 0 && (
                      <tr><td colSpan={4} style={{ ...S.td, textAlign:'center', color:'#999' }}>Nenhuma sangria no período</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#f0f7f0', fontWeight:700 }}>
                      <td colSpan={3} style={{ ...S.td, color:'#333' }}>TOTAL SANGRIAS</td>
                      <td style={{ ...S.td, textAlign:'right', color:'#388e3c', fontSize:'15px' }}>{fmtMoeda(totalSangria)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Seção 2 — Saídas em Dinheiro (sistema) */}
            <div style={S.card}>
              <div style={S.sectionTitle}>💸 Saídas em Dinheiro — Sistema <span style={{ fontSize:'13px', fontWeight:400, color:'#888' }}>({saidasDinheiro.length} identificadas de {saidasRows.length} totais)</span></div>

              {saidasDinheiro.length > 0 ? (
                <div style={{ overflowX:'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Data</th>
                        <th style={S.th}>Colaborador</th>
                        <th style={S.th}>Descrição</th>
                        <th style={S.th}>Tipo</th>
                        <th style={{ ...S.th, textAlign:'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saidasDinheiro.map(s => (
                        <tr key={s.id}>
                          <td style={S.td}>{fmtData(s.data)}</td>
                          <td style={S.td}>{s.colaborador || s.favorecido || '—'}</td>
                          <td style={S.td}>{s.descricao}</td>
                          <td style={S.td}><span style={S.tag('#e65100')}>{s.formaPagamento || s.tipo || s.origem}</span></td>
                          <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#e65100' }}>{fmtMoeda(R(s.valor))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#fff3e0', fontWeight:700 }}>
                        <td colSpan={4} style={{ ...S.td, color:'#333' }}>TOTAL SAÍDAS SISTEMA</td>
                        <td style={{ ...S.td, textAlign:'right', color:'#e65100', fontSize:'15px' }}>{fmtMoeda(totalSaidasSist)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p style={{ color:'#888', fontSize:'13px' }}>Nenhuma saída classificada como "Dinheiro" encontrada no sistema para o período.<br/>
                <em>Use a seção abaixo para registrar pagamentos manuais.</em></p>
              )}

              {/* Todas as saídas (colapsável) */}
              <details style={{ marginTop:'16px' }}>
                <summary style={{ cursor:'pointer', fontSize:'13px', color:'#1565c0', fontWeight:600 }}>
                  📋 Ver todas as saídas do período ({saidasRows.length} registros)
                </summary>
                <div style={{ overflowX:'auto', marginTop:'10px' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Data</th>
                        <th style={S.th}>Colaborador</th>
                        <th style={S.th}>Descrição</th>
                        <th style={S.th}>Forma/Tipo</th>
                        <th style={{ ...S.th, textAlign:'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saidasRows.map(s => (
                        <tr key={s.id} style={{ background: isDinheiro(s) ? '#fff8e1' : 'transparent' }}>
                          <td style={S.td}>{fmtData(s.data)}</td>
                          <td style={S.td}>{s.colaborador || s.favorecido || '—'}</td>
                          <td style={S.td}>{s.descricao}</td>
                          <td style={S.td}><span style={S.tag(isDinheiro(s)?'#e65100':'#666')}>{s.formaPagamento || s.tipo || s.origem || '—'}</span></td>
                          <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{fmtMoeda(R(s.valor))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            {/* Seção 3 — Lançamentos Manuais */}
            <div style={S.card}>
              <div style={S.sectionTitle}>✏️ Saídas Manuais em Dinheiro <span style={{ fontSize:'12px', fontWeight:400, color:'#888' }}>(retiradas, compras, não cadastradas no sistema)</span></div>

              <div style={S.manualRow}>
                <input
                  placeholder="Descrição (ex: Mimi, Betinho, Luis Compras...)"
                  value={manualNome}
                  onChange={e => setManualNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarManual()}
                  style={{ ...S.input, flex:2, minWidth:'200px' }}
                />
                <input
                  placeholder="Valor (R$)"
                  value={manualValor}
                  onChange={e => setManualValor(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarManual()}
                  style={{ ...S.input, width:'120px' }}
                />
                <button onClick={adicionarManual} style={S.btn('#6a1b9a')}>+ Adicionar</button>
              </div>

              {manuais.length > 0 && (
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Descrição</th>
                      <th style={{ ...S.th, textAlign:'right' }}>Valor</th>
                      <th style={S.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manuais.map(m => (
                      <tr key={m.id}>
                        <td style={S.td}>{m.nome}</td>
                        <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#6a1b9a' }}>{fmtMoeda(m.valor)}</td>
                        <td style={S.td}>
                          <button onClick={() => removerManual(m.id)} style={{ background:'none', border:'none', color:'#e53935', cursor:'pointer', fontSize:'16px' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#f3e5f5', fontWeight:700 }}>
                      <td style={S.td}>TOTAL MANUAL</td>
                      <td style={{ ...S.td, textAlign:'right', color:'#6a1b9a', fontSize:'15px' }}>{fmtMoeda(totalManual)}</td>
                      <td style={S.td}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {manuais.length === 0 && <p style={{ color:'#aaa', fontSize:'13px', margin:0 }}>Nenhum item adicionado.</p>}
            </div>

            {/* Resumo final destacado */}
            <div style={{ ...S.card, border:`2px solid ${sobra>=0?'#388e3c':'#e53935'}`, background: sobra>=0?'#f1f8f2':'#fff5f5' }}>
              <div style={S.sectionTitle}>{sobra>=0?'✅':'⚠️'} Resumo do Batimento</div>
              <table style={{ ...S.table, maxWidth:'480px' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.td, fontWeight:600 }}>Total Sangrias</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#388e3c', fontWeight:700 }}>{fmtMoeda(totalSangria)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...S.td, color:'#e65100' }}>− Saídas Sistema (Dinheiro)</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#e65100', fontWeight:700 }}>{fmtMoeda(totalSaidasSist)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...S.td, color:'#6a1b9a' }}>− Saídas Manuais</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#6a1b9a', fontWeight:700 }}>{fmtMoeda(totalManual)}</td>
                  </tr>
                  <tr style={{ borderTop:'2px solid #ccc' }}>
                    <td style={{ ...S.td, fontWeight:700, fontSize:'16px' }}>= Sobra em Caixa</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:700, fontSize:'20px', color: sobra>=0?'#1b5e20':'#b71c1c' }}>{fmtMoeda(sobra)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      <Footer showLinks={true} />
    </div>
  );
};

export default FechamentoCaixaDinheiro;
