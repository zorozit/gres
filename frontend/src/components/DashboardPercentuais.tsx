import React, { useMemo } from 'react';

interface DayData {
  label: string;           // DD/MM
  data: string;            // YYYY-MM-DD
  faturamento_dia: number;
  faturamento_noite: number;
  faturamento_total: number;
  custo_dia: number;
  custo_noite: number;
  custo_total: number;
  func_dia: number;
  func_noite: number;
}

interface Props {
  dailyData: DayData[];
  colaboradores: any[];
  escalas: any[];
}

const fmtM = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (v: number) => isFinite(v) ? v.toFixed(1) + '%' : '—';

function percColor(p: number): { bg: string; color: string; label: string } {
  if (p <= 0)   return { bg: '#f5f5f5', color: '#999',    label: 'Sem fat.' };
  if (p < 20)   return { bg: '#e8f5e9', color: '#1b5e20', label: '✅ Ótimo' };
  if (p < 30)   return { bg: '#f1f8e9', color: '#33691e', label: '👍 Bom' };
  if (p < 40)   return { bg: '#fff8e1', color: '#f57f17', label: '⚠️ Atenção' };
  if (p < 55)   return { bg: '#fff3e0', color: '#e65100', label: '🔴 Alto' };
  return           { bg: '#ffebee', color: '#b71c1c', label: '🚨 Crítico' };
}

export const DashboardPercentuais: React.FC<Props> = ({ dailyData }) => {

  const mensal = useMemo(() => {
    const fat  = dailyData.reduce((s, d) => s + d.faturamento_total, 0);
    const custo= dailyData.reduce((s, d) => s + d.custo_total, 0);
    const fat_dia   = dailyData.reduce((s, d) => s + d.faturamento_dia, 0);
    const fat_noite = dailyData.reduce((s, d) => s + d.faturamento_noite, 0);
    return { fat, custo, fat_dia, fat_noite, perc: fat > 0 ? (custo / fat) * 100 : 0 };
  }, [dailyData]);

  const maxFat = Math.max(...dailyData.map(d => d.faturamento_total), 1);

  const th: React.CSSProperties = {
    padding: '9px 8px', background: '#f0f4f8', textAlign: 'left',
    fontWeight: 700, color: '#444', borderBottom: '2px solid #d0d0d0',
    fontSize: '12px', whiteSpace: 'nowrap',
  };
  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '8px 8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px',
    whiteSpace: 'nowrap', ...extra,
  });

  return (
    <div>
      {/* ── Cards resumo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:'12px', marginBottom:'22px' }}>
        {[
          { label:'Faturamento Total', value: fmtM(mensal.fat),      color:'#2e7d32' },
          { label:'Faturamento Dia',   value: fmtM(mensal.fat_dia),   color:'#f57c00' },
          { label:'Faturamento Noite', value: fmtM(mensal.fat_noite), color:'#1565c0' },
          { label:'Custo Mão de Obra', value: fmtM(mensal.custo),     color:'#c62828' },
          { label:'% Custo / Fat.',    value: fmtP(mensal.perc),      color: mensal.perc < 30 ? '#2e7d32' : mensal.perc < 45 ? '#e65100' : '#b71c1c' },
        ].map((c, i) => (
          <div key={i} style={{ background:'#fff', border:'1px solid #e0e0e0', borderLeft:`4px solid ${c.color}`, borderRadius:'8px', padding:'14px' }}>
            <div style={{ fontSize:'11px', color:'#777', marginBottom:'5px', textTransform:'uppercase', fontWeight:600 }}>{c.label}</div>
            <div style={{ fontSize:'17px', fontWeight:700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabela diária ── */}
      <div style={{ background:'#fff', border:'1px solid #e0e0e0', borderRadius:'10px', padding:'20px', marginBottom:'22px' }}>
        <h4 style={{ margin:'0 0 14px', fontSize:'15px', fontWeight:700, color:'#333' }}>
          📅 Custo × Faturamento por Dia e Turno
        </h4>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                {/* Dia */}
                <th style={{ ...th, borderLeft:'2px solid #ffe0b2' }}>Fat. Dia</th>
                <th style={th}>Custo Dia</th>
                <th style={th}>% Dia</th>
                <th style={th}>Func. Dia</th>
                {/* Noite */}
                <th style={{ ...th, borderLeft:'2px solid #bbdefb' }}>Fat. Noite</th>
                <th style={th}>Custo Noite</th>
                <th style={th}>% Noite</th>
                <th style={th}>Func. Noite</th>
                {/* Total */}
                <th style={{ ...th, borderLeft:'2px solid #e0e0e0' }}>Fat. Total</th>
                <th style={th}>Custo Total</th>
                <th style={th}>% Total</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((d, i) => {
                const pDia   = d.faturamento_dia   > 0 ? (d.custo_dia   / d.faturamento_dia)   * 100 : 0;
                const pNoite = d.faturamento_noite > 0 ? (d.custo_noite / d.faturamento_noite) * 100 : 0;
                const pTotal = d.faturamento_total > 0 ? (d.custo_total / d.faturamento_total) * 100 : 0;
                const st = percColor(pTotal);
                const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
                const cellPerc = (p: number): React.CSSProperties => {
                  const c = percColor(p);
                  return { ...td({ textAlign:'center', fontWeight:700, background: c.bg, color: c.color }), borderRadius:'4px' };
                };
                return (
                  <tr key={d.data} style={{ background: pTotal > 55 ? '#fff5f5' : pTotal > 0 && pTotal < 20 ? '#f9fff9' : rowBg }}>
                    <td style={td({ fontWeight:600 })}>{d.label}</td>
                    {/* Dia */}
                    <td style={{ ...td({ borderLeft:'2px solid #ffe0b2' }), color:'#f57c00', fontWeight:600 }}>
                      {d.faturamento_dia > 0 ? fmtM(d.faturamento_dia) : <span style={{ color:'#bbb' }}>—</span>}
                    </td>
                    <td style={td()}>{d.custo_dia > 0 ? fmtM(d.custo_dia) : <span style={{ color:'#bbb' }}>—</span>}</td>
                    <td style={cellPerc(pDia)}>{d.faturamento_dia > 0 ? fmtP(pDia) : '—'}</td>
                    <td style={td({ textAlign:'center' })}>
                      {d.func_dia > 0 ? <span style={{ background:'#fff3e0', color:'#e65100', padding:'1px 7px', borderRadius:'10px', fontWeight:600 }}>{d.func_dia}</span> : '—'}
                    </td>
                    {/* Noite */}
                    <td style={{ ...td({ borderLeft:'2px solid #bbdefb' }), color:'#1565c0', fontWeight:600 }}>
                      {d.faturamento_noite > 0 ? fmtM(d.faturamento_noite) : <span style={{ color:'#bbb' }}>—</span>}
                    </td>
                    <td style={td()}>{d.custo_noite > 0 ? fmtM(d.custo_noite) : <span style={{ color:'#bbb' }}>—</span>}</td>
                    <td style={cellPerc(pNoite)}>{d.faturamento_noite > 0 ? fmtP(pNoite) : '—'}</td>
                    <td style={td({ textAlign:'center' })}>
                      {d.func_noite > 0 ? <span style={{ background:'#e3f2fd', color:'#1565c0', padding:'1px 7px', borderRadius:'10px', fontWeight:600 }}>{d.func_noite}</span> : '—'}
                    </td>
                    {/* Total */}
                    <td style={{ ...td({ fontWeight:700, borderLeft:'2px solid #e0e0e0' }) }}>{d.faturamento_total > 0 ? fmtM(d.faturamento_total) : '—'}</td>
                    <td style={td({ fontWeight:600, color:'#c62828' })}>{d.custo_total > 0 ? fmtM(d.custo_total) : '—'}</td>
                    <td style={cellPerc(pTotal)}>{d.faturamento_total > 0 ? fmtP(pTotal) : '—'}</td>
                    <td style={td({ textAlign:'center' })}>
                      <span style={{ background: st.bg, color: st.color, padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:700 }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totais */}
            <tfoot>
              <tr style={{ background:'#f5f5f5', fontWeight:700, borderTop:'2px solid #ccc' }}>
                <td style={td({ fontWeight:700 })}>TOTAL</td>
                <td style={{ ...td({ borderLeft:'2px solid #ffe0b2' }), color:'#f57c00', fontWeight:700 }}>{fmtM(mensal.fat_dia)}</td>
                <td style={td()}>{fmtM(dailyData.reduce((s,d)=>s+d.custo_dia,0))}</td>
                <td style={td({ textAlign:'center', color: mensal.fat_dia > 0 ? percColor(dailyData.reduce((s,d)=>s+d.custo_dia,0)/mensal.fat_dia*100).color : '#999' })}>
                  {mensal.fat_dia > 0 ? fmtP(dailyData.reduce((s,d)=>s+d.custo_dia,0)/mensal.fat_dia*100) : '—'}
                </td>
                <td style={td()}></td>
                <td style={{ ...td({ borderLeft:'2px solid #bbdefb' }), color:'#1565c0', fontWeight:700 }}>{fmtM(mensal.fat_noite)}</td>
                <td style={td()}>{fmtM(dailyData.reduce((s,d)=>s+d.custo_noite,0))}</td>
                <td style={td({ textAlign:'center' })}>
                  {mensal.fat_noite > 0 ? fmtP(dailyData.reduce((s,d)=>s+d.custo_noite,0)/mensal.fat_noite*100) : '—'}
                </td>
                <td style={td()}></td>
                <td style={{ ...td({ fontWeight:700, borderLeft:'2px solid #e0e0e0' }) }}>{fmtM(mensal.fat)}</td>
                <td style={td({ fontWeight:700, color:'#c62828' })}>{fmtM(mensal.custo)}</td>
                <td style={td({ textAlign:'center', fontWeight:700, color: percColor(mensal.perc).color })}>
                  {fmtP(mensal.perc)}
                </td>
                <td style={td()}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ marginTop:'10px', fontSize:'11px', color:'#888', borderTop:'1px solid #f0f0f0', paddingTop:'8px' }}>
          💡 <strong>Legenda %:</strong>&nbsp;
          <span style={{ color:'#1b5e20' }}>✅ &lt;20% Ótimo</span> &nbsp;
          <span style={{ color:'#33691e' }}>👍 20–30% Bom</span> &nbsp;
          <span style={{ color:'#f57f17' }}>⚠️ 30–40% Atenção</span> &nbsp;
          <span style={{ color:'#e65100' }}>🔴 40–55% Alto</span> &nbsp;
          <span style={{ color:'#b71c1c' }}>🚨 &gt;55% Crítico</span>
        </div>
      </div>

      {/* ── Gráfico de barras horizontal (fat vs custo por dia) ── */}
      <div style={{ background:'#fff', border:'1px solid #e0e0e0', borderRadius:'10px', padding:'20px' }}>
        <h4 style={{ margin:'0 0 14px', fontSize:'15px', fontWeight:700, color:'#333' }}>
          📈 Faturamento × Custo por Dia
        </h4>
        <div style={{ display:'flex', gap:'16px', marginBottom:'12px', fontSize:'12px' }}>
          {[
            { color:'#667eea', label:'Faturamento' },
            { color:'#e53935', label:'Custo Mão de Obra' },
          ].map(l => (
            <span key={l.label} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
              <span style={{ width:'12px', height:'12px', background:l.color, borderRadius:'2px', display:'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
        <div style={{ overflowY:'auto', maxHeight:'420px' }}>
          {dailyData.map(d => {
            const wFat  = maxFat > 0 ? (d.faturamento_total / maxFat) * 100 : 0;
            const wCust = maxFat > 0 ? (d.custo_total / maxFat) * 100 : 0;
            const pTotal = d.faturamento_total > 0 ? (d.custo_total / d.faturamento_total) * 100 : 0;
            const st = percColor(pTotal);
            return (
              <div key={d.data} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                <div style={{ width:'36px', fontSize:'11px', color:'#666', textAlign:'right', flexShrink:0 }}>{d.label}</div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'3px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                    <div style={{ height:'12px', width:`${wFat}%`, background:'#667eea', borderRadius:'2px', minWidth:'2px', transition:'width .3s' }} />
                    <span style={{ fontSize:'11px', color:'#444' }}>{fmtM(d.faturamento_total)}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                    <div style={{ height:'12px', width:`${wCust}%`, background:'#e53935', borderRadius:'2px', minWidth:'2px', transition:'width .3s' }} />
                    <span style={{ fontSize:'11px', color:'#c62828' }}>{fmtM(d.custo_total)}</span>
                  </div>
                </div>
                <div style={{ width:'60px', fontSize:'11px', textAlign:'center', background: st.bg, color: st.color, padding:'2px 4px', borderRadius:'4px', fontWeight:700, flexShrink:0 }}>
                  {d.faturamento_total > 0 ? fmtP(pTotal) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
