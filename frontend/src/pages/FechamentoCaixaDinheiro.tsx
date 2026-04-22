import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { Footer } from '../components/Footer';

const API = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
const fmtM = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const toNum = (v: any) => parseFloat(v) || 0;

function hoje() { return new Date().toISOString().split('T')[0]; }
function inicioMes() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }

interface RegistroCaixa {
  id: string; data: string; periodo: string; responsavelNome: string; sangria: number;
}
interface Saida {
  id: string; data: string; colaborador: string; favorecido: string;
  descricao: string; valor: number; tipo: string; origem: string;
  formaPagamento?: string; observacao?: string;
}
interface ManualItem { id: string; nome: string; valor: number; }

export const FechamentoCaixaDinheiro: React.FC = () => {
  const navigate     = useNavigate();
  const { activeUnit } = useUnit();
  const token        = () => localStorage.getItem('auth_token') || '';

  const [dataInicio, setDataInicio] = useState(inicioMes());
  const [dataFim,    setDataFim]    = useState(hoje());
  const [loading,    setLoading]    = useState(false);
  const [caixaRows,  setCaixaRows]  = useState<RegistroCaixa[]>([]);
  const [saidasRows, setSaidasRows] = useState<Saida[]>([]);
  const [carregado,  setCarregado]  = useState(false);

  // Mapa local: saidaId → forma de pagamento selecionada pelo usuário
  const [formaMap, setFormaMap]     = useState<Record<string, string>>({});

  // Itens manuais (pagamentos fora do sistema)
  const [manualNome,  setManualNome]  = useState('');
  const [manualValor, setManualValor] = useState('');
  const [manuais,     setManuais]     = useState<ManualItem[]>([]);

  const unitId = activeUnit?.id || '';

  const carregar = async () => {
    if (!unitId) { alert('Selecione uma unidade primeiro.'); return; }
    setLoading(true);
    setFormaMap({});
    try {
      const h = { Authorization: `Bearer ${token()}` };
      const [rC, rS] = await Promise.all([
        fetch(`${API}/caixa?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }),
        fetch(`${API}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }),
      ]);
      const caixaJson  = rC.ok  ? await rC.json()  : [];
      const saidasJson = rS.ok  ? await rS.json()  : [];
      const caixaArr   = Array.isArray(caixaJson)  ? caixaJson.sort((a: any,b: any) => a.data.localeCompare(b.data)) : [];
      const saidasArr  = Array.isArray(saidasJson) ? saidasJson.sort((a: any,b: any) => a.data.localeCompare(b.data)) : [];

      setCaixaRows(caixaArr);
      setSaidasRows(saidasArr);

      // Pré-preenche formaMap com o valor já salvo no banco
      // Padrão: PIX (dinheiro é exceção)
      const mapa: Record<string, string> = {};
      saidasArr.forEach((s: Saida) => {
        mapa[s.id] = s.formaPagamento || 'PIX';
      });
      setFormaMap(mapa);
      setCarregado(true);
    } catch(e) { console.error(e); alert('Erro ao carregar dados.'); }
    finally { setLoading(false); }
  };

  const setForma = (id: string, forma: string) => setFormaMap(prev => ({ ...prev, [id]: forma }));

  const adicionarManual = () => {
    const v = parseFloat(manualValor.replace(',','.'));
    if (!manualNome.trim() || isNaN(v) || v <= 0) return;
    setManuais(prev => [...prev, { id: Date.now().toString(), nome: manualNome.trim(), valor: v }]);
    setManualNome(''); setManualValor('');
  };
  const removerManual = (id: string) => setManuais(prev => prev.filter(m => m.id !== id));

  // Saídas marcadas como dinheiro (sistema ou forma selecionada localmente)
  const saidasDinheiro = saidasRows.filter(s => {
    const forma = formaMap[s.id] || s.formaPagamento || '';
    return forma === 'Dinheiro' || forma === 'Misto';
  });
  // Saídas marcadas como PIX
  const saidasPix = saidasRows.filter(s => {
    const forma = formaMap[s.id] || s.formaPagamento || '';
    return forma === 'PIX' || forma === 'Misto';
  });

  const totalSangria    = caixaRows.reduce((s,c) => s + toNum(c.sangria), 0);
  const totalSaisDin    = saidasDinheiro.reduce((s,x) => s + toNum(x.valor), 0);
  const totalSaisPix    = saidasPix.reduce((s,x) => s + toNum(x.valor), 0);
  const totalManual     = manuais.reduce((s,m) => s + m.valor, 0);
  const sobra           = totalSangria - totalSaisDin - totalManual;

  const exportarCSV = () => {
    const linhas = [
      ['FECHAMENTO CAIXA EM DINHEIRO'],
      [`Período: ${fmtD(dataInicio)} a ${fmtD(dataFim)}`],
      [`Unidade: ${activeUnit?.nome || unitId}`],
      [],
      ['SANGRIAS'],
      ['Data','Período','Conferência','Sangria (R$)'],
      ...caixaRows.filter(c => toNum(c.sangria) > 0).map(c => [fmtD(c.data), c.periodo, c.responsavelNome, toNum(c.sangria).toFixed(2)]),
      ['','','TOTAL', totalSangria.toFixed(2)],
      [],
      ['SAÍDAS EM DINHEIRO (sistema + seleção)'],
      ['Data','Colaborador','Descrição','Valor (R$)','Forma'],
      ...saidasDinheiro.map(s => [fmtD(s.data), s.colaborador||s.favorecido, s.descricao, toNum(s.valor).toFixed(2), formaMap[s.id]||s.formaPagamento||'']),
      ['','','TOTAL', totalSaisDin.toFixed(2),''],
      [],
      ['SAÍDAS EM DINHEIRO (manual)'],
      ['Descrição','Valor (R$)'],
      ...manuais.map(m => [m.nome, m.valor.toFixed(2)]),
      ['TOTAL', totalManual.toFixed(2)],
      [],
      ['RESUMO'],
      ['Total Sangrias', totalSangria.toFixed(2)],
      ['Total Saídas Dinheiro Sistema', totalSaisDin.toFixed(2)],
      ['Total Saídas PIX Sistema', totalSaisPix.toFixed(2)],
      ['Total Saídas Manuais', totalManual.toFixed(2)],
      ['SOBRA EM CAIXA', sobra.toFixed(2)],
    ];
    const csv = linhas.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`fechamento_${dataInicio}_${dataFim}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Estilos ── */
  const S = {
    page:    { display:'flex', flexDirection:'column' as const, minHeight:'100vh', background:'#f5f7fa', fontFamily:'Segoe UI,sans-serif' },
    header:  { background:'linear-gradient(135deg,#1b5e20,#388e3c)', color:'#fff', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'56px', boxShadow:'0 2px 8px rgba(0,0,0,.2)' },
    main:    { flex:1, padding:'24px', maxWidth:'1300px', margin:'0 auto', width:'100%' },
    card:    { background:'#fff', border:'1px solid #e0e0e0', borderRadius:'10px', padding:'20px', marginBottom:'20px' },
    title:   { fontSize:'15px', fontWeight:700, color:'#333', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' } as React.CSSProperties,
    table:   { width:'100%', borderCollapse:'collapse' as const, fontSize:'13px' },
    th:      { background:'#f0f4f8', padding:'9px 10px', textAlign:'left' as const, fontWeight:700, color:'#444', borderBottom:'2px solid #d0d0d0', whiteSpace:'nowrap' as const },
    td:      { padding:'8px 10px', borderBottom:'1px solid #f0f0f0', color:'#333', verticalAlign:'middle' as const },
    sumGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:'14px', marginBottom:'22px' },
    sumCard: (color: string, bg?: string) => ({ background: bg||'#fff', border:`2px solid ${color}`, borderRadius:'10px', padding:'16px', textAlign:'center' as const }),
    label:   { fontSize:'12px', fontWeight:600, color:'#555', display:'block', marginBottom:'4px' } as React.CSSProperties,
    inp:     { padding:'8px 10px', border:'1px solid #ccc', borderRadius:'6px', fontSize:'13px' } as React.CSSProperties,
    btn:     (bg: string) => ({ padding:'8px 18px', background:bg, color:'#fff', border:'none', borderRadius:'6px', fontWeight:700, fontSize:'13px', cursor:'pointer' }),
    tag:     (color: string, bg: string) => ({ display:'inline-block', padding:'2px 9px', borderRadius:'10px', background:bg, color, fontSize:'11px', fontWeight:700, whiteSpace:'nowrap' as const }),
  };

  const FormaBtn = ({ id, forma, label, color, bg }: { id:string; forma:string; label:string; color:string; bg:string }) => {
    const current = formaMap[id] || '';
    const active = current === forma;
    return (
      <button type="button" onClick={() => setForma(id, active ? '' : forma)}
        title={`Marcar como ${forma}`}
        style={{ padding:'2px 10px', borderRadius:'10px', border:`2px solid ${active?color:'#ddd'}`,
          background: active ? bg : '#f9f9f9', color: active ? color : '#aaa',
          fontWeight:700, fontSize:'11px', cursor:'pointer', transition:'all .15s' }}>
        {label}
      </button>
    );
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
          <div style={S.title}>🔍 Filtros</div>
          <div style={{ display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap' }}>
            <div><label style={S.label}>Data Início</label><input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={S.inp}/></div>
            <div><label style={S.label}>Data Fim</label><input type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)} style={S.inp}/></div>
            <button onClick={carregar} disabled={loading||!unitId} style={S.btn('#388e3c')}>{loading?'⏳ Carregando...':'🔄 Carregar'}</button>
            {carregado && <button onClick={exportarCSV} style={S.btn('#1565c0')}>📥 Exportar CSV</button>}
          </div>
          {!unitId && <p style={{ color:'#e53935', fontSize:'13px', margin:'12px 0 0' }}>⚠️ Selecione uma unidade no menu principal.</p>}
        </div>

        {carregado && <>
          {/* Cards resumo */}
          <div style={S.sumGrid}>
            <div style={S.sumCard('#388e3c')}>
              <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', fontWeight:600, textTransform:'uppercase' }}>Total Sangrias</div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#388e3c' }}>{fmtM(totalSangria)}</div>
            </div>
            <div style={S.sumCard('#e65100')}>
              <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', fontWeight:600, textTransform:'uppercase' }}>Saídas em Dinheiro (sistema)</div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#e65100' }}>{fmtM(totalSaisDin)}</div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'3px' }}>{saidasDinheiro.length} registro(s)</div>
            </div>
            <div style={S.sumCard('#1565c0')}>
              <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', fontWeight:600, textTransform:'uppercase' }}>Saídas em PIX (sistema)</div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#1565c0' }}>{fmtM(totalSaisPix)}</div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'3px' }}>{saidasPix.length} registro(s)</div>
            </div>
            <div style={S.sumCard('#6a1b9a')}>
              <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', fontWeight:600, textTransform:'uppercase' }}>Saídas Manuais (dinheiro)</div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#6a1b9a' }}>{fmtM(totalManual)}</div>
            </div>
            <div style={{ ...S.sumCard(sobra>=0?'#1b5e20':'#b71c1c'), background:sobra>=0?'#e8f5e9':'#ffebee' }}>
              <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', fontWeight:600, textTransform:'uppercase' }}>Sobra em Caixa</div>
              <div style={{ fontSize:'22px', fontWeight:700, color:sobra>=0?'#1b5e20':'#b71c1c' }}>{fmtM(sobra)}</div>
              <div style={{ fontSize:'11px', color:sobra>=0?'#388e3c':'#e53935', marginTop:'3px' }}>{sobra>=0?'✅ Positivo':'❌ Negativo'}</div>
            </div>
          </div>

          {/* Seção 1 — Sangrias */}
          <div style={S.card}>
            <div style={S.title}>🏦 Sangrias do Período <span style={{ fontSize:'12px', fontWeight:400, color:'#888' }}>({caixaRows.filter(c=>toNum(c.sangria)>0).length} com sangria)</span></div>
            <div style={{ overflowX:'auto' }}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Data</th><th style={S.th}>Período</th>
                  <th style={S.th}>Conferência</th><th style={{ ...S.th, textAlign:'right' }}>Sangria</th>
                </tr></thead>
                <tbody>
                  {caixaRows.filter(c=>toNum(c.sangria)>0).map(c=>(
                    <tr key={c.id}>
                      <td style={S.td}>{fmtD(c.data)}</td>
                      <td style={S.td}><span style={S.tag(c.periodo==='Dia'?'#f57c00':'#1565c0', c.periodo==='Dia'?'#fff3e0':'#e3f2fd')}>{c.periodo}</span></td>
                      <td style={S.td}>{c.responsavelNome||'—'}</td>
                      <td style={{ ...S.td, textAlign:'right', fontWeight:700, color:'#388e3c' }}>{fmtM(toNum(c.sangria))}</td>
                    </tr>
                  ))}
                  {caixaRows.filter(c=>toNum(c.sangria)>0).length===0 && (
                    <tr><td colSpan={4} style={{ ...S.td, textAlign:'center', color:'#999' }}>Nenhuma sangria no período</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#f0f7f0', fontWeight:700 }}>
                    <td colSpan={3} style={S.td}>TOTAL SANGRIAS</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#388e3c', fontSize:'15px' }}>{fmtM(totalSangria)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Seção 2 — Todas as Saídas com seleção de forma */}
          <div style={S.card}>
            <div style={S.title}>
              💸 Saídas do Período — Selecione a Forma de Pagamento
              <span style={{ fontSize:'12px', fontWeight:400, color:'#888' }}>({saidasRows.length} registros)</span>
            </div>
            <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:'6px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:'#795548' }}>
              💡 <strong>Como usar:</strong> O padrão é <strong>📱 PIX</strong>. Clique em <strong>💵 Din.</strong> apenas nas saídas que foram pagas em dinheiro físico — essas entram no cálculo da sobra. PIX não desconta do caixa físico.
            </div>
            {saidasRows.length === 0 ? (
              <p style={{ color:'#999', fontSize:'13px' }}>Nenhuma saída registrada no período.</p>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Data</th>
                    <th style={S.th}>Colaborador</th>
                    <th style={S.th}>Descrição</th>
                    <th style={S.th}>Tipo</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Valor</th>
                    <th style={{ ...S.th, textAlign:'center' }}>Forma de Pagamento</th>
                  </tr></thead>
                  <tbody>
                    {saidasRows.map(s => {
                      const formaAtual = formaMap[s.id] || s.formaPagamento || '';
                      const isDin = formaAtual === 'Dinheiro' || formaAtual === 'Misto';
                      return (
                        <tr key={s.id} style={{ background: isDin ? '#fffde7' : 'transparent' }}>
                          <td style={S.td}>{fmtD(s.data)}</td>
                          <td style={S.td}>{s.colaborador||s.favorecido||'—'}</td>
                          <td style={{ ...S.td, maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis' }}>{s.descricao}</td>
                          <td style={S.td}>
                            <span style={S.tag('#555','#f5f5f5')}>{s.tipo||s.origem||'—'}</span>
                          </td>
                          <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{fmtM(toNum(s.valor))}</td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <div style={{ display:'flex', gap:'4px', justifyContent:'center' }}>
                              <FormaBtn id={s.id} forma="Dinheiro" label="💵 Din." color="#2e7d32" bg="#e8f5e9" />
                              <FormaBtn id={s.id} forma="PIX"      label="📱 PIX"  color="#1565c0" bg="#e3f2fd" />
                              <FormaBtn id={s.id} forma="Misto"    label="🔄 Misto" color="#6a1b9a" bg="#f3e5f5" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Seção 3 — Lançamentos Manuais */}
          <div style={S.card}>
            <div style={S.title}>✏️ Pagamentos em Dinheiro — Não Cadastrados no Sistema
              <span style={{ fontSize:'12px', fontWeight:400, color:'#888' }}>(Betinho, Lucio, compras, retiradas...)</span>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'12px' }}>
              <input placeholder="Nome / Descrição (ex: Betinho, Luis Compras)" value={manualNome}
                onChange={e=>setManualNome(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adicionarManual()}
                style={{ ...S.inp, flex:'2 1 200px' }}/>
              <input placeholder="Valor R$" value={manualValor}
                onChange={e=>setManualValor(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adicionarManual()}
                style={{ ...S.inp, width:'110px' }}/>
              <button onClick={adicionarManual} style={S.btn('#6a1b9a')}>+ Adicionar</button>
            </div>
            {manuais.length > 0 ? (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Descrição</th>
                  <th style={{ ...S.th, textAlign:'right' }}>Valor</th>
                  <th style={S.th}></th>
                </tr></thead>
                <tbody>
                  {manuais.map(m=>(
                    <tr key={m.id}>
                      <td style={S.td}>{m.nome}</td>
                      <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#6a1b9a' }}>{fmtM(m.valor)}</td>
                      <td style={S.td}>
                        <button onClick={()=>removerManual(m.id)} style={{ background:'none', border:'none', color:'#e53935', cursor:'pointer', fontSize:'16px' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#f3e5f5', fontWeight:700 }}>
                    <td style={S.td}>TOTAL MANUAL</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#6a1b9a', fontSize:'15px' }}>{fmtM(totalManual)}</td>
                    <td style={S.td}></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p style={{ color:'#aaa', fontSize:'13px', margin:0 }}>Nenhum item adicionado ainda.</p>
            )}
          </div>

          {/* Resumo final */}
          <div style={{ ...S.card, border:`2px solid ${sobra>=0?'#388e3c':'#e53935'}`, background:sobra>=0?'#f1f8f2':'#fff5f5' }}>
            <div style={S.title}>{sobra>=0?'✅':'⚠️'} Resumo do Batimento — Dinheiro</div>
            <table style={{ ...S.table, maxWidth:'500px' }}>
              <tbody>
                <tr>
                  <td style={{ ...S.td, fontWeight:600 }}>Total Sangrias (entrada de dinheiro)</td>
                  <td style={{ ...S.td, textAlign:'right', color:'#388e3c', fontWeight:700 }}>{fmtM(totalSangria)}</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, color:'#e65100' }}>− Saídas em Dinheiro (sistema: {saidasDinheiro.length} lançamentos)</td>
                  <td style={{ ...S.td, textAlign:'right', color:'#e65100', fontWeight:700 }}>{fmtM(totalSaisDin)}</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, color:'#6a1b9a' }}>− Saídas Manuais ({manuais.length} itens)</td>
                  <td style={{ ...S.td, textAlign:'right', color:'#6a1b9a', fontWeight:700 }}>{fmtM(totalManual)}</td>
                </tr>
                <tr style={{ borderTop:'2px solid #ccc' }}>
                  <td style={{ ...S.td, fontWeight:700, fontSize:'15px' }}>= Sobra em Caixa</td>
                  <td style={{ ...S.td, textAlign:'right', fontWeight:700, fontSize:'22px', color:sobra>=0?'#1b5e20':'#b71c1c' }}>{fmtM(sobra)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ ...S.td, fontSize:'11px', color:'#888', borderTop:'1px solid #eee', paddingTop:'8px' }}>
                    💡 Saídas em PIX ({fmtM(totalSaisPix)}) não impactam o saldo físico de dinheiro — não entram na sobra.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>}
      </main>
      <Footer showLinks={true} />
    </div>
  );
};

export default FechamentoCaixaDinheiro;
