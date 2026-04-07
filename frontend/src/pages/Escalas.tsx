import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/* ─── Feriados 2026 ──────────────────────────────────────────────────────── */
const FERIADOS_2026: Record<string, string> = {
  '2026-01-01':'Confraternização','2026-02-16':'Carnaval','2026-02-17':'Carnaval',
  '2026-02-18':'Quarta-feira Cinzas','2026-04-03':'Sexta-feira Santa',
  '2026-04-05':'Páscoa','2026-04-21':'Tiradentes','2026-05-01':'Dia do Trabalho',
  '2026-06-04':'Corpus Christi','2026-09-07':'Independência','2026-10-12':'N.S. Aparecida',
  '2026-11-02':'Finados','2026-11-15':'Proclamação da República',
  '2026-11-20':'Consciência Negra','2026-12-25':'Natal',
};

/* ─── Tipos ──────────────────────────────────────────────────────────────── */
interface Pessoa {
  id: string;
  nome: string;
  cargo?: string;
  funcao?: string;
  area?: string;
  tipoContrato?: string; // 'CLT' | 'Freelancer'
  chavePix?: string;
  telefone?: string;
  valorDia?: number;
  valorNoite?: number;
  valorDobra?: number;   // freelancer: R$ por dobra (D ou N = 0.5 dobra)
  valorTransporte?: number;
  salario?: number;
  ativo?: boolean;
  unitId?: string;
}

interface Escala {
  id: string;
  colaboradorId: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  presenca?: 'presente' | 'falta' | 'falta_justificada';
  observacao?: string;
  unitId?: string;
}

interface FuncaoEscala {
  id: string;
  nome: string;
  area?: string;
  cor: string;
  diasTrabalho: number[];
  turnoNoite: number[];
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function diasDoMes(ano: number, mes: number): Date[] {
  const dias: Date[] = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) { dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}
function fmtIso(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
// fmtBRL kept for possible future use
// function fmtBRL(v: number) {
//   return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// }

const DS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DF = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

// Agrupa dias em semanas de Segunda (fecha Domingo)
function semanasDoMes(ano: number, mes: number): { label: string; dias: Date[]; segunda: Date }[] {
  const todos = diasDoMes(ano, mes);
  const semanas: { label: string; dias: Date[]; segunda: Date }[] = [];
  const primeiro = todos[0];
  let seg = new Date(primeiro);
  const dow0 = seg.getDay();
  const diff = dow0 === 0 ? -6 : 1 - dow0;
  seg.setDate(seg.getDate() + diff);

  while (seg <= todos[todos.length - 1]) {
    const diasSem: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(seg, i);
      if (d.getMonth() === mes - 1) diasSem.push(d);
    }
    if (diasSem.length > 0) {
      const domFim = addDays(seg, 6);
      semanas.push({
        label: `${seg.getDate()}/${mes} – ${domFim.getDate()}/${domFim.getMonth() + 1}`,
        dias: diasSem,
        segunda: new Date(seg),
      });
    }
    seg = addDays(seg, 7);
  }
  return semanas;
}

function proximaSegunda(dataRef: Date): Date {
  const d = new Date(dataRef);
  const dow = d.getDay();
  const dias = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + dias);
  return d;
}

// proxDataPagtoStr moved to FolhaPagamento
// function proxDataPagtoStr(dias: Date[]): string {
//   const ultimo = dias[dias.length - 1];
//   const seg = proximaSegunda(ultimo);
//   return `${seg.getDate().toString().padStart(2,'0')}/${(seg.getMonth()+1).toString().padStart(2,'0')}/${seg.getFullYear()}`;
// }

const TURNO_BADGE: Record<string, { bg: string; cor: string; label: string }> = {
  Dia:      { bg:'#fff9c4', cor:'#f57f17', label:'D' },
  Noite:    { bg:'#e8eaf6', cor:'#3949ab', label:'N' },
  DiaNoite: { bg:'#e8f5e9', cor:'#2e7d32', label:'DN' },
  Folga:    { bg:'#fce4ec', cor:'#c62828', label:'F' },
  '':       { bg:'#f5f5f5', cor:'#bbb',    label:'—' },
};

const PRES_BADGE: Record<string, { bg: string; cor: string; icon: string }> = {
  presente:           { bg:'#e8f5e9', cor:'#2e7d32', icon:'✅' },
  falta:              { bg:'#fce4ec', cor:'#c62828', icon:'❌' },
  falta_justificada:  { bg:'#fff3e0', cor:'#e65100', icon:'⚠️' },
};

// Cor da área
const AREA_CORES: Record<string, string> = {
  'Bar':        '#ad1457',
  'Cozinha':    '#e65100',
  'Salão':      '#2e7d32',
  'Operações':  '#1565c0',
  'Gerência':   '#37474f',
  'Pizzaria':   '#6a1b9a',
  'Caixa':      '#558b2f',
};
function corArea(area: string): string {
  return AREA_CORES[area] || '#455a64';
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Escalas: React.FC = () => {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`
  );
  const [colaboradores, setColabs] = useState<Pessoa[]>([]);
  const [freelancers,   setFreels] = useState<Pessoa[]>([]);
  const [escalas,       setEscalas]= useState<Escala[]>([]);
  const [funcoes,       setFuncoes]= useState<FuncaoEscala[]>([]);
  const [loading,       setLoading]= useState(false);
  const [salvando,      setSalvando]=useState(false);

  type AbaType = 'mensal' | 'lancamento' | 'presencas';
  const [aba, setAba] = useState<AbaType>('mensal');

  const [filtroArea,   setFiltroArea]  = useState('Todos');
  const [filtroFuncao, setFiltroFuncao]= useState('Todos');
  const [semanaIdx,    setSemanaIdx]   = useState(0);

  // Turnos editáveis
  const [turnos, setTurnos] = useState<Record<string, {dia: boolean; noite: boolean}>>({});
  // Presenças
  const [presencaMap, setPresencaMap] = useState<Record<string, Record<string, string>>>({});
  const [salvandoPres, setSalvandoPres] = useState(false);

  const [ano, mes] = mesAno.split('-').map(Number);
  const dias   = useMemo(() => diasDoMes(ano, mes), [ano, mes]);
  const semanas= useMemo(() => semanasDoMes(ano, mes), [ano, mes]);

  const token = () => localStorage.getItem('auth_token');

  /* ── Load ────────────────────────────────────────────────── */
  useEffect(() => {
    if (unitId) { fetchAll(); }
  }, [unitId, mesAno]);

  // Sync semana idx to current week
  useEffect(() => {
    const isoHoje = fmtIso(hoje);
    const idx = semanas.findIndex(s =>
      s.dias.some(d => fmtIso(d) === isoHoje)
    );
    if (idx >= 0) setSemanaIdx(idx);
    else setSemanaIdx(0);
  }, [semanas]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchColabs(), fetchEscalas(), fetchFuncoes()]);
    setLoading(false);
  };

  const fetchColabs = async () => {
    try {
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      const todos = (Array.isArray(d)?d:[]).filter((c:Pessoa)=>c.ativo!==false);
      // Separate CLT from Freelancers
      setColabs(todos.filter((c:Pessoa)=>c.tipoContrato!=='Freelancer'));
      setFreels(todos.filter((c:Pessoa)=>c.tipoContrato==='Freelancer').map((f:any)=>({ ...f, tipoContrato:'Freelancer' as const })));
    } catch(e){console.error(e);}
  };



  const fetchEscalas = async () => {
    try {
      const r = await fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      const lista:Escala[] = Array.isArray(d)?d:[];
      setEscalas(lista);
      // Rebuild presenca map (day presenca uses id, night presenca uses id_N)
      const pm:Record<string,Record<string,string>>={};
      for (const e of lista) {
        if (e.presenca) {
          if (!pm[e.colaboradorId]) pm[e.colaboradorId]={};
          pm[e.colaboradorId][e.data]=e.presenca;
        }
        if ((e as any).presencaNoite) {
          const kN=`${e.colaboradorId}_N`;
          if (!pm[kN]) pm[kN]={};
          pm[kN][e.data]=(e as any).presencaNoite;
        }
      }
      setPresencaMap(pm);
      // Rebuild turno state
      const tv:Record<string,{dia:boolean;noite:boolean}>={};
      for (const e of lista) {
        const k = `${e.colaboradorId}_${e.data}`;
        tv[k]={ dia: e.turno==='Dia'||e.turno==='DiaNoite', noite: e.turno==='Noite'||e.turno==='DiaNoite' };
      }
      setTurnos(tv);
    } catch(e){console.error(e);}
  };

  const fetchFuncoes = async () => {
    try {
      const r = await fetch(`${apiUrl}/funcoes-escala?unitId=${unitId}`, { headers:{ Authorization:`Bearer ${token()}` } });
      if (r.ok) { const d=await r.json(); setFuncoes(Array.isArray(d)?d:[]); }
    } catch(e){console.error(e);}
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  const funcaoDe = (p:Pessoa) => p.funcao || p.cargo || '';
  const areaDe   = (p:Pessoa) => p.area   || '';

  const regraByFuncao = useCallback((fn:string): FuncaoEscala|undefined => {
    return funcoes.find(f=>f.nome.toLowerCase()===fn.toLowerCase())
      || funcoes.find(f=>fn.toLowerCase().includes(f.nome.toLowerCase()));
  },[funcoes]);

  const corFuncao = useCallback((p:Pessoa):string => {
    const r = regraByFuncao(funcaoDe(p));
    if (r?.cor) return r.cor;
    return corArea(areaDe(p)) || (p.tipoContrato==='Freelancer' ? '#c2185b' : '#1976d2');
  },[regraByFuncao]);

  // Todos (CLT + Freelancers) para o grid, ordenados por área e nome
  const todos = useMemo<Pessoa[]>(()=>{
    const combined = [...colaboradores,...freelancers];
    return combined.sort((a,b)=>{
      const aArea = areaDe(a)||'zzz';
      const bArea = areaDe(b)||'zzz';
      if (aArea !== bArea) return aArea.localeCompare(bArea);
      return a.nome.localeCompare(b.nome);
    });
  },[colaboradores,freelancers]);

  const todosFiltered = useMemo(()=>todos.filter(p=>{
    const matchArea   = filtroArea==='Todos' || (areaDe(p)||'Sem Área')===filtroArea;
    const matchFuncao = filtroFuncao==='Todos' || funcaoDe(p)===filtroFuncao;
    return matchArea && matchFuncao;
  }),[todos,filtroArea,filtroFuncao]);

  const areasUnicas = useMemo(()=>{
    const s=new Set(todos.map(p=>areaDe(p)||'Sem Área'));
    return Array.from(s).sort();
  },[todos]);

  const funcoesUnicas = useMemo(()=>{
    const s=new Set(todos.map(p=>funcaoDe(p)).filter(Boolean));
    return ['Todos',...Array.from(s).sort()];
  },[todos]);

  const escalasMap = useMemo(()=>{
    const m:Record<string,Record<string,Escala>>={};
    for (const e of escalas){
      if (!m[e.colaboradorId]) m[e.colaboradorId]={};
      m[e.colaboradorId][e.data]=e;
    }
    return m;
  },[escalas]);

  /* ── Toggle turno ────────────────────────────────────────── */
  const toggleTurno = async (pessoaId:string, data:string, tipo:'dia'|'noite') => {
    if (!unitId) { alert('Selecione uma unidade antes de lançar turnos.'); return; }
    const k = `${pessoaId}_${data}`;
    const cur = turnos[k] || {dia:false,noite:false};
    const next = { ...cur, [tipo]: !cur[tipo] };
    setTurnos(prev=>({...prev,[k]:next}));

    let turno: string;
    if (next.dia && next.noite) turno = 'DiaNoite';
    else if (next.dia) turno = 'Dia';
    else if (next.noite) turno = 'Noite';
    else turno = 'Folga';

    setSalvando(true);
    try {
      const existente = escalasMap[pessoaId]?.[data];
      if (existente) {
        if (turno === 'Folga') {
          const r = await fetch(`${apiUrl}/escalas/${existente.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token()}` }
          });
          if (!r.ok) throw new Error(`DELETE falhou: ${r.status}`);
        } else {
          const r = await fetch(`${apiUrl}/escalas/${existente.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ turno }),
          });
          if (!r.ok) throw new Error(`PUT falhou: ${r.status}`);
        }
      } else if (turno !== 'Folga') {
        const r = await fetch(`${apiUrl}/escalas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ unitId, colaboradorId: pessoaId, data, turno }),
        });
        if (!r.ok) throw new Error(`POST falhou: ${r.status}`);
      }
      await fetchEscalas();
    } catch(e) {
      console.error('Erro ao salvar turno:', e);
      // Revert optimistic update on error
      setTurnos(prev => ({ ...prev, [k]: cur }));
      alert(`Erro ao salvar turno: ${e instanceof Error ? e.message : e}`);
    }
    finally { setSalvando(false); }
  };

  /* ── Presença ciclo ──────────────────────────────────────── */
  // presKey can be pessoaId (dia) or pessoaId_N (noite)
  const handlePresenca = useCallback(async (presKey:string, data:string, cur:string) => {
    const ciclo = ['','presente','falta','falta_justificada'];
    const next = ciclo[(ciclo.indexOf(cur)+1)%ciclo.length];
    setPresencaMap(prev=>({...prev,[presKey]:{...(prev[presKey]||{}),[data]:next}}));
    setSalvandoPres(true);
    const isNoite = presKey.endsWith('_N');
    const pessoaId = isNoite ? presKey.slice(0,-2) : presKey;
    try {
      const esc = escalasMap[pessoaId]?.[data];
      if (esc) {
        const field = isNoite ? 'presencaNoite' : 'presenca';
        await fetch(`${apiUrl}/escalas/${esc.id}`, {
          method:'PUT',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token()}` },
          body: JSON.stringify({ [field]: next }),
        });
      } else if (next) {
        const turno = isNoite ? 'Noite' : 'Dia';
        const field = isNoite ? 'presencaNoite' : 'presenca';
        await fetch(`${apiUrl}/escalas`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token()}` },
          body: JSON.stringify({ unitId, colaboradorId:pessoaId, data, turno, [field]:next }),
        });
      }
    } catch(e){ console.error(e); }
    finally { setSalvandoPres(false); }
  },[escalasMap,apiUrl,unitId]);

  /* ── Gerar automático ──────────────────────────────────────  */
  const gerarAuto = async () => {
    if (!window.confirm(`Gerar escala automática para ${mesAno}?\nEscalas existentes não serão sobrescritas.`)) return;
    setSalvando(true);
    let criados=0;
    for (const p of todos) {
      const fn = funcaoDe(p);
      const regra = regraByFuncao(fn);
      for (const dia of dias) {
        const dow = dia.getDay();
        const ds  = fmtIso(dia);
        if (escalasMap[p.id]?.[ds]) continue;
        let turno: string;
        if (regra) {
          if (!(regra.diasTrabalho||[]).includes(dow)) continue;
          turno = (regra.turnoNoite||[]).includes(dow) ? 'DiaNoite' : 'Dia';
        } else {
          if (dow===0||dow===1) continue;
          turno = 'Dia';
        }
        try {
          await fetch(`${apiUrl}/escalas`,{
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},
            body: JSON.stringify({ unitId, colaboradorId:p.id, data:ds, turno }),
          });
          criados++;
        } catch{}
      }
    }
    alert(`✅ ${criados} turnos criados.`);
    setSalvando(false);
    fetchEscalas();
  };

  /* ── Calcular pagamento semanal ───────────────────────────── */
  interface CalcResult {
    dobras: number;
    totalDia: number;
    totalNoite: number;
    totalBruto: number;
    totalTransporte: number;
    descricao: string;
    codigos: string[];
    dataPagto: string;
    dC: number; nC: number; dnC: number;
  }

  const calcPagamentoSemana = useCallback((pessoa:Pessoa, diasSem:Date[]): CalcResult => {
    let dC=0, nC=0, dnC=0;
    const codigos: string[]=[];
    for (const d of diasSem) {
      const ds = fmtIso(d);
      const esc = escalasMap[pessoa.id]?.[ds];
      if (!esc || esc.turno==='Folga') { codigos.push('—'); continue; }
      if (esc.turno==='Dia')      { dC++;          codigos.push('D');  }
      else if (esc.turno==='Noite')    { nC++;          codigos.push('N');  }
      else if (esc.turno==='DiaNoite') { dnC++; dC++; nC++; codigos.push('DN');}
    }
    const isCLT = pessoa.tipoContrato==='CLT';
    let totalBruto = 0, totalDia = 0, totalNoite = 0;
    let descricao = '';

    if (isCLT) {
      const vDia   = pessoa.valorDia   || 0;
      const vNoite = pessoa.valorNoite || 0;
      totalDia   = vDia   * (dC - dnC);  // apenas dias simples
      totalNoite = vNoite * (nC - dnC);  // apenas noites simples
      const totalDobra = (vDia + vNoite) * dnC; // dobra = dia + noite
      totalBruto = totalDia + totalNoite + totalDobra;
      descricao = dnC>0
        ? `${dnC} dobra(s) × (D${vDia}+N${vNoite}) + ${dC-dnC}×D${vDia} + ${nC-dnC}×N${vNoite}`
        : `${dC}×D R$${vDia} + ${nC}×N R$${vNoite}`;
    } else {
      // Freelancer: DN=1 dobra, D=0.5, N=0.5
      const vd = pessoa.valorDobra || 120;
      const diasSimples = dC - dnC;   // só dia
      const noitesSimples = nC - dnC; // só noite
      const dobrasCalc = dnC + diasSimples * 0.5 + noitesSimples * 0.5;
      totalBruto = vd * dobrasCalc;
      totalDia   = vd * (diasSimples * 0.5 + dnC * 0.5);
      totalNoite = vd * (noitesSimples * 0.5 + dnC * 0.5);
      descricao = `${dobrasCalc.toFixed(1)} dobras × R$${vd}`;
    }

    // Transporte: por dia trabalhado
    const diasTrabalhados = codigos.filter(c=>c!=='—').length;
    const totalTransporte = (pessoa.valorTransporte || 0) * diasTrabalhados;

    const ultimoDiaSem = diasSem[diasSem.length-1];
    const proxSeg = proximaSegunda(ultimoDiaSem);
    const dataPagto = fmtIso(proxSeg);

    return { dobras: dnC, totalDia, totalNoite, totalBruto, totalTransporte,
             descricao, codigos, dataPagto, dC, nC, dnC };
  },[escalasMap]);

  /* ── Resumo mensal por pessoa ─────────────────────────────── */
  const resumos = useMemo(()=>todos.map(p=>{
    let diaT=0,noiteT=0,dobraT=0,presenteT=0,faltaT=0,faltaJT=0;
    for (const d of dias){
      const ds=fmtIso(d);
      const esc=escalasMap[p.id]?.[ds];
      if(esc?.turno==='Dia') diaT++;
      else if(esc?.turno==='Noite') noiteT++;
      else if(esc?.turno==='DiaNoite') dobraT++;
      const pr=presencaMap[p.id]?.[ds];
      if(pr==='presente') presenteT++;
      else if(pr==='falta') faltaT++;
      else if(pr==='falta_justificada') faltaJT++;
    }
    return {id:p.id,nome:p.nome,diaT,noiteT,dobraT,presenteT,faltaT,faltaJT};
  }),[todos,dias,escalasMap,presencaMap]);

  /* ── Estilos ─────────────────────────────────────────────── */
  const s = {
    card:  { backgroundColor:'white', border:'1px solid #e0e0e0', borderRadius:'8px', padding:'16px', boxShadow:'0 2px 4px rgba(0,0,0,0.06)' },
    tab:   (a:boolean)=>({ padding:'10px 18px', border:'none', cursor:'pointer', fontWeight:'bold' as const,
              borderRadius:'4px 4px 0 0', fontSize:'13px',
              backgroundColor:a?'#1976d2':'#e0e0e0', color:a?'white':'#333' }),
    th:    { backgroundColor:'#1565c0', color:'white', padding:'7px 5px', fontSize:'10px', whiteSpace:'nowrap' as const, textAlign:'center' as const },
    td:    { padding:'4px 3px', borderBottom:'1px solid #f0f0f0', fontSize:'11px', textAlign:'center' as const, verticalAlign:'middle' as const },
    label: { fontSize:'13px', fontWeight:'bold' as const, marginBottom:'4px', color:'#444', display:'block' },
    input: { padding:'9px', border:'1px solid #ccc', borderRadius:'4px', fontSize:'14px', width:'100%' },
    sel:   { padding:'9px', border:'1px solid #ccc', borderRadius:'4px', fontSize:'14px', width:'100%' },
    btn:   (bg:string)=>({ padding:'9px 18px', border:'none', borderRadius:'4px', fontSize:'13px', fontWeight:'bold' as const, cursor:'pointer', backgroundColor:bg, color:'white' }),
  };

  /* ─── Célula de turno (botões D / N) ─────────────────────── */
  const CelulaTurno = ({ pessoaId, data, disabled }: { pessoaId:string; data:string; disabled?:boolean }) => {
    const k = `${pessoaId}_${data}`;
    const cur = turnos[k] || {dia:false,noite:false};
    const isFeriado = !!FERIADOS_2026[data];
    return (
      <td style={{ ...s.td, backgroundColor: isFeriado?'#fff3e0':undefined, padding:'3px 2px' }}>
        <div style={{ display:'flex', gap:'2px', justifyContent:'center' }}>
          <button
            disabled={disabled}
            onClick={()=>!disabled&&toggleTurno(pessoaId,data,'dia')}
            style={{
              width:'22px', height:'22px', border:'none', borderRadius:'3px', cursor:'pointer', fontSize:'11px',
              fontWeight:'bold',
              backgroundColor: cur.dia ? '#fff9c4' : '#f5f5f5',
              color: cur.dia ? '#f57f17' : '#ccc',
              outline: cur.dia ? '2px solid #f57f17' : 'none',
            }}
            title={`${data} — Dia`}
          >D</button>
          <button
            disabled={disabled}
            onClick={()=>!disabled&&toggleTurno(pessoaId,data,'noite')}
            style={{
              width:'22px', height:'22px', border:'none', borderRadius:'3px', cursor:'pointer', fontSize:'11px',
              fontWeight:'bold',
              backgroundColor: cur.noite ? '#e8eaf6' : '#f5f5f5',
              color: cur.noite ? '#3949ab' : '#ccc',
              outline: cur.noite ? '2px solid #3949ab' : 'none',
            }}
            title={`${data} — Noite`}
          >N</button>
        </div>
      </td>
    );
  };

  /* ─── Render ─────────────────────────────────────────────── */
  const semAtual = semanas[semanaIdx] || semanas[0];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', backgroundColor:'#f4f6f9' }}>
      <Header title="📅 Gestão de Escalas" showBack={true} />
      <div style={{ flex:1, padding:'20px', maxWidth:'1800px', margin:'0 auto', width:'100%' }}>

        {/* Controles globais */}
        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'16px' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e=>setMesAno(e.target.value)} style={{ ...s.input, width:'160px' }} />
          </div>
          <div>
            <label style={s.label}>Área</label>
            <select value={filtroArea} onChange={e=>setFiltroArea(e.target.value)} style={{ ...s.sel, width:'150px' }}>
              <option value="Todos">Todas as áreas</option>
              {areasUnicas.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Função</label>
            <select value={filtroFuncao} onChange={e=>setFiltroFuncao(e.target.value)} style={{ ...s.sel, width:'160px' }}>
              {funcoesUnicas.map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button onClick={fetchAll} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={gerarAuto} disabled={salvando} style={s.btn('#43a047')}>
            {salvando?'⏳...':'⚡ Gerar Auto'}
          </button>
          {(salvando||salvandoPres) && <span style={{ fontSize:'12px', color:'#1976d2', paddingBottom:'6px' }}>💾 Salvando...</span>}
        </div>

        {/* Resumo rápido */}
        <div style={{ display:'flex', gap:'10px', marginBottom:'12px', flexWrap:'wrap' }}>
          <div style={{ backgroundColor:'white', border:'1px solid #e0e0e0', borderRadius:'6px', padding:'8px 14px', fontSize:'12px' }}>
            <strong style={{ color:'#1565c0' }}>👥 Equipe:</strong> {colaboradores.length} CLT + {freelancers.length} Freelancers
          </div>
          <div style={{ backgroundColor:'white', border:'1px solid #e0e0e0', borderRadius:'6px', padding:'8px 14px', fontSize:'12px' }}>
            <strong style={{ color:'#2e7d32' }}>📅 Mês:</strong> {mesAno}
          </div>
          {areasUnicas.map(a=>(
            <div key={a} style={{ backgroundColor:'white', border:`1px solid ${corArea(a)}`, borderLeft:`4px solid ${corArea(a)}`, borderRadius:'6px', padding:'8px 12px', fontSize:'12px' }}>
              <strong style={{ color:corArea(a) }}>{a}:</strong>{' '}
              {todosFiltered.filter(p=>(areaDe(p)||'Sem Área')===a).length} pessoas
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display:'flex', gap:'4px', borderBottom:'2px solid #e0e0e0', flexWrap:'wrap' }}>
          {([
            { key:'mensal',    label:'📋 Visão Mensal' },
            { key:'lancamento',label:'✏️ Lançar Turnos' },
            { key:'presencas', label:'✅ Presenças/Faltas' },
          ] as {key:AbaType;label:string}[]).map(({key,label})=>(
            <button key={key} style={s.tab(aba===key)} onClick={()=>setAba(key)}>{label}</button>
          ))}
        </div>

        {/* ─── ABA MENSAL ─────────────────────────────────────── */}
        {aba==='mensal' && (
          <div style={{ ...s.card, borderRadius:'0 8px 8px 8px', overflowX:'auto' }}>
            {loading ? <p style={{ textAlign:'center', padding:'30px', color:'#999' }}>Carregando...</p> : (
              <>
                {/* Legenda */}
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'12px', fontSize:'12px', alignItems:'center' }}>
                  {Object.entries(TURNO_BADGE).filter(([k])=>k).map(([k,v])=>(
                    <span key={k} style={{ backgroundColor:v.bg, color:v.cor, padding:'2px 8px', borderRadius:'10px', fontWeight:'bold', border:`1px solid ${v.cor}` }}>{v.label} = {k}</span>
                  ))}
                  <span style={{ backgroundColor:'#fce4ec', color:'#c62828', padding:'2px 8px', borderRadius:'10px', fontWeight:'bold', border:'1px dashed #e53935' }}>🎉 Feriado</span>
                  <span style={{ color:'#666', fontSize:'11px', marginLeft:'8px' }}>D=Dia | N=Noite | DN=Dobra | F=Folga</span>
                </div>

                {areasUnicas.filter(a=>filtroArea==='Todos'||a===filtroArea).map(area=>{
                  const gp = todosFiltered.filter(p=>(areaDe(p)||'Sem Área')===area);
                  if (gp.length===0) return null;
                  const areaColor = corArea(area);
                  return (
                    <div key={area} style={{ marginBottom:'28px' }}>
                      <div style={{ backgroundColor:areaColor, color:'white', padding:'8px 14px', borderRadius:'6px 6px 0 0', fontWeight:'bold', fontSize:'13px', display:'flex', alignItems:'center', gap:'8px' }}>
                        <span>📍 {area}</span>
                        <span style={{ opacity:0.8, fontSize:'11px' }}>({gp.length} pessoas)</span>
                        <span style={{ marginLeft:'auto', fontSize:'11px', opacity:0.8 }}>
                          {gp.filter(p=>p.tipoContrato==='CLT').length} CLT · {gp.filter(p=>p.tipoContrato!=='CLT').length} Free
                        </span>
                      </div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px' }}>
                          <thead>
                            <tr>
                              <th style={{ ...s.th, textAlign:'left', minWidth:'110px', fontSize:'11px', backgroundColor:areaColor }}>Nome</th>
                              <th style={{ ...s.th, minWidth:'32px', fontSize:'10px', backgroundColor:areaColor }}>Tipo</th>
                              <th style={{ ...s.th, textAlign:'left', minWidth:'70px', fontSize:'10px', backgroundColor:areaColor }}>Função</th>
                              {dias.map(d=>{
                                const ds=fmtIso(d); const dow=d.getDay();
                                const isFer=!!FERIADOS_2026[ds];
                                const isWkd=dow===0||dow===6;
                                return (
                                  <th key={ds} title={isFer?FERIADOS_2026[ds]:DF[dow]} style={{
                                    ...s.th, minWidth:'28px', padding:'3px 1px',
                                    backgroundColor: isFer?'#b71c1c':isWkd?'#37474f':areaColor,
                                    fontSize:'9px',
                                  }}>
                                    <div>{d.getDate()}</div>
                                    <div style={{ opacity:0.85 }}>{DS[dow]}</div>
                                    {isFer&&<div>🎉</div>}
                                  </th>
                                );
                              })}
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'24px', fontSize:'9px' }}>D</th>
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'24px', fontSize:'9px' }}>N</th>
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'24px', fontSize:'9px' }}>DN</th>
                              <th style={{ ...s.th, backgroundColor:'#1b5e20', minWidth:'24px', fontSize:'9px' }}>✅</th>
                              <th style={{ ...s.th, backgroundColor:'#c62828', minWidth:'24px', fontSize:'9px' }}>❌</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gp.map((p,ci)=>{
                              const r=resumos.find(x=>x.id===p.id);
                              const cor=corFuncao(p);
                              const tipo=p.tipoContrato||'CLT';
                              return (
                                <tr key={p.id} style={{ backgroundColor:ci%2===0?'#fafafa':'white' }}>
                                  <td style={{ ...s.td, textAlign:'left', fontWeight:'bold', paddingLeft:'8px', fontSize:'11px', borderLeft:`3px solid ${cor}` }}>
                                    {p.nome.split(' ').slice(0,2).join(' ')}
                                  </td>
                                  <td style={s.td}>
                                    <span style={{ padding:'1px 4px', borderRadius:'6px', fontSize:'9px', fontWeight:'bold',
                                      backgroundColor:tipo==='CLT'?'#e8f5e9':'#fff3e0',
                                      color:tipo==='CLT'?'#2e7d32':'#e65100' }}>
                                      {tipo==='CLT'?'CLT':'Free'}
                                    </span>
                                  </td>
                                  <td style={{ ...s.td, textAlign:'left', fontSize:'10px', color:'#555', paddingLeft:'4px' }}>{funcaoDe(p)}</td>
                                  {dias.map(d=>{
                                    const ds=fmtIso(d);
                                    const esc=escalasMap[p.id]?.[ds];
                                    const pr=presencaMap[p.id]?.[ds];
                                    const b=TURNO_BADGE[esc?.turno||'']||TURNO_BADGE[''];
                                    const pb=pr?PRES_BADGE[pr]:null;
                                    const isFer=!!FERIADOS_2026[ds];
                                    return (
                                      <td key={ds} style={{ ...s.td, backgroundColor:isFer?'#fff9e0':undefined, padding:'2px 1px' }}>
                                        {esc?.turno && esc.turno!=='Folga' ? (
                                          <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center',
                                            backgroundColor:b.bg, color:b.cor, borderRadius:'4px',
                                            padding:'1px 3px', fontSize:'9px', fontWeight:'bold', minWidth:'20px', lineHeight:'1.2' }}>
                                            <span>{b.label}</span>
                                            {pb&&<span style={{ fontSize:'7px' }}>{pb.icon}</span>}
                                          </div>
                                        ) : esc?.turno==='Folga' ? (
                                          <span style={{ fontSize:'9px', color:'#c62828' }}>F</span>
                                        ) : isFer?(
                                          <span style={{ fontSize:'9px' }}>🎉</span>
                                        ) : <span style={{ color:'#ddd', fontSize:'9px' }}>·</span>}
                                      </td>
                                    );
                                  })}
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#f57f17', fontSize:'10px' }}>{(r?.diaT||0)+(r?.dobraT||0)}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#3949ab', fontSize:'10px' }}>{(r?.noiteT||0)+(r?.dobraT||0)}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#2e7d32', fontSize:'10px' }}>{r?.dobraT||0}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#2e7d32', fontSize:'10px' }}>{r?.presenteT||0}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#c62828', fontSize:'10px' }}>{(r?.faltaT||0)+(r?.faltaJT||0)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* Feriados do mês */}
                {dias.some(d=>FERIADOS_2026[fmtIso(d)]) && (
                  <div style={{ marginTop:'14px', padding:'12px', backgroundColor:'#fff3e0', borderRadius:'6px', borderLeft:'4px solid #e65100' }}>
                    <strong style={{ color:'#e65100', fontSize:'13px' }}>🎉 Feriados em {mesAno}:</strong>
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'6px' }}>
                      {dias.filter(d=>FERIADOS_2026[fmtIso(d)]).map(d=>{
                        const ds=fmtIso(d);
                        return <span key={ds} style={{ fontSize:'12px', backgroundColor:'white', padding:'3px 8px', borderRadius:'4px', border:'1px solid #e65100' }}>
                          <strong>{d.getDate()}/{mes}</strong> – {FERIADOS_2026[ds]}
                        </span>;
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── ABA LANÇAMENTO DE TURNOS ───────────────────────── */}
        {aba==='lancamento' && (
          <div style={{ ...s.card, borderRadius:'0 8px 8px 8px' }}>
            {/* Seletor de semana */}
            <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'16px', flexWrap:'wrap' }}>
              <strong style={{ fontSize:'13px', color:'#1565c0' }}>📅 Semana:</strong>
              {semanas.map((sem,i)=>(
                <button key={i} onClick={()=>setSemanaIdx(i)} style={{
                  padding:'5px 12px', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:'bold',
                  backgroundColor: i===semanaIdx ? '#1976d2' : '#e0e0e0',
                  color: i===semanaIdx ? 'white' : '#333',
                }}>{sem.label}</button>
              ))}
              {salvando && <span style={{ fontSize:'11px', color:'#1976d2' }}>💾 Salvando...</span>}
            </div>

            {semAtual && (
              <>
                <p style={{ fontSize:'12px', color:'#666', margin:'0 0 12px 0', backgroundColor:'#e3f2fd', padding:'8px 12px', borderRadius:'6px' }}>
                  💡 Clique <strong style={{ color:'#f57f17' }}>D</strong> = Dia, <strong style={{ color:'#3949ab' }}>N</strong> = Noite. D+N ativo = Dobra. Desmarcar remove o turno.
                </p>

                {areasUnicas.filter(a=>filtroArea==='Todos'||a===filtroArea).map(area=>{
                  const gp = todosFiltered.filter(p=>(areaDe(p)||'Sem Área')===area);
                  if (gp.length===0) return null;
                  const areaColor = corArea(area);
                  return (
                    <div key={area} style={{ marginBottom:'28px' }}>
                      <div style={{ backgroundColor:areaColor, color:'white', padding:'7px 12px', borderRadius:'6px 6px 0 0', fontWeight:'bold', fontSize:'13px', display:'flex', alignItems:'center', gap:'8px' }}>
                        📍 {area}
                        <span style={{ opacity:0.8, fontSize:'11px' }}>({gp.length})</span>
                      </div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                          <thead>
                            <tr>
                              <th style={{ ...s.th, textAlign:'left', minWidth:'140px', fontSize:'11px', backgroundColor:areaColor }}>Nome</th>
                              <th style={{ ...s.th, minWidth:'32px', fontSize:'10px', backgroundColor:areaColor }}>Tipo</th>
                              <th style={{ ...s.th, textAlign:'left', minWidth:'80px', fontSize:'10px', backgroundColor:areaColor }}>Função</th>
                              {semAtual.dias.map(d=>{
                                const ds=fmtIso(d); const dow=d.getDay();
                                const isFer=!!FERIADOS_2026[ds];
                                const isWkd=dow===0||dow===6;
                                return (
                                  <th key={ds} title={isFer?FERIADOS_2026[ds]:DF[dow]} style={{
                                    ...s.th, minWidth:'52px', padding:'5px 3px',
                                    backgroundColor:isFer?'#b71c1c':isWkd?'#37474f':areaColor,
                                  }}>
                                    <div style={{ fontSize:'11px' }}>{d.getDate()}/{d.getMonth()+1}</div>
                                    <div style={{ fontSize:'9px', opacity:0.85 }}>{DF[dow].slice(0,3)}</div>
                                    {isFer&&<div style={{ fontSize:'8px' }}>🎉</div>}
                                  </th>
                                );
                              })}
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'32px' }}>D</th>
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'32px' }}>N</th>
                              <th style={{ ...s.th, backgroundColor:'#0d47a1', minWidth:'32px' }}>DN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gp.map((p,ci)=>{
                              const calc = calcPagamentoSemana(p, semAtual.dias);
                              const cor=corFuncao(p);
                              const tipo=p.tipoContrato||'CLT';
                              return (
                                <tr key={p.id} style={{ backgroundColor:ci%2===0?'#fafafa':'white' }}>
                                  <td style={{ ...s.td, textAlign:'left', fontWeight:'bold', paddingLeft:'8px', fontSize:'12px', borderLeft:`3px solid ${cor}` }}>
                                    {p.nome.split(' ').slice(0,2).join(' ')}
                                    {p.chavePix && <span style={{ display:'block', fontSize:'9px', color:'#1976d2', fontWeight:'normal' }}>PIX</span>}
                                  </td>
                                  <td style={s.td}>
                                    <span style={{ padding:'1px 4px', borderRadius:'6px', fontSize:'9px', fontWeight:'bold',
                                      backgroundColor:tipo==='CLT'?'#e8f5e9':'#fff3e0',
                                      color:tipo==='CLT'?'#2e7d32':'#e65100' }}>
                                      {tipo==='CLT'?'CLT':'Free'}
                                    </span>
                                  </td>
                                  <td style={{ ...s.td, textAlign:'left', fontSize:'10px', color:'#555', paddingLeft:'4px' }}>{funcaoDe(p)}</td>
                                  {semAtual.dias.map(d=>(
                                    <CelulaTurno key={fmtIso(d)} pessoaId={p.id} data={fmtIso(d)} disabled={salvando} />
                                  ))}
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#f57f17' }}>{calc.dC}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#3949ab' }}>{calc.nC}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#2e7d32' }}>{calc.dnC}</td>
                                </tr>
                              );
                            })}
                          </tbody>

                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* Info - ver Folha de Pagamento para valores */}
                <div style={{ marginTop:'12px', padding:'10px 14px', backgroundColor:'#e8f5e9', borderRadius:'6px', borderLeft:'4px solid #2e7d32', fontSize:'12px', color:'#1b5e20' }}>
                  💡 Os valores de pagamento estão disponíveis em <strong>Folha de Pagamento → Dobras Semanais</strong>.
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── ABA PRESENÇAS ──────────────────────────────────── */}
        {aba==='presencas' && (
          <div style={{ ...s.card, borderRadius:'0 8px 8px 8px', overflowX:'auto' }}>
            <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'14px', flexWrap:'wrap' }}>
              <strong style={{ color:'#2e7d32', fontSize:'13px' }}>📅 Semana:</strong>
              {semanas.map((sem,i)=>(
                <button key={i} onClick={()=>setSemanaIdx(i)} style={{
                  padding:'5px 12px', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'11px', fontWeight:'bold',
                  backgroundColor:i===semanaIdx?'#2e7d32':'#e0e0e0', color:i===semanaIdx?'white':'#333',
                }}>{sem.label}</button>
              ))}
              {salvandoPres && <span style={{ fontSize:'11px', color:'#1976d2' }}>💾...</span>}
            </div>

            <p style={{ color:'#666', fontSize:'12px', margin:'0 0 14px 0', backgroundColor:'#e8f5e9', padding:'8px 12px', borderRadius:'6px' }}>
              🖱️ Clique em <strong style={{color:'#f57f17'}}>D</strong> ou <strong style={{color:'#3949ab'}}>N</strong> para ciclar presença: <strong>— → ✅ Presente → ❌ Falta → ⚠️ Justificada → —</strong>.
              Apenas dias com turno lançado podem ser pontuados. Dia e Noite são pontuados separadamente.
            </p>

            {semAtual && areasUnicas.filter(a=>filtroArea==='Todos'||a===filtroArea).map(area=>{
              const gp = todosFiltered.filter(p=>(areaDe(p)||'Sem Área')===area);
              if (gp.length===0) return null;
              const areaColor = corArea(area);
              return (
                <div key={area} style={{ marginBottom:'24px' }}>
                  <div style={{ backgroundColor:areaColor, color:'white', padding:'7px 12px', borderRadius:'6px 6px 0 0', fontWeight:'bold', fontSize:'13px' }}>
                    📍 {area}
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, textAlign:'left', minWidth:'130px', backgroundColor:areaColor, fontSize:'11px' }}>Nome</th>
                        <th style={{ ...s.th, textAlign:'left', minWidth:'60px', backgroundColor:areaColor, fontSize:'10px' }}>Função</th>
                        <th style={{ ...s.th, width:'28px', backgroundColor:'#0d47a1', fontSize:'9px' }}>T</th>
                        {semAtual.dias.map(d=>{
                          const ds=fmtIso(d); const dow=d.getDay();
                          const isFer=!!FERIADOS_2026[ds];
                          return (
                            <th key={ds} style={{ ...s.th, minWidth:'64px', backgroundColor:isFer?'#b71c1c':dow===0||dow===6?'#546e7a':areaColor }}>
                              <div style={{ fontSize:'11px' }}>{d.getDate()}/{d.getMonth()+1}</div>
                              <div style={{ fontSize:'8px', opacity:0.85 }}>{DS[dow]}</div>
                              {isFer&&<div style={{ fontSize:'7px' }}>🎉</div>}
                            </th>
                          );
                        })}
                        <th style={{ ...s.th, backgroundColor:'#1b5e20', minWidth:'28px', fontSize:'9px' }}>✅</th>
                        <th style={{ ...s.th, backgroundColor:'#c62828', minWidth:'28px', fontSize:'9px' }}>❌</th>
                        <th style={{ ...s.th, backgroundColor:'#e65100', minWidth:'28px', fontSize:'9px' }}>⚠️</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gp.map((p,ci)=>{
                        const cor=corFuncao(p);
                        let pT=0,fT=0,fjT=0;
                        for (const d of semAtual.dias){
                          const pr=presencaMap[p.id]?.[fmtIso(d)];
                          if(pr==='presente')pT++;
                          else if(pr==='falta')fT++;
                          else if(pr==='falta_justificada')fjT++;
                          // Also count night separately
                          const prN=presencaMap[`${p.id}_N`]?.[fmtIso(d)];
                          if(prN==='presente')pT++;
                          else if(prN==='falta')fT++;
                          else if(prN==='falta_justificada')fjT++;
                        }
                        // Check if this person has any DiaNoite shifts this week
                        const hasDN = semAtual.dias.some(d=>{
                          const esc=escalasMap[p.id]?.[fmtIso(d)];
                          return esc?.turno==='DiaNoite';
                        });
                        // Render 2 rows if hasDN, else 1
                        const turnos_label = ['Dia','Noite'] as const;
                        return turnos_label.map((tLabel, tIdx)=>{
                          // Only show night row if person has noite or diaNoite shifts this week
                          const hasNightInWeek = semAtual.dias.some(d=>{
                            const esc=escalasMap[p.id]?.[fmtIso(d)];
                            return esc?.turno==='Noite'||esc?.turno==='DiaNoite';
                          });
                          const hasDayInWeek = semAtual.dias.some(d=>{
                            const esc=escalasMap[p.id]?.[fmtIso(d)];
                            return esc?.turno==='Dia'||esc?.turno==='DiaNoite';
                          });
                          if (tLabel==='Noite' && !hasNightInWeek) return null;
                          if (tLabel==='Dia' && !hasDayInWeek && hasNightInWeek) return null;
                          const presKey = tLabel==='Noite' ? `${p.id}_N` : p.id;
                          return (
                            <tr key={`${p.id}_${tLabel}`} style={{ backgroundColor:ci%2===0?'#fafafa':'white', borderBottom: tLabel==='Dia'&&hasDN?'none':undefined }}>
                              {tIdx===0 ? (
                                <>
                                  <td style={{ ...s.td, textAlign:'left', fontWeight:'bold', paddingLeft:'8px', fontSize:'11px', borderLeft:`3px solid ${cor}` }} rowSpan={hasDN&&hasNightInWeek?2:1}>
                                    {p.nome.split(' ').slice(0,2).join(' ')}
                                  </td>
                                  <td style={{ ...s.td, textAlign:'left', fontSize:'10px', color:'#555' }} rowSpan={hasDN&&hasNightInWeek?2:1}>{funcaoDe(p)}</td>
                                </>
                              ) : null}
                              <td style={{ ...s.td, textAlign:'center', fontWeight:'bold', fontSize:'9px',
                                backgroundColor:tLabel==='Dia'?'#fff9c4':'#e8eaf6',
                                color:tLabel==='Dia'?'#f57f17':'#3949ab',
                                padding:'2px 3px' }}>{tLabel[0]}</td>
                              {semAtual.dias.map(d=>{
                                const ds=fmtIso(d);
                                const esc=escalasMap[p.id]?.[ds];
                                // Check if this shift type is present
                                const hasThisTurno = tLabel==='Dia'
                                  ? (esc?.turno==='Dia'||esc?.turno==='DiaNoite')
                                  : (esc?.turno==='Noite'||esc?.turno==='DiaNoite');
                                const cur=presencaMap[presKey]?.[ds]||'';
                                const pb=cur?PRES_BADGE[cur]:null;
                                return (
                                  <td key={ds} style={{ ...s.td, cursor:hasThisTurno?'pointer':'default',
                                    backgroundColor:FERIADOS_2026[ds]?'#fff9e0':pb?pb.bg:(hasThisTurno?(tLabel==='Dia'?'#fffde7':'#e8eaf6'):undefined),
                                    opacity:hasThisTurno?1:0.2, minWidth:'64px', padding:'3px' }}
                                    title={hasThisTurno?(tLabel+' — clique para pontuar'):'Sem turno '+tLabel}
                                    onClick={()=>hasThisTurno&&handlePresenca(presKey,ds,cur)}>
                                    {hasThisTurno ? (
                                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1px' }}>
                                        <span style={{ fontSize:'8px', fontWeight:'bold',
                                          color:tLabel==='Dia'?'#f57f17':'#3949ab' }}>{tLabel[0]}</span>
                                        {pb ? <span style={{ fontSize:'12px' }}>{pb.icon}</span>
                                             : <span style={{ fontSize:'9px', color:'#bbb' }}>—</span>}
                                      </div>
                                    ) : <span style={{ color:'#eee', fontSize:'8px' }}>·</span>}
                                  </td>
                                );
                              })}
                              {tIdx===0 ? (
                                <>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#2e7d32', fontSize:'11px' }} rowSpan={hasDN&&hasNightInWeek?2:1}>{pT}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#c62828', fontSize:'11px' }} rowSpan={hasDN&&hasNightInWeek?2:1}>{fT}</td>
                                  <td style={{ ...s.td, fontWeight:'bold', color:'#e65100', fontSize:'11px' }} rowSpan={hasDN&&hasNightInWeek?2:1}>{fjT}</td>
                                </>
                              ) : null}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Resumo mensal de presenças */}
            <div style={{ marginTop:'20px', padding:'14px', backgroundColor:'#f9f9f9', borderRadius:'8px', border:'1px solid #e0e0e0' }}>
              <h4 style={{ margin:'0 0 10px 0', color:'#333', fontSize:'14px' }}>📊 Resumo Mensal de Presenças — {mesAno}</h4>
              <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                {resumos.filter(r=>{
                  const p=todos.find(x=>x.id===r.id);
                  if (!p) return false;
                  const matchArea=filtroArea==='Todos'||(areaDe(p)||'Sem Área')===filtroArea;
                  return matchArea && (r.presenteT+r.faltaT+r.faltaJT)>0;
                }).map(r=>{
                  const p=todos.find(x=>x.id===r.id)!;
                  const cor=corFuncao(p);
                  return (
                    <div key={r.id} style={{ backgroundColor:'white', border:`1px solid ${cor}`, borderLeft:`4px solid ${cor}`, borderRadius:'6px', padding:'8px 12px', minWidth:'130px' }}>
                      <div style={{ fontWeight:'bold', fontSize:'12px' }}>{r.nome.split(' ')[0]}</div>
                      <div style={{ fontSize:'10px', color:'#666', marginBottom:'4px' }}>{funcaoDe(p)}</div>
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                        <span style={{ padding:'1px 5px', borderRadius:'6px', fontSize:'10px', fontWeight:'bold', backgroundColor:'#e8f5e9', color:'#2e7d32' }}>✅{r.presenteT}</span>
                        {r.faltaT>0 && <span style={{ padding:'1px 5px', borderRadius:'6px', fontSize:'10px', fontWeight:'bold', backgroundColor:'#fce4ec', color:'#c62828' }}>❌{r.faltaT}</span>}
                        {r.faltaJT>0 && <span style={{ padding:'1px 5px', borderRadius:'6px', fontSize:'10px', fontWeight:'bold', backgroundColor:'#fff3e0', color:'#e65100' }}>⚠️{r.faltaJT}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}


      </div>
      <Footer showLinks={true} />
    </div>
  );
};
