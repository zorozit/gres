import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { DashboardPercentuais } from '../components/DashboardPercentuais';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

const R = (v: any) => parseFloat(v) || 0;

function hoje() { return new Date().toISOString().split('T')[0]; }
function inicioMes() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }

export const Dashboard: React.FC = () => {
  const navigate  = useNavigate();
  const { activeUnit, setActiveUnit } = useUnit();
  const { user, email, logout }       = useAuth();

  const apiUrl  = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const userRole = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdminOrGerente = ['Administrador','Gerente','admin','gerente','ADMIN','GERENTE'].includes(userRole);
  const token = () => localStorage.getItem('auth_token');

  const [dataInicio,   setDataInicio]   = useState(inicioMes());
  const [dataFim,      setDataFim]      = useState(hoje());
  const [loadingChart, setLoadingChart] = useState(false);
  const [unidades,     setUnidades]     = React.useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = React.useState(activeUnit?.id || '');
  const [caixaData,    setCaixaData]    = useState<any[]>([]);
  const [colaboradores,setColaboradores]= useState<any[]>([]);
  const [escalas,      setEscalas]      = useState<any[]>([]);
  const [motoboys,     setMotoboys]     = useState<any[]>([]);
  const [saidasMes,    setSaidasMes]    = useState<any[]>([]);  // saídas do mês (para variável motoboy)
  const [folhasDB,     setFolhasDB]     = useState<any[]>([]);  // registros reais de folha-pagamento

  const unitId = activeUnit?.id || '';

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
  }, [unitId, dataInicio, dataFim]);

  const carregarDashboard = async () => {
    setLoadingChart(true);
    try {
      const h = { Authorization: `Bearer ${token()}` };
      // Para escalas, pega o mês de dataInicio
      const mesAno = dataInicio.substring(0, 7);
      // Meses tocados pelo range (pode ser 1 ou 2 meses)
      const mesesAlvo = new Set<string>();
      mesesAlvo.add(dataInicio.substring(0, 7));
      mesesAlvo.add(dataFim.substring(0, 7));
      const folhaFetches = [...mesesAlvo].map(mm =>
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mm}`, { headers: h }).catch(() => null)
      );

      const [rC, rCol, rEsc, rMoto, rSaidas, ...foRs] = await Promise.all([
        fetch(`${apiUrl}/caixa?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/motoboys?unitId=${unitId}`, { headers: h }).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: h }).catch(() => null),
        ...folhaFetches,
      ]);
      if (rC?.ok)      { const d = await rC.json();      setCaixaData   (Array.isArray(d) ? d : []); }
      if (rCol?.ok)    { const d = await rCol.json();    setColaboradores(Array.isArray(d) ? d : []); }
      if (rEsc?.ok)    { const d = await rEsc.json();    setEscalas     (Array.isArray(d) ? d : []); }
      if (rMoto?.ok)   { const d = await rMoto.json();   setMotoboys    (Array.isArray(d) ? d : []); }
      if (rSaidas?.ok) { const d = await rSaidas.json(); setSaidasMes   (Array.isArray(d) ? d : []); }
      // Folhas reais: agrega todos os mêses
      const folhasAcc: any[] = [];
      for (const r of foRs) {
        if (r?.ok) { try { const d = await r.json(); if (Array.isArray(d)) folhasAcc.push(...d); } catch {} }
      }
      setFolhasDB(folhasAcc);
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

  // ── Custo real por dia: indexa registros pagos da folha por dataPagamento ──
  const custoRealPorDia = useMemo(() => {
    const motoboyIds = new Set(motoboys.map((m: any) => m.id));
    const map = new Map<string, { free: number; clt: number; moto: number }>();

    for (const reg of folhasDB) {
      // Granulares freelancer (1 por turno/dia)
      // Usa reg.data (dia do serviço) para mapear o custo no dia correto do gráfico.
      // dataPagamento é quando o dinheiro saiu (pode ser domingo, fora do range).
      if (reg.tipo === 'freelancer-dia' && reg.pago) {
        const dia = reg.data || reg.dataPagamento || '';
        if (!dia || dia < dataInicio || dia > dataFim) continue;
        const entry = map.get(dia) || { free: 0, clt: 0, moto: 0 };
        // 'valor' = valor do turno deste dia; totalFinal/valorBruto são legados
        const val = R(reg.valor) || R(reg.totalFinal) || R(reg.valorBruto) || 0;
        if (motoboyIds.has(reg.colaboradorId)) entry.moto += val;
        else entry.free += val;
        map.set(dia, entry);
      }
      // CLT: adiantamento dia 20
      if (reg.tipo === 'clt-mensal' && reg.pago && reg.dataPgtoAdiantamento) {
        const dia = reg.dataPgtoAdiantamento;
        if (dia >= dataInicio && dia <= dataFim) {
          const entry = map.get(dia) || { free: 0, clt: 0, moto: 0 };
          entry.clt += R(reg.adiantamentoValor) || 0;
          map.set(dia, entry);
        }
      }
      // CLT: diferença dia 5
      if (reg.tipo === 'clt-mensal' && reg.pago && reg.dataPgtoVariavel) {
        const dia = reg.dataPgtoVariavel;
        if (dia >= dataInicio && dia <= dataFim) {
          const entry = map.get(dia) || { free: 0, clt: 0, moto: 0 };
          const val5 = (R(reg.valorBruto) || R(reg.totalLiquido) || 0) - (R(reg.adiantamentoValor) || 0);
          entry.clt += Math.max(0, val5);
          map.set(dia, entry);
        }
      }
    }
    return map;
  }, [folhasDB, dataInicio, dataFim, motoboys]);

  // Calcula custo de mão de obra por dia e por turno
  // Prioriza dados reais da folha; cai em estimativa por escala se não houver
  const calcCustoPorTurno = (data: string, turno: 'Dia' | 'Noite') => {
    let custoCLT = 0, custoFree = 0, custoMotoboy = 0;

    // ✔ Dados reais da folha: acumula tudo no turno Dia (evita duplicar no Noite)
    const realDia = custoRealPorDia.get(data);
    if (realDia) {
      if (turno === 'Dia') return { custoCLT: realDia.clt, custoFree: realDia.free, custoMotoboy: realDia.moto, custo: realDia.clt + realDia.free + realDia.moto };
      return { custoCLT: 0, custoFree: 0, custoMotoboy: 0, custo: 0 }; // Noite: já somado no Dia
    }

    // ⚠️ Fallback: estimativa por escala (dia sem pagamento real registrado)
    const motoboyIds = new Set(motoboys.map((m: any) => m.id));
    const motoboyCpfs = new Set(motoboys.filter((m: any) => m.cpf).map((m: any) => m.cpf));

    for (const colab of colaboradores) {
      if (colab.ativo === false) continue;
      if (motoboyIds.has(colab.id)) continue;
      if (colab.cpf && motoboyCpfs.has(colab.cpf)) continue;
      if ((colab.cargo || '').toLowerCase() === 'motoboy') continue;

      const isFree = colab.tipoContrato === 'Freelancer';
      const escsColabDia = escalas.filter((e: any) =>
        e.colaboradorId === colab.id && e.data === data && (e.turno === turno || e.turno === 'DiaNoite')
      );
      if (escsColabDia.length === 0) continue;
      const temDN = escsColabDia.some((e: any) => e.turno === 'DiaNoite');
      const fator = temDN ? 0.5 : 1;
      const transp = R(colab.valorTransporte) * fator; // rateado por turno

      if (isFree) {
        let vTurno = turno === 'Noite' ? (R(colab.valorNoite) || R(colab.valorDia) || 120) : (R(colab.valorDia) || 120);
        // Respeitar acordo.tabela (valor_turno) por dia da semana
        if (colab.tipoAcordo === 'valor_turno' && colab.acordo?.tabela) {
          const DOW_K = ['dom','seg','ter','qua','qui','sex','sab'];
          const dow = new Date(data + 'T12:00:00').getDay();
          const vals = colab.acordo.tabela[DOW_K[dow]] || {};
          vTurno = turno === 'Noite' ? (R(vals.N) || vTurno) : (R(vals.D) || vTurno);
        }
        custoFree += vTurno * fator + transp;
      } else {
        const salDia = parseFloat((R(colab.salario) / 30 * fator).toFixed(2));
        const vTurno = turno === 'Dia' ? R(colab.valorDia) : R(colab.valorNoite);
        custoCLT += salDia + vTurno * fator + transp;
      }
    }

    if (turno === 'Dia') {
      for (const m of motoboys) {
        if (m.ativo === false) continue;
        const escsMoto = escalas.filter((e: any) => e.colaboradorId === m.id && e.data === data);
        if (escsMoto.length === 0) continue;
        const salDia = parseFloat((R(m.salario || m.salarioBase) / 30).toFixed(2));
        const transp = R(m.valorTransporte);
        const saidasMotoHoje = saidasMes.filter((s: any) => s.colaboradorId === m.id && (s.data || '').startsWith(data));
        const entregasDia = saidasMotoHoje.reduce((sum: number, s: any) => sum + R(s.viagens), 0);
        const caixinhaDia = saidasMotoHoje.reduce((sum: number, s: any) => sum + R(s.caixinha), 0);
        const custoVar = entregasDia > 0 ? entregasDia * R(m.valorEntrega) + caixinhaDia : 0;
        custoMotoboy += salDia + transp + custoVar;
      }
    }

    return { custoCLT, custoFree, custoMotoboy, custo: custoCLT + custoFree + custoMotoboy };
  };

  // Agrupa por dia
  const dailyData = useMemo(() => {
    // Coleta todos os dias únicos no range
    const diasSet = new Set<string>();
    caixaData.forEach(c => diasSet.add(c.data));
    // Também dias que têm escala mas não caixa
    escalas.forEach(e => {
      if (e.data >= dataInicio && e.data <= dataFim) diasSet.add(e.data);
    });

    const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return Array.from(diasSet).sort().map(data => {
      const [y, m, d] = data.split('-');
      const diaSem = DIAS_SEMANA[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
      const label = `${d}/${m} ${diaSem}`;
      const caixaDia   = caixaData.find(c => c.data === data && c.periodo?.toLowerCase() === 'dia');
      const caixaNoite = caixaData.find(c => c.data === data && c.periodo?.toLowerCase() === 'noite');
      const fat_dia    = R(caixaDia?.total);
      const fat_noite  = R(caixaNoite?.total);
      const { custo: custo_dia }   = calcCustoPorTurno(data, 'Dia');
      const { custo: custo_noite } = calcCustoPorTurno(data, 'Noite');

      // Contagem de funcionários escalados
      const funcDia   = escalas.filter(e => e.data === data && (e.turno === 'Dia' || e.turno === 'DiaNoite')).length;
      const funcNoite = escalas.filter(e => e.data === data && (e.turno === 'Noite' || e.turno === 'DiaNoite')).length;

      return {
        label, data,
        faturamento_dia: fat_dia,
        faturamento_noite: fat_noite,
        faturamento_total: fat_dia + fat_noite,
        custo_dia, custo_noite,
        custo_total: custo_dia + custo_noite,
        func_dia: funcDia,
        func_noite: funcNoite,
      };
    });
  }, [dataInicio, dataFim, caixaData, colaboradores, escalas, motoboys, saidasMes, custoRealPorDia]);

  /* ─── Render ── */
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f5f7fa', fontFamily:'Segoe UI,sans-serif' }}>

      <header style={{ background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'56px', boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={() => navigate('/modulos')} style={{ padding:'6px 14px', background:'rgba(255,255,255,.18)', color:'#fff', border:'1px solid rgba(255,255,255,.35)', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
            ← Módulos
          </button>
          <span style={{ fontSize:'18px', fontWeight:700, letterSpacing:'-0.3px' }}>📊 Dashboard Operacional</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px', fontSize:'13px' }}>
          {unidades.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ opacity:.8 }}>Unidade:</span>
              <select value={selectedUnit || ''} onChange={handleUnitChange}
                style={{ padding:'4px 10px', borderRadius:'6px', border:'none', fontSize:'13px', background:'rgba(255,255,255,.2)', color:'#fff', cursor:'pointer', outline:'none' }}>
                <option value="" style={{ color:'#333' }}>Todas</option>
                {unidades.map((u: any) => (
                  <option key={u.id} value={u.id} style={{ color:'#333' }}>{u.nome}</option>
                ))}
              </select>
            </div>
          )}
          <span style={{ opacity:.8 }}>{email}</span>
          {userRole && (
            <span style={{ padding:'2px 10px', borderRadius:'10px', background:'rgba(255,255,255,.2)', fontSize:'12px', fontWeight:600 }}>{userRole}</span>
          )}
          <button onClick={logout} style={{ padding:'6px 14px', background:'rgba(255,255,255,.15)', color:'#fff', border:'1px solid rgba(255,255,255,.3)', borderRadius:'6px', cursor:'pointer', fontSize:'13px' }}>
            Sair
          </button>
        </div>
      </header>

      <main style={{ flex:1, padding:'28px', maxWidth:'1400px', margin:'0 auto', width:'100%' }}>

        {/* Barra de controle */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h2 style={{ margin:0, fontSize:'20px', color:'#333', fontWeight:700 }}>Análise de Custos vs Faturamento</h2>
            <p style={{ margin:'4px 0 0', fontSize:'13px', color:'#888' }}>Custo de mão de obra por dia e turno — identifique excesso ou falta de pessoal</p>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexWrap:'wrap' }}>
            <div>
              <label style={{ fontSize:'12px', fontWeight:600, color:'#555', display:'block', marginBottom:'3px' }}>De:</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'14px' }} />
            </div>
            <div>
              <label style={{ fontSize:'12px', fontWeight:600, color:'#555', display:'block', marginBottom:'3px' }}>Até:</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'14px' }} />
            </div>
            <button onClick={carregarDashboard}
              style={{ padding:'7px 14px', border:'none', borderRadius:'6px', background:'#667eea', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'13px' }}>
              🔄 Atualizar
            </button>
          </div>
        </div>

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
        ) : dailyData.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px', background:'#fff', borderRadius:'12px', border:'1px solid #e0e0e0', color:'#999' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>📭</div>
            <p>Nenhum dado encontrado para o período selecionado.</p>
          </div>
        ) : (
          <DashboardPercentuais
            dailyData={dailyData}
            colaboradores={colaboradores}
            escalas={escalas}
          />
        )}
      </main>

      <Footer showLinks={true} />
    </div>
  );
};
