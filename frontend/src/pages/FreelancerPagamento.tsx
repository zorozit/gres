/**
 * FreelancerPagamento.tsx
 *
 * Módulo standalone de pagamento de Freelancers.
 * Replica FIELMENTE a lógica da aba "Freelancers" da FolhaPagamento:
 *  - mesmo fetch (folha + escalas + saídas + meses anteriores + hist. especial)
 *  - mesmo calcularFechamentosFreelancer
 *  - mesmo modal de confirmação de pagamento (checklist + forma + data)
 *  - mesmo detalhe de semana
 *  - filtro de período customizado
 *
 * Rota: /modulos/freelancer-pagamento
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { fetchAuth } from '../utils/fetchAuth';


/* ─── Helpers (idênticos à FolhaPagamento) ────────────────────────────────── */
const R = (v: any): number => { const n = parseFloat(String(v ?? 0).replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);
const isMigradoReg  = (r: any) => r.migrado   === true || r.migrado   === 'True' || r.migrado   === 'true';
const isEstornadoReg = (r: any) => r.estornado === true || r.estornado === 'True' || r.estornado === 'true';

function semanasFechamento(ano: number, mes: number): { inicio: Date; fim: Date }[] {
  const semanas: { inicio: Date; fim: Date }[] = [];
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimo   = new Date(ano, mes, 0);
  let cur = new Date(primeiro);
  while (cur <= ultimo) {
    const inicio = new Date(cur);
    const fim    = new Date(cur);
    while (fim.getDay() !== 0 && fim < ultimo) fim.setDate(fim.getDate() + 1);
    semanas.push({ inicio, fim: new Date(Math.min(fim.getTime(), ultimo.getTime())) });
    cur = new Date(fim); cur.setDate(cur.getDate() + 1);
  }
  return semanas;
}
function fmtDataISO(d: Date) { return d.toISOString().split('T')[0]; }

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function FreelancerPagamento() {
  const navigate  = useNavigate();
  const { activeUnit } = useUnit();
  const { user, email: authEmail } = useAuth() as any;
  const unitId  = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const apiUrl  = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const token   = () => localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
  const responsavelEmail = authEmail || (user as any)?.email || localStorage.getItem('user_email') || 'sistema';
  const responsavelId    = localStorage.getItem('user_id') || '';
  const responsavelNome  = (user as any)?.nome || (user as any)?.name || responsavelEmail;
  const auditoriaCampos  = () => ({ responsavelId, responsavelNome, responsavelEmail });

  /* ── Estado ── */
  const hoje = new Date();
  const [mesAno,    setMesAno]    = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`);
  const [periodoIni, setPeriodoIni] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const periodoCustomAtivo = !!(periodoIni && periodoFim);
  const [loading,   setLoading]   = useState(false);
  const [salvando,  setSalvando]  = useState(false);

  const [freelancers,         setFreelancers]         = useState<any[]>([]);
  const [escalas,             setEscalas]             = useState<any[]>([]);
  const [folhasDB,            setFolhasDB]            = useState<any[]>([]);
  const [saidasPeriodo,       setSaidasPeriodo]       = useState<any[]>([]);
  const [saidasMesCompleto,   setSaidasMesCompleto]   = useState<any[]>([]);
  const [saidasPendentesAnt,  setSaidasPendentesAnt]  = useState<any[]>([]);
  const [saldosEspeciais,     setSaldosEspeciais]     = useState<Record<string,number>>({});
  const [motoboysFr,          setMotoboysFr]          = useState<any[]>([]);
  const [controlesMap,        setControlesMap]        = useState<Record<string, any[]>>({});
  const [fechamentos,         setFechamentos]         = useState<any[]>([]);
  const [editFechamento, setEditFechamento] = useState<Record<string, any>>({});

  /* modal pagamento */
  const [modalPgto,      setModalPgto]      = useState<{fr: any; fech: any} | null>(null);
  const [checkItems,     setCheckItems]     = useState<any[]>([]);
  const [dataLocalPgto,  setDataLocalPgto]  = useState(hoje.toISOString().split('T')[0]);
  const [formaPgto,      setFormaPgto]      = useState<'PIX'|'Dinheiro'|'Misto'>('PIX');
  const [formaPix,       setFormaPix]       = useState('');
  const [formaDin,       setFormaDin]       = useState('');
  const [abaterEsp,      setAbaterEsp]      = useState(false);
  const [vlAbat,         setVlAbat]         = useState('');

  /* detalhe */
  const [detalhe, setDetalhe] = useState<{fr: any; fech: any; escsSemana: any[]; saidasSemana: any[]} | null>(null);

  /* ── helpers de mês ── */
  const mesesNoRange = (iniIso: string, fimIso: string): string[] => {
    const [ai,mi] = iniIso.split('-').map(Number); const [af,mf] = fimIso.split('-').map(Number);
    const out: string[] = []; let y=ai, m=mi;
    while (y < af || (y===af && m<=mf)) { out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;} }
    return out;
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     FETCH — idêntico ao carregarDados() da FolhaPagamento, mas só freelancers
  ═══════════════════════════════════════════════════════════════════════════ */
  const carregarDados = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const mesalIni = `${mesAno}-01`;
      const mesalFim = new Date(ano, mes, 0).toISOString().split('T')[0];
      const dataInicio = periodoCustomAtivo ? periodoIni : mesalIni;
      const dataFim    = periodoCustomAtivo ? periodoFim : mesalFim;

      const mesAnterior = (() => {
        const d = new Date(ano, mes-2, 1);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      })();
      const mesesAlvo = periodoCustomAtivo ? mesesNoRange(periodoIni, periodoFim) : [mesAnterior, mesAno];

      const [aIni, mIni] = dataInicio.split('-').map(Number);
      const prevDate = new Date(aIni, mIni-4, 1);
      const prevIni  = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}-01`;
      const histDate = new Date(aIni, mIni-25, 1);
      const histIni  = `${histDate.getFullYear()}-${String(histDate.getMonth()+1).padStart(2,'0')}-01`;

      const auth = { headers: { Authorization: `Bearer ${token()}` } };

      const folhaFetches  = mesesAlvo.map(mm => fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mm}`, auth).catch(()=>null));
      const escalaFetches = mesesAlvo.map(mm => fetchAuth(`${apiUrl}/escalas?unitId=${unitId}&mes=${mm}`, auth).catch(()=>null));
      // Sempre buscar saídas do mês completo (necessário para cálculo de adiantamento de transporte)
      const rSMes = fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${mesalIni}&dataFim=${mesalFim}`, auth).catch(()=>null);

      // Para saldo de adiantamento especial, buscar até HOJE (não até dataFim do período)
      // pois descontos podem ser lançados em data posterior ao período de trabalho
      const hojeISO = new Date().toISOString().split('T')[0];
      const histFim = dataFim > hojeISO ? dataFim : hojeISO;

      const [rC, foRs, esRs, rS, rSPend, rSHist, rSMesResult] = await Promise.all([
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, auth),
        Promise.all(folhaFetches),
        Promise.all(escalaFetches),
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, auth).catch(()=>null),
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${prevIni}&dataFim=${dataInicio}`, auth).catch(()=>null),
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${histIni}&dataFim=${histFim}`, auth).catch(()=>null),
        rSMes || Promise.resolve(null),
      ]);

      const dC = await rC.json();
      const todosColabs: any[] = (Array.isArray(dC) ? dC : []).filter((c:any) => c.ativo !== false);
      const frsList = todosColabs.filter((c:any) => c.tipoContrato === 'Freelancer');
      setFreelancers(frsList);

      /* ── Motoboys freelancers: derivados de colaboradores com isMotoboy=true ou cargo=motoboy ── */
      const motos = todosColabs
        .filter((c:any) => (c as any).isMotoboy === true || ((c as any).cargo || '').toLowerCase() === 'motoboy')
        .map((c:any) => ({
          id: c.id, cpf: c.cpf, nome: c.nome,
          valorDia:    R(c.valorDia)    || 0,
          valorNoite:  R(c.valorNoite)  || 0,
          valorEntrega: R(c.valorEntrega) || R(c.valorTransporte) || 0,
          valorTransporte: R(c.valorTransporte) || 0,
          vinculo: c.tipoContrato === 'Freelancer' ? 'Freelancer' : 'CLT',
        }));
      setMotoboysFr(motos);

      /* Buscar controle-motoboy por motoboy × mês */
      const ctrlMap: Record<string, any[]> = {};
      await Promise.all(motos.map(async (m:any) => {
        try {
          const partes = await Promise.all(mesesAlvo.map((mm:string) =>
            fetchAuth(`${apiUrl}/controle-motoboy?motoboyId=${m.id}&mes=${mm}&unitId=${unitId}`, auth)
              .then((r:Response) => r.ok ? r.json() : [])
              .catch(() => [])
          ));
          const d: any[] = partes.flat();
          ctrlMap[m.id] = d;
          if (m.cpf) ctrlMap[m.cpf] = d;
        } catch { ctrlMap[m.id] = []; }
      }));
      setControlesMap(ctrlMap);

      /* escalas */
      const escalasAcc: any[] = [];
      for (const r of esRs) { if (!r?.ok) continue; try { const d = await r.json(); if (Array.isArray(d)) escalasAcc.push(...d); } catch{} }
      setEscalas(escalasAcc);

      /* folhasDB */
      const folhasAcc: any[] = [];
      for (const r of foRs) { if (!r?.ok) continue; try { const d = await r.json(); if (Array.isArray(d)) folhasAcc.push(...d); } catch{} }
      setFolhasDB(folhasAcc);

      /* saídas — salvar em variáveis locais antes para passar ao calcular */
      let saidasPer: any[] = [];
      let saidasMesComp: any[] = [];
      let saidasPendAnt: any[] = [];
      if (rS?.ok) { const d = await rS.json(); saidasPer = Array.isArray(d)?d:[]; setSaidasPeriodo(saidasPer); } else setSaidasPeriodo([]);
      if (rSMesResult?.ok) { const d = await rSMesResult.json(); saidasMesComp = Array.isArray(d)?d:[]; setSaidasMesCompleto(saidasMesComp); } else setSaidasMesCompleto([]);
      if (rSPend?.ok) { const d = await rSPend.json(); saidasPendAnt = (Array.isArray(d)?d:[]).filter((s:any)=>s.pago===false); setSaidasPendentesAnt(saidasPendAnt); } else setSaidasPendentesAnt([]);

      /* saldos especiais */
      let saldos: Record<string,number> = {};
      if (rSHist?.ok) {
        const hist: any[] = await rSHist.json();
        for (const s of hist) {
          const tipo = s.tipo||s.origem||s.referencia||''; const cid = s.colaboradorId||s.colabId; if (!cid) continue;
          if (tipo==='Adiantamento Especial') saldos[cid]=(saldos[cid]||0)+(parseFloat(s.valor)||0);
          else if (tipo==='Desconto Adiantamento Especial') saldos[cid]=(saldos[cid]||0)-(parseFloat(s.valor)||0);
        }
        Object.keys(saldos).forEach(k => { if (saldos[k]<=0) delete saldos[k]; });
      }
      setSaldosEspeciais(saldos);
      calcularFechamentos(
        frsList,
        escalasAcc, folhasAcc,
        saidasPer,
        saidasPendAnt,
        saldos,
        motos,
        ctrlMap
      );
    } catch(e) { console.error('[FreelancerPagamento] fetch error', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno, periodoIni, periodoFim]);

  /* ═══════════════════════════════════════════════════════════════════════════
     calcularFechamentos — cópia fiel de calcularFechamentosFreelancer da FolhaPagamento
  ═══════════════════════════════════════════════════════════════════════════ */
  const calcularFechamentos = (
    frs: any[],
    escs: any[],
    fDB: any[],
    saidasPer: any[],
    saidasPendAnt: any[],
    saldos: Record<string,number>,
    motos: any[] = [],
    ctrlMap: Record<string, any[]> = {}
  ) => {
    if (!frs.length) { setFechamentos([]); return; }

    let semanas: { inicio: Date; fim: Date }[];
    if (periodoCustomAtivo) {
      semanas = [{ inicio: new Date(periodoIni+'T00:00:00'), fim: new Date(periodoFim+'T00:00:00') }];
    } else {
      const [ano, mes] = mesAno.split('-').map(Number);
      semanas = semanasFechamento(ano, mes);
    }

    /* index dias já pagos */
    const diasPagosPorColab: Record<string, Set<string>> = {};
    const turnosPagosPorColab: Record<string, Map<string,{valor:number;dataPagamento:string;forma:string}>> = {};
    for (const reg of fDB) {
      if (!reg.colaboradorId || !reg.pago) continue;
      if (isMigradoReg(reg) || isEstornadoReg(reg)) continue;
      const cid = reg.colaboradorId;
      if (!diasPagosPorColab[cid]) diasPagosPorColab[cid] = new Set();
      if (!turnosPagosPorColab[cid]) turnosPagosPorColab[cid] = new Map();
      if (typeof reg.id==='string' && reg.id.startsWith('folha-') && reg.data && reg.turno) {
        diasPagosPorColab[cid].add(reg.data);
        turnosPagosPorColab[cid].set(`${reg.data}-${reg.turno}`,{valor:R(reg.valor),dataPagamento:reg.dataPagamento||'',forma:reg.formaPagamento||'PIX'});
        continue;
      }
      if (Array.isArray(reg.diasPagos)) {
        for (const dp of reg.diasPagos) {
          if (!dp?.data) continue;
          diasPagosPorColab[cid].add(dp.data);
          const turnos = (dp.turno==='DiaNoite'||dp.turno==='DN')?['Dia','Noite']:[dp.turno||'Dia'];
          for (const t of turnos) turnosPagosPorColab[cid].set(`${dp.data}-${t}`,{valor:R(dp.valor)/turnos.length,dataPagamento:reg.dataPagamento||'',forma:reg.formaPagamento||'PIX'});
        }
      }
    }

    /* adiantamentos de transporte por colab */
    const calcTransporteAdiantado = (frId: string, isoIni: string, isoFim: string, saidasUsadas: any[]): number => {
      return saidasUsadas.filter((s:any) => {
        const t = s.tipo||s.origem||s.referencia||'';
        return s.colaboradorId===frId && t==='Adiantamento Transporte' && (s.dataPagamento||s.data||'')>=isoIni && (s.dataPagamento||s.data||'')<=isoFim;
      }).reduce((acc:number,s:any)=>acc+R(s.valor),0);
    };

    const result: any[] = semanas.map(({inicio,fim}) => {
      const isoInicioBase = fmtDataISO(inicio);
      const isoFimBase    = fmtDataISO(fim);
      const efBase = periodoCustomAtivo ? {} : (editFechamento[isoFimBase]||{});
      const isoInicio = (efBase as any).dataIniCustom || isoInicioBase;
      const isoFim2   = (efBase as any).dataFimCustom || isoFimBase;
      const [iniD,iniM] = isoInicio.split('-').slice(1).map(Number);
      const [fimD,fimM] = isoFim2.split('-').slice(1).map(Number);
      const semLabel = periodoCustomAtivo
        ? `${String(iniD).padStart(2,'0')}/${String(iniM).padStart(2,'0')} - ${String(fimD).padStart(2,'0')}/${String(fimM).padStart(2,'0')} (período custom)`
        : `${String(iniD).padStart(2,'0')}/${String(iniM).padStart(2,'0')} - ${String(fimD).padStart(2,'0')}/${String(fimM).padStart(2,'0')}`;

      /* saídas do mês inteiro para cálculo de transporte adiantado */
      const [ano2,mes2] = mesAno.split('-').map(Number);
      const mesIni2 = `${mesAno}-01`;
      const mesFim2 = new Date(ano2,mes2,0).toISOString().split('T')[0];
      // Para cálculo de adiantamento de transporte, SEMPRE usar saídas do mês completo
      // (o adiantamento pode ter sido feito em qualquer dia do mês, não só na semana atual)
      const saidasTranspMes = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPer;

      const DOW_KEYS = ['dom','seg','ter','qua','qui','sex','sab'];
      const frList = frs.map((fr:any) => {
        const cid = fr.id;
        const fCpf = (fr as any).cpf || '';
        const vDia   = R(fr.valorDia);
        const vNoite = R(fr.valorNoite);
        const vDobra = R(fr.valorDobra) || 120;
        const usaTurno = vDia>0 || vNoite>0;
        const isValorTurno = fr.tipoAcordo === 'valor_turno' && fr.acordo?.tabela;
        const acordoTabela = fr.acordo?.tabela || {};

        /* Resolver valor do turno levando em conta acordo.tabela por dia da semana */
        const resolverValorTurno = (data: string, turno: 'Dia' | 'Noite'): number => {
          if (isValorTurno) {
            const dow = new Date(data + 'T12:00:00').getDay();
            const vals = acordoTabela[DOW_KEYS[dow]] || {};
            return turno === 'Dia' ? R(vals.D) : R(vals.N);
          }
          if (usaTurno) return turno === 'Dia' ? vDia : vNoite;
          return vDobra;
        };

        /* ── Detectar se é motoboy freelancer ── */
        const motoboyMatch = motos.find((m:any) => m.id === cid || (fCpf && m.cpf === fCpf));
        const isMotoboy = !!motoboyMatch || (fr as any).cargo === 'Motoboy' || (fr as any).isMotoboy === true;
        const motoboyId = motoboyMatch?.id || cid;
        const vEntrega  = motoboyMatch ? (R(motoboyMatch.valorEntrega) || 0) : 0;
        const ctrlLinhas: any[] = ctrlMap[motoboyId] || (fCpf ? ctrlMap[fCpf] : undefined) || [];

        /* is turno pago */
        const isTurnoPago = (data:string, turno:string) => (turnosPagosPorColab[cid]||new Map()).has(`${data}-${turno}`);

        const diasJaPagos = diasPagosPorColab[cid] || new Set<string>();

        /* Caixinha do controle-motoboy */
        let caixinhaCtrlMotoboy = 0;
        const caixinhaCtrlDetalhe: {descricao:string;valor:number;data:string}[] = [];

        /* diasPagos / diasJaPagosDetalhe */
        const diasPagosList: {data:string;turno:string;valor:number}[] = [];
        const diasJaPagosDetalhe: {data:string;turno:string;valor:number}[] = [];
        // Detalhe linha-a-linha para o modal (motoboy): chegada + entregas separados
        const ctrlLinhasDetalhe: {data:string;turno:string;chegada:number;qtdEntregas:number;vlEntrega:number;totalEntregas:number;vlLinha:number;pago:boolean}[] = [];
        let total = 0, totalJaPago = 0, dobras = 0, diasTrabalhados = 0, diasCodigo = '';

        if (isMotoboy && (vDia > 0 || vNoite > 0 || vEntrega > 0)) {
          /* ── Cálculo baseado em controle-motoboy (mesma lógica da FolhaPagamento) ── */
          const linhasSemana = ctrlLinhas.filter((l:any) => l.data >= isoInicio && l.data <= isoFim2);
          for (const linha of linhasSemana) {
            const jaPago = diasJaPagos.has(linha.data);
            const chegD = R(linha.chegadaDia)   > 0 ? R(linha.chegadaDia)   : (R(linha.entDia)   > 0 ? vDia   : 0);
            const chegN = R(linha.chegadaNoite) > 0 ? R(linha.chegadaNoite) : (R(linha.entNoite) > 0 ? vNoite : 0);
            const temDia   = chegD > 0 || R(linha.entDia)   > 0;
            const temNoite = chegN > 0 || R(linha.entNoite) > 0;
            const totalEntregas = (R(linha.entDia) + R(linha.entNoite)) * vEntrega;
            const caixinhaLinha = R(linha.caixinhaDia) + R(linha.caixinhaNoite);
            const vlLinha = parseFloat((chegD + chegN + totalEntregas).toFixed(2));
            const turno = (temDia && temNoite) ? 'DiaNoite' : temDia ? 'Dia' : temNoite ? 'Noite' : 'Dia';

            if (jaPago) {
              totalJaPago += vlLinha;
              diasJaPagosDetalhe.push({data: linha.data, turno, valor: vlLinha});
              // Guardar detalhe para o modal (pago — exibição de auditoria)
              if (vlLinha > 0) ctrlLinhasDetalhe.push({
                data: linha.data, turno,
                chegada: parseFloat((chegD + chegN).toFixed(2)),
                qtdEntregas: R(linha.entDia) + R(linha.entNoite),
                vlEntrega: vEntrega,
                totalEntregas: parseFloat(totalEntregas.toFixed(2)),
                vlLinha, pago: true,
              });
            } else if (vlLinha > 0) {
              total += vlLinha;
              diasPagosList.push({data: linha.data, turno, valor: vlLinha});
              dobras += (temDia && temNoite) ? 2 : 1;
              diasTrabalhados++;
              // Guardar detalhe para o modal (pendente)
              ctrlLinhasDetalhe.push({
                data: linha.data,
                turno,
                chegada: parseFloat((chegD + chegN).toFixed(2)),
                qtdEntregas: R(linha.entDia) + R(linha.entNoite),
                vlEntrega: vEntrega,
                totalEntregas: parseFloat(totalEntregas.toFixed(2)),
                vlLinha, pago: false,
              });
            }
            if (caixinhaLinha > 0 && !jaPago) {
              caixinhaCtrlMotoboy += caixinhaLinha;
              caixinhaCtrlDetalhe.push({
                descricao: `🪙 Caixinha ${linha.data.split('-').reverse().join('/')}`,
                valor: caixinhaLinha,
                data: linha.data,
              });
            }
          }
          total = parseFloat(total.toFixed(2));
          totalJaPago = parseFloat(totalJaPago.toFixed(2));
          caixinhaCtrlMotoboy = parseFloat(caixinhaCtrlMotoboy.toFixed(2));
          dobras = parseFloat(dobras.toFixed(1));
          diasCodigo = diasPagosList.map(d => d.data.slice(8)).join(',');
        } else {
          /* ── Cálculo baseado em escalas (freelancer padrão) ── */
          const escsSemana = escs.filter((e:any) => e.colaboradorId===cid && e.data>=isoInicio && e.data<=isoFim2);
          type TU = {data:string;turno:string;valor:number};
          const turnosUnidade: TU[] = [];
          for (const esc of escsSemana) {
            if (esc.turno==='DiaNoite') {
              const pD = esc.presenca==='presente', pN = esc.presencaNoite==='presente';
              if (pD) turnosUnidade.push({data:esc.data, turno:'Dia',   valor:resolverValorTurno(esc.data, 'Dia')});
              if (pN) turnosUnidade.push({data:esc.data, turno:'Noite', valor:resolverValorTurno(esc.data, 'Noite')});
            } else if (esc.turno==='Noite') {
              const p = esc.presencaNoite==='presente'||esc.presenca==='presente';
              if (p) turnosUnidade.push({data:esc.data, turno:'Noite', valor:resolverValorTurno(esc.data, 'Noite')});
            } else {
              if (esc.presenca==='presente') turnosUnidade.push({data:esc.data, turno:esc.turno||'Dia', valor:resolverValorTurno(esc.data, (esc.turno||'Dia') as 'Dia'|'Noite')});
            }
          }
          const escPendentes = turnosUnidade.filter(u => !isTurnoPago(u.data,u.turno));
          const escJaPagas   = turnosUnidade.filter(u =>  isTurnoPago(u.data,u.turno));
          for (const u of escPendentes) {
            diasPagosList.push({data:u.data, turno:u.turno, valor:u.valor});
            total += u.valor;
          }
          for (const u of escJaPagas) {
            const v = turnosPagosPorColab[cid]?.get(`${u.data}-${u.turno}`)?.valor ?? u.valor;
            diasJaPagosDetalhe.push({data:u.data, turno:u.turno, valor:v});
            totalJaPago += v;
          }
          total = parseFloat(total.toFixed(2));
          totalJaPago = parseFloat(totalJaPago.toFixed(2));
          dobras = diasPagosList.length;
          diasTrabalhados = new Set(escPendentes.map(u=>u.data)).size;
          diasCodigo = [...new Set(diasPagosList.map(d=>d.data))].sort().map(d=>{
            const dd=new Date(d+'T12:00:00'); return `${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dd.getDay()]} ${d.substring(8,10)}/${d.substring(5,7)}`;
          }).join(', ');
        } // fim if/else isMotoboy

        const totalBrutoPeriodo = parseFloat((total + totalJaPago).toFixed(2));

        /* transporte */
        const valorTransp = R(fr.valorTransporte);
        const transpAdtBruto  = calcTransporteAdiantado(cid, mesIni2, mesFim2, saidasTranspMes);
        // Calcular quanto do adiantamento já foi consumido (saídas "Desconto Transporte" já pagas no mês)
        const transpJaConsumido = saidasTranspMes.filter((s:any) => {
          const t = s.tipo||s.origem||s.referencia||'';
          const dt = s.dataPagamento||s.data||'';
          return s.colaboradorId===cid && t==='Desconto Transporte'
            && dt>=mesIni2 && dt<=mesFim2
            && (s.pago===true || s.pago==='true' || s.pagamentoIdLigado);
        }).reduce((acc:number,s:any)=>acc+R(s.valor),0);
        const transpAdtMes   = Math.max(0, transpAdtBruto - transpJaConsumido);
        const transp          = valorTransp>0 ? diasTrabalhados * valorTransp : 0;
        const transp_adt      = Math.min(transpAdtMes, transp);
        const transp_saldo    = Math.max(0, transp - transp_adt);

        /* caixinha total (controle-motoboy + saídas Caixinha) — exclui já pagas */
        const saidasCaixFr = saidasPer.filter((s:any) => {
          const t = s.tipo||s.origem||s.referencia||'';
          const dt = s.dataPagamento||s.data||'';
          if (s.colaboradorId!==cid || t!=='Caixinha' || dt<isoInicio || dt>isoFim2) return false;
          // Excluir caixinhas já incorporadas a um pagamento anterior
          if (s.pago === true || s.pago === 'true' || s.pagamentoIdLigado) return false;
          return true;
        });
        const caixinhaSaidas = parseFloat(saidasCaixFr.reduce((s:number,x:any)=>s+R(x.valor),0).toFixed(2));
        const caixinhaTotal  = parseFloat((caixinhaSaidas + caixinhaCtrlMotoboy).toFixed(2));
        const caixinhaDetalhe = [
          ...saidasCaixFr.map((s:any)=>({descricao:`🪙 Caixinha: ${s.descricao||'Gorjeta'}`, valor:R(s.valor), data:s.dataPagamento||s.data||''})),
          ...caixinhaCtrlDetalhe,
        ];

        /* saídas desconto da semana — usar fonte expandida (mês completo se disponível)
           Range expandido +2 dias para incluir saídas criadas no dia do pagamento (Desconto Adto Esp, Desconto Transporte) */
        const TIPOS_DESC = new Set(['A pagar','A receber','Consumo Interno','Desconto Adiantamento Especial']);
        const fonteSaidas = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPer;
        const fimExp = new Date(new Date(isoFim2+'T12:00:00').getTime()+2*864e5).toISOString().slice(0,10);
        const saidasDescFr = fonteSaidas.filter((s:any) => {
          const t = s.tipo||s.origem||s.referencia||'';
          const dt = s.dataPagamento||s.data||'';
          if (!TIPOS_DESC.has(t)) return false;
          if (s.colaboradorId !== cid) return false;
          if (dt < isoInicio || dt > fimExp) return false;
          // Desc Adto Especial com adiantamentoId + pago = já abatido — MOSTRAR como info (não excluir)
          return true;
        });
        const saidasDesconto = parseFloat(saidasDescFr.reduce((s:number,x:any)=>s+R(x.valor),0).toFixed(2));
        const saidasDetalhe  = saidasDescFr.map((s:any)=>({descricao:s.descricao||s.tipo||'Desconto',valor:R(s.valor),data:s.dataPagamento||s.data||''}));

        /* pendentes anteriores */
        const pendentesAnteriores = saidasPendAnt.filter((s:any)=>s.colaboradorId===cid);

        /* saldo especial */
        const saldoEspecialAberto = saldos[cid] || 0;

        /* total líquido */
        const totalLiquido = parseFloat(Math.max(0, total + transp_saldo + caixinhaTotal - saidasDesconto).toFixed(2));

        /* pago? */
        const pago = diasJaPagosDetalhe.length>0 && dobras===0;
        const pagoParcial = diasJaPagosDetalhe.length>0 && dobras>0;

        if (dobras===0 && diasJaPagosDetalhe.length===0) return null;

        return {
          id: cid, nome: fr.nome, chavePix: fr.chavePix, telefone: fr.telefone||fr.celular,
          valorDia: vDia, valorNoite: vNoite, valorDobra: vDobra, valorTransporte: valorTransp,
          tipoAcordo: fr.tipoAcordo || null, acordo: fr.acordo || null,
          isValorTurno, resolverValorTurno,
          dobras, diasCodigo, diasTrabalhados,
          total, totalJaPago, totalBrutoPeriodo,
          diasPagos: diasPagosList, diasJaPagosDetalhe,
          ctrlLinhasDetalhe,  // detalhe chegada+entregas por linha (motoboy)
          totalTransporte: transp_saldo,
          transporteAdiantado: transp_adt, transporteAdiantadoBruto: transpAdtBruto, transporteAdiantadoMes: transpAdtMes, transporteJaConsumido: transpJaConsumido, transporteSemanasAnteriores: 0, transporteSaldo: transp_saldo,
          saidasDesconto, saidasDetalhe,
          totalLiquido, pago, pagoParcial,
          pendentesAnteriores, saldoEspecialAberto,
          periodoInicio: isoInicio, periodoFim: isoFim2,
          caixinhaTotal, caixinhaDetalhe,
          isMotoboy,
        };
      }).filter(Boolean);

      if (!frList.length) return null;
      const totalSemana = frList.reduce((s:number,f:any)=>s+f.totalLiquido,0);
      return {
        semanaLabel: semLabel,
        dataFechamento: isoFimBase,
        dataFechamentoBase: isoFimBase,
        dataInicioBase: isoInicio,
        dataFimEfetivo: isoFim2,
        freelancers: frList,
        totalSemana,
        totalCaixinha: 0, totalTransporte: 0, totalCombustivel: 0, totalExtra: 0, totalDesconto: 0, totalSaidasDesconto: 0, totalLiquido: totalSemana,
      };
    }).filter(Boolean);

    setFechamentos(result);
  };

  /* recalcular quando deps mudam */
  useEffect(() => {
    if (freelancers.length>0) {
      calcularFechamentos(freelancers, escalas, folhasDB, saidasPeriodo, saidasPendentesAnt, saldosEspeciais, motoboysFr, controlesMap);
    }
  }, [freelancers, escalas, mesAno, periodoIni, periodoFim, saidasPendentesAnt, folhasDB, saidasPeriodo, editFechamento, motoboysFr, controlesMap]);

  /* ═══════════════════════════════════════════════════════════════════════════
     Modal de Pagamento — cópia fiel do modal da FolhaPagamento
  ═══════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!modalPgto) return;
    const {fr, fech} = modalPgto;
    setFormaPgto('PIX'); setFormaPix(''); setFormaDin(''); setCheckItems([]);
    setAbaterEsp(fr.saldoEspecialAberto>0); setVlAbat('');
    setDataLocalPgto(new Date().toISOString().split('T')[0]);

    const buildChecklist = (saidasFrescas: any[]) => {
      const TIPOS_DESC = ['A pagar','A receber','Consumo Interno','Desconto Adiantamento Especial'];
      const TIPOS_CAIX = ['Caixinha'];
      const saidaData = (s:any) => s.dataPagamento||s.data||'';
      const rangeIni = fech.dataInicioBase;
      const rangeFim = fech.dataFimEfetivo||fech.dataFechamentoBase;
      const descFr = saidasFrescas.filter((s:any) => {
        const t = s.tipo||s.origem||s.referencia||'';
        if (s.colaboradorId !== fr.id) return false;
        if (!TIPOS_DESC.includes(t)) return false;
        if (saidaData(s) < rangeIni || saidaData(s) > rangeFim) return false;
        // Excluir saídas já vinculadas a um pagamento anterior (pagamentoIdLigado)
        if (s.pagamentoIdLigado) return false;
        // Excluir saídas já marcadas como pagas (pago=true) — já foram descontadas em pagamento anterior
        if (s.pago === true || s.pago === 'true') return false;
        return true;
      });
      const caixFr = saidasFrescas.filter((s:any)=>{
        if (s.colaboradorId!==fr.id) return false;
        if (!TIPOS_CAIX.includes(s.tipo||s.origem||s.referencia||'')) return false;
        const d = saidaData(s);
        if (d<rangeIni || d>rangeFim) return false;
        // Excluir caixinhas já incorporadas a um pagamento anterior
        if (s.pago === true || s.pago === 'true' || s.pagamentoIdLigado) return false;
        return true;
      });
      const obsValor = fr.isValorTurno
        ? `📅 Tabela variável por dia da semana`
        : (fr.valorDia>0||fr.valorNoite>0) ? `☀️ R$${fmt(fr.valorDia)}/dia + 🌙 R$${fmt(fr.valorNoite)}/noite` : `R$${fmt(fr.valorDobra)}/dobra`;
      const totalTransp = fr.diasTrabalhados * R(fr.valorTransporte);
      const transpAdto  = Math.min(fr.transporteAdiantado, totalTransp);
      const transpLabel = totalTransp>0
        ? (fr.transporteAdiantado>0
           ? `🚗 Transporte: ${fr.diasTrabalhados} dias × R$${fmt(R(fr.valorTransporte))} = R$${fmt(totalTransp)}${transpAdto>0?` — coberto pelo adto (R$${fmt(transpAdto)}) — saldo: R$${fmt(fr.transporteSaldo)}`:''}` 
           : `🚗 Transporte: ${fr.diasTrabalhados} dias × R$${fmt(R(fr.valorTransporte))} = R$${fmt(totalTransp)}`)
        : '';

      // Caixinha do controle-motoboy (já calculada em fr.caixinhaDetalhe)
      const caixCtrlItems = (fr.caixinhaDetalhe || [])
        .filter((d:any) => !caixFr.some((s:any) => (s.dataPagamento||s.data||'') === d.data)) // evitar duplicatas
        .map((d:any, i:number) => ({
          key: `caix_ctrl_${i}`,
          label: `🪙 ${d.descricao||'Caixinha'} (${d.data})`,
          valor: d.valor,
          tipo: 'credito' as const,
          checked: true,
        }));

      // Label do item principal: motoboy usa chegada + entregas, freelancer usa dobras
      const ctrlDet: {chegada:number;qtdEntregas:number;vlEntrega:number;totalEntregas:number}[] = fr.ctrlLinhasDetalhe || [];
      const isMotoboy = fr.isMotoboy === true && ctrlDet.length > 0;
      const labelPrincipal = (() => {
        if (isMotoboy) {
          const totalChegada  = parseFloat(ctrlDet.reduce((s,l)=>s+l.chegada,0).toFixed(2));
          const totalQtdEnt   = ctrlDet.reduce((s,l)=>s+l.qtdEntregas,0);
          const vlEnt         = ctrlDet[0]?.vlEntrega || 0;
          const totalEnt      = parseFloat(ctrlDet.reduce((s,l)=>s+l.totalEntregas,0).toFixed(2));
          const partes: string[] = [];
          if (totalChegada > 0) partes.push(`🏍️ Chegada: R$${fmt(totalChegada)}`);
          if (totalQtdEnt > 0)  partes.push(`📦 ${totalQtdEnt}× R$${fmt(vlEnt)} = R$${fmt(totalEnt)}`);
          return partes.join('  +  ') || `🏍️ Motoboy: R$${fmt(fr.total)}`;
        }
        return `Dobras (${fr.dobras}× ${obsValor})`;
      })();

      const items: any[] = [
        { key:'dobras', label: labelPrincipal, valor:fr.total, tipo:'credito', checked:true },
        ...(totalTransp>0?[{key:'transporte',label:transpLabel,valor:fr.transporteSaldo,tipo:'credito',checked:fr.transporteSaldo>0}]:[]),
        // Caixinha do controle-motoboy (para motoboys)
        ...caixCtrlItems,
        // Caixinha de saídas (para não-motoboys, ou complementar)
        ...(caixCtrlItems.length === 0
          ? caixFr.map((d:any,i:number)=>({key:`caix_${i}`,label:`🪙 Caixinha: ${d.descricao||'Gorjeta'} (${saidaData(d)})`,valor:R(d.valor),tipo:'credito',checked:true}))
          : []),
        ...descFr.map((d:any,i:number)=>({key:`desc_${i}`,label:`🔴 Desconto: ${d.descricao||d.tipo||'Desconto'} (${saidaData(d)})`,valor:R(d.valor),tipo:'debito',checked:true})),
        ...(fr.pendentesAnteriores||[]).map((p:any,i:number)=>({
          key:`pend_${i}`,
          label:`⏳ Pendente anterior: [${p.tipo||p.origem}] ${p.descricao||''} (${(p.dataPagamento||p.data||'').substring(0,10)})`,
          valor:R(p.valor),tipo:'debito',checked:false,
        })),
      ];
      setCheckItems(items);
    };

    const [ano3,mes3] = mesAno.split('-').map(Number);
    const dI3 = `${mesAno}-01`, dF3 = new Date(ano3,mes3,0).toISOString().split('T')[0];
    fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dI3}&dataFim=${dF3}`,{headers:{Authorization:`Bearer ${token()}`}})
      .then(r=>r.ok?r.json():[]).then(buildChecklist).catch(()=>buildChecklist(saidasPeriodo));
  }, [modalPgto]);

  const totalSelecionado = checkItems.reduce((s,it)=>it.checked?(it.tipo==='credito'?s+it.valor:s-it.valor):s, 0);
  const vlAbateN = abaterEsp ? (parseFloat(vlAbat)||0) : 0;
  const totalDesembolsar = Math.max(0, totalSelecionado - vlAbateN);
  const toggleItem = (key:string) => setCheckItems(prev=>prev.map(it=>it.key===key?{...it,checked:!it.checked}:it));

  const confirmarPagamento = async () => {
    if (!modalPgto) return;
    const {fr, fech} = modalPgto;
    setModalPgto(null); setSalvando(true);
    try {
      const creditoItems = checkItems.filter(it=>it.checked&&it.tipo==='credito');
      const debitoItems  = checkItems.filter(it=>it.checked&&it.tipo==='debito');
      const totalCredito = creditoItems.reduce((s:number,it:any)=>s+it.valor,0);
      const totalDebito  = debitoItems.reduce((s:number,it:any)=>s+it.valor,0);
      const vlAbate      = abaterEsp?(parseFloat(vlAbat)||0):0;
      const inclTransp   = checkItems.find(it=>it.key==='transporte')?.checked??false;
      const inclDobras   = checkItems.find(it=>it.key==='dobras')?.checked??false;
      const caixinhaChecked = checkItems.filter(it=>it.checked&&it.key.startsWith('caix_')).reduce((s:number,it:any)=>s+it.valor,0);
      void totalCredito; void totalDebito;

      const diasParaPagar: {data:string;turno:string;valor:number;tipoCodigo:string}[] = [];
      if (inclDobras && fr.diasPagos) {
        for (const dp of fr.diasPagos) {
          const turno = dp.turno||'Dia';
          if (turno==='DiaNoite'||turno==='DN') {
            diasParaPagar.push({data:dp.data,turno:'Dia',  valor:fr.resolverValorTurno?fr.resolverValorTurno(dp.data,'Dia'):(R(fr.valorDia)||dp.valor/2),tipoCodigo:'freelancer-dia'});
            diasParaPagar.push({data:dp.data,turno:'Noite',valor:fr.resolverValorTurno?fr.resolverValorTurno(dp.data,'Noite'):(R(fr.valorNoite)||dp.valor/2),tipoCodigo:'freelancer-noite'});
          } else {
            diasParaPagar.push({data:dp.data,turno,valor:dp.valor,tipoCodigo:turno==='Dia'?'freelancer-dia':'freelancer-noite'});
          }
        }
      }

      const valorBrutoDobras  = diasParaPagar.reduce((s:number,d:any)=>s+d.valor,0);
      const valorTranspSaldo  = (inclTransp&&fr.transporteSaldo>0)?fr.transporteSaldo:0;
      const valorBrutoLote    = valorBrutoDobras + valorTranspSaldo + caixinhaChecked;
      const valorDescSaidas   = totalDebito;
      const valorAbatEsp2     = vlAbate;
      const valorLiquido      = Math.max(0, valorBrutoLote - valorDescSaidas - valorAbatEsp2);
      const obsLabel = fr.isValorTurno
        ? `tabela variável (${diasParaPagar.map((d:any)=>`${d.data.slice(8)}/${d.data.slice(5,7)}${d.turno==='Dia'?'D':'N'}=R$${fmt(d.valor)}`).join(', ')})`
        : (fr.valorDia>0||fr.valorNoite>0)?`D=R$${fmt(fr.valorDia)} N=R$${fmt(fr.valorNoite)}`:`R$${fmt(fr.valorDobra)}/dobra`;

      const obsText = `Freelancer sem. ${fech.semanaLabel} - ${fr.dobras} dobras - ${obsLabel} - ${formaPgto}${fr.transporteAdiantado>0?` - Transp. adiant.: R$${fmt(fr.transporteAdiantado)}`:''}${caixinhaChecked>0?` - Caixinha: +R$${fmt(caixinhaChecked)}`:''}${totalDebito>0?` - Desc. saídas: R$${fmt(totalDebito)}`:''}${vlAbate>0?` - Abat. adto.esp.: R$${fmt(vlAbate)}`:''} - Líquido: R$${fmt(valorLiquido)}`;

      /* ── P0.4: Montar operações para pagamento atômico (TransactWriteItems) ── */
      const operacoes: any[] = [];

      // 1) Turnos (folha-pagamento)
      for (const dp of diasParaPagar) {
        operacoes.push({ tipo:'folha-turno', data:dp.data, turno:dp.turno, valor:dp.valor, tipoCodigo:dp.tipoCodigo, obs:obsText });
      }

      // 2) Transporte
      if (inclTransp && fr.transporteSaldo>0) {
        operacoes.push({ tipo:'folha-transporte', data:fech.dataFechamento, valor:fr.transporteSaldo, obs:`Transporte sem. ${fech.semanaLabel} - ${fr.diasPagos?.length||0} dias - R$${fmt(fr.transporteSaldo)}` });
      }

      // 3) Desconto Transporte automático por dia
      if (R(fr.valorTransporte)>0 && inclDobras && fr.diasPagos?.length>0) {
        const diasUnicos = Array.from(new Set(fr.diasPagos.map((dp:any)=>dp.data))).sort() as string[];
        let saldoDisp = R(fr.transporteAdiantado);
        for (const data of diasUnicos) {
          const excede = saldoDisp < R(fr.valorTransporte);
          operacoes.push({ tipo:'saida-criar', tipoSaida:'Desconto Transporte', descricao:`Transporte do dia ${data} (consumo do adto.)`, valor:R(fr.valorTransporte), data, dataPagamento:data, pago:true, excedeAdto:excede, responsavel:responsavelEmail, responsavelId, obs:`Auto-gerado ao confirmar pagamento sem. ${fech.semanaLabel}${excede?' [excede adto]':''}` });
          saldoDisp = Math.max(0, saldoDisp - R(fr.valorTransporte));
        }
      }

      // 4) Abatimento especial
      if (abaterEsp && vlAbate>0) {
        operacoes.push({ tipo:'saida-criar', tipoSaida:'Desconto Adiantamento Especial', descricao:`Abatimento adto. especial - pgto sem. ${fech.semanaLabel}`, valor:vlAbate, data:dataLocalPgto, dataPagamento:dataLocalPgto, pago:true, responsavel:responsavelEmail, responsavelId, obs:`Abatido no pagamento da semana ${fech.semanaLabel}` });
      }

      // 5) Marcar saídas/descontos da semana como pagas (consumo, a receber, caixinhas)
      {
        const rangeIni = fr.periodoInicio || fech.dataInicioBase;
        const rangeFim = fr.periodoFim || fech.dataFechamento;
        const TIPOS_MARCAR = new Set(['A pagar','A receber','Consumo Interno','Caixinha']);
        const saidasParaMarcar = saidasPeriodo.filter((s:any) => {
          const t = s.tipo||s.origem||s.referencia||'';
          const dt = s.dataPagamento||s.data||'';
          return s.colaboradorId===fr.id && TIPOS_MARCAR.has(t) && dt>=rangeIni && dt<=rangeFim
            && s.pago !== true && s.pago !== 'true' && !s.pagamentoIdLigado;
        });
        for (const sc of saidasParaMarcar) {
          operacoes.push({ tipo:'saida-atualizar', id:sc.id, obs:`${sc.obs||''} [Pago no lote sem. ${fech.semanaLabel}]`.trim() });
        }
      }

      // 6) Payslip automático
      const semLabel = fech.semanaLabel || `${fech.dataInicioBase}-${fech.dataFechamento}`;
      const periodoKey = `${mesAno}-${semLabel.replace(/[^\w]/g,'')}`;
      operacoes.push({ tipo:'payslip', periodo:periodoKey, periodoInicio:fech.dataInicioBase||fech.dataFechamento, periodoFim:fech.dataFechamento, bruto:valorBrutoLote, transporte:valorTranspSaldo, descontos:valorDescSaidas+valorAbatEsp2, adiantamentos:R(fr.transporteAdiantado)||0, liquido:valorLiquido, nomeColaborador:fr.nome });

      // ── Enviar tudo de uma vez (atômico) ──
      const resp = await fetchAuth(`${apiUrl}/pagamento-batch`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},
        body:JSON.stringify({
          colaboradorId:fr.id, unitId, mes: (fech.dataInicioBase || fech.dataFechamento || '').slice(0,7) || mesAno, semana:fech.dataFechamento,
          dataPagamento:dataLocalPgto, formaPagamento:formaPgto,
          ...auditoriaCampos(),
          valorBruto:valorBrutoLote, valorDescSaidas, valorAbatEsp:valorAbatEsp2, valorLiquido,
          obs:obsText,
          operacoes,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(()=>null);
        throw new Error(errData?.message || `HTTP ${resp.status}`);
      }

      await carregarDados();
    } catch(err) { alert('Erro ao salvar pagamento: '+err); }
    finally { setSalvando(false); }
  };

  /* desfazer pagamento */
  const desfazerPagamento = async (fr: any, fech: any) => {
    if (!window.confirm(`Desfazer pagamento de ${fr.nome} — semana ${fech.semanaLabel}?`)) return;
    setSalvando(true);
    try {
      const diasPagosNovos = folhasDB.filter((f:any)=>
        f.colaboradorId===fr.id && f.tipo==='freelancer-dia' &&
        f.data>=fech.dataInicioBase && f.data<=fech.dataFechamento && f.pago
      );
      if (diasPagosNovos.length>0) {
        await fetchAuth(`${apiUrl}/folha-pagamento`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({
          colaboradorId:fr.id,mes:mesAno,semana:fech.dataFechamento,unitId,pago:false,
          dias:diasPagosNovos.map((d:any)=>({data:d.data,turno:d.turno,valor:d.valor})),
        })});
      } else {
        await fetchAuth(`${apiUrl}/folha-pagamento`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({
          colaboradorId:fr.id,mes:mesAno,semana:fech.dataFechamento,unitId,pago:false,dataPagamento:null,diasPagos:[],
        })});
      }
      await carregarDados();
    } catch(err){ alert('Erro: '+err); }
    finally{ setSalvando(false); }
  };

  /* ─── Styles ── */
  const s = {
    card:  { backgroundColor:'white', border:'1px solid #e0e0e0', borderRadius:'8px', padding:'16px', boxShadow:'0 2px 4px rgba(0,0,0,.06)' },
    th:    { backgroundColor:'#c2185b', color:'white', padding:'8px 10px', fontSize:'12px', whiteSpace:'nowrap' as const, textAlign:'left' as const },
    td:    { padding:'8px 10px', borderBottom:'1px solid #fce4ec', fontSize:'12px', verticalAlign:'middle' as const },
    input: { padding:'7px 10px', border:'1px solid #ccc', borderRadius:'6px', fontSize:'13px', width:'100%', boxSizing:'border-box' as const },
    label: { display:'block' as const, fontSize:'11px', fontWeight:'bold' as const, color:'#666', marginBottom:'3px' },
    btn:   (bg:string) => ({ padding:'8px 14px', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:'bold' as const, cursor:'pointer', backgroundColor:bg, color:'white' }),
    badge: (bg:string,cl:string) => ({ padding:'3px 10px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold' as const, backgroundColor:bg, color:cl }),
  };

  /* totais */
  const totalFreelancerMes = fechamentos.reduce((s:number,f:any)=>s+(f?.totalLiquido||0),0);

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f5f5f5', display:'flex', flexDirection:'column' }}>
      <Header title="Pagamento de Freelancers" />
      {/* Modal pagamento */}
      {modalPgto && (() => {
        const {fr, fech} = modalPgto;
        const totalTranspSemana = fr.diasTrabalhados * R(fr.valorTransporte);
        return (
          <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,.55)',zIndex:10002,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setModalPgto(null)}>
            <div style={{...s.card,maxWidth:'520px',width:'96%',maxHeight:'92vh',overflowY:'auto',padding:'24px'}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                <h3 style={{margin:0,color:'#c2185b'}}>✅ Confirmar Pagamento Freelancer</h3>
                <button onClick={()=>setModalPgto(null)} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{backgroundColor:'#fce4ec',borderRadius:'6px',padding:'10px 14px',marginBottom:'14px',fontSize:'13px'}}>
                <div style={{fontWeight:'bold',color:'#880e4f',fontSize:'15px'}}>{fr.nome}</div>
                <div style={{color:'#c2185b',marginTop:'2px'}}>Semana {fech.semanaLabel}</div>
                {fr.chavePix && <div style={{marginTop:'4px',fontSize:'12px',color:'#666'}}>💳 PIX: <strong>{fr.chavePix}</strong>
                  <button onClick={()=>navigator.clipboard.writeText(fr.chavePix)} style={{marginLeft:'8px',padding:'1px 6px',fontSize:'10px',border:'none',borderRadius:'3px',backgroundColor:'#43a047',color:'white',cursor:'pointer'}}>📋</button></div>}
              </div>
              {(fr.transporteAdiantadoMes>0 || fr.totalTransporte>0) && (
                <div style={{backgroundColor:'#e8f5e9',border:'1px solid #a5d6a7',borderLeft:'4px solid #388e3c',borderRadius:'6px',padding:'10px 14px',marginBottom:'12px',fontSize:'12px'}}>
                  <div style={{fontWeight:'bold',color:'#2e7d32',fontSize:'13px',marginBottom:'6px'}}>🚗 Conta Transporte (saldo separado)</div>
                  <div style={{color:'#1b5e20',lineHeight:'1.7',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 14px'}}>
                    <div>📥 Adiantado no mês: <strong>{fmtMoeda(fr.transporteAdiantadoBruto)}</strong></div>
                    <div>🚗 Transp. desta semana: <strong>{fmtMoeda(totalTranspSemana)}</strong></div>
                    {fr.transporteJaConsumido > 0 && <div>✅ Já descontado: <strong style={{color:'#e65100'}}>-{fmtMoeda(fr.transporteJaConsumido)}</strong></div>}
                    <div>💰 Disponível: <strong style={{color:fr.transporteAdiantadoMes>0?'#388e3c':'#c62828'}}>{fmtMoeda(fr.transporteAdiantadoMes)}</strong></div>
                    <div>🟢 Saldo a pagar: <strong>{fmtMoeda(fr.transporteSaldo)}</strong></div>
                  </div>
                </div>
              )}
              {/* checklist */}
              <div style={{marginBottom:'14px'}}>
                <div style={{fontSize:'12px',fontWeight:'bold',color:'#444',marginBottom:'8px'}}>☑️ Selecione os itens:</div>
                <div style={{border:'1px solid #e0e0e0',borderRadius:'6px',overflow:'hidden'}}>
                  {checkItems.map((item,i)=>(
                    <label key={item.key} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 12px',cursor:'pointer',
                      backgroundColor:item.checked?(item.tipo==='debito'?'#fff3e0':'#f1f8e9'):'#f9f9f9',
                      borderBottom:i<checkItems.length-1?'1px solid #eee':'none'}}>
                      <input type="checkbox" checked={item.checked} onChange={()=>toggleItem(item.key)} style={{width:'16px',height:'16px',cursor:'pointer',accentColor:item.tipo==='credito'?'#43a047':'#e65100'}} />
                      <span style={{flex:1,fontSize:'12px',color:'#333'}}>{item.label}</span>
                      <span style={{fontWeight:'bold',fontSize:'13px',minWidth:'80px',textAlign:'right',color:item.tipo==='credito'?'#2e7d32':'#c62828',opacity:item.checked?1:0.35}}>
                        {item.tipo==='credito'?'+':'-'}{fmtMoeda(item.valor)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {/* total */}
              <div style={{backgroundColor:totalSelecionado>=0?'#e8f5e9':'#ffebee',borderRadius:'6px',padding:'10px 14px',marginBottom:'14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'13px',fontWeight:'bold',color:'#444'}}>{vlAbateN>0?'🧾 Subtotal bruto:':'💰 Total a pagar:'}</span>
                  <span style={{fontSize:vlAbateN>0?'15px':'20px',fontWeight:'bold',color:totalSelecionado>=0?'#2e7d32':'#c62828'}}>{fmtMoeda(Math.max(0,totalSelecionado))}</span>
                </div>
                {vlAbateN>0 && <>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'4px'}}>
                    <span style={{fontSize:'12px',color:'#7c3aed'}}>➖ Abatimento adto. especial:</span>
                    <span style={{fontSize:'13px',fontWeight:'bold',color:'#7c3aed'}}>-{fmtMoeda(vlAbateN)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'6px',borderTop:'1px solid #c3d9c3',paddingTop:'6px'}}>
                    <span style={{fontSize:'13px',fontWeight:'bold',color:'#444'}}>💰 A desembolsar:</span>
                    <span style={{fontSize:'20px',fontWeight:'bold',color:'#2e7d32'}}>{fmtMoeda(totalDesembolsar)}</span>
                  </div>
                </>}
              </div>
              {/* abatimento especial */}
              {(fr.saldoEspecialAberto||0)>0 && (
                <div style={{backgroundColor:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:'8px',padding:'12px 14px',marginBottom:'14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                    <input type="checkbox" id="abaterCheck" checked={abaterEsp} onChange={e=>{setAbaterEsp(e.target.checked);if(!e.target.checked)setVlAbat('');}} style={{width:'16px',height:'16px',accentColor:'#7c3aed',cursor:'pointer'}} />
                    <label htmlFor="abaterCheck" style={{fontWeight:700,color:'#5b21b6',fontSize:'13px',cursor:'pointer'}}>➖ Abater Adiantamento Especial em aberto</label>
                    <span style={{marginLeft:'auto',fontSize:'12px',color:'#7c3aed',fontWeight:700}}>Saldo: {fmtMoeda(fr.saldoEspecialAberto)}</span>
                  </div>
                  {abaterEsp && <div>
                    <label style={{...s.label,fontSize:'11px',color:'#5b21b6'}}>Valor a abater (R$)</label>
                    <input type="number" step="0.01" min="0.01" max={fr.saldoEspecialAberto} value={vlAbat} placeholder={`máx. ${fmtMoeda(fr.saldoEspecialAberto)}`} onChange={e=>setVlAbat(e.target.value)} style={{...s.input,fontSize:'12px',borderColor:'#a78bfa'}} />
                    <div style={{fontSize:'11px',color:'#6d28d9',marginTop:'4px'}}>Saldo restante: <strong>{fmtMoeda(Math.max(0,fr.saldoEspecialAberto-(parseFloat(vlAbat)||0)))}</strong></div>
                  </div>}
                </div>
              )}
              {/* forma */}
              <div style={{marginBottom:'14px'}}>
                <label style={s.label}>💳 Forma de pagamento</label>
                <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
                  {(['PIX','Dinheiro','Misto'] as const).map(f=>(
                    <button key={f} onClick={()=>setFormaPgto(f)} style={{flex:1,padding:'8px 6px',border:`2px solid ${formaPgto===f?'#c2185b':'#e0e0e0'}`,borderRadius:'6px',background:formaPgto===f?'#fce4ec':'white',fontWeight:formaPgto===f?700:400,cursor:'pointer',fontSize:'12px',color:formaPgto===f?'#880e4f':'#555'}}>
                      {f==='PIX'?'📱 PIX':f==='Dinheiro'?'💵 Dinheiro':'🔄 Misto'}
                    </button>
                  ))}
                </div>
                {formaPgto==='Misto' && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  <div><label style={{...s.label,fontSize:'11px'}}>Valor PIX (R$)</label><input type="number" step="0.01" min="0" value={formaPix} placeholder="0,00" onChange={e=>setFormaPix(e.target.value)} style={{...s.input,fontSize:'12px',padding:'6px'}} /></div>
                  <div><label style={{...s.label,fontSize:'11px'}}>Valor Dinheiro (R$)</label><input type="number" step="0.01" min="0" value={formaDin} placeholder="0,00" onChange={e=>setFormaDin(e.target.value)} style={{...s.input,fontSize:'12px',padding:'6px'}} /></div>
                </div>}
              </div>
              {/* data */}
              <div style={{marginBottom:'16px'}}>
                <label style={s.label}>Data do pagamento</label>
                <input type="date" value={dataLocalPgto} onChange={e=>setDataLocalPgto(e.target.value)} style={s.input} />
              </div>
              {totalSelecionado<0 && <div style={{backgroundColor:'#fff3e0',border:'1px solid #ff9800',borderRadius:'6px',padding:'10px 14px',marginBottom:'10px',fontSize:'12px',color:'#e65100'}}>
                ⚠️ <strong>Saldo negativo: {fmtMoeda(Math.abs(totalSelecionado))}</strong> a favor do restaurante. Os descontos excedem o valor a pagar.
              </div>}
              <div style={{display:'flex',gap:'10px'}}>
                <button disabled={salvando} onClick={confirmarPagamento} style={{...s.btn('#43a047'),flex:1}}>
                  {salvando?'⏳ Salvando...':`✅ Confirmar ${fmtMoeda(totalDesembolsar)}`}
                </button>
                <button onClick={()=>setModalPgto(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal detalhe */}
      {detalhe && (() => {
        const fr = detalhe.fr;
        const fech = detalhe.fech;
        // ── todos os turnos: pendentes + já pagos ──
        const todosTurnos: {data:string;turno:string;valor:number;pago:boolean}[] = [
          ...(fr.diasJaPagosDetalhe||[]).map((d:any)=>({...d,pago:true})),
          ...(fr.diasPagos||[]).map((d:any)=>({...d,pago:false})),
        ].sort((a,b)=>a.data.localeCompare(b.data)||(a.turno.localeCompare(b.turno)));
        // ── detalhe por linha do controle-motoboy (chegada + entregas separados) ──
        const ctrlLinhasDetalhe: {data:string;turno:string;chegada:number;qtdEntregas:number;vlEntrega:number;totalEntregas:number;vlLinha:number;pago:boolean}[] =
          fr.ctrlLinhasDetalhe || [];
        const isMotoboy = fr.isMotoboy === true;
        // ── dias únicos com presença ──
        const diasUnicos = Array.from(new Set(todosTurnos.map(t=>t.data))).sort();
        const valorTranspDia = R(fr.valorTransporte);
        // ── saídas: só consumo/descontos reais (excluir automáticos) ──
        const EXCLUIR_SAIDA = new Set(['Desconto Transporte','Desconto Adiantamento Especial','Caixinha']);
        const saidasReais = detalhe.saidasSemana.filter((s2:any)=>{
          const t = s2.tipo||s2.origem||s2.referencia||'';
          return !EXCLUIR_SAIDA.has(t);
        });
        // desconto adiantamento especial (automático — exibir separado)
        const abatEspSaidas = detalhe.saidasSemana.filter((s2:any)=>{
          const t = s2.tipo||s2.origem||s2.referencia||'';
          return t==='Desconto Adiantamento Especial';
        });
        // ── totais ──
        const totalTurnos = todosTurnos.reduce((s,t)=>s+t.valor,0);
        const totalTransp = valorTranspDia>0 ? diasUnicos.length*valorTranspDia : 0;
        // Caixinha do controle-motoboy (fr.caixinhaDetalhe) + saídas tipo Caixinha da semana
        const caixinhaDet = fr.caixinhaDetalhe || [];
        const totalCaixinha = parseFloat((R(fr.caixinhaTotal) || caixinhaDet.reduce((s:number,d:any)=>s+R(d.valor),0)).toFixed(2));
        const totalBruto  = totalTurnos + totalTransp + totalCaixinha;
        const totalDesc   = saidasReais.reduce((s:number,x:any)=>s+R(x.valor),0);
        const totalAbat   = abatEspSaidas.reduce((s:number,x:any)=>s+R(x.valor),0);
        const totalLiq    = Math.max(0, totalBruto - totalDesc - totalAbat - R(fr.transporteAdiantado));
        const thDet:React.CSSProperties = {...s.th,fontSize:'11px',padding:'5px 8px'};
        const tdDet:React.CSSProperties = {...s.td,padding:'5px 8px',fontSize:'11px'};
        return (
          <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,.55)',zIndex:10001,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setDetalhe(null)}>
            <div style={{...s.card,maxWidth:'720px',width:'96%',maxHeight:'92vh',overflowY:'auto',padding:'20px'}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                <h3 style={{margin:0,color:'#c2185b',fontSize:'16px'}}>📋 Detalhamento — {fr.nome}</h3>
                <button onClick={()=>setDetalhe(null)} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{fontSize:'12px',color:'#666',marginBottom:'14px'}}>Semana <strong>{fech.semanaLabel}</strong></div>

              {/* ── CRÉDITOS: motoboy (chegada + entregas detalhados) ── */}
              {isMotoboy && ctrlLinhasDetalhe.length>0 ? (
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontWeight:'bold',fontSize:'12px',color:'#2e7d32',marginBottom:'6px'}}>
                    🏍️ Créditos — Motoboy ({ctrlLinhasDetalhe.length} dia(s))
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                    <thead><tr>
                      {['Data','Turno','Chegada','Entregas','Total dia','Status'].map(h=><th key={h} style={thDet}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {ctrlLinhasDetalhe.map((l,i)=>{
                        const dd = new Date(l.data+'T12:00:00');
                        const diaSem = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dd.getDay()];
                        const dataFmt = `${l.data.slice(8)}/${l.data.slice(5,7)} ${diaSem}`;
                        const turnoLabel = l.turno==='Dia'?'☀️ Dia':l.turno==='Noite'?'🌙 Noite':l.turno==='DiaNoite'?'☀️🌙':l.turno;
                        return (
                          <tr key={i} style={{backgroundColor:l.pago?'#f1f8e9':i%2===0?'#fafafa':'white',borderLeft:l.pago?'3px solid #a5d6a7':'3px solid transparent'}}>
                            <td style={tdDet}>{dataFmt}</td>
                            <td style={tdDet}>{turnoLabel}</td>
                            <td style={{...tdDet,textAlign:'right',color:l.pago?'#888':'#e65100'}}>+{fmtMoeda(l.chegada)}</td>
                            <td style={{...tdDet,textAlign:'right',color:l.pago?'#888':'#1565c0'}}>
                              {l.qtdEntregas>0 ? `${l.qtdEntregas}×${fmtMoeda(l.vlEntrega)} = +${fmtMoeda(l.totalEntregas)}` : '—'}
                            </td>
                            <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:l.pago?'#888':'#2e7d32'}}>+{fmtMoeda(l.vlLinha)}</td>
                            <td style={{...tdDet,textAlign:'center'}}>
                              <span style={{padding:'2px 7px',borderRadius:'8px',fontSize:'10px',fontWeight:'bold',
                                backgroundColor:l.pago?'#e8f5e9':'#fff9c4',color:l.pago?'#2e7d32':'#f57f17'}}>
                                {l.pago?'✅ Pago':'⏳ Pend.'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{backgroundColor:'#e8f5e9'}}>
                        <td colSpan={4} style={{...tdDet,fontWeight:'bold',color:'#1b5e20'}}>Subtotal motoboy</td>
                        <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#1b5e20'}}>+{fmtMoeda(totalTurnos)}</td>
                        <td/>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
              /* ── CRÉDITOS: turnos (freelancer padrão) ── */
              <div style={{marginBottom:'14px'}}>
                <div style={{fontWeight:'bold',fontSize:'12px',color:'#2e7d32',marginBottom:'6px'}}>
                  💰 Créditos — Turnos ({todosTurnos.length})
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                  <thead><tr>
                    {['Data','Dia semana','Turno','Valor','Status'].map(h=><th key={h} style={thDet}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {todosTurnos.length===0
                      ? <tr><td colSpan={5} style={{...tdDet,textAlign:'center',color:'#aaa'}}>Nenhum turno com presença</td></tr>
                      : todosTurnos.map((t,i)=>{
                        const dd = new Date(t.data+'T12:00:00');
                        const diaSem = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dd.getDay()];
                        const turnoLabel = t.turno==='Dia'?'☀️ Dia':t.turno==='Noite'?'🌙 Noite':t.turno;
                        return (
                          <tr key={i} style={{backgroundColor:t.pago?'#f1f8e9':i%2===0?'#fafafa':'white',borderLeft:t.pago?'3px solid #a5d6a7':'3px solid transparent'}}>
                            <td style={tdDet}>{t.data}</td>
                            <td style={tdDet}>{diaSem}</td>
                            <td style={tdDet}>{turnoLabel}</td>
                            <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#2e7d32'}}>+{fmtMoeda(t.valor)}</td>
                            <td style={{...tdDet,textAlign:'center'}}>
                              <span style={{padding:'2px 7px',borderRadius:'8px',fontSize:'10px',fontWeight:'bold',
                                backgroundColor:t.pago?'#e8f5e9':'#fff9c4',color:t.pago?'#2e7d32':'#f57f17'}}>
                                {t.pago?'✅ Pago':'⏳ Pend.'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    }
                    <tr style={{backgroundColor:'#e8f5e9'}}>
                      <td colSpan={3} style={{...tdDet,fontWeight:'bold',color:'#1b5e20'}}>Subtotal turnos</td>
                      <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#1b5e20'}}>+{fmtMoeda(totalTurnos)}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
              )}

              {/* ── CRÉDITOS: transporte ── */}
              {valorTranspDia>0 && diasUnicos.length>0 && (
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontWeight:'bold',fontSize:'12px',color:'#1565c0',marginBottom:'6px'}}>
                    🚗 Transporte ({diasUnicos.length} dia(s) × {fmtMoeda(valorTranspDia)}/dia = {fmtMoeda(totalTransp)})
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                    <thead><tr>
                      {['Data','Valor/dia','Adiantado','Saldo'].map(h=><th key={h} style={{...thDet,backgroundColor:'#1565c0'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {diasUnicos.map((data,i)=>(
                        <tr key={i} style={{backgroundColor:i%2===0?'#e3f2fd':'#bbdefb20'}}>
                          <td style={tdDet}>{data}</td>
                          <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#1565c0'}}>+{fmtMoeda(valorTranspDia)}</td>
                          <td style={{...tdDet,textAlign:'right',color:'#e65100'}}>
                            {fr.transporteAdiantado>0 ? `-${fmtMoeda(R(fr.transporteAdiantado)/diasUnicos.length)}` : '—'}
                          </td>
                          <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#2e7d32'}}>
                            {fmtMoeda(Math.max(0, valorTranspDia - (fr.transporteAdiantado>0?R(fr.transporteAdiantado)/diasUnicos.length:0)))}
                          </td>
                        </tr>
                      ))}
                      <tr style={{backgroundColor:'#bbdefb'}}>
                        <td style={{...tdDet,fontWeight:'bold',color:'#0d47a1'}}>Total transporte</td>
                        <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#1565c0'}}>+{fmtMoeda(totalTransp)}</td>
                        <td style={{...tdDet,textAlign:'right',color:'#e65100'}}>{fr.transporteAdiantado>0?`-${fmtMoeda(R(fr.transporteAdiantado))}`:'—'}</td>
                        <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#2e7d32'}}>{fmtMoeda(R(fr.transporteSaldo))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── DÉBITOS: consumo/descontos reais ── */}
              {saidasReais.length>0 && (
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontWeight:'bold',fontSize:'12px',color:'#c62828',marginBottom:'6px'}}>
                    💸 Débitos — Descontos ({saidasReais.length})
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                    <thead><tr>
                      {['Tipo','Descrição','Valor','Data'].map(h=><th key={h} style={{...thDet,backgroundColor:'#c62828'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {saidasReais.map((s2:any,i:number)=>(
                        <tr key={i} style={{backgroundColor:i%2===0?'#ffebee':'#fff'}}>
                          <td style={tdDet}>{s2.tipo||s2.origem||'—'}</td>
                          <td style={tdDet}>{s2.descricao||'—'}</td>
                          <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#c62828'}}>-{fmtMoeda(R(s2.valor))}</td>
                          <td style={tdDet}>{s2.dataPagamento||s2.data||'—'}</td>
                        </tr>
                      ))}
                      <tr style={{backgroundColor:'#ffcdd2'}}>
                        <td colSpan={2} style={{...tdDet,fontWeight:'bold',color:'#b71c1c'}}>Total descontos</td>
                        <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#b71c1c'}}>-{fmtMoeda(totalDesc)}</td>
                        <td/>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── CRÉDITOS: caixinha do controle-motoboy ── */}
              {totalCaixinha>0 && (
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontWeight:'bold',fontSize:'12px',color:'#00838f',marginBottom:'6px'}}>
                    🪙 Caixinha / Gorjeta
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                    <thead><tr>
                      {['Descrição','Data','Valor'].map(h=><th key={h} style={{...thDet,backgroundColor:'#00838f'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {caixinhaDet.length>0
                        ? caixinhaDet.map((d:any,i:number)=>(
                            <tr key={i} style={{backgroundColor:i%2===0?'#e0f7fa':'#fff'}}>
                              <td style={tdDet}>{d.descricao||'🪙 Caixinha'}</td>
                              <td style={tdDet}>{d.data||'—'}</td>
                              <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#00838f'}}>+{fmtMoeda(R(d.valor))}</td>
                            </tr>
                          ))
                        : <tr><td colSpan={3} style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#00838f'}}>+{fmtMoeda(totalCaixinha)}</td></tr>
                      }
                      <tr style={{backgroundColor:'#b2ebf2'}}>
                        <td colSpan={2} style={{...tdDet,fontWeight:'bold',color:'#006064'}}>Total caixinha</td>
                        <td style={{...tdDet,textAlign:'right',fontWeight:'bold',color:'#006064'}}>+{fmtMoeda(totalCaixinha)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Abatimento especial (gerado automaticamente — informativo) ── */}
              {abatEspSaidas.length>0 && (
                <div style={{marginBottom:'14px',backgroundColor:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:'6px',padding:'10px 12px'}}>
                  <div style={{fontWeight:'bold',fontSize:'12px',color:'#6d28d9',marginBottom:'4px'}}>➖ Abatimento Adiantamento Especial</div>
                  {abatEspSaidas.map((s2:any,i:number)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'#5b21b6',marginTop:'2px'}}>
                      <span>{s2.descricao||'Abatimento automático'}</span>
                      <span style={{fontWeight:'bold'}}>-{fmtMoeda(R(s2.valor))}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Resumo final ── */}
              <div style={{backgroundColor:'#1b5e20',borderRadius:'8px',padding:'12px 16px',color:'white'}}>
                <div style={{fontSize:'12px',fontWeight:'bold',marginBottom:'8px',borderBottom:'1px solid rgba(255,255,255,.3)',paddingBottom:'6px'}}>
                  📊 Resumo do pagamento
                </div>
                <div style={{display:'grid',gap:'4px',fontSize:'12px'}}>
                  {totalTurnos>0 && isMotoboy && ctrlLinhasDetalhe.length>0 ? (<>
                    {/* Motoboy: chegada + entregas separados */}
                    {ctrlLinhasDetalhe.reduce((s,l)=>s+l.chegada,0)>0 && <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span>🏍️ Chegada ({ctrlLinhasDetalhe.length}x)</span>
                      <span style={{fontWeight:'bold'}}>+{fmtMoeda(ctrlLinhasDetalhe.reduce((s,l)=>s+l.chegada,0))}</span>
                    </div>}
                    {ctrlLinhasDetalhe.reduce((s,l)=>s+l.totalEntregas,0)>0 && <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span>📦 Entregas ({ctrlLinhasDetalhe.reduce((s,l)=>s+l.qtdEntregas,0)}×{fmtMoeda(ctrlLinhasDetalhe[0]?.vlEntrega||0)})</span>
                      <span style={{fontWeight:'bold'}}>+{fmtMoeda(ctrlLinhasDetalhe.reduce((s,l)=>s+l.totalEntregas,0))}</span>
                    </div>}
                  </>) : totalTurnos>0 ? (
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span>💰 Turnos ({todosTurnos.length}x)</span>
                      <span style={{fontWeight:'bold'}}>+{fmtMoeda(totalTurnos)}</span>
                    </div>
                  ) : null}
                  {totalTransp>0 && <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span>🚗 Transporte ({diasUnicos.length} dia(s))</span>
                    <span style={{fontWeight:'bold'}}>+{fmtMoeda(totalTransp)}</span>
                  </div>}
                  {totalCaixinha>0 && <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span>🪙 Caixinha ({caixinhaDet.length||1}x)</span>
                    <span style={{fontWeight:'bold'}}>+{fmtMoeda(totalCaixinha)}</span>
                  </div>}
                  {R(fr.transporteAdiantado)>0 && <div style={{display:'flex',justifyContent:'space-between',color:'#ffcc80'}}>
                    <span>✔ Transp. já adiantado</span>
                    <span style={{fontWeight:'bold'}}>-{fmtMoeda(R(fr.transporteAdiantado))}</span>
                  </div>}
                  {totalDesc>0 && <div style={{display:'flex',justifyContent:'space-between',color:'#ef9a9a'}}>
                    <span>💸 Descontos ({saidasReais.length}x)</span>
                    <span style={{fontWeight:'bold'}}>-{fmtMoeda(totalDesc)}</span>
                  </div>}
                  {totalAbat>0 && <div style={{display:'flex',justifyContent:'space-between',color:'#ce93d8'}}>
                    <span>➖ Abat. adto. especial</span>
                    <span style={{fontWeight:'bold'}}>-{fmtMoeda(totalAbat)}</span>
                  </div>}
                  <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(255,255,255,.4)',marginTop:'6px',paddingTop:'6px',fontSize:'15px'}}>
                    <span style={{fontWeight:'bold'}}>✔ Líquido a pagar</span>
                    <span style={{fontWeight:'bold',fontSize:'18px'}}>{fmtMoeda(totalLiq)}</span>
                  </div>
                </div>
              </div>

              {/* ── Escalas brutas (recolhido) ── */}
              <details style={{marginTop:'14px'}}>
                <summary style={{cursor:'pointer',fontSize:'11px',color:'#888',userSelect:'none'}}>
                  📅 Registros de escala brutos ({detalhe.escsSemana.length})
                </summary>
                <table style={{width:'100%',borderCollapse:'collapse',marginTop:'6px',fontSize:'11px'}}>
                  <thead><tr>{['Data','Turno','Presença','Presença Noite'].map(h=><th key={h} style={thDet}>{h}</th>)}</tr></thead>
                  <tbody>{detalhe.escsSemana.map((e:any,i:number)=>(
                    <tr key={i} style={{backgroundColor:i%2===0?'#fafafa':'white'}}>
                      <td style={tdDet}>{e.data}</td>
                      <td style={tdDet}>{e.turno}</td>
                      <td style={{...tdDet,color:e.presenca==='presente'?'#2e7d32':'#aaa'}}>{e.presenca||'—'}</td>
                      <td style={{...tdDet,color:e.presencaNoite==='presente'?'#2e7d32':'#aaa'}}>{e.presencaNoite||'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </details>
            </div>
          </div>
        );
      })()}

      <main style={{flex:1,maxWidth:'1500px',margin:'0 auto',padding:'20px 16px',width:'100%'}}>
        {/* Cabeçalho */}
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
          <button onClick={()=>navigate('/modulos')} style={{background:'none',border:'none',cursor:'pointer',color:'#c2185b',fontSize:'20px'}} title="Voltar">←</button>
          <div>
            <h2 style={{margin:0,fontSize:'20px',color:'#880e4f'}}>🎯 Pagamento de Freelancers</h2>
            <div style={{fontSize:'12px',color:'#888',marginTop:'2px'}}>Auditoria, descontos e confirmação de pagamento</div>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={()=>navigate('/modulos/extrato')} style={s.btn('#00838f')}>📋 Extrato</button>
            <button onClick={()=>navigate('/modulos/folha-pagamento')} style={s.btn('#1976d2')}>🧾 Folha CLT</button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{...s.card,marginBottom:'16px',display:'flex',gap:'14px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e=>setMesAno(e.target.value)} disabled={periodoCustomAtivo}
              style={{...s.input,width:'150px',opacity:periodoCustomAtivo?0.5:1}} />
          </div>
          <div style={{borderLeft:'1px solid #e0e0e0',paddingLeft:'14px'}}>
            <label style={{...s.label,color:periodoCustomAtivo?'#7b1fa2':'#666'}}>
              Período customizado {periodoCustomAtivo && <span style={{fontSize:'10px',backgroundColor:'#f3e5f5',color:'#7b1fa2',padding:'1px 6px',borderRadius:'8px',marginLeft:'6px'}}>ativo</span>}
            </label>
            <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
              <input type="date" value={periodoIni} onChange={e=>setPeriodoIni(e.target.value)}
                style={{...s.input,width:'140px',borderColor:periodoCustomAtivo?'#ab47bc':undefined}} />
              <span style={{fontSize:'12px',color:'#888'}}>até</span>
              <input type="date" value={periodoFim} onChange={e=>setPeriodoFim(e.target.value)}
                style={{...s.input,width:'140px',borderColor:periodoCustomAtivo?'#ab47bc':undefined}} />
              {periodoCustomAtivo && <button onClick={()=>{setPeriodoIni('');setPeriodoFim('');}}
                style={{padding:'6px 10px',fontSize:'11px',border:'1px solid #ab47bc',backgroundColor:'#fff',color:'#7b1fa2',borderRadius:'4px',cursor:'pointer'}}>✕ limpar</button>}
            </div>
          </div>
          <button onClick={carregarDados} style={s.btn('#c2185b')}>🔄 Atualizar</button>
        </div>

        {periodoCustomAtivo && <div style={{marginBottom:'12px',padding:'8px 12px',backgroundColor:'#fff3e0',borderRadius:'6px',borderLeft:'3px solid #fb8c00',fontSize:'12px',color:'#5d4037'}}>
          ⚠️ <strong>Período customizado ativo</strong> ({periodoIni} a {periodoFim})
        </div>}

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'12px',marginBottom:'18px'}}>
          {[
            {label:'Freelancers ativos',val:freelancers.length,cor:'#c2185b'},
            {label:'Semanas com escala',val:fechamentos.length,cor:'#1976d2'},
            {label:'Total Líquido Mês',val:fmtMoeda(totalFreelancerMes),cor:'#2e7d32'},
          ].map(c=>(
            <div key={c.label} style={{...s.card,borderLeft:`4px solid ${c.cor}`}}>
              <div style={{fontSize:'11px',color:'#666'}}>{c.label}</div>
              <div style={{fontSize:'18px',fontWeight:'bold',color:c.cor}}>{c.val}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{...s.card,textAlign:'center',padding:'40px',color:'#999'}}>Carregando...</div>
        ) : freelancers.length===0 ? (
          <div style={{...s.card,textAlign:'center',padding:'40px',color:'#999'}}>
            <p>Nenhum freelancer cadastrado nesta unidade.</p>
            <p style={{fontSize:'13px'}}>Cadastre colaboradores com <strong>Tipo de Contrato = Freelancer</strong> em <strong>Gestão de Colaboradores</strong>.</p>
          </div>
        ) : fechamentos.length===0 ? (
          <div style={{...s.card,textAlign:'center',padding:'40px',color:'#999'}}>
            <p>Nenhuma escala de freelancer lançada em {mesAno}.</p>
            <p style={{fontSize:'13px'}}>Lance as escalas na aba <strong>Gestão de Escalas → Editar Turno</strong> e marque a presença como <strong>"Presente"</strong>.</p>
          </div>
        ) : (
          <>
            {/* Pendências de meses anteriores */}
            {(() => {
              const comPend = freelancers.map((fr:any)=>({fr,pends:saidasPendentesAnt.filter((s:any)=>s.colaboradorId===fr.id)})).filter(x=>x.pends.length>0);
              if (!comPend.length) return null;
              return (
                <div style={{...s.card,marginBottom:'16px',borderLeft:'4px solid #f9a825',backgroundColor:'#fffde7'}}>
                  <h4 style={{margin:'0 0 10px',color:'#f57f17',fontSize:'14px'}}>⏳ Pendências de meses anteriores a descontar</h4>
                  {comPend.map(({fr,pends}:any)=>(
                    <div key={fr.id} style={{marginBottom:'8px',paddingBottom:'8px',borderBottom:'1px solid #fff176'}}>
                      <div style={{fontWeight:'bold',color:'#5d4037',fontSize:'12px',marginBottom:'4px'}}>👤 {fr.nome} ({pends.length} item(s) · {fmtMoeda(pends.reduce((s:number,p:any)=>s+R(p.valor),0))})</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                        {pends.map((p:any,i:number)=>(
                          <div key={i} style={{backgroundColor:'#fff8e1',borderRadius:'6px',padding:'3px 10px',fontSize:'11px',border:'1px solid #ffe082'}}>
                            <span style={{color:'#e65100',fontWeight:'bold'}}>{p.tipo||p.origem||'Saída'}</span>
                            {' '}{p.descricao||'-'}{' '}
                            <span style={{color:'#c62828',fontWeight:'bold'}}>-{fmtMoeda(R(p.valor))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Fechamentos por semana */}
            {fechamentos.map((fech:any) => {
              const key = fech.dataFechamentoBase;
              const efRaw = editFechamento[key]||{combustivel:'0',extra:'0',desconto:'0',obs:''};
              const ef: any = periodoCustomAtivo ? {...efRaw,dataIniCustom:'',dataFimCustom:''} : efRaw;
              const updateEf = (campo:string,val:string) => setEditFechamento(prev=>({...prev,[key]:{...(prev[key]||efRaw),[campo]:val}}));
              const periodoAjustado = !!(ef.dataIniCustom||ef.dataFimCustom);
              return (
                <div key={key} style={{...s.card,marginBottom:'16px',borderTop:`3px solid ${periodoAjustado?'#7b1fa2':'#c2185b'}`}}>
                  {/* Cabeçalho semana */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
                    <div>
                      <h4 style={{margin:'0 0 6px',color:periodoAjustado?'#7b1fa2':'#c2185b',fontSize:'15px'}}>
                        📅 Semana {fech.semanaLabel}
                        {periodoAjustado && <span style={{fontSize:'11px',marginLeft:'8px',backgroundColor:'#f3e5f5',color:'#7b1fa2',padding:'1px 6px',borderRadius:'8px'}}>período ajustado</span>}
                      </h4>
                      {!periodoCustomAtivo && (
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'12px',color:'#888'}}>Período:</span>
                          <input type="date" value={ef.dataIniCustom||fech.dataInicioBase} onChange={e=>updateEf('dataIniCustom',e.target.value)}
                            style={{padding:'3px 6px',border:`1px solid ${periodoAjustado?'#ab47bc':'#ccc'}`,borderRadius:'4px',fontSize:'12px'}} />
                          <span style={{fontSize:'12px',color:'#888'}}>até</span>
                          <input type="date" value={ef.dataFimCustom||fech.dataFimEfetivo||fech.dataFechamentoBase} onChange={e=>updateEf('dataFimCustom',e.target.value)}
                            style={{padding:'3px 6px',border:`1px solid ${periodoAjustado?'#ab47bc':'#ccc'}`,borderRadius:'4px',fontSize:'12px'}} />
                          {periodoAjustado && <button onClick={()=>setEditFechamento(prev=>({...prev,[key]:{...ef,dataIniCustom:'',dataFimCustom:''}}))}
                            style={{padding:'2px 8px',fontSize:'11px',border:'none',borderRadius:'4px',backgroundColor:'#f3e5f5',color:'#7b1fa2',cursor:'pointer'}}>↩ restaurar</button>}
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:'13px',color:'#c2185b',fontWeight:'bold'}}>
                      Total semana: {fmtMoeda(fech.totalLiquido)}
                    </div>
                  </div>

                  {/* Tabela freelancers da semana */}
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                      <thead>
                        <tr>
                          {['Freelancer','PIX / Tel','Dias (código)','Dobras','Valor/Dobra','Total Dobras','Transp.','Desconto','Líquido','Status','Ações'].map(h=>(
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fech.freelancers.map((fr:any, fi:number) => {
                          const frFolhaSalva = folhasDB.find((f:any)=>
                            f.colaboradorId===fr.id && f.mes===mesAno && f.semana===fech.dataFechamento && !isMigradoReg(f) && !isEstornadoReg(f)
                          );
                          const diasPagosNovos = folhasDB.filter((f:any)=>
                            f.colaboradorId===fr.id && f.mes===mesAno && f.data>=(fr.periodoInicio||fech.dataInicioBase) && f.data<=(fr.periodoFim||fech.dataFechamento) && f.pago===true && f.tipo==='freelancer-dia'
                          ).sort((a:any,b:any)=>(b.dataPagamento||'').localeCompare(a.dataPagamento||''));
                          const frDataPgto = diasPagosNovos.length>0 ? diasPagosNovos[0]?.dataPagamento : frFolhaSalva?.dataPagamento;
                          const frForma    = diasPagosNovos.length>0 ? diasPagosNovos[0]?.formaPagamento : frFolhaSalva?.formaPagamento;
                          const diasJaPagesSemana = (fr.diasJaPagosDetalhe||[]).length;
                          const frIsPago = diasJaPagesSemana>0 || frFolhaSalva?.pago || fr.pago || false;
                          const pagoParcial = frIsPago && fr.dobras>0;
                          const pagoCompleto = diasJaPagesSemana>0 && fr.dobras===0;
                          const semDetalhe  = frFolhaSalva?.pago && diasJaPagesSemana===0 && (frFolhaSalva?.diasPagos?.length||0)===0;
                          /* ── composição do pagamento (campos estruturados do backend) ── */
                          const compReg = diasPagosNovos.length>0 ? diasPagosNovos[0] : frFolhaSalva;
                          const compBruto   = R(compReg?.valorBruto);
                          const compDesc    = R(compReg?.valorDescSaidas);
                          const compAbat    = R(compReg?.valorAbatEsp);
                          const compLiq     = R(compReg?.valorLiquido);
                          const temComp     = compLiq > 0 || compBruto > 0;
                          return (
                            <tr key={fr.id} style={{backgroundColor:fi%2===0?'#fafafa':'white'}}>
                              <td style={{...s.td,fontWeight:'bold'}}>
                                {fr.nome}
                                {(fr.saldoEspecialAberto||0)>0 && <div style={{fontSize:'10px',color:'#7c3aed',fontWeight:'bold',marginTop:'2px'}}>🟣 Adto. esp.: {fmtMoeda(fr.saldoEspecialAberto)}</div>}
                                {(fr.diasJaPagosDetalhe?.length||0)>0 && <div style={{fontSize:'10px',color:'#1565c0',marginTop:'2px'}}>✅ {fr.diasJaPagosDetalhe.length} dia(s) já pago(s): {fmtMoeda(fr.totalJaPago)}</div>}
                              </td>
                              <td style={{...s.td,fontSize:'11px'}}>
                                {fr.chavePix && <div>💳 {fr.chavePix}</div>}
                                {fr.telefone && <div>📱 {fr.telefone}</div>}
                              </td>
                              <td style={{...s.td,fontSize:'11px',color:'#555',maxWidth:'200px'}}>{fr.diasCodigo||'-'}</td>
                              <td style={{...s.td,textAlign:'center',fontWeight:'bold',color:'#2e7d32'}}>
                                {fr.dobras}
                                {fr.totalJaPago>0 && fr.dobras===0 && <div style={{fontSize:'9px',color:'#1565c0',fontWeight:'normal'}}>tudo pago</div>}
                              </td>
                              <td style={{...s.td,textAlign:'right'}}>
                                {fr.isValorTurno
                                  ? <span style={{color:'#6a1b9a',fontSize:'10px'}} title="Valor variável por dia da semana (acordo.tabela)">📅 Variável</span>
                                  : (fr.valorDia>0||fr.valorNoite>0)
                                    ? <><span style={{color:'#e65100'}}>☀️{fmt(fr.valorDia)}</span><br/><span style={{color:'#3949ab'}}>🌙{fmt(fr.valorNoite)}</span></>
                                    : <>R$ {fmt(fr.valorDobra)}</>}
                              </td>
                              <td style={{...s.td,textAlign:'right',fontWeight:'bold',color:'#1976d2',fontSize:'13px'}}>
                                {fmtMoeda(fr.totalBrutoPeriodo??fr.total)}
                                {fr.totalJaPago>0 && <div style={{fontSize:'9px',color:'#2e7d32'}}>✓ {fmtMoeda(fr.totalJaPago)} pago</div>}
                              </td>
                              <td style={{...s.td,textAlign:'right',fontSize:'11px',color:fr.totalTransporte>0?'#1565c0':'#aaa'}}>
                                {fr.totalTransporte>0 ? `📦 ${fmtMoeda(fr.totalTransporte)}` : '-'}
                                {fr.transporteAdiantado>0 && <div style={{color:'#e65100',fontSize:'10px'}}>✔ {fmtMoeda(fr.transporteAdiantado)} pago</div>}
                              </td>
                              <td style={{...s.td,textAlign:'right',color:fr.saidasDesconto>0?'#c62828':'#aaa',fontSize:'12px'}}>
                                {fr.saidasDesconto>0 ? <span title={fr.saidasDetalhe.map((d:any)=>`${d.descricao}: R$${fmt(d.valor)}`).join(' | ')}>-{fmtMoeda(fr.saidasDesconto)}</span> : '-'}
                              </td>
                              {/* ── Líquido: valor em destaque + equação (padrão Extrato) ── */}
                              <td style={{...s.td,textAlign:'right',fontWeight:'bold',fontSize:'13px'}}>
                                {frIsPago && temComp ? (
                                  <>
                                    {/* valor pago em destaque na cor da forma */}
                                    <div style={{
                                      color: frForma==='PIX'?'#1565c0':frForma==='Dinheiro'?'#2e7d32':'#e65100',
                                      fontSize:'14px', fontWeight:'bold'
                                    }}>
                                      {frForma==='PIX'?'📱 ':frForma==='Dinheiro'?'💵 ':'🔄 '}{fmtMoeda(compLiq)}
                                    </div>
                                    {/* equação resumida em subscript cinza */}
                                    {(compDesc>0||compAbat>0) && (
                                      <div style={{fontSize:'9px',color:'#888',fontWeight:'normal',lineHeight:'1.5',marginTop:'2px'}}>
                                        bruto {fmtMoeda(compBruto)}
                                        {compDesc>0 && <span style={{color:'#c62828'}}> −{fmtMoeda(compDesc)}</span>}
                                        {compAbat>0 && <span style={{color:'#7b1fa2'}}> −{fmtMoeda(compAbat)} adto.</span>}
                                        {' = '}<span style={{color:'#1b5e20',fontWeight:'bold'}}>{fmtMoeda(compLiq)}</span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div style={{color:fr.totalLiquido>0?'#1b5e20':'#888'}}>
                                      {fmtMoeda(fr.totalLiquido)}
                                    </div>
                                    {fr.totalLiquido===0 && fr.totalJaPago>0 && (
                                      <div style={{fontSize:'9px',color:'#2e7d32',fontWeight:'normal'}}>quitado</div>
                                    )}
                                  </>
                                )}
                              </td>
                              {/* ── Status: badge simples + data + forma (padrão Extrato) ── */}
                              <td style={{...s.td,textAlign:'center'}}>
                                {semDetalhe
                                  ? <span style={{...s.badge('#fff3e0','#e65100'),fontSize:'9px'}} title="Pago sem detalhe analítico — reabra e repague">⚠️ Pago*</span>
                                  : pagoParcial
                                  ? <span style={{...s.badge('#fff9c4','#f57f17'),fontSize:'9px'}}>🟡 Parcial</span>
                                  : pagoCompleto
                                  ? <span style={s.badge('#e8f5e9','#2e7d32')}>✅ Pago</span>
                                  : <span style={s.badge('#fff9c4','#f57f17')}>⏳ Pend.</span>}
                                {frIsPago && frDataPgto && (
                                  <div style={{fontSize:'9px',color:'#555',marginTop:'3px'}}>📅 {frDataPgto}</div>
                                )}
                                {frIsPago && frForma && (
                                  <div style={{marginTop:'3px'}}>
                                    <span style={{padding:'2px 6px',borderRadius:'8px',fontSize:'10px',fontWeight:'bold',
                                      backgroundColor:frForma==='PIX'?'#e3f2fd':frForma==='Dinheiro'?'#e8f5e9':'#fff3e0',
                                      color:frForma==='PIX'?'#1565c0':frForma==='Dinheiro'?'#2e7d32':'#e65100'}}>
                                      {frForma==='PIX'?'📱 PIX':frForma==='Dinheiro'?'💵 Din.':'🔄 Misto'}
                                    </span>
                                  </div>
                                )}
                                {semDetalhe && <div style={{fontSize:'9px',color:'#e65100',marginTop:'2px'}}>* sem detalhe</div>}
                              </td>
                              <td style={s.td}>
                                <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                                  <button onClick={()=>{
                                    const isoIni=fr.periodoInicio||fech.dataInicioBase;
                                    const isoFimDet=fr.periodoFim||fech.dataFechamento;
                                    const escsSemana=escalas.filter((e:any)=>e.colaboradorId===fr.id&&e.data>=isoIni&&e.data<=isoFimDet);
                                    /* Usar saidasMesCompleto para incluir saídas fora do range da semana (ex: Desconto Adto Esp criado no dia do pagamento)
                                       + filtrar por pagamentoIdLigado ou range de datas expandido (+2 dias) */
                                    const fonteSaidas = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPeriodo;
                                    const fimExpandido = new Date(new Date(isoFimDet+'T12:00:00').getTime()+2*864e5).toISOString().slice(0,10);
                                    const saidasSemana=fonteSaidas.filter((s2:any)=>{const cid=s2.colaboradorId||s2.colabId;if(cid!==fr.id)return false;const dt=s2.dataPagamento||s2.data||'';return dt>=isoIni&&dt<=fimExpandido;});
                                    setDetalhe({fr,fech,escsSemana,saidasSemana});
                                  }} style={{...s.btn('#c2185b'),padding:'3px 8px',fontSize:'11px'}}>📋 Ver</button>
                                  {semDetalhe && <button disabled={salvando} onClick={async()=>{
                                    if(!window.confirm(`Reabrir pagamento de ${fr.nome}?`)) return;
                                    setSalvando(true);
                                    try {
                                      await fetchAuth(`${apiUrl}/folha-pagamento`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({colaboradorId:fr.id,mes:mesAno,semana:fech.dataFechamento,unitId,pago:false,dataPagamento:null,diasPagos:[]})});
                                      await carregarDados();
                                      setTimeout(()=>setModalPgto({fr,fech}),300);
                                    } catch(err){alert('Erro: '+err);} finally{setSalvando(false);}
                                  }} style={{...s.btn('#e65100'),padding:'3px 8px',fontSize:'11px'}}>🔧 Corrigir</button>}
                                  <button disabled={salvando} onClick={()=>{
                                    if (!frIsPago||pagoParcial) { setModalPgto({fr,fech}); return; }
                                    desfazerPagamento(fr, fech);
                                  }} style={{...s.btn(pagoParcial?'#43a047':frIsPago?'#e53935':'#43a047'),padding:'3px 8px',fontSize:'11px'}}
                                    title={pagoParcial?'Pagar dias pendentes':frIsPago?'Desfazer pagamento':'Pagar esta semana'}>
                                    {pagoParcial?'✅ Pagar pend.':frIsPago?'↩ Desfazer':'✅ Pagar'}
                                  </button>
                                  {fr.chavePix && <button onClick={()=>navigator.clipboard.writeText(fr.chavePix)} style={{...s.btn('#1565c0'),padding:'3px 8px',fontSize:'11px'}}>💳 PIX</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{backgroundColor:'#880e4f'}}>
                          <td colSpan={4} style={{padding:'8px 10px',color:'white',fontWeight:'bold',fontSize:'12px'}}>TOTAL DA SEMANA</td>
                          <td colSpan={1} />
                          <td style={{padding:'8px 10px',textAlign:'right',color:'white',fontWeight:'bold'}}>{fmtMoeda(fech.freelancers.reduce((s:number,f:any)=>s+(f.totalBrutoPeriodo??f.total),0))}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'#f8bbd0'}}>{fmtMoeda(fech.freelancers.reduce((s:number,f:any)=>s+f.totalTransporte,0))}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'#f48fb1'}}>{fmtMoeda(fech.freelancers.reduce((s:number,f:any)=>s+f.saidasDesconto,0)>0?fech.freelancers.reduce((s:number,f:any)=>s+f.saidasDesconto,0):0)}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'#a5d6a7',fontSize:'14px',fontWeight:'bold'}}>{fmtMoeda(fech.totalLiquido)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
