import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { DashboardPercentuais } from '../components/DashboardPercentuais';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;

function getSemanasDoMes(ano: number, mes: number): { label: string; inicio: string; fim: string }[] {
  const semanas: { label: string; inicio: string; fim: string }[] = [];
  const primDia = new Date(ano, mes - 1, 1);
  const ultDia  = new Date(ano, mes, 0);
  let cur = new Date(primDia);
  const dow0 = cur.getDay();
  if (dow0 !== 1) cur.setDate(cur.getDate() + (dow0 === 0 ? -6 : 1 - dow0));
  while (cur <= ultDia) {
    const seg = new Date(cur);
    const dom = new Date(cur); dom.setDate(dom.getDate() + 6);
    const fimReal = dom > ultDia ? new Date(ultDia) : new Date(dom);
    semanas.push({
      label: `${seg.getDate().toString().padStart(2,'0')}/${(seg.getMonth()+1).toString().padStart(2,'0')} – ${fimReal.getDate().toString().padStart(2,'0')}/${(fimReal.getMonth()+1).toString().padStart(2,'0')}`,
      inicio: seg.toISOString().split('T')[0],
      fim:    fimReal.toISOString().split('T')[0],
    });
    cur.setDate(cur.getDate() + 7);
  }
  return semanas;
}

/* ─── Component ────────────────────────────────────────────────────────────── */
export const Dashboard: React.FC = () => {
  const navigate  = useNavigate();
  const { activeUnit, setActiveUnit } = useUnit();
  const { user, email, logout }       = useAuth();

  const apiUrl  = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const userRole = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdminOrGerente = ['Administrador','Gerente','admin','gerente','ADMIN','GERENTE'].includes(userRole);

  const token = () => localStorage.getItem('auth_token');

  const hoje = new Date();
  const [mesAno,       setMesAno]       = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`);
  const [loadingChart, setLoadingChart] = useState(false);
  const [unidades,     setUnidades]     = React.useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = React.useState(activeUnit?.id || '');
  const [caixaData,    setCaixaData]    = useState<any[]>([]);
  const [colaboradores,setColaboradores]= useState<any[]>([]);
  const [escalas,      setEscalas]      = useState<any[]>([]);

  const unitId = activeUnit?.id || '';

  /* carrega lista de unidades */
  React.useEffect(() => {
    fetch(`${apiUrl}/unidades`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setUnidades(d); }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (activeUnit) setSelectedUnit(activeUnit.id);
    else setSelectedUnit('');
  }, [activeUnit]);

  useEffect(() => {
    if (unitId) carregarDashboard();
  }, [unitId, mesAno]);

  const carregarDashboard = async () => {
    setLoadingChart(true);
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
      const dataFim    = new Date(ano, mes, 0).toISOString().split('T')[0];
      const h          = { Authorization: `Bearer ${token()}` };
      const [rC, rCol, rEsc] = await Promise.all([
        fetch(`${apiUrl}/caixa?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: h }).catch(() => null),
      ]);
      if (rC?.ok)   { const d = await rC.json();   setCaixaData   (Array.isArray(d) ? d : []); }
      if (rCol?.ok) { const d = await rCol.json(); setColaboradores(Array.isArray(d) ? d : []); }
      if (rEsc?.ok) { const d = await rEsc.json(); setEscalas     (Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
    finally { setLoadingChart(false); }
  };

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedUnit(id);
    const u = unidades.find(u => u.id === id);
    if (u) { setActiveUnit(u); window.dispatchEvent(new CustomEvent('unitChanged', { detail: u })); }
    else   { setActiveUnit(null); window.dispatchEvent(new CustomEvent('unitChanged', { detail: null })); }
  };

  const weeklyData = useMemo(() => {
    if (!mesAno) return [];
    const [ano, mes] = mesAno.split('-').map(Number);
    return getSemanasDoMes(ano, mes).map(sem => {
      const caixaSem = caixaData.filter(c => c.data >= sem.inicio && c.data <= sem.fim);
      const faturamento = caixaSem.reduce((s: number, c: any) => s + R(c.total || 0), 0);
      let custoCLT = 0, custoFree = 0;
      for (const colab of colaboradores) {
        if (colab.ativo === false) continue;
        const isFree   = colab.tipoContrato === 'Freelancer';
        const escsSem  = escalas.filter(e => e.colaboradorId === colab.id && e.data >= sem.inicio && e.data <= sem.fim);
        let dC = 0, nC = 0, dnC = 0;
        for (const e of escsSem) {
          if (e.turno === 'Dia') dC++;
          else if (e.turno === 'Noite') nC++;
          else if (e.turno === 'DiaNoite') { dnC++; dC++; nC++; }
        }
        const diasTrab = escsSem.filter(e => e.turno !== 'Folga').length;
        if (isFree) {
          const vd = R(colab.valorDia) || 120;
          custoFree += (dnC + (dC - dnC) * 0.5 + (nC - dnC) * 0.5) * vd + R(colab.valorTransporte) * diasTrab;
        } else {
          custoCLT += (R(colab.valorDia) + R(colab.valorNoite)) * dnC
            + R(colab.valorDia) * (dC - dnC) + R(colab.valorNoite) * (nC - dnC)
            + R(colab.valorTransporte) * diasTrab + R(colab.salario) / 4.3;
        }
      }
      const custo = custoCLT + custoFree;
      return { label: sem.label, faturamento, custoCLT, custoFree, custo, lucro: faturamento - custo };
    });
  }, [mesAno, caixaData, colaboradores, escalas]);

  /* ─── Render ──────────────────────────────────────────── */
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f5f7fa', fontFamily:'Segoe UI,sans-serif' }}>

      {/* ── Header ── */}
      <header style={{ background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'56px', boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button
            onClick={() => navigate('/modulos')}
            style={{ padding:'6px 14px', background:'rgba(255,255,255,.18)', color:'#fff', border:'1px solid rgba(255,255,255,.35)', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600 }}
          >
            ← Módulos
          </button>
          <span style={{ fontSize:'18px', fontWeight:700, letterSpacing:'-0.3px' }}>📊 Dashboard Operacional</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px', fontSize:'13px' }}>
          {/* Seletor de unidade no header */}
          {unidades.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ opacity:.8 }}>Unidade:</span>
              <select
                value={selectedUnit || ''}
                onChange={handleUnitChange}
                style={{ padding:'4px 10px', borderRadius:'6px', border:'none', fontSize:'13px', background:'rgba(255,255,255,.2)', color:'#fff', cursor:'pointer', outline:'none' }}
              >
                <option value="" style={{ color:'#333' }}>Todas</option>
                {unidades.map((u: any) => (
                  <option key={u.id} value={u.id} style={{ color:'#333' }}>{u.nome}</option>
                ))}
              </select>
            </div>
          )}
          <span style={{ opacity:.8 }}>{email}</span>
          {userRole && (
            <span style={{ padding:'2px 10px', borderRadius:'10px', background:'rgba(255,255,255,.2)', fontSize:'12px', fontWeight:600 }}>
              {userRole}
            </span>
          )}
          <button
            onClick={logout}
            style={{ padding:'6px 14px', background:'rgba(255,255,255,.15)', color:'#fff', border:'1px solid rgba(255,255,255,.3)', borderRadius:'6px', cursor:'pointer', fontSize:'13px' }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex:1, padding:'28px', maxWidth:'1400px', margin:'0 auto', width:'100%' }}>

        {/* Barra de controle */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h2 style={{ margin:0, fontSize:'20px', color:'#333', fontWeight:700 }}>Análise de Custos vs Faturamento</h2>
            <p style={{ margin:'4px 0 0', fontSize:'13px', color:'#888' }}>% semanal — custo de equipe sobre faturamento do caixa</p>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
            <label style={{ fontSize:'13px', fontWeight:600, color:'#555' }}>Mês:</label>
            <input
              type="month"
              value={mesAno}
              onChange={e => setMesAno(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'14px' }}
            />
            <button
              onClick={carregarDashboard}
              style={{ padding:'7px 14px', border:'none', borderRadius:'6px', background:'#667eea', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'13px' }}
            >
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Conteúdo do chart */}
        {!unitId ? (
          <div style={{ textAlign:'center', padding:'60px 20px', background:'#fff', borderRadius:'12px', border:'1px solid #e0e0e0', color:'#999' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>🏢</div>
            <p style={{ fontSize:'16px', margin:0 }}>Selecione uma <strong>unidade</strong> no menu acima para visualizar os dados do dashboard.</p>
          </div>
        ) : loadingChart ? (
          <div style={{ textAlign:'center', padding:'60px', background:'#fff', borderRadius:'12px', border:'1px solid #e0e0e0', color:'#999' }}>
            <div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div>
            <p>Carregando dados...</p>
          </div>
        ) : !isAdminOrGerente ? (
          <div style={{ textAlign:'center', padding:'60px', background:'#fff', borderRadius:'12px', border:'1px solid #e0e0e0', color:'#999' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>🔒</div>
            <p style={{ fontSize:'16px', margin:0 }}>O Dashboard Operacional está disponível apenas para <strong>Administradores</strong> e <strong>Gerentes</strong>.</p>
          </div>
        ) : weeklyData.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px', background:'#fff', borderRadius:'12px', border:'1px solid #e0e0e0', color:'#999' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>📭</div>
            <p>Nenhum dado encontrado para o período selecionado.</p>
          </div>
        ) : (
          <DashboardPercentuais
            weeklyData={weeklyData}
            colaboradores={colaboradores}
            escalas={escalas}
          />
        )}
      </main>

      <Footer showLinks={true} />
    </div>
  );
};
