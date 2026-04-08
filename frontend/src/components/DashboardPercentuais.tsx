import React, { useMemo } from 'react';

interface DashboardPercData {
  weeklyData: WeekData[];
  colaboradores: any[];
  escalas: any[];
}

interface WeekData {
  label: string;
  faturamento: number;
  custoCLT: number;
  custoFree: number;
  custo: number;
}

const R = (v: any) => parseFloat(v) || 0;
const fmtMoeda = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPerc = (v: number) => v.toFixed(1) + '%';

export const DashboardPercentuais: React.FC<DashboardPercData> = ({ weeklyData, colaboradores, escalas }) => {
  
  // Cálculos mensais consolidados
  const mensal = useMemo(() => {
    const faturamento = weeklyData.reduce((s, d) => s + d.faturamento, 0);
    const custoCLT = weeklyData.reduce((s, d) => s + d.custoCLT, 0);
    const custoFree = weeklyData.reduce((s, d) => s + d.custoFree, 0);
    const custoTotal = custoCLT + custoFree;
    
    const percCLT = faturamento > 0 ? (custoCLT / faturamento) * 100 : 0;
    const percFree = faturamento > 0 ? (custoFree / faturamento) * 100 : 0;
    const percTotal = faturamento > 0 ? (custoTotal / faturamento) * 100 : 0;
    
    return { faturamento, custoCLT, custoFree, custoTotal, percCLT, percFree, percTotal };
  }, [weeklyData]);

  // Cálculos por função
  const porFuncao = useMemo(() => {
    const funcoes: { [key: string]: { clt: number; free: number } } = {};
    
    for (const colab of colaboradores) {
      if (colab.ativo === false) continue;
      
      const funcao = colab.funcao || 'Outros';
      if (!funcoes[funcao]) funcoes[funcao] = { clt: 0, free: 0 };
      
      const isFree = colab.tipoContrato === 'Freelancer';
      
      // Calcular custo total do mês para este colaborador
      const escsColab = escalas.filter((e: any) => e.colaboradorId === colab.id);
      let custoColab = 0;
      
      if (isFree) {
        let dC = 0, nC = 0, dnC = 0;
        for (const e of escsColab) {
          if (e.turno === 'Dia') dC++;
          else if (e.turno === 'Noite') nC++;
          else if (e.turno === 'DiaNoite') { dnC++; dC++; nC++; }
        }
        const diasTrab = escsColab.filter((e: any) => e.turno !== 'Folga').length;
        const vd = R(colab.valorDia) || 120;
        const dobras = dnC + (dC - dnC) * 0.5 + (nC - dnC) * 0.5;
        const transp = R(colab.valorTransporte) * diasTrab;
        custoColab = dobras * vd + transp;
      } else {
        // CLT: salário mensal completo
        custoColab = R(colab.salario);
      }
      
      if (isFree) {
        funcoes[funcao].free += custoColab;
      } else {
        funcoes[funcao].clt += custoColab;
      }
    }
    
    // Converter para array e calcular %
    const arr = Object.entries(funcoes).map(([funcao, custos]) => {
      const total = custos.clt + custos.free;
      const percCLT = mensal.faturamento > 0 ? (custos.clt / mensal.faturamento) * 100 : 0;
      const percFree = mensal.faturamento > 0 ? (custos.free / mensal.faturamento) * 100 : 0;
      const percTotal = mensal.faturamento > 0 ? (total / mensal.faturamento) * 100 : 0;
      
      return { funcao, clt: custos.clt, free: custos.free, total, percCLT, percFree, percTotal };
    });
    
    // Ordenar por % total decrescente
    arr.sort((a, b) => b.percTotal - a.percTotal);
    
    return arr;
  }, [colaboradores, escalas, mensal.faturamento]);

  // Dados semanais com %
  const semanalPerc = useMemo(() => {
    return weeklyData.map(d => ({
      ...d,
      percCLT: d.faturamento > 0 ? (d.custoCLT / d.faturamento) * 100 : 0,
      percFree: d.faturamento > 0 ? (d.custoFree / d.faturamento) * 100 : 0,
      percTotal: d.faturamento > 0 ? (d.custo / d.faturamento) * 100 : 0,
    }));
  }, [weeklyData]);

  const maxPerc = Math.max(...semanalPerc.map(d => d.percTotal), 1);

  return (
    <div>
      {/* Cards Mensais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div style={cardStyle('#2e7d32')}>
          <div style={labelStyle}>Faturamento Mensal</div>
          <div style={valueStyle('#2e7d32')}>{fmtMoeda(mensal.faturamento)}</div>
        </div>
        
        <div style={cardStyle('#1565c0')}>
          <div style={labelStyle}>Custo CLT</div>
          <div style={valueStyle('#1565c0')}>{fmtMoeda(mensal.custoCLT)}</div>
          <div style={percStyle('#1565c0')}>{fmtPerc(mensal.percCLT)} do faturamento</div>
        </div>
        
        <div style={cardStyle('#c2185b')}>
          <div style={labelStyle}>Custo Freelancer</div>
          <div style={valueStyle('#c2185b')}>{fmtMoeda(mensal.custoFree)}</div>
          <div style={percStyle('#c2185b')}>{fmtPerc(mensal.percFree)} do faturamento</div>
        </div>
        
        <div style={cardStyle('#e65100')}>
          <div style={labelStyle}>Custo Total</div>
          <div style={valueStyle('#e65100')}>{fmtMoeda(mensal.custoTotal)}</div>
          <div style={percStyle('#e65100')}>{fmtPerc(mensal.percTotal)} do faturamento</div>
        </div>
      </div>

      {/* Tabela por Função */}
      <div style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
          📊 Custo por Função (% sobre Faturamento)
        </h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={thStyle}>Função</th>
                <th style={thStyle}>CLT (R$)</th>
                <th style={thStyle}>CLT (%)</th>
                <th style={thStyle}>Freelancer (R$)</th>
                <th style={thStyle}>Freelancer (%)</th>
                <th style={thStyle}>Total (R$)</th>
                <th style={thStyle}>Total (%)</th>
              </tr>
            </thead>
            <tbody>
              {porFuncao.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}><strong>{f.funcao}</strong></td>
                  <td style={tdStyle}>{fmtMoeda(f.clt)}</td>
                  <td style={{...tdStyle, color: '#1565c0', fontWeight: 'bold'}}>{fmtPerc(f.percCLT)}</td>
                  <td style={tdStyle}>{fmtMoeda(f.free)}</td>
                  <td style={{...tdStyle, color: '#c2185b', fontWeight: 'bold'}}>{fmtPerc(f.percFree)}</td>
                  <td style={tdStyle}>{fmtMoeda(f.total)}</td>
                  <td style={{...tdStyle, color: '#e65100', fontWeight: 'bold'}}>{fmtPerc(f.percTotal)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f9f9f9', fontWeight: 'bold', borderTop: '2px solid #ddd' }}>
                <td style={tdStyle}>TOTAL</td>
                <td style={tdStyle}>{fmtMoeda(mensal.custoCLT)}</td>
                <td style={{...tdStyle, color: '#1565c0'}}>{fmtPerc(mensal.percCLT)}</td>
                <td style={tdStyle}>{fmtMoeda(mensal.custoFree)}</td>
                <td style={{...tdStyle, color: '#c2185b'}}>{fmtPerc(mensal.percFree)}</td>
                <td style={tdStyle}>{fmtMoeda(mensal.custoTotal)}</td>
                <td style={{...tdStyle, color: '#e65100'}}>{fmtPerc(mensal.percTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico Semanal de % */}
      <div style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
          📈 % de Custo sobre Faturamento (Semanal)
        </h4>
        
        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '14px', height: '14px', backgroundColor: '#1565c0', borderRadius: '3px' }} />
            % CLT
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '14px', height: '14px', backgroundColor: '#c2185b', borderRadius: '3px' }} />
            % Freelancer
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '14px', height: '14px', backgroundColor: '#e65100', borderRadius: '3px' }} />
            % Total
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', minWidth: `${semanalPerc.length * 150}px`, height: '220px' }}>
            {semanalPerc.map((d, i) => {
              const hCLT = maxPerc > 0 ? Math.round((d.percCLT / maxPerc) * 180) : 0;
              const hFree = maxPerc > 0 ? Math.round((d.percFree / maxPerc) * 180) : 0;
              const hTotal = maxPerc > 0 ? Math.round((d.percTotal / maxPerc) * 180) : 0;
              
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '130px' }}>
                  {/* Bars */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '180px', paddingTop: '10px' }}>
                    {/* CLT */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#1565c0', fontWeight: 'bold', marginBottom: '2px' }}>
                        {fmtPerc(d.percCLT)}
                      </span>
                      <div style={{
                        width: '32px', height: `${Math.max(hCLT, 2)}px`,
                        backgroundColor: '#1565c0', borderRadius: '3px 3px 0 0',
                      }} title={`CLT: ${fmtPerc(d.percCLT)}`} />
                    </div>
                    
                    {/* Free */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#c2185b', fontWeight: 'bold', marginBottom: '2px' }}>
                        {fmtPerc(d.percFree)}
                      </span>
                      <div style={{
                        width: '32px', height: `${Math.max(hFree, 2)}px`,
                        backgroundColor: '#c2185b', borderRadius: '3px 3px 0 0',
                      }} title={`Free: ${fmtPerc(d.percFree)}`} />
                    </div>
                    
                    {/* Total */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#e65100', fontWeight: 'bold', marginBottom: '2px' }}>
                        {fmtPerc(d.percTotal)}
                      </span>
                      <div style={{
                        width: '32px', height: `${Math.max(hTotal, 2)}px`,
                        backgroundColor: '#e65100', borderRadius: '3px 3px 0 0',
                      }} title={`Total: ${fmtPerc(d.percTotal)}`} />
                    </div>
                  </div>

                  {/* Baseline */}
                  <div style={{ width: '100%', height: '2px', backgroundColor: '#e0e0e0', marginBottom: '6px' }} />

                  {/* Week label */}
                  <div style={{ fontSize: '10px', color: '#555', textAlign: 'center', fontWeight: 'bold' }}>
                    {d.label}
                  </div>
                  
                  {/* Faturamento */}
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                    {fmtMoeda(d.faturamento)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '12px', fontSize: '11px', color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
          💡 <strong>Percentuais sobre faturamento:</strong> Quanto maior o %, maior o impacto do custo na receita.
          Meta ideal: manter custo total abaixo de 35% do faturamento.
        </div>
      </div>
    </div>
  );
};

// Estilos
const cardStyle = (cor: string): React.CSSProperties => ({
  backgroundColor: 'white',
  border: '1px solid #e0e0e0',
  borderLeft: `4px solid ${cor}`,
  borderRadius: '8px',
  padding: '16px',
});

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginBottom: '6px',
};

const valueStyle = (cor: string): React.CSSProperties => ({
  fontSize: '18px',
  fontWeight: 'bold',
  color: cor,
  marginBottom: '4px',
});

const percStyle = (cor: string): React.CSSProperties => ({
  fontSize: '13px',
  fontWeight: 'bold',
  color: cor,
  backgroundColor: `${cor}15`,
  padding: '4px 8px',
  borderRadius: '4px',
  display: 'inline-block',
});

const thStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'left',
  fontWeight: 'bold',
  color: '#333',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
};
