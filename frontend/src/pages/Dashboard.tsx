import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { DashboardPercentuais } from '../components/DashboardPercentuais';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;

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
  const { user } = useAuth();
  const [unidades, setUnidades] = React.useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = React.useState(activeUnit?.id || '');
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  // Role check: only Admin and Gerente can see the full dashboard with chart
  const userRole = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdminOrGerente = ['Administrador', 'Gerente', 'admin', 'gerente', 'ADMIN', 'GERENTE'].includes(userRole);

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

  const allModules = [
    { icon: '💰', title: 'Controle de Caixa', desc: 'Gerencie aberturas, recebimentos e fechamentos', path: '/modulos/caixa', roles: [] },
    { icon: '📅', title: 'Gestão de Escalas', desc: 'Organize turnos e presenças de colaboradores', path: '/modulos/escalas', roles: [] },
    { icon: '💸', title: 'Registro de Saídas', desc: 'Controle despesas e saídas operacionais', path: '/modulos/saidas', roles: [] },
    { icon: '👥', title: 'Gestão de Colaboradores', desc: 'Gerencie dados e históricos de funcionários', path: '/modulos/colaboradores', roles: [] },
    { icon: '💳', title: 'Folha de Pagamento', desc: 'Calcule e gerencie pagamentos de colaboradores', path: '/modulos/folha-pagamento', roles: ['admin', 'gerente', 'Administrador', 'Gerente', 'ADMIN', 'GERENTE'] },
    { icon: '🏍️', title: 'Gestão de Motoboys', desc: 'Administre entregas e comissões', path: '/modulos/motoboys', roles: [] },
    { icon: '📋', title: 'Extrato de Pagamentos', desc: 'Histórico analítico de pagamentos e descontos', path: '/modulos/extrato', roles: ['admin', 'gerente', 'Administrador', 'Gerente', 'ADMIN', 'GERENTE'] },
    { icon: '🏢', title: 'Gestão de Unidades', desc: 'Administre as unidades do restaurante', path: '/modulos/unidades', roles: ['admin', 'Administrador', 'ADMIN'] },
    { icon: '👨‍💼', title: 'Gestão de Usuários', desc: 'Gerencie usuários e permissões do sistema', path: '/modulos/usuarios', roles: ['admin', 'Administrador', 'ADMIN'] },
  ];
  // Filter modules based on role: empty roles = visible to all
  const modules = allModules.filter(m => m.roles.length === 0 || m.roles.includes(userRole));

  return (
    <div style={styles.pageWrapper}>
      <Header title="🍽️ GIRES - Gestão Inteligente para Restaurantes" showBack={false} />
      
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
          <h2 style={styles.welcomeTitle}>Bem-vindo ao GIRES! 👋</h2>
          <p style={styles.welcomeText}>Gestão Inteligente para Restaurantes</p>
          {userRole && (
            <div style={{ marginTop: '8px', display: 'inline-block', padding: '4px 14px', borderRadius: '12px',
              backgroundColor: isAdminOrGerente ? '#e8f5e9' : '#fff3e0',
              color: isAdminOrGerente ? '#2e7d32' : '#e65100', fontSize: '13px', fontWeight: 'bold' }}>
              {isAdminOrGerente ? '🔑' : '👤'} Perfil: {userRole}
            </div>
          )}
        </div>

        {/* ── Dashboard com Percentuais (Admin/Gerente only) ──────────────── */}
        {unitId && isAdminOrGerente && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ ...styles.sectionTitle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                📊 Análise de Custos (% sobre Faturamento)
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
                Selecione uma unidade para ver o dashboard.
              </div>
            ) : (
              <DashboardPercentuais 
                weeklyData={weeklyData}
                colaboradores={colaboradores}
                escalas={escalas}
              />
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
