import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmtMoeda = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getSemanasDoMes(ano: number, mes: number): { label: string; inicio: string; fim: string }[] {
  const semanas: { label: string; inicio: string; fim: string }[] = [];
  const primDia = new Date(ano, mes - 1, 1);
  const ultDia = new Date(ano, mes, 0);
  let cur = new Date(primDia);
  const dow0 = cur.getDay();
  if (dow0 !== 1) cur.setDate(cur.getDate() + (dow0 === 0 ? -6 : 1 - dow0));
  while (cur <= ultDia) {
    const seg = new Date(cur);
    const dom = new Date(cur); dom.setDate(dom.getDate() + 6);
    const fimReal = dom > ultDia ? new Date(ultDia) : new Date(dom);
    const inicioStr = seg.toISOString().split('T')[0];
    const fimStr = fimReal.toISOString().split('T')[0];
    semanas.push({
      label: `${seg.getDate().toString().padStart(2,'0')}/${(seg.getMonth()+1).toString().padStart(2,'0')} – ${fimReal.getDate().toString().padStart(2,'0')}/${(fimReal.getMonth()+1).toString().padStart(2,'0')}`,
      inicio: inicioStr,
      fim: fimStr,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return semanas;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit, setActiveUnit } = useUnit();
  const [unidades, setUnidades] = React.useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = React.useState(activeUnit?.id || '');
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loadingChart, setLoadingChart] = useState(false);
  const [caixaData, setCaixaData] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [escalas, setEscalas] = useState<any[]>([]);

  const token = () => localStorage.getItem('auth_token');
  const unitId = activeUnit?.id || '';

  React.useEffect(() => {
    const carregarUnidades = async () => {
      try {
        const response = await fetch(`${apiUrl}/unidades`, {
          headers: { 'Authorization': `Bearer ${token()}` }
        });
        const data = await response.json();
        if (Array.isArray(data)) {
          setUnidades(data);
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      }
    };
    carregarUnidades();
  }, []);

  React.useEffect(() => {
    if (activeUnit) setSelectedUnit(activeUnit.id);
    else setSelectedUnit('');
  }, [activeUnit]);

  // Load chart data when unit or month changes
  useEffect(() => {
    if (unitId) carregarDashboard();
  }, [unitId, mesAno]);

  const carregarDashboard = async () => {
    setLoadingChart(true);
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

      const [rCaixa, rColabs, rEscalas] = await Promise.all([
        fetch(`${apiUrl}/caixa?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
      ]);

      if (rCaixa?.ok) { const d = await rCaixa.json(); setCaixaData(Array.isArray(d) ? d : []); }
      if (rColabs?.ok) { const d = await rColabs.json(); setColaboradores(Array.isArray(d) ? d : []); }
      if (rEscalas?.ok) { const d = await rEscalas.json(); setEscalas(Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
    finally { setLoadingChart(false); }
  };

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const unitId = e.target.value;
    setSelectedUnit(unitId);
    const selectedUnitData = unidades.find(u => u.id === unitId);
    if (selectedUnitData) {
      setActiveUnit(selectedUnitData);
      window.dispatchEvent(new CustomEvent('unitChanged', { detail: selectedUnitData }));
    } else if (unitId === '') {
      setActiveUnit(null);
      window.dispatchEvent(new CustomEvent('unitChanged', { detail: null }));
    }
  };

  // Weekly analysis
  const weeklyData = useMemo(() => {
    if (!mesAno) return [];
    const [ano, mes] = mesAno.split('-').map(Number);
    const semanas = getSemanasDoMes(ano, mes);

    return semanas.map(sem => {
      // Faturamento: sum caixa totals in this week (dia period = total de entradas)
      const caixaSem = caixaData.filter(c => c.data >= sem.inicio && c.data <= sem.fim);
      const faturamento = caixaSem.reduce((s: number, c: any) => s + R(c.total || 0), 0);

      // Custo: compute from escalas + folhas
      // For each person working this week, estimate weekly cost
      let custoCLT = 0;
      let custoFree = 0;

      for (const colab of colaboradores) {
        if (colab.ativo === false) continue;
        const isFree = colab.tipoContrato === 'Freelancer';
        // Escalas this week for this person
        const escsSem = escalas.filter(e => e.colaboradorId === colab.id && e.data >= sem.inicio && e.data <= sem.fim);
        let dC = 0, nC = 0, dnC = 0;
        for (const e of escsSem) {
          if (e.turno === 'Dia') dC++;
          else if (e.turno === 'Noite') nC++;
          else if (e.turno === 'DiaNoite') { dnC++; dC++; nC++; }
        }
        const diasTrab = escsSem.filter(e => e.turno !== 'Folga').length;
        if (isFree) {
          const vd = R(colab.valorDia) || 120;
          const dobras = dnC + (dC - dnC) * 0.5 + (nC - dnC) * 0.5;
          const transp = R(colab.valorTransporte) * diasTrab;
          custoFree += dobras * vd + transp;
        } else {
          const vDia = R(colab.valorDia);
          const vNoite = R(colab.valorNoite);
          const transp = R(colab.valorTransporte) * diasTrab;
          const bruto = (vDia + vNoite) * dnC + vDia * (dC - dnC) + vNoite * (nC - dnC);
          // Weekly CLT cost estimate (salary / 4.3 weeks)
          const salSemanal = R(colab.salario) / 4.3;
          custoCLT += bruto + transp + salSemanal;
        }
      }

      const custo = custoCLT + custoFree;
      const lucro = faturamento - custo;
      return { label: sem.label, faturamento, custoCLT, custoFree, custo, lucro };
    });
  }, [mesAno, caixaData, colaboradores, escalas]);

  const maxVal = useMemo(() => Math.max(...weeklyData.map(d => Math.max(d.faturamento, d.custo)), 1), [weeklyData]);

  const modules = [
    { icon: '💰', title: 'Controle de Caixa', desc: 'Gerencie aberturas, recebimentos e fechamentos', path: '/modulos/caixa' },
    { icon: '📅', title: 'Gestão de Escalas', desc: 'Organize turnos e presenças de colaboradores', path: '/modulos/escalas' },
    { icon: '💸', title: 'Registro de Saídas', desc: 'Controle despesas e saídas operacionais', path: '/modulos/saidas' },
    { icon: '👥', title: 'Gestão de Colaboradores', desc: 'Gerencie dados e históricos de funcionários', path: '/modulos/colaboradores' },
    { icon: '💳', title: 'Folha de Pagamento', desc: 'Calcule e gerencie pagamentos de colaboradores', path: '/modulos/folha-pagamento' },
    { icon: '🏍️', title: 'Gestão de Motoboys', desc: 'Administre entregas e comissões', path: '/modulos/motoboys' },
    { icon: '📋', title: 'Extrato de Pagamentos', desc: 'Histórico analítico de pagamentos e descontos', path: '/modulos/extrato' },
    { icon: '🏢', title: 'Gestão de Unidades', desc: 'Administre as unidades do restaurante', path: '/modulos/unidades' },
    { icon: '👨‍💼', title: 'Gestão de Usuários', desc: 'Gerencie usuários e permissões do sistema', path: '/modulos/usuarios' },
  ];

  const CHART_HEIGHT = 180;

  return (
    <div style={styles.pageWrapper}>
      <Header title="🍽️ GRES - Gestão de Restaurantes" showBack={false} />
      
      <main style={styles.container}>
        {unidades.length > 0 && (
          <div style={styles.unitSelectorSection}>
            <label style={styles.unitSelectorLabel}>Selecione a Unidade:</label>
            <select value={selectedUnit || ''} onChange={handleUnitChange} style={styles.unitSelector}>
              <option value="">Todas as Unidades</option>
              {unidades.map((unit: any) => (
                <option key={unit.id} value={unit.id}>{unit.nome}</option>
              ))}
            </select>
          </div>
        )}
        
        <div style={styles.welcomeSection}>
          <h2 style={styles.welcomeTitle}>Bem-vindo ao GRES! 👋</h2>
          <p style={styles.welcomeText}>Sistema de Gestão Operacional para Redes de Restaurantes</p>
        </div>

        {/* ── Dashboard Semanal ─────────────────────────────────── */}
        {unitId && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ ...styles.sectionTitle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                📊 Faturamento vs Custo Semanal
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>Mês:</label>
                <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }} />
                <button onClick={carregarDashboard}
                  style={{ padding: '7px 14px', border: 'none', borderRadius: '4px', backgroundColor: '#1976d2', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                  🔄
                </button>
              </div>
            </div>

            {loadingChart ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#999', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                Carregando dados...
              </div>
            ) : weeklyData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#999', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                Selecione uma unidade para ver o dashboard semanal.
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: 'Faturamento Total', val: fmtMoeda(weeklyData.reduce((s, d) => s + d.faturamento, 0)), cor: '#2e7d32' },
                    { label: 'Custo CLT', val: fmtMoeda(weeklyData.reduce((s, d) => s + d.custoCLT, 0)), cor: '#1565c0' },
                    { label: 'Custo Freelancers', val: fmtMoeda(weeklyData.reduce((s, d) => s + d.custoFree, 0)), cor: '#c2185b' },
                    { label: 'Custo Total', val: fmtMoeda(weeklyData.reduce((s, d) => s + d.custo, 0)), cor: '#e65100' },
                    { label: 'Resultado', val: fmtMoeda(weeklyData.reduce((s, d) => s + d.lucro, 0)), cor: weeklyData.reduce((s, d) => s + d.lucro, 0) >= 0 ? '#1976d2' : '#c62828' },
                  ].map(c => (
                    <div key={c.label} style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderLeft: `4px solid ${c.cor}`, borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor, marginTop: '4px' }}>{c.val}</div>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', overflowX: 'auto' }}>
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                    {[
                      { cor: '#2e7d32', label: '🟢 Faturamento (Caixa)' },
                      { cor: '#1565c0', label: '🔵 Custo CLT' },
                      { cor: '#c2185b', label: '🔴 Custo Freelancers' },
                    ].map(l => (
                      <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '14px', height: '14px', backgroundColor: l.cor, borderRadius: '3px', display: 'inline-block' }} />
                        {l.label}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', minWidth: `${weeklyData.length * 130}px` }}>
                    {weeklyData.map((d, i) => {
                      const fH = maxVal > 0 ? Math.round((d.faturamento / maxVal) * CHART_HEIGHT) : 0;
                      const cCLTH = maxVal > 0 ? Math.round((d.custoCLT / maxVal) * CHART_HEIGHT) : 0;
                      const cFreeH = maxVal > 0 ? Math.round((d.custoFree / maxVal) * CHART_HEIGHT) : 0;
                      const isPositive = d.lucro >= 0;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px' }}>
                          {/* Bars */}
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: `${CHART_HEIGHT + 10}px`, paddingTop: '10px' }}>
                            {/* Faturamento */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', color: '#2e7d32', fontWeight: 'bold', marginBottom: '2px' }}>
                                {d.faturamento > 0 ? fmtMoeda(d.faturamento).replace('R$ ', '') : '—'}
                              </span>
                              <div style={{
                                width: '28px', height: `${Math.max(fH, 2)}px`,
                                backgroundColor: '#2e7d32', borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                              }} title={`Faturamento: ${fmtMoeda(d.faturamento)}`} />
                            </div>
                            {/* Custo CLT */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', color: '#1565c0', fontWeight: 'bold', marginBottom: '2px' }}>
                                {d.custoCLT > 0 ? fmtMoeda(d.custoCLT).replace('R$ ', '') : '—'}
                              </span>
                              <div style={{
                                width: '28px', height: `${Math.max(cCLTH, 2)}px`,
                                backgroundColor: '#1565c0', borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                              }} title={`Custo CLT: ${fmtMoeda(d.custoCLT)}`} />
                            </div>
                            {/* Custo Free */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', color: '#c2185b', fontWeight: 'bold', marginBottom: '2px' }}>
                                {d.custoFree > 0 ? fmtMoeda(d.custoFree).replace('R$ ', '') : '—'}
                              </span>
                              <div style={{
                                width: '28px', height: `${Math.max(cFreeH, 2)}px`,
                                backgroundColor: '#c2185b', borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                              }} title={`Custo Free: ${fmtMoeda(d.custoFree)}`} />
                            </div>
                          </div>

                          {/* Baseline */}
                          <div style={{ width: '100%', height: '2px', backgroundColor: '#e0e0e0', marginBottom: '6px' }} />

                          {/* Week label */}
                          <div style={{ fontSize: '10px', color: '#555', textAlign: 'center', fontWeight: 'bold' }}>
                            {d.label}
                          </div>

                          {/* Resultado */}
                          <div style={{
                            fontSize: '10px', fontWeight: 'bold', marginTop: '4px',
                            color: isPositive ? '#2e7d32' : '#c62828',
                            backgroundColor: isPositive ? '#e8f5e9' : '#fce4ec',
                            padding: '2px 6px', borderRadius: '8px',
                          }}>
                            {isPositive ? '+' : ''}{fmtMoeda(d.lucro).replace('R$ ', 'R$')}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                    ⚠️ <strong>Nota:</strong> Faturamento = soma dos registros de Caixa (entradas). Custo = estimativa semanal baseada nas escalas lançadas (CLT inclui salário proporcional + dobras + transporte; Freelancer = dobras × valor + transporte).
                    Valores precisos estão na <span style={{ color: '#1976d2', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/modulos/folha-pagamento')}>Folha de Pagamento</span>.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div style={styles.modulesSection}>
          <h3 style={styles.sectionTitle}>📋 Módulos Disponíveis</h3>
          <div style={styles.modulesGrid}>
            {modules.map((module) => (
              <div 
                key={module.path}
                style={styles.moduleCard}
                onClick={() => navigate(module.path)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
              >
                <div style={styles.moduleIcon}>{module.icon}</div>
                <h4 style={styles.moduleTitle}>{module.title}</h4>
                <p style={styles.moduleDesc}>{module.desc}</p>
                <div style={styles.moduleArrow}>→</div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.statusSection}>
          <h3 style={styles.sectionTitle}>✅ Status do Sistema</h3>
          <div style={styles.statusGrid}>
            {[
              'API: Conectada',
              'Banco de Dados: Ativo',
              'Autenticação: Ativa',
              'Armazenamento: Disponível',
            ].map(label => (
              <div key={label} style={styles.statusItem}>
                <span style={styles.statusDot} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer showLinks={true} />
    </div>
  );
};

const styles = {
  pageWrapper: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' },
  container: { padding: '40px 20px', maxWidth: '1400px', margin: '0 auto', width: '100%', flex: 1 },
  unitSelectorSection: { marginBottom: '30px', padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center' } as React.CSSProperties,
  unitSelectorLabel: { fontWeight: 'bold', color: '#333' },
  unitSelector: { padding: '8px 12px', border: '1px solid #3498db', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' } as React.CSSProperties,
  welcomeSection: { textAlign: 'center' as const, marginBottom: '40px' },
  welcomeTitle: { fontSize: '32px', fontWeight: 'bold', color: '#333', margin: '0 0 10px 0' },
  welcomeText: { fontSize: '16px', color: '#666', margin: 0 },
  modulesSection: { marginBottom: '40px' },
  sectionTitle: { fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '20px', borderBottom: '2px solid #3498db', paddingBottom: '10px' },
  modulesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' } as React.CSSProperties,
  moduleCard: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '24px', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' } as React.CSSProperties,
  moduleIcon: { fontSize: '40px', marginBottom: '12px', display: 'block' },
  moduleTitle: { fontSize: '16px', fontWeight: 'bold', color: '#333', margin: '0 0 8px 0' },
  moduleDesc: { fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.4' },
  moduleArrow: { position: 'absolute' as const, bottom: '12px', right: '12px', fontSize: '20px', color: '#3498db', fontWeight: 'bold' } as React.CSSProperties,
  statusSection: { marginTop: '40px' },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' } as React.CSSProperties,
  statusItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '14px', color: '#333' } as React.CSSProperties,
  statusDot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#4CAF50', boxShadow: '0 0 5px rgba(76, 175, 80, 0.5)' },
};
