import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Colaborador {
  id: string;
  nome: string;
  cpf: string;
  telefone?: string;
  celular?: string;
  chavePix?: string;
  cargo?: string;
  funcao?: string;
  area?: string;
  tipoContrato?: 'CLT' | 'Freelancer';
  salario?: number;
  valorDia?: number;      // CLT: valor dobra-dia; Freelancer: valor por dobra
  valorNoite?: number;    // CLT: valor dobra-noite
  valorTransporte?: number;
  periculosidade?: number;
  unitId?: string;
  ativo?: boolean;
}

interface Motoboy extends Colaborador {
  placa?: string;
  vinculo?: 'CLT' | 'Freelancer';
  comissao?: number;
}

// Freelancers are colaboradores with tipoContrato='Freelancer'
type Freelancer = Colaborador;

interface ControleDia {
  motoboyId: string;
  data: string;
  entDia: number;
  caixinhaDia: number;
  entNoite: number;
  caixinhaNoite: number;
  vlVariavel: number;
  pgto: number;
  variavel: number;
}

/** Escala de um colaborador/freelancer em um dia */
interface EscalaItem {
  colaboradorId: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
}

/** Resumo mensal para cada colaborador CLT */
interface FolhaMensal {
  colaboradorId: string;
  nome: string;
  cpf: string;
  chavePix?: string;
  cargo?: string;
  tipoContrato: string;
  vinculo?: string;
  salarioBase: number;
  periculosidade: number;
  inss: number;
  contrAssistencial: number;
  adiantamentoSalario: number;
  adiantamentoValor: number;
  diferencaSalario: number;
  variavelAte19: number;
  variavelDe20a31: number;
  totalVariavel: number;
  pgtosDia20: number;
  pgtosDia05: number;
  outrosPgtos: number;
  saldoFinal: number;
  pago: boolean;
  dataPagamento?: string;
  raw?: any;
}

/** Resumo semanal de fechamento para freelancers */
interface FechamentoSemanalFreelancer {
  semanaLabel: string;           // Ex: "01/03 – 07/03"
  dataFechamento: string;        // YYYY-MM-DD
  freelancers: {
    id: string;
    nome: string;
    chavePix?: string;
    telefone?: string;
    dobras: number;
    valorDobra: number;
    valorDia: number;
    valorNoite: number;
    valorTransporte: number;
    totalTransporte: number;        // transporte calculado pelos dias trabalhados
    transporteAdiantado: number;    // transporte já pago (Saídas "Adiantamento Transporte")
    transporteSaldo: number;        // totalTransporte - transporteAdiantado (≥ 0)
    diasTrabalhados: number;
    total: number;
    totalLiquido: number;           // total dobras + transporteSaldo - saidasDesconto
    saidasDesconto: number;         // total de saídas "A receber" (descontos gerais)
    saidasDetalhe: { descricao: string; valor: number; data: string }[]; // detalhes desconto
    pendentesAnteriores: any[];     // Saídas pendentes de meses anteriores a descontar
    diasCodigo: string;             // Ex: "Ter D | Qui DN | Sex DN | Sáb D"
    pago?: boolean;
  }[];
  totalSemana: number;
  totalTransporte: number;             // saldo a pagar (calculado - adiantado)
  totalTransporteCalculado?: number;   // transporte bruto pelos dias trabalhados
  totalTransporteAdiantado?: number;   // total já pago via "Adiantamento Transporte"
  totalCombustivel: number;
  totalExtra: number;
  totalDesconto: number;
  totalSaidasDesconto: number;         // soma dos descontos de saídas (A receber)
  totalLiquido: number;
  observacao?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function calcINSS(salarioBruto: number): number {
  const tabela = [
    { ate: 1518.00, aliq: 0.075 },
    { ate: 2793.88, aliq: 0.09 },
    { ate: 4190.83, aliq: 0.12 },
    { ate: 8157.41, aliq: 0.14 },
  ];
  let inss = 0;
  let base = salarioBruto;
  let anterior = 0;
  for (const faixa of tabela) {
    if (base <= 0) break;
    const faixaVal = Math.min(base, faixa.ate - anterior);
    inss += faixaVal * faixa.aliq;
    base -= faixaVal;
    anterior = faixa.ate;
    if (salarioBruto <= faixa.ate) break;
  }
  return parseFloat(inss.toFixed(2));
}

/** Calcula as semanas de fechamento de um mês (domingo = final de semana) */
function semanasFechamento(ano: number, mes: number): { inicio: Date; fim: Date }[] {
  const semanas: { inicio: Date; fim: Date }[] = [];
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimo = new Date(ano, mes, 0);

  let cur = new Date(primeiro);
  while (cur <= ultimo) {
    const inicio = new Date(cur);
    // Fim = próximo domingo (ou fim do mês)
    const fim = new Date(cur);
    while (fim.getDay() !== 0 && fim < ultimo) {
      fim.setDate(fim.getDate() + 1);
    }
    semanas.push({ inicio, fim: new Date(Math.min(fim.getTime(), ultimo.getTime())) });
    cur = new Date(fim);
    cur.setDate(cur.getDate() + 1);
  }
  return semanas;
}

function fmtDataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDataISO(d: Date) {
  return d.toISOString().split('T')[0];
}

/** Conta dobras e dias trabalhados de um freelancer em um conjunto de escalas */
function contarDobras(escalas: EscalaItem[], freelancerId: string): { dobras: number; diasCodigo: string; diasTrabalhados: number } {
  const linhas: string[] = [];
  let dobras = 0;
  let diasTrabalhados = 0;
  const dias = escalas.filter(e => e.colaboradorId === freelancerId && e.turno !== 'Folga').sort((a,b) => a.data.localeCompare(b.data));
  for (const esc of dias) {
    const dow = new Date(esc.data + 'T12:00:00').getDay();
    const label = `${DIAS_SEMANA_ABREV[dow]} ${esc.turno === 'DiaNoite' ? 'DN' : esc.turno === 'Dia' ? 'D' : esc.turno === 'Noite' ? 'N' : 'F'}`;
    linhas.push(label);
    diasTrabalhados++;
    if (esc.turno === 'DiaNoite') dobras += 1;
    else if (esc.turno === 'Dia' || esc.turno === 'Noite') dobras += 0.5;
  }
  return { dobras, diasCodigo: linhas.join(' | '), diasTrabalhados };
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function FolhaPagamento() {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || (user as any)?.unitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'clt' | 'freelancers' | 'dobras'>('clt');

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [controlesMap, setControlesMap] = useState<Record<string, ControleDia[]>>({});
  const [escalas, setEscalas] = useState<EscalaItem[]>([]);
  const [folhasDB, setFolhasDB] = useState<any[]>([]);
  const [folhasLocais, setFolhasLocais] = useState<FolhaMensal[]>([]);
  const [fechamentosFreelancer, setFechamentosFreelancer] = useState<FechamentoSemanalFreelancer[]>([]);
  // Saídas do período para cruzamento com motoboys
  const [saidasPeriodo, setSaidasPeriodo] = useState<any[]>([]);
  // Saídas pendentes de meses anteriores (pago=false)
  const [saidasPendentesAnt, setSaidasPendentesAnt] = useState<any[]>([]);

  const [detalheSelecionado, setDetalheSelecionado] = useState<FolhaMensal | null>(null);
  const [historicoColabId, setHistoricoColabId] = useState<string | null>(null);
  const [historicoItems, setHistoricoItems] = useState<any[]>([]);
  const [detalheFreelancer, setDetalheFreelancer] = useState<{fr: any; semana: string; escalas: any[]; saidaItems?: any[]} | null>(null);
  // Modal confirmar pagamento freelancer (com data editável)
  const [modalFreelancerPgto, setModalFreelancerPgto] = useState<{fr: any; fech: FechamentoSemanalFreelancer} | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [salvando, setSalvando] = useState(false);

  // Campos editáveis do fechamento semanal (combustível, extra, desconto, obs)
  const [editFechamento, setEditFechamento] = useState<Record<string, { combustivel: string; extra: string; desconto: string; obs: string }>>({});

  // Interface DobraSemanalCLT (used inline in tab)
  // Valores editados pelo gestor (valorDia, valorNoite, totalBruto overrides)
  const [editDobras, setEditDobras] = useState<Record<string, { valorBruto?: string; valorTransporte?: string; obs?: string }>>({});

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno]);

  const abrirHistorico = async (colaboradorId: string) => {
    try {
      const r = await fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&colaboradorId=${colaboradorId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        const items = await r.json();
        setHistoricoItems(Array.isArray(items) ? items.sort((a: any, b: any) => (b.updatedAt||'').localeCompare(a.updatedAt||'')) : []);
      } else {
        setHistoricoItems([]);
      }
    } catch { setHistoricoItems([]); }
    setHistoricoColabId(colaboradorId);
  };

  const token = () => localStorage.getItem('auth_token');

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
      const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

      // Previous 3 months to catch pending saídas
      const prevDate = new Date(ano, mes - 4, 1);
      const prevIni  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

      const [rC, rM, rF, rE, rS, rSPend] = await Promise.all([
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/motoboys?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        // Pending saídas from previous 3 months
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${prevIni}&dataFim=${dataInicio}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
      ]);

      const dC = await rC.json();
      const todosColabs: Colaborador[] = (Array.isArray(dC) ? dC : []).filter((c: Colaborador) => c.ativo !== false);
      // Separate CLT from Freelancer
      const colabs = todosColabs.filter(c => c.tipoContrato !== 'Freelancer');
      setColaboradores(colabs);
      // Freelancers are colaboradores with tipoContrato='Freelancer'
      setFreelancers(todosColabs.filter(c => c.tipoContrato === 'Freelancer'));

      const dM = await rM.json();
      const motos: Motoboy[] = Array.isArray(dM) ? dM.filter((m: Motoboy) => m.ativo !== false) : [];
      setMotoboys(motos);

      if (rE?.ok) {
        const dE = await rE.json();
        setEscalas(Array.isArray(dE) ? dE : []);
      }

      const ctrlMap: Record<string, ControleDia[]> = {};
      await Promise.all(motos.map(async m => {
        try {
          const r = await fetch(`${apiUrl}/controle-motoboy?motoboyId=${m.id}&mes=${mesAno}&unitId=${unitId}`, {
            headers: { Authorization: `Bearer ${token()}` },
          });
          const d = await r.json();
          if (Array.isArray(d)) ctrlMap[m.id] = d;
        } catch { ctrlMap[m.id] = []; }
      }));
      setControlesMap(ctrlMap);

      if (rF?.ok) {
        const dF = await rF.json();
        setFolhasDB(Array.isArray(dF) ? dF : []);
      } else {
        setFolhasDB([]);
      }

      // Carregar saídas do período
      if (rS?.ok) {
        const dS = await rS.json();
        setSaidasPeriodo(Array.isArray(dS) ? dS : []);
      } else {
        setSaidasPeriodo([]);
      }

      // Carregar saídas pendentes de meses anteriores
      if (rSPend?.ok) {
        const dSP = await rSPend.json();
        // Only keep ones with pago !== true (pending)
        const pendentes = (Array.isArray(dSP) ? dSP : []).filter((s: any) => s.pago === false);
        setSaidasPendentesAnt(pendentes);
      } else {
        setSaidasPendentesAnt([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Freelancers state (derived from colaboradores)
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);

  // Recalcular folhas CLT
  useEffect(() => {
    setFolhasLocais(calcularTodasFolhas());
  }, [colaboradores, motoboys, controlesMap, folhasDB, mesAno, saidasPeriodo]);

  // Recalcular fechamentos freelancer
  useEffect(() => {
    if (freelancers.length > 0) {
      calcularFechamentosFreelancer();
    }
  }, [freelancers, escalas, mesAno, saidasPendentesAnt]);

  /* ── Cálculo CLT ─────────────────────────────────────────── */
  const calcularTodasFolhas = (): FolhaMensal[] => {
    const folhas: FolhaMensal[] = [];

    for (const c of colaboradores) {
      const isMotoboy = motoboys.some(m => m.id === c.id || m.cpf === c.cpf);
      if (isMotoboy) continue;
      const salBase = R(c.salario);
      const peri = R(c.periculosidade) / 100;
      const salBruto = salBase * (1 + peri);
      const inss = calcINSS(salBruto);
      const contrAssist = 0;
      const adiantPct = 0.40;
      const adiantValor = parseFloat((salBruto * adiantPct).toFixed(2));
      const difSal = parseFloat((salBruto - adiantValor).toFixed(2));
      const saldoFinal = difSal - inss - contrAssist;
      const salva = folhasDB.find(f => f.colaboradorId === c.id);
      folhas.push({
        colaboradorId: c.id, nome: c.nome, cpf: c.cpf, chavePix: c.chavePix, cargo: c.cargo,
        tipoContrato: c.tipoContrato || 'CLT',
        salarioBase: salBase, periculosidade: salBase * peri, inss, contrAssistencial: contrAssist,
        adiantamentoSalario: adiantPct * 100, adiantamentoValor: adiantValor,
        diferencaSalario: difSal, variavelAte19: 0, variavelDe20a31: 0, totalVariavel: 0,
        pgtosDia20: adiantValor, pgtosDia05: parseFloat(Math.max(0, saldoFinal).toFixed(2)),
        outrosPgtos: 0, saldoFinal: parseFloat(saldoFinal.toFixed(2)),
        pago: salva?.pago || false, dataPagamento: salva?.dataPagamento, raw: c,
      });
    }

    for (const m of motoboys) {
      const controle: ControleDia[] = controlesMap[m.id] || [];
      const salBase = R(m.salario);
      const peri = R(m.periculosidade ?? 30) / 100;
      const salBruto = salBase * (1 + peri);
      const periculosidadeValor = salBase * peri;
      const inss = calcINSS(salBruto);
      const contrAssist = 32.62;
      const dia19 = `${mesAno}-19`;

      // Saídas do motoboy no período — complementam o controle quando não há dados salvos
      const saidasMotoboy = saidasPeriodo.filter(s => s.colaboradorId === m.id);
      const totalPagoSaidas = saidasMotoboy.reduce((sum: number, s: any) => sum + R(s.valor), 0);

      let varAte19 = 0, varDe20a31 = 0;
      if (controle.length > 0) {
        // Usar controle salvo
        for (const linha of controle) {
          if (linha.data <= dia19) varAte19 += R(linha.vlVariavel);
          else varDe20a31 += R(linha.vlVariavel);
        }
      } else if (saidasMotoboy.length > 0) {
        // Fallback: calcular variável a partir das saídas
        for (const s of saidasMotoboy) {
          if ((s.data || '') <= dia19) varAte19 += R(s.valor);
          else varDe20a31 += R(s.valor);
        }
      }
      varAte19 = parseFloat(varAte19.toFixed(2));
      varDe20a31 = parseFloat(varDe20a31.toFixed(2));
      const totalVariavel = parseFloat((varAte19 + varDe20a31).toFixed(2));
      const adiantValor = parseFloat((salBruto * 0.40).toFixed(2));
      const difSal = parseFloat((salBruto * 0.60).toFixed(2));
      const descontos = inss + contrAssist;
      const saldoFinal = parseFloat((totalVariavel + salBruto - descontos).toFixed(2));
      const pgtosDia05 = parseFloat(Math.max(0, varDe20a31 + difSal - descontos).toFixed(2));
      const salva = folhasDB.find(f => f.colaboradorId === m.id);
      folhas.push({
        colaboradorId: m.id, nome: m.nome, cpf: m.cpf, chavePix: m.chavePix, cargo: m.cargo || 'Motoboy',
        tipoContrato: 'CLT', vinculo: m.vinculo,
        salarioBase: salBase, periculosidade: periculosidadeValor, inss, contrAssistencial: contrAssist,
        adiantamentoSalario: 40, adiantamentoValor: adiantValor, diferencaSalario: difSal,
        variavelAte19: varAte19, variavelDe20a31: varDe20a31, totalVariavel,
        pgtosDia20: varAte19 + adiantValor, pgtosDia05,
        outrosPgtos: totalPagoSaidas, saldoFinal,
        pago: salva?.pago || false, dataPagamento: salva?.dataPagamento, raw: m,
      });
    }
    return folhas.sort((a, b) => a.nome.localeCompare(b.nome));
  };

  /* ── Cálculo Freelancers ─────────────────────────────────── */
  const calcularFechamentosFreelancer = () => {
    const [ano, mes] = mesAno.split('-').map(Number);
    const semanas = semanasFechamento(ano, mes);

    const fechamentos: FechamentoSemanalFreelancer[] = semanas.map(({ inicio, fim }) => {
      const isoInicio = fmtDataISO(inicio);
      const isoFim = fmtDataISO(fim);

      const frList = freelancers.map(f => {
        const escalasSemana = escalas.filter(e =>
          e.colaboradorId === f.id && e.data >= isoInicio && e.data <= isoFim
        );
        const { dobras, diasCodigo, diasTrabalhados } = contarDobras(escalasSemana, f.id);

        // Se tem valorDia E/OU valorNoite configurados, calcular por turno
        const vDia   = R(f.valorDia);
        const vNoite = R(f.valorNoite);
        const vDobra = R((f as any).valorDobra) || 120;
        const usaTurno = vDia > 0 || vNoite > 0;

        let total = 0;
        if (usaTurno) {
          for (const esc of escalasSemana) {
            if (esc.turno === 'DiaNoite') total += vDia + vNoite;
            else if (esc.turno === 'Dia')   total += vDia;
            else if (esc.turno === 'Noite') total += vNoite;
          }
        } else {
          total = parseFloat((dobras * vDobra).toFixed(2));
        }
        total = parseFloat(total.toFixed(2));

        // valorDobra para exibição
        const valorDobra = usaTurno ? (vDia + vNoite) : vDobra;
        const valorTransporte = R(f.valorTransporte);
        const totalTransporte = parseFloat((valorTransporte * diasTrabalhados).toFixed(2));

        // Helper: data efetiva da saída (dataPagamento ou data de lançamento)
        const saidaData = (s: any) => s.dataPagamento || s.data || '';

        // Saídas "Adiantamento Transporte" do freelancer nesta semana (transporte já pago)
        const saidasTransporte = saidasPeriodo.filter((s: any) =>
          s.colaboradorId === f.id &&
          (s.tipo || s.origem || s.referencia || '') === 'Adiantamento Transporte' &&
          saidaData(s) >= isoInicio &&
          saidaData(s) <= isoFim
        );
        const transporteAdiantado = parseFloat(
          saidasTransporte.reduce((sum: number, s: any) => sum + R(s.valor), 0).toFixed(2)
        );
        // Saldo = quanto ainda é devido (transporte calculado menos o que já foi adiantado)
        // Não fica negativo: se adiantou mais do que calculado, saldo = 0
        const transporteSaldo = parseFloat(Math.max(0, totalTransporte - transporteAdiantado).toFixed(2));

        // Saídas de desconto do freelancer nesta semana:
        // inclui 'A receber', 'Caixinha', 'Consumo Interno' (qualquer categoria com regraFolha = desconto_liquido)
        const TIPOS_DESCONTO_FREELANCER = ['A receber', 'Caixinha', 'Consumo Interno'];
        const saidasDescFreelancer = saidasPeriodo.filter((s: any) =>
          s.colaboradorId === f.id &&
          TIPOS_DESCONTO_FREELANCER.includes(s.tipo || s.origem || s.referencia || '') &&
          saidaData(s) >= isoInicio &&
          saidaData(s) <= isoFim
        );
        const saidasDesconto = parseFloat(
          saidasDescFreelancer.reduce((sum: number, s: any) => sum + R(s.valor), 0).toFixed(2)
        );
        const saidasDetalhe = saidasDescFreelancer.map((s: any) => ({
          descricao: `[${s.tipo || s.origem}] ${s.descricao || 'Desconto'}`,
          valor: R(s.valor),
          data: saidaData(s),
        }));

        // Saídas pendentes de meses anteriores para este freelancer
        const pendentesAnteriores = saidasPendentesAnt.filter((s: any) => s.colaboradorId === f.id);

        // Líquido = dobras + saldo de transporte (já subtraído o adiantado) - descontos gerais
        const totalLiquido = parseFloat((total + transporteSaldo - saidasDesconto).toFixed(2));

        return {
          id: f.id, nome: f.nome, chavePix: f.chavePix,
          telefone: f.celular || f.telefone,
          dobras, valorDobra, valorDia: vDia, valorNoite: vNoite,
          valorTransporte, totalTransporte,
          transporteAdiantado, transporteSaldo,
          total, totalLiquido, saidasDesconto, saidasDetalhe,
          diasCodigo, diasTrabalhados,
          pendentesAnteriores,
          pago: false,
        };
      }).filter(fr => fr.dobras > 0);

      const key = isoFim;
      const ef = editFechamento[key] || {};
      const combustivel = parseFloat(ef.combustivel || '0') || 0;
      const extra = parseFloat(ef.extra || '0') || 0;
      const desconto = parseFloat(ef.desconto || '0') || 0;
      const totalSemana = frList.reduce((s, fr) => s + fr.total, 0);
      const totalTransporteSemana = frList.reduce((s, fr) => s + (fr.totalTransporte || 0), 0);
      const totalTransporteAdiantado = frList.reduce((s, fr) => s + (fr.transporteAdiantado || 0), 0);
      const totalTransporteSaldo = frList.reduce((s, fr) => s + (fr.transporteSaldo || 0), 0);
      const totalSaidasDesconto = frList.reduce((s, fr) => s + (fr.saidasDesconto || 0), 0);

      return {
        semanaLabel: `${fmtDataBR(inicio)} – ${fmtDataBR(fim)}`,
        dataFechamento: isoFim,
        freelancers: frList,
        totalSemana,
        totalTransporte: totalTransporteSaldo,         // s\u00f3 o saldo (calculado - adiantado)
        totalTransporteCalculado: totalTransporteSemana,
        totalTransporteAdiantado,
        totalCombustivel: combustivel,
        totalExtra: extra,
        totalDesconto: desconto,
        totalSaidasDesconto,
        totalLiquido: totalSemana + totalTransporteSaldo - totalSaidasDesconto + extra - desconto,
        observacao: ef.obs,
      };
    });

    setFechamentosFreelancer(fechamentos.filter(f => f.freelancers.length > 0));
  };

  // Recalcular fechamentos quando editFechamento, saidas ou escalas mudam
  useEffect(() => {
    if (freelancers.length > 0 && escalas.length >= 0) calcularFechamentosFreelancer();
  }, [editFechamento, freelancers, escalas, saidasPeriodo, saidasPendentesAnt]);

  /* ── Toggle pago CLT ─────────────────────────────────────── */
  const handleTogglePago = async (folha: FolhaMensal, dataOverride?: string) => {
    const novoPago = !folha.pago;
    const hoje2 = new Date().toISOString().split('T')[0];
    const dataPgtoFinal = novoPago ? (dataOverride || hoje2) : null;
    setSalvando(true);
    try {
      const payload = {
        colaboradorId: folha.colaboradorId, mes: mesAno, unitId,
        pago: novoPago, dataPagamento: dataPgtoFinal,
        saldoFinal: folha.saldoFinal,
      };
      await fetch(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      setFolhasLocais(prev => prev.map(f =>
        f.colaboradorId === folha.colaboradorId
          ? { ...f, pago: novoPago, dataPagamento: novoPago ? (dataOverride || hoje2) : undefined }
          : f
      ));
    } catch { alert('Erro ao salvar status'); }
    finally { setSalvando(false); }
  };

  /* ── Export XLSX ─────────────────────────────────────────── */
  const exportarXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(folhasFiltradas.map(f => ({
      'Nome': f.nome, 'CPF': f.cpf, 'Cargo': f.cargo, 'Tipo': f.tipoContrato,
      'Salário Base': f.salarioBase, 'Periculosidade': f.periculosidade,
      'Variável até 19': f.variavelAte19, 'Pgto dia 20': f.pgtosDia20,
      'Diferença Sal.': f.diferencaSalario, 'Variável 20-31': f.variavelDe20a31,
      'INSS': f.inss, 'Contr. Assist.': f.contrAssistencial,
      'Pgto dia 05': f.pgtosDia05, 'Total Variável': f.totalVariavel,
      'Saldo Final': f.saldoFinal, 'Pago': f.pago ? 'Sim' : 'Não',
      'Data Pgto': f.dataPagamento || '', 'PIX': f.chavePix || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `CLT ${mesAno}`);

    // Aba freelancers
    const wsF: any[] = [];
    for (const fech of fechamentosFreelancer) {
      for (const fr of fech.freelancers) {
        wsF.push({
          'Semana': fech.semanaLabel, 'Nome': fr.nome, 'PIX': fr.chavePix || '',
          'Dobras': fr.dobras, 'Valor/Dobra': fr.valorDobra, 'Total': fr.total,
          'Dias': fr.diasCodigo,
        });
      }
    }
    if (wsF.length > 0) {
      const wsFreel = XLSX.utils.json_to_sheet(wsF);
      XLSX.utils.book_append_sheet(wb, wsFreel, `Freelancers ${mesAno}`);
    }
    XLSX.writeFile(wb, `folha-pagamento-${mesAno}.xlsx`);
  };

  const folhasFiltradas = useMemo(() => folhasLocais.filter(f => {
    if (filtroStatus === 'pago' && !f.pago) return false;
    if (filtroStatus === 'pendente' && f.pago) return false;
    if (filtroTipo === 'CLT' && f.tipoContrato !== 'CLT') return false;
    if (filtroTipo === 'Freelancer' && f.tipoContrato !== 'Freelancer') return false;
    return true;
  }), [folhasLocais, filtroStatus, filtroTipo]);

  const totais = useMemo(() => ({
    saldo: folhasFiltradas.reduce((s, f) => s + f.saldoFinal, 0),
    variavel: folhasFiltradas.reduce((s, f) => s + f.totalVariavel, 0),
    salarios: folhasFiltradas.reduce((s, f) => s + f.salarioBase + f.periculosidade, 0),
    pgto20: folhasFiltradas.reduce((s, f) => s + f.pgtosDia20, 0),
    pgto05: folhasFiltradas.reduce((s, f) => s + f.pgtosDia05, 0),
  }), [folhasFiltradas]);

  // Total l\u00edquido do m\u00eas: soma das dobras + transporte - descontos de sa\u00eddas
  const totalFreelancerMes = useMemo(() =>
    fechamentosFreelancer.reduce((s, f) => s + f.totalSemana + (f.totalTransporte || 0) - (f.totalSaidasDesconto || 0), 0),
    [fechamentosFreelancer]);

  // Estado para modal de confirmação de pagamento CLT
  const [modalPagamento, setModalPagamento] = useState<FolhaMensal | null>(null);

  /* ── Styles ──────────────────────────────────────────────── */
  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
    tab: (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
    }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdR: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const }),
  };

  /* ── Modal histórico analítico ───────────────────────────── */
  const ModalHistorico = ({ items, nome, onClose }: { items: any[]; nome: string; onClose: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ ...s.card, maxWidth: '700px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#1565c0' }}>📊 Histórico Analítico — {nome}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999' }}>Nenhum registro de pagamento encontrado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                {['Mês', 'Semana', 'Bruto', 'Transp', 'Total', 'Status', 'Data Pgto', 'Obs'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : 'white', borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>{item.mes}</td>
                  <td style={{ padding: '6px 8px', color: '#666', fontSize: '11px' }}>{item.semana || '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1976d2' }}>
                    {item.valorBruto > 0 ? fmtMoeda(item.valorBruto) : fmtMoeda(item.saldoFinal || 0)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1565c0' }}>
                    {item.valorTransporte > 0 ? fmtMoeda(item.valorTransporte) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20' }}>
                    {fmtMoeda(item.totalFinal || item.saldoFinal || 0)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                      backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                      color: item.pago ? '#2e7d32' : '#f57f17' }}>
                      {item.pago ? '✅ Pago' : '⏳ Pendente'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: '11px', color: item.dataPagamento ? '#2e7d32' : '#bbb' }}>
                    {item.dataPagamento || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: '11px', color: '#666', maxWidth: '120px' }}>
                    {item.obs || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={4} style={{ padding: '8px' }}>TOTAL PAGO (histórico)</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7' }}>
                  {fmtMoeda(items.filter((x: any) => x.pago).reduce((sum: number, x: any) => sum + R(x.totalFinal || x.saldoFinal), 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
        <div style={{ marginTop: '12px', textAlign: 'right' }}>
          <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
        </div>
      </div>
    </div>
  );

  /* ── Modal detalhe CLT ───────────────────────────────────── */
  const ModalDetalhe = ({ f, onClose }: { f: FolhaMensal; onClose: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ ...s.card, maxWidth: '520px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>💰 Resumo Mensal — {f.nome.split(' ')[0]}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
          {f.cargo} · {f.tipoContrato} · {mesAno}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <colgroup><col style={{ width: '60%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /></colgroup>
          <thead>
            <tr style={{ backgroundColor: '#e8f5e9' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Descrição</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: '#2e7d32' }}>Crédito</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>Débito</th>
            </tr>
          </thead>
          <tbody>
            {[
              { desc: `Variável até dia 19`, cred: f.variavelAte19, deb: 0 },
              { desc: `Adiantamento Sal. ${f.adiantamentoSalario}%`, cred: 0, deb: f.adiantamentoValor, note: 'Pgto dia 20' },
              { desc: `Pgto dia 20`, cred: f.pgtosDia20, deb: 0, italic: true },
              { desc: `Diferença de Salário (60%)`, cred: f.diferencaSalario, deb: 0 },
              { desc: `Adicional Periculosidade`, cred: f.periculosidade, deb: 0 },
              { desc: `INSS sobre Salário`, cred: 0, deb: f.inss },
              ...(f.contrAssistencial > 0 ? [{ desc: 'Contr. Assistencial', cred: 0, deb: f.contrAssistencial }] : []),
              { desc: `Variável 20 a 31`, cred: f.variavelDe20a31, deb: 0 },
              { desc: `Pgto dia 05`, cred: 0, deb: f.pgtosDia05, italic: true },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                <td style={{ padding: '6px 8px', fontStyle: (row as any).italic ? 'italic' : 'normal', color: (row as any).italic ? '#c62828' : 'inherit' }}>{row.desc}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.cred > 0 ? '#2e7d32' : '#bbb' }}>
                  {row.cred > 0 ? fmtMoeda(row.cred) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.deb > 0 ? '#c62828' : '#bbb' }}>
                  {row.deb > 0 ? fmtMoeda(row.deb) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
              <td style={{ padding: '8px' }}>Saldo Final</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(f.saldoFinal)}</td>
              <td style={{ padding: '8px' }} />
            </tr>
          </tfoot>
        </table>

        {f.chavePix && (
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '6px', fontSize: '13px' }}>
            <strong>PIX:</strong> {f.chavePix}
            <button onClick={() => navigator.clipboard.writeText(f.chavePix!)}
              style={{ marginLeft: '8px', ...s.btn('#43a047'), padding: '4px 10px', fontSize: '11px' }}>
              📋 Copiar
            </button>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
          <button onClick={() => {
            onClose();
            if (f.pago) handleTogglePago(f);
            else setModalPagamento(f);
          }} style={s.btn(f.pago ? '#e53935' : '#43a047')}>
            {f.pago ? '↩ Desfazer' : '✅ Marcar pago'}
          </button>
          <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
        </div>
      </div>
    </div>
  );


  /* ── Modal confirmar pagamento Freelancer (checklist + data editável) ── */
  // Hooks must be called unconditionally (React rules) — states are always created
  // even when the modal is not open; they are reset via useEffect when modal opens.
  interface CheckItem { key: string; label: string; valor: number; tipo: 'credito'|'debito'; checked: boolean; }
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [dataLocalFreelancer, setDataLocalFreelancer] = useState(new Date().toISOString().split('T')[0]);

  // Reset checklist whenever a new freelancer payment modal opens
  useEffect(() => {
    if (!modalFreelancerPgto) return;
    const { fr } = modalFreelancerPgto;
    const obsValor = (fr.valorDia > 0 || fr.valorNoite > 0)
      ? `☀️ R$${fmt(fr.valorDia)}/dia + 🌙 R$${fmt(fr.valorNoite)}/noite`
      : `R$${fmt(fr.valorDobra)}/dobra`;
    const items: CheckItem[] = [
      { key: 'dobras', label: `Dobras (${fr.dobras}× ${obsValor})`, valor: fr.total, tipo: 'credito', checked: true },
      ...(fr.transporteSaldo > 0 ? [{ key: 'transporte', label: `🚗 Transporte (saldo: ${fr.diasTrabalhados} dias − R$${fmt(fr.transporteAdiantado)} adiant.)`, valor: fr.transporteSaldo, tipo: 'credito' as const, checked: true }] : []),
      ...fr.saidasDetalhe.map((d: { descricao: string; valor: number; data: string }, i: number) => ({ key: `desc_${i}`, label: `🔴 Desconto: ${d.descricao} (${d.data})`, valor: d.valor, tipo: 'debito' as const, checked: true })),
      ...(fr.pendentesAnteriores || []).map((p: any, i: number) => ({
        key: `pend_${i}`,
        label: `⏳ Pendente anterior: [${p.tipo || p.origem}] ${p.descricao || ''} (${(p.dataPagamento || p.data || '').substring(0, 10)})`,
        valor: R(p.valor),
        tipo: 'debito' as const,
        checked: false,
      })),
    ];
    setCheckItems(items);
    setDataLocalFreelancer(new Date().toISOString().split('T')[0]);
  }, [modalFreelancerPgto]);

  const ModalConfirmarPgtoFreelancer = () => {
    if (!modalFreelancerPgto) return null;
    const { fr, fech } = modalFreelancerPgto;

    const totalSelecionado = checkItems.reduce((sum, item) => {
      if (!item.checked) return sum;
      return item.tipo === 'credito' ? sum + item.valor : sum - item.valor;
    }, 0);

    const toggleItem = (key: string) => {
      setCheckItems(prev => prev.map(it => it.key === key ? { ...it, checked: !it.checked } : it));
    };

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalFreelancerPgto(null)}>
        <div style={{ ...s.card, maxWidth: '520px', width: '96%', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#c2185b' }}>✅ Confirmar Pagamento Freelancer</h3>
            <button onClick={() => setModalFreelancerPgto(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Colaborador info */}
          <div style={{ backgroundColor: '#fce4ec', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px' }}>
            <div style={{ fontWeight: 'bold', color: '#880e4f', fontSize: '15px' }}>{fr.nome}</div>
            <div style={{ color: '#c2185b', marginTop: '2px' }}>Semana {fech.semanaLabel}</div>
            {fr.chavePix && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                💳 PIX: <strong>{fr.chavePix}</strong>
                <button onClick={() => navigator.clipboard.writeText(fr.chavePix!)}
                  style={{ marginLeft: '8px', padding: '1px 6px', fontSize: '10px', border: 'none', borderRadius: '3px', backgroundColor: '#43a047', color: 'white', cursor: 'pointer' }}>
                  📋
                </button>
              </div>
            )}
          </div>

          {/* Checklist de itens */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#444', marginBottom: '8px' }}>
              ☑️ Selecione os itens a incluir neste pagamento:
            </div>
            <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', overflow: 'hidden' }}>
              {checkItems.map((item, i) => (
                <label key={item.key} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer',
                  backgroundColor: item.checked ? (item.tipo === 'debito' ? '#fff3e0' : '#f1f8e9') : '#f9f9f9',
                  borderBottom: i < checkItems.length - 1 ? '1px solid #eeeeee' : 'none',
                  transition: 'background 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleItem(item.key)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: item.tipo === 'credito' ? '#43a047' : '#e65100' }}
                  />
                  <span style={{ flex: 1, fontSize: '12px', color: '#333' }}>{item.label}</span>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', minWidth: '80px', textAlign: 'right',
                    color: item.tipo === 'credito' ? '#2e7d32' : '#c62828',
                    opacity: item.checked ? 1 : 0.35 }}>
                    {item.tipo === 'credito' ? '+' : '−'}{fmtMoeda(item.valor)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Total selecionado */}
          <div style={{ backgroundColor: totalSelecionado >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>💰 Total a pagar:</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: totalSelecionado >= 0 ? '#2e7d32' : '#c62828' }}>
              {fmtMoeda(Math.max(0, totalSelecionado))}
            </span>
          </div>

          {/* Data pagamento */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...s.label }}>Data do pagamento</label>
            <input
              type="date"
              value={dataLocalFreelancer}
              onChange={e => setDataLocalFreelancer(e.target.value)}
              style={s.input}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              disabled={salvando || totalSelecionado < 0}
              onClick={async () => {
                setModalFreelancerPgto(null);
                setSalvando(true);
                try {
                  const creditoItems = checkItems.filter(it => it.checked && it.tipo === 'credito');
                  const debitoItems  = checkItems.filter(it => it.checked && it.tipo === 'debito');
                  const totalCredito = creditoItems.reduce((s, it) => s + it.valor, 0);
                  const totalDebito  = debitoItems.reduce((s, it) => s + it.valor, 0);
                  const totalFinal   = Math.max(0, totalCredito - totalDebito);

                  const inclTransporte = checkItems.find(it => it.key === 'transporte')?.checked ?? false;
                  const inclDobras     = checkItems.find(it => it.key === 'dobras')?.checked ?? false;
                  const obsLabel       = (fr.valorDia > 0 || fr.valorNoite > 0)
                    ? `D=R$${fmt(fr.valorDia)} N=R$${fmt(fr.valorNoite)}`
                    : `R$${fmt(fr.valorDobra)}/dobra`;

                  const payload = {
                    colaboradorId: fr.id, mes: mesAno,
                    semana: fech.dataFechamento, unitId,
                    pago: true,
                    dataPagamento: dataLocalFreelancer,
                    valorBruto:          inclDobras ? fr.total : 0,
                    valorTransporte:     inclTransporte ? fr.transporteSaldo : 0,
                    transporteCalculado: fr.totalTransporte || 0,
                    transporteAdiantado: fr.transporteAdiantado || 0,
                    desconto:            totalDebito,
                    totalFinal,
                    obs: `Freelancer sem. ${fech.semanaLabel} – ${fr.dobras} dobras – ${obsLabel}${fr.transporteAdiantado > 0 ? ` – Transp. adiant.: R$${fmt(fr.transporteAdiantado)}` : ''}${totalDebito > 0 ? ` – Desc. saídas: R$${fmt(totalDebito)}` : ''}`,
                  };
                  const resp = await fetch(`${apiUrl}/folha-pagamento`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                    body: JSON.stringify(payload),
                  });
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  await carregarDados();
                } catch (err) { alert('Erro ao salvar pagamento: ' + err); }
                finally { setSalvando(false); }
              }}
              style={{ ...s.btn('#43a047'), flex: 1 }}>
              {salvando ? '⏳ Salvando...' : `✅ Confirmar ${fmtMoeda(Math.max(0, totalSelecionado))}`}
            </button>
            <button onClick={() => setModalFreelancerPgto(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Modal detalhe Freelancer ────────────────────────────── */
  const ModalDetalheFreelancer = ({ data, onClose }: { data: { fr: any; semana: string; escalas: any[]; saidaItems?: any[] }; onClose: () => void }) => {
    const { fr, semana, escalas: escs, saidaItems } = data;
    const vDia   = R(fr.valorDia)   || 0;
    const vNoite = R(fr.valorNoite) || 0;
    const usaTurno = vDia > 0 || vNoite > 0;
    const valorDobra = usaTurno ? (vDia + vNoite) : (R(fr.valorDobra) || R(fr.valorDia) || 120);
    const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const linhas = escs.map(e => {
      const dow = new Date(e.data + 'T12:00:00').getDay();
      const turnoLabel = e.turno === 'DiaNoite' ? 'DN (D+N)' : e.turno === 'Dia' ? 'Dia' : e.turno === 'Noite' ? 'Noite' : e.turno;
      const dobras = e.turno === 'DiaNoite' ? 1 : (e.turno === 'Dia' || e.turno === 'Noite') ? 0.5 : 0;
      let valor = 0;
      if (usaTurno) {
        if (e.turno === 'DiaNoite') valor = vDia + vNoite;
        else if (e.turno === 'Dia')   valor = vDia;
        else if (e.turno === 'Noite') valor = vNoite;
      } else {
        valor = dobras * valorDobra;
      }
      return { data: e.data, dia: DIAS_ABR[dow], turno: turnoLabel, dobras, valor };
    }).filter(l => l.dobras > 0);
    const totalDobras = linhas.reduce((s, l) => s + l.dobras, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
    const transp = R(fr.valorTransporte) * linhas.length;
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
        <div style={{ ...s.card, maxWidth: '500px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#c2185b' }}>🎯 Detalhamento Freelancer</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
            <strong>{fr.nome}</strong> · Semana {semana}
            {usaTurno
              ? <> · ☀️ R$ {fmt(vDia)}/dia · 🌙 R$ {fmt(vNoite)}/noite</>
              : <> · R$ {fmt(valorDobra)}/dobra</>}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#c2185b', color: 'white' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
                <th style={{ padding: '6px 8px' }}>Dia</th>
                <th style={{ padding: '6px 8px' }}>Turno</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Dobras</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{l.data}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: '#555' }}>{l.dia}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                      backgroundColor: l.dobras === 1 ? '#e8f5e9' : '#fff9c4',
                      color: l.dobras === 1 ? '#2e7d32' : '#f57f17' }}>
                      {l.turno}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{l.dobras}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1976d2', fontWeight: 'bold' }}>{fmtMoeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#880e4f', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '8px' }}>SUBTOTAL DOBRAS</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{totalDobras}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f48fb1' }}>{fmtMoeda(totalValor)}</td>
              </tr>
              {transp > 0 && (
                <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                  <td colSpan={4} style={{ padding: '6px 8px' }}>🚗 Transporte ({linhas.length} dias × R$ {fmt(R(fr.valorTransporte))})</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#90caf9' }}>+{fmtMoeda(transp)}</td>
                </tr>
              )}
              <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                <td colSpan={4} style={{ padding: '8px' }}>TOTAL A PAGAR</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totalValor + transp)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Saídas lançadas para o colaborador na semana */}
          {saidaItems && saidaItems.length > 0 && (
            <div style={{ marginTop: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
              <strong style={{ color: '#e65100' }}>📋 Saídas da Semana:</strong>
              <table style={{ width: '100%', marginTop: '6px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e65100', color: 'white' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {saidaItems.map((s2: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff8f0' : 'white', borderBottom: '1px solid #ffe0b2' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: s2.tipo === 'A receber' ? '#e8f5e9' : s2.tipo === 'Adiantamento Transporte' ? '#fff3e0' : '#ffebee',
                          color: s2.tipo === 'A receber' ? '#2e7d32' : s2.tipo === 'Adiantamento Transporte' ? '#e65100' : '#c62828' }}>
                          {s2.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '4px 6px', color: '#555' }}>{s2.descricao || '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 'bold',
                        color: s2.tipo === 'A receber' ? '#c62828' : '#e65100' }}>
                        {s2.tipo === 'A receber' ? '−' : '+'}{fmtMoeda(R(s2.valor))}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>{s2.dataPagamento || s2.data || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pendências de meses anteriores */}
          {fr.pendentesAnteriores && fr.pendentesAnteriores.length > 0 && (
            <div style={{ marginTop: '12px', backgroundColor: '#fff9c4', borderRadius: '6px', padding: '10px', fontSize: '12px', borderLeft: '4px solid #f9a825' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <strong style={{ color: '#f57f17' }}>⏳ Pendências de meses anteriores ({fr.pendentesAnteriores.length}):</strong>
                <span style={{ fontSize: '11px', color: '#5d4037' }}>
                  Total: <strong>{fmtMoeda(fr.pendentesAnteriores.reduce((s: number, x: any) => s + R(x.valor), 0))}</strong>
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9a825', color: 'white' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Data orig.</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {fr.pendentesAnteriores.map((p: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fffde7' : 'white', borderBottom: '1px solid #fff176' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: '#fff3e0', color: '#e65100' }}>
                          {p.tipo || p.origem || 'Pendente'}
                        </span>
                      </td>
                      <td style={{ padding: '4px 6px', color: '#555' }}>{p.descricao || '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>
                        −{fmtMoeda(R(p.valor))}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>
                        {p.dataPagamento || p.data || '—'}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button
                          onClick={() => { onClose(); navigate('/modulos/extrato'); }}
                          style={{ padding: '2px 6px', fontSize: '10px', border: 'none', borderRadius: '4px', backgroundColor: '#f57c00', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                          title="Editar no Extrato de Pagamentos"
                        >
                          ✏️ Extrato
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#5d4037', fontStyle: 'italic' }}>
                💡 Para descontar: vá ao Extrato de Pagamentos → filtre por "{fr.nome}" → clique ✏️ para editar e marcar como Pago quando descontado.
              </div>
            </div>
          )}

          {fr.chavePix && (
            <div style={{ padding: '10px', marginTop: '10px', backgroundColor: '#e8f5e9', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <strong>💳 PIX:</strong> {fr.chavePix}
              <button onClick={() => navigator.clipboard.writeText(fr.chavePix!)}
                style={{ ...s.btn('#43a047'), padding: '4px 10px', fontSize: '11px' }}>📋 Copiar</button>
            </div>
          )}

          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Modal Confirmar Pagamento CLT (com data editável) ── */
  // Hook called unconditionally (React rules) — state persists across renders
  const [dataLocalCLT, setDataLocalCLT] = useState(new Date().toISOString().split('T')[0]);
  // Reset date whenever modal opens
  useEffect(() => {
    if (modalPagamento) setDataLocalCLT(new Date().toISOString().split('T')[0]);
  }, [modalPagamento]);

  const ModalConfirmarPagamentoCLT = () => {
    if (!modalPagamento) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalPagamento(null)}>
        <div style={{ ...s.card, maxWidth: '380px', width: '94%', padding: '24px' }}
          onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', color: '#2e7d32' }}>✅ Confirmar Pagamento</h3>
          <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#333' }}>
            <strong>{modalPagamento.nome}</strong>
          </p>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#666' }}>
            Saldo: <strong style={{ color: '#1976d2' }}>{fmtMoeda(modalPagamento.saldoFinal)}</strong>
          </p>
          <label style={{ ...s.label }}>Data do pagamento</label>
          <input
            type="date"
            value={dataLocalCLT}
            onChange={e => setDataLocalCLT(e.target.value)}
            style={{ ...s.input, marginBottom: '16px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={async () => { setModalPagamento(null); await handleTogglePago(modalPagamento, dataLocalCLT); }}
              style={s.btn('#43a047')}>✅ Confirmar
            </button>
            <button onClick={() => setModalPagamento(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="💰 Folha de Pagamento" showBack={true} />
      <ModalConfirmarPagamentoCLT />
      <ModalConfirmarPgtoFreelancer />
      {detalheSelecionado && <ModalDetalhe f={detalheSelecionado} onClose={() => setDetalheSelecionado(null)} />}
      {detalheFreelancer && <ModalDetalheFreelancer data={detalheFreelancer} onClose={() => setDetalheFreelancer(null)} />}
      {historicoColabId && (
        <ModalHistorico
          items={historicoItems}
          nome={(() => { const f = folhasLocais.find(x => x.colaboradorId === historicoColabId) || freelancers.find(x => x.id === historicoColabId); return (f as any)?.nome || historicoColabId; })()}
          onClose={() => { setHistoricoColabId(null); setHistoricoItems([]); }}
        />
      )}

      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* Filtros globais */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={folhasFiltradas.length === 0 && fechamentosFreelancer.length === 0} style={s.btn('#7b1fa2')}>
            📥 XLSX
          </button>
          <button onClick={() => navigate('/modulos/extrato')} style={s.btn('#00838f')}>
            📋 Extrato
          </button>
        </div>

        {/* Cards resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'CLT', val: `${folhasLocais.length}`, cor: '#1976d2' },
            { label: 'Total Salários CLT', val: fmtMoeda(totais.salarios), cor: '#6a1b9a' },
            { label: 'Pgto dia 20', val: fmtMoeda(totais.pgto20), cor: '#fb8c00' },
            { label: 'Pgto dia 05', val: fmtMoeda(totais.pgto05), cor: '#0288d1' },
            { label: 'Freelancers (mês)', val: fmtMoeda(totalFreelancerMes), cor: '#c2185b' },
            { label: 'Total Mês', val: fmtMoeda(totais.saldo + totalFreelancerMes), cor: '#2e7d32' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0', flexWrap: 'wrap' }}>
          <button style={s.tab(aba === 'clt')} onClick={() => setAba('clt')}>🧾 Colaboradores CLT</button>
          <button style={s.tab(aba === 'dobras')} onClick={() => setAba('dobras')}>
            📅 Dobras Semanais
          </button>
          <button style={s.tab(aba === 'freelancers')} onClick={() => setAba('freelancers')}>
            🎯 Freelancers {fechamentosFreelancer.length > 0 ? `(${fechamentosFreelancer.length} semana${fechamentosFreelancer.length > 1 ? 's' : ''})` : ''}
          </button>
        </div>

        {/* ── ABA CLT ─────────────────────────────────────────── */}
        {aba === 'clt' && (
          <>
            {/* Filtros CLT */}
            <div style={{ ...s.card, borderRadius: '0 8px 0 0', borderBottom: 'none', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 16px' }}>
              <div>
                <label style={s.label}>Tipo</label>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="todos">Todos</option><option value="CLT">CLT</option><option value="Freelancer">Freelancer</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Status</label>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="todos">Todos</option><option value="pago">Pagos</option><option value="pendente">Pendentes</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999', borderRadius: '0 8px 8px 8px' }}>Carregando dados...</div>
            ) : folhasFiltradas.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999', borderRadius: '0 8px 8px 8px' }}>Nenhum colaborador CLT para este período.</div>
            ) : (
              <div style={{ ...s.card, overflowX: 'auto', borderRadius: '0 8px 8px 8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nome</th>
                      <th style={s.th}>Cargo</th>
                      <th style={s.thC}>Tipo</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Sal. Base</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>+ Periculosidade</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável ≤19</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#fb8c00' }}>Pgto dia 20</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Dif. Sal.</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável 20–31</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>INSS</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>Contr. Assist.</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0288d1' }}>Pgto dia 05</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0d47a1' }}>Saldo Final</th>
                      <th style={s.thC}>Status</th>
                      <th style={s.thC}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folhasFiltradas.map((f, idx) => (
                      <tr key={f.colaboradorId}
                        style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fafafa' : 'white')}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                        <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <span style={f.tipoContrato === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                            {f.tipoContrato}
                          </span>
                        </td>
                        <td style={s.tdR}>{fmtMoeda(f.salarioBase)}</td>
                        <td style={{ ...s.tdR, color: '#e65100' }}>{f.periculosidade > 0 ? fmtMoeda(f.periculosidade) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{f.variavelAte19 > 0 ? fmtMoeda(f.variavelAte19) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#fb8c00', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia20)}</td>
                        <td style={s.tdR}>{fmtMoeda(f.diferencaSalario)}</td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{f.variavelDe20a31 > 0 ? fmtMoeda(f.variavelDe20a31) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{fmtMoeda(f.inss)}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{f.contrAssistencial > 0 ? fmtMoeda(f.contrAssistencial) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#0288d1', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia05)}</td>
                        <td style={{ ...s.tdR, fontWeight: 'bold', color: f.saldoFinal >= 0 ? '#2e7d32' : '#c62828' }}>
                          {fmtMoeda(f.saldoFinal)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <span style={f.pago ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff9c4', '#f57f17')}>
                            {f.pago ? '✅ Pago' : '⏳ Pendente'}
                          </span>
                          {f.pago && f.dataPagamento && (
                            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{f.dataPagamento}</div>
                          )}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => setDetalheSelecionado(f)} style={{ ...s.btn('#1976d2'), padding: '4px 10px', fontSize: '11px' }}
                              title="Ver detalhes">
                              📋
                            </button>
                            <button onClick={() => abrirHistorico(f.colaboradorId)} style={{ ...s.btn('#6a1b9a'), padding: '4px 10px', fontSize: '11px' }}
                              title="Histórico analítico">
                              📊
                            </button>
                            <button
                              onClick={() => f.pago ? handleTogglePago(f) : setModalPagamento(f)}
                              disabled={salvando}
                              title={f.pago ? 'Desfazer pagamento' : 'Registrar pagamento com data'}
                              style={{ ...s.btn(f.pago ? '#e53935' : '#43a047'), padding: '4px 10px', fontSize: '11px' }}>
                              {f.pago ? '↩' : '✅'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                      <td style={{ padding: '8px', fontSize: '13px' }} colSpan={3}>TOTAIS</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.salarioBase, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.periculosidade, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(totais.variavel - folhasFiltradas.reduce((s, f) => s + f.variavelDe20a31, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ffcc80' }}>{fmtMoeda(totais.pgto20)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.diferencaSalario, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.variavelDe20a31, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ef9a9a' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.inss, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ef9a9a' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.contrAssistencial, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#b3e5fc' }}>{fmtMoeda(totais.pgto05)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7' }}>{fmtMoeda(totais.saldo)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>🟠 <strong>Pgto dia 20</strong> = variável até 19 + adiantamento 40% sal.</span>
                  <span>🔵 <strong>Pgto dia 05</strong> = variável 20–31 + diferença sal. (60%) − INSS − contr. assist.</span>
                  <span>🟣 <strong>Periculosidade</strong>: CLT motoboy = 30% sobre salário base</span>
                </div>
              </div>
            )}
          </>
        )}


        {/* ── ABA DOBRAS SEMANAIS ─────────────────────────────── */}
        {aba === 'dobras' && (() => {
          const [anoM, mesM] = mesAno.split('-').map(Number);

          interface SemanaInfo { label: string; inicio: string; fim: string; proxSeg: string; }
          const semanas: SemanaInfo[] = [];
          const primDia = new Date(anoM, mesM - 1, 1);
          const ultDia = new Date(anoM, mesM, 0);
          let cur = new Date(primDia);
          // Start from Monday of first week
          const dow0 = cur.getDay();
          if (dow0 !== 1) cur.setDate(cur.getDate() + (dow0 === 0 ? -6 : 1 - dow0));
          while (cur <= ultDia) {
            const seg = new Date(cur);
            const dom = new Date(cur); dom.setDate(dom.getDate() + 6);
            const fimReal = dom > ultDia ? new Date(ultDia) : new Date(dom);
            const inicioStr = seg.toISOString().split('T')[0];
            const fimStr = fimReal.toISOString().split('T')[0];
            // proxSeg after fim
            const ps = new Date(fimReal);
            const pdow = ps.getDay();
            ps.setDate(ps.getDate() + (pdow === 1 ? 0 : pdow === 0 ? 1 : 8 - pdow));
            semanas.push({
              label: `${seg.getDate().toString().padStart(2,'0')}/${(seg.getMonth()+1).toString().padStart(2,'0')} – ${fimReal.getDate().toString().padStart(2,'0')}/${(fimReal.getMonth()+1).toString().padStart(2,'0')}`,
              inicio: inicioStr,
              fim: fimStr,
              proxSeg: `${ps.getDate().toString().padStart(2,'0')}/${(ps.getMonth()+1).toString().padStart(2,'0')}/${ps.getFullYear()}`,
            });
            cur.setDate(cur.getDate() + 7);
          }

          const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
          const AREA_COR: Record<string,string> = { 'Bar':'#ad1457','Cozinha':'#e65100','Salão':'#2e7d32','Operações':'#1565c0','Gerência':'#37474f','Pizzaria':'#6a1b9a','Caixa':'#558b2f' };
          const corArea = (a: string) => AREA_COR[a] || '#455a64';

          // Build all people (colaboradores + freelancers) for this view
          interface PessoaDobra {
            id: string; nome: string; chavePix?: string; cargo?: string;
            tipoContrato: string; area?: string; funcao?: string;
            valorDia: number; valorNoite: number; valorDobra: number; valorTransporte: number;
          }
          const pessoas: PessoaDobra[] = [
            ...colaboradores.map(c => ({
              id: c.id, nome: c.nome, chavePix: c.chavePix, cargo: c.cargo,
              tipoContrato: c.tipoContrato || 'CLT',
              area: c.area, funcao: c.funcao,
              valorDia: c.valorDia || 0, valorNoite: c.valorNoite || 0,
              valorDobra: 0, valorTransporte: c.valorTransporte || 0,
            })),
            ...freelancers.map(f => ({
              id: f.id, nome: f.nome, chavePix: f.chavePix, cargo: f.cargo,
              tipoContrato: 'Freelancer' as const, area: f.area, funcao: f.funcao || f.cargo,
              valorDia: R(f.valorDia) || 0,
              valorNoite: R(f.valorNoite) || 0,
              // valorDobra usado quando não há valorDia/valorNoite separados
              valorDobra: R((f as any).valorDobra) || R(f.valorDia) || 120,
              valorTransporte: f.valorTransporte || 0,
            })),
          ].sort((a,b) => {
            const aa = a.area || 'zzz', ba = b.area || 'zzz';
            return aa !== ba ? aa.localeCompare(ba) : a.nome.localeCompare(b.nome);
          });

          const areasP = [...new Set(pessoas.map(p => p.area || 'Sem Área'))].sort();

          return (
            <div style={{ borderRadius: '0 8px 8px 8px' }}>
              <div style={{ padding: '10px 14px', backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', borderRadius: '0 0 4px 4px', marginBottom: '8px', fontSize: '12px', color: '#1b5e20' }}>
                📅 <strong>Dobras Semanais</strong> — controle semanal de turnos (CLT dobras + Freelancers). Valores editáveis. Marque como Pago para registrar data e log.
              </div>

              {loading ? (
                <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
              ) : semanas.map(sem => {
                // Pessoas que trabalharam nesta semana
                interface LinhaCalc {
                  pessoa: PessoaDobra;
                  dC: number; nC: number; dnC: number;
                  codigos: string[];
                  totalBruto: number;
                  totalTransporte: number;
                }
                const linhas: LinhaCalc[] = pessoas.map(p => {
                  let dC=0, nC=0, dnC=0;
                  const codigos: string[] = [];
                  // Get days in this week
                  const d1 = new Date(sem.inicio + 'T12:00:00');
                  const d2 = new Date(sem.fim + 'T12:00:00');
                  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+1)) {
                    const ds = d.toISOString().split('T')[0];
                    const esc = escalas.find(e => e.colaboradorId === p.id && e.data === ds);
                    if (!esc || esc.turno === 'Folga') { codigos.push('—'); continue; }
                    if (esc.turno === 'Dia') { dC++; codigos.push('D'); }
                    else if (esc.turno === 'Noite') { nC++; codigos.push('N'); }
                    else if (esc.turno === 'DiaNoite') { dnC++; dC++; nC++; codigos.push('DN'); }
                  }
                  let totalBruto = 0;
                  const vDia = p.valorDia || 0;
                  const vNoite = p.valorNoite || 0;
                  if (p.tipoContrato === 'CLT' || (vDia > 0 || vNoite > 0)) {
                    // Calcula por turno: DN = vDia + vNoite, D = vDia, N = vNoite
                    totalBruto = (vDia + vNoite) * dnC + vDia * (dC - dnC) + vNoite * (nC - dnC);
                  } else {
                    // Freelancer com dobra única (valorDobra)
                    const vd = p.valorDobra || 120;
                    const dobrasCalc = dnC + (dC - dnC) * 0.5 + (nC - dnC) * 0.5;
                    totalBruto = vd * dobrasCalc;
                  }
                  const diasTrab = codigos.filter(c => c !== '—').length;
                  const totalTransporte = p.valorTransporte * diasTrab;
                  return { pessoa: p, dC, nC, dnC, codigos, totalBruto, totalTransporte };
                }).filter(l => l.dC + l.nC + l.dnC > 0);

                if (linhas.length === 0) return null;

                const semTotalBruto = linhas.reduce((s, l) => s + l.totalBruto, 0);
                const semTotalTransp = linhas.reduce((s, l) => s + l.totalTransporte, 0);

                return (
                  <div key={sem.inicio} style={{ ...s.card, marginBottom: '20px', borderTop: '3px solid #1565c0' }}>
                    {/* Header semana */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, color: '#1565c0', fontSize: '15px' }}>
                          📅 Semana {sem.label}
                        </h4>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                          💳 Pagto na <strong>{sem.proxSeg}</strong>
                          {' · '}CLT: <strong style={{ color: '#1976d2' }}>{fmtMoeda(linhas.filter(l=>l.pessoa.tipoContrato==='CLT').reduce((s,l)=>s+l.totalBruto,0))}</strong>
                          {' · '}Free: <strong style={{ color: '#c2185b' }}>{fmtMoeda(linhas.filter(l=>l.pessoa.tipoContrato!=='CLT').reduce((s,l)=>s+l.totalBruto,0))}</strong>
                          {semTotalTransp > 0 && <> · 🚗 <strong style={{ color: '#1565c0' }}>{fmtMoeda(semTotalTransp)}</strong></>}
                          {' · '}Total: <strong style={{ color: '#1b5e20' }}>{fmtMoeda(semTotalBruto + semTotalTransp)}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Tabela por área */}
                    {areasP.map(area => {
                      const gp = linhas.filter(l => (l.pessoa.area || 'Sem Área') === area);
                      if (gp.length === 0) return null;
                      const ac = corArea(area);
                      const areaTotal = gp.reduce((s,l)=>s+l.totalBruto+l.totalTransporte,0);
                      return (
                        <div key={area} style={{ marginBottom: '16px' }}>
                          <div style={{ backgroundColor: ac, color: 'white', padding: '5px 12px', borderRadius: '4px 4px 0 0', fontWeight: 'bold', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>📍 {area}</span>
                            <span style={{ opacity: 0.9 }}>{fmtMoeda(areaTotal)}</span>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f5f5f5' }}>
                                  <th style={{ ...s.th, backgroundColor: ac, textAlign: 'left', minWidth: '130px' }}>Nome</th>
                                  <th style={{ ...s.th, backgroundColor: ac, minWidth: '40px' }}>Tipo</th>
                                  <th style={{ ...s.th, backgroundColor: ac, textAlign: 'left', minWidth: '80px' }}>Função</th>
                                  {(() => {
                                    const days: string[] = [];
                                    const d1 = new Date(sem.inicio + 'T12:00:00');
                                    const d2 = new Date(sem.fim + 'T12:00:00');
                                    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+1)) {
                                      days.push(d.toISOString().split('T')[0]);
                                    }
                                    return days.map(ds => {
                                      const dow = new Date(ds + 'T12:00:00').getDay();
                                      return <th key={ds} style={{ ...s.thC, backgroundColor: dow===0||dow===6?'#546e7a':ac, minWidth: '40px', fontSize: '10px' }}>
                                        {parseInt(ds.split('-')[2])}/{parseInt(ds.split('-')[1])}
                                        <div style={{ fontSize: '9px', opacity: 0.85 }}>{DIAS_ABR[dow]}</div>
                                      </th>;
                                    });
                                  })()}
                                  <th style={{ ...s.thC, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '10px' }}>D</th>
                                  <th style={{ ...s.thC, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '10px' }}>N</th>
                                  <th style={{ ...s.thC, backgroundColor: '#0d47a1', minWidth: '28px', fontSize: '10px' }}>DN</th>
                                  <th style={{ ...s.th, backgroundColor: '#1b5e20', textAlign: 'right', minWidth: '85px', fontSize: '11px' }}>Bruto (R$)</th>
                                  <th style={{ ...s.th, backgroundColor: '#1565c0', textAlign: 'right', minWidth: '70px', fontSize: '11px' }}>🚗 Transp</th>
                                  <th style={{ ...s.th, backgroundColor: '#2e7d32', textAlign: 'right', minWidth: '85px', fontSize: '11px' }}>Total</th>
                                  <th style={{ ...s.th, backgroundColor: '#37474f', textAlign: 'center', minWidth: '80px', fontSize: '10px' }}>Status</th>
                                  <th style={{ ...s.th, backgroundColor: '#37474f', textAlign: 'left', minWidth: '100px', fontSize: '10px' }}>PIX</th>
                                </tr>
                              </thead>
                              <tbody>
                                {gp.map((l, li) => {
                                  const p = l.pessoa;
                                  const editKey = `${sem.inicio}_${p.id}`;
                                  const ed = editDobras[editKey] || {};
                                  const brutoEditado = ed.valorBruto !== undefined ? (parseFloat(ed.valorBruto) || 0) : l.totalBruto;
                                  const transpEditado = ed.valorTransporte !== undefined ? (parseFloat(ed.valorTransporte) || 0) : l.totalTransporte;
                                  const totalEdit = brutoEditado + transpEditado;
                                  // payment log from folhasDB or local state
                                  const folhaSalva = folhasDB.find(f => f.colaboradorId === p.id && f.mes === mesAno && f.semana === sem.inicio);
                                  const isPago = folhaSalva?.pago || false;
                                  const dataPgto = folhaSalva?.dataPagamento;
                                  const cod = l.codigos;
                                  const days2: string[] = [];
                                  const d1 = new Date(sem.inicio + 'T12:00:00');
                                  const d2 = new Date(sem.fim + 'T12:00:00');
                                  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+1)) days2.push(d.toISOString().split('T')[0]);

                                  return (
                                    <tr key={p.id} style={{ backgroundColor: li % 2 === 0 ? '#fafafa' : 'white' }}>
                                      <td style={{ ...s.td, fontWeight: 'bold', borderLeft: `3px solid ${corArea(p.area||'')}` }}>
                                        {p.nome.split(' ').slice(0,2).join(' ')}
                                      </td>
                                      <td style={{ ...s.td, textAlign: 'center' }}>
                                        <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 'bold',
                                          backgroundColor: p.tipoContrato==='CLT' ? '#e8f5e9' : '#fff3e0',
                                          color: p.tipoContrato==='CLT' ? '#2e7d32' : '#e65100' }}>
                                          {p.tipoContrato==='CLT' ? 'CLT' : 'Free'}
                                        </span>
                                      </td>
                                      <td style={{ ...s.td, fontSize: '11px', color: '#555' }}>{p.funcao || p.cargo || '—'}</td>
                                      {days2.map((ds, di) => {
                                        const c = cod[di] || '—';
                                        let bg = 'transparent', tc = '#bbb';
                                        if (c==='D') { bg='#fff9c4'; tc='#f57f17'; }
                                        else if (c==='N') { bg='#e8eaf6'; tc='#3949ab'; }
                                        else if (c==='DN') { bg='#e8f5e9'; tc='#2e7d32'; }
                                        return <td key={ds} style={{ ...s.td, textAlign: 'center', padding: '4px 2px' }}>
                                          <span style={{ backgroundColor: bg, color: tc, padding: '1px 4px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', minWidth: '22px', display: 'inline-block' }}>{c}</span>
                                        </td>;
                                      })}
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#f57f17' }}>{l.dC}</td>
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#3949ab' }}>{l.nC}</td>
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32' }}>{l.dnC}</td>
                                      {/* Bruto editável */}
                                      <td style={{ ...s.td, textAlign: 'right', padding: '4px 4px' }}>
                                        <input
                                          type="number" step="0.01" min="0"
                                          value={ed.valorBruto !== undefined ? ed.valorBruto : l.totalBruto.toFixed(2)}
                                          onChange={e => setEditDobras(prev => ({ ...prev, [editKey]: { ...prev[editKey], valorBruto: e.target.value } }))}
                                          style={{ width: '75px', padding: '3px 5px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', textAlign: 'right', backgroundColor: ed.valorBruto !== undefined ? '#fff9e0' : 'white' }}
                                        />
                                      </td>
                                      {/* Transporte editável */}
                                      <td style={{ ...s.td, textAlign: 'right', padding: '4px 4px' }}>
                                        <input
                                          type="number" step="0.50" min="0"
                                          value={ed.valorTransporte !== undefined ? ed.valorTransporte : l.totalTransporte.toFixed(2)}
                                          onChange={e => setEditDobras(prev => ({ ...prev, [editKey]: { ...prev[editKey], valorTransporte: e.target.value } }))}
                                          style={{ width: '65px', padding: '3px 5px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', textAlign: 'right', backgroundColor: ed.valorTransporte !== undefined ? '#e3f2fd' : 'white' }}
                                        />
                                      </td>
                                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '13px' }}>
                                        {fmtMoeda(totalEdit)}
                                      </td>
                                      {/* Status pago */}
                                      <td style={{ ...s.td, textAlign: 'center' }}>
                                        <button
                                          onClick={async () => {
                                            if (!isPago) {
                                              const hoje2 = new Date().toISOString().split('T')[0];
                                              const dataConfirmada = window.prompt('Data do pagamento (AAAA-MM-DD):', hoje2);
                                              if (!dataConfirmada) return;
                                              setSalvando(true);
                                              try {
                                                const payload = {
                                                  colaboradorId: p.id, mes: mesAno, semana: sem.inicio, unitId,
                                                  pago: true,
                                                  dataPagamento: dataConfirmada,
                                                  valorBruto: brutoEditado, valorTransporte: transpEditado,
                                                  totalFinal: totalEdit, obs: ed.obs || '',
                                                };
                                                await fetch(`${apiUrl}/folha-pagamento`, {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                                  body: JSON.stringify(payload),
                                                });
                                                await carregarDados();
                                              } catch { alert('Erro ao salvar status'); }
                                              finally { setSalvando(false); }
                                            } else {
                                              setSalvando(true);
                                              try {
                                                const payload = {
                                                  colaboradorId: p.id, mes: mesAno, semana: sem.inicio, unitId,
                                                  pago: false, dataPagamento: null,
                                                  valorBruto: brutoEditado, valorTransporte: transpEditado,
                                                  totalFinal: totalEdit, obs: ed.obs || '',
                                                };
                                                await fetch(`${apiUrl}/folha-pagamento`, {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                                  body: JSON.stringify(payload),
                                                });
                                                await carregarDados();
                                              } catch { alert('Erro ao salvar status'); }
                                              finally { setSalvando(false); }
                                            }
                                          }}
                                          disabled={salvando}
                                          style={{ ...s.btn(isPago ? '#e53935' : '#43a047'), padding: '3px 8px', fontSize: '11px' }}
                                        >
                                          {isPago ? '✅ Pago' : '⏳ Pagar'}
                                        </button>
                                        {isPago && dataPgto && (
                                          <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>{dataPgto}</div>
                                        )}
                                        <button
                                          onClick={() => abrirHistorico(p.id)}
                                          style={{ ...s.btn('#6a1b9a'), padding: '2px 6px', fontSize: '9px', marginTop: '3px' }}
                                          title="Histórico de pagamentos"
                                        >📊</button>
                                      </td>
                                      <td style={{ ...s.td, fontSize: '11px' }}>
                                        {p.chavePix ? (
                                          <span
                                            onClick={() => navigator.clipboard.writeText(p.chavePix!)}
                                            style={{ cursor: 'pointer', color: '#1976d2', fontSize: '11px' }}
                                            title="Clique para copiar PIX"
                                          >💳 {p.chavePix}</span>
                                        ) : <span style={{ color: '#bbb' }}>—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ backgroundColor: '#e8f5e9', borderTop: `2px solid ${ac}` }}>
                                  <td colSpan={3} style={{ padding: '6px 10px', fontWeight: 'bold', color: ac, fontSize: '12px' }}>Subtotal {area}</td>
                                  {(() => {
                                    const days3: string[] = [];
                                    const d1 = new Date(sem.inicio + 'T12:00:00');
                                    const d2 = new Date(sem.fim + 'T12:00:00');
                                    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+1)) days3.push(d.toISOString().split('T')[0]);
                                    return <td colSpan={days3.length + 3} />;
                                  })()}
                                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>
                                    {fmtMoeda(gp.reduce((s,l) => {
                                      const ek = `${sem.inicio}_${l.pessoa.id}`;
                                      const ed = editDobras[ek] || {};
                                      return s + (ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto);
                                    }, 0))}
                                  </td>
                                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: '#1565c0', fontSize: '12px' }}>
                                    {fmtMoeda(gp.reduce((s,l) => {
                                      const ek = `${sem.inicio}_${l.pessoa.id}`;
                                      const ed = editDobras[ek] || {};
                                      return s + (ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : l.totalTransporte);
                                    }, 0))}
                                  </td>
                                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '13px' }}>
                                    {fmtMoeda(gp.reduce((s,l) => {
                                      const ek = `${sem.inicio}_${l.pessoa.id}`;
                                      const ed = editDobras[ek] || {};
                                      const br = ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto;
                                      const tr = ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : l.totalTransporte;
                                      return s + br + tr;
                                    }, 0))}
                                  </td>
                                  <td colSpan={2} />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })}

                    {/* Rodapé semana */}
                    <div style={{ marginTop: '8px', padding: '10px 14px', backgroundColor: '#1565c0', borderRadius: '6px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '12px', opacity: 0.9 }}>💳 Pagto previsto na <strong>{sem.proxSeg}</strong></span>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px' }}>CLT: <strong>{fmtMoeda(linhas.filter(l=>l.pessoa.tipoContrato==='CLT').reduce((s,l) => {
                          const ek = `${sem.inicio}_${l.pessoa.id}`;
                          const ed = editDobras[ek] || {};
                          return s + (ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto);
                        }, 0))}</strong></span>
                        <span style={{ fontSize: '12px' }}>Free: <strong>{fmtMoeda(linhas.filter(l=>l.pessoa.tipoContrato!=='CLT').reduce((s,l) => {
                          const ek = `${sem.inicio}_${l.pessoa.id}`;
                          const ed = editDobras[ek] || {};
                          return s + (ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto);
                        }, 0))}</strong></span>
                        {semTotalTransp > 0 && <span style={{ fontSize: '12px' }}>🚗: <strong>{fmtMoeda(linhas.reduce((s,l) => {
                          const ek = `${sem.inicio}_${l.pessoa.id}`;
                          const ed = editDobras[ek] || {};
                          return s + (ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : l.totalTransporte);
                        }, 0))}</strong></span>}
                        <span style={{ fontSize: '15px', fontWeight: 'bold' }}>Total: {fmtMoeda(linhas.reduce((s,l) => {
                          const ek = `${sem.inicio}_${l.pessoa.id}`;
                          const ed = editDobras[ek] || {};
                          const br = ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto;
                          const tr = ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : l.totalTransporte;
                          return s + br + tr;
                        }, 0))}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── ABA FREELANCERS ──────────────────────────────────── */}
        {aba === 'freelancers' && (
          <div style={{ borderRadius: '0 8px 8px 8px' }}>
            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : freelancers.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>
                <p>Nenhum freelancer cadastrado.</p>
                <p style={{ fontSize: '13px' }}>Cadastre freelancers na aba <strong>Escalas → Freelancers</strong>.</p>
              </div>
            ) : fechamentosFreelancer.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>
                <p>Nenhuma escala de freelancer lançada em {mesAno}.</p>
                <p style={{ fontSize: '13px' }}>Lance as escalas na aba <strong>Escalas → Editar Turno</strong>.</p>
              </div>
            ) : (
              <>
                {/* Informações sobre transporte e descontos */}
                <div style={{ backgroundColor: '#e3f2fd', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#1565c0', borderLeft: '4px solid #1976d2' }}>
                  <strong>ℹ️ Como funciona o pagamento semanal de freelancers:</strong>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0, lineHeight: '1.8' }}>
                    <li><strong>Transporte calculado</strong>: dias com escala lançada × valor/dia configurado no cadastro. Se o colaborador faltar e a escala for removida, não é contabilizado.</li>
                    <li>
                      <strong>🚗 Adiantamento de Transporte</strong>: se voc\u00ea pagou o transporte antecipado,
                      v\u00e1 em <strong>Sa\u00eddas → Novo Registro</strong>, selecione o colaborador, escolha o tipo
                      <em> "🚗 Adiantamento Transporte"</em> e informe o valor pago. O sistema abate automaticamente
                      esse valor do transporte calculado na semana correspondente e mostra o saldo restante.
                    </li>
                    <li><strong>🔴 Descontos (A receber)</strong>: lan\u00e7amentos tipo <em>"A receber"</em> em Sa\u00eddas (vale, empr\u00e9stimo, etc.) s\u00e3o descontados automaticamente do l\u00edquido da semana.</li>
                    <li><strong>Ajuste manual</strong>: use os campos <em>Extra / Desconto</em> no cabe\u00e7alho de cada semana para corre\u00e7\u00f5es avulsas que n\u00e3o se enquadram nos tipos acima.</li>
                  </ul>
                </div>
                {/* ── Checklist de Pendências de meses anteriores ────────── */}
                {(() => {
                  const colabsComPendencia = freelancers.map(fr => {
                    const pends = saidasPendentesAnt.filter((s: any) => s.colaboradorId === fr.id);
                    return { fr, pends };
                  }).filter(x => x.pends.length > 0);

                  if (colabsComPendencia.length === 0) return null;

                  const totalPendente = colabsComPendencia.reduce(
                    (sum, x) => sum + x.pends.reduce((s: number, p: any) => s + R(p.valor), 0), 0
                  );

                  return (
                    <div style={{ ...s.card, marginBottom: '16px', borderLeft: '4px solid #f9a825', backgroundColor: '#fffde7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#f57f17', fontSize: '14px' }}>
                          ⏳ Checklist de Pendências — Saídas a Descontar no Próximo Pagamento
                        </h4>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#5d4037', fontWeight: 'bold' }}>
                            Total: {fmtMoeda(totalPendente)}
                          </span>
                          <button
                            onClick={() => navigate('/modulos/extrato')}
                            style={{ padding: '4px 10px', fontSize: '11px', border: 'none', borderRadius: '4px', backgroundColor: '#f57c00', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ✏️ Editar no Extrato
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: '#5d4037', marginBottom: '10px', fontStyle: 'italic' }}>
                        Estas saídas foram lançadas em meses anteriores e marcadas como <strong>Pendente</strong>.
                        Para descontá-las: no Extrato de Pagamentos, filtre o colaborador → clique <strong>✏️</strong> na saída → marque como <strong>Pago</strong> quando descontar.
                      </div>
                      {colabsComPendencia.map(({ fr, pends }) => (
                        <div key={fr.id} style={{ marginBottom: '10px', borderBottom: '1px solid #fff176', paddingBottom: '8px' }}>
                          <div style={{ fontWeight: 'bold', color: '#5d4037', marginBottom: '4px', fontSize: '12px' }}>
                            👤 {fr.nome}
                            <span style={{ marginLeft: '8px', fontWeight: 'normal', color: '#888' }}>
                              ({pends.length} item{pends.length > 1 ? 's' : ''} · {fmtMoeda(pends.reduce((s: number, p: any) => s + R(p.valor), 0))})
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {pends.map((p: any, i: number) => (
                              <div key={i} style={{ backgroundColor: '#fff8e1', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', border: '1px solid #ffe082', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: '#e65100', fontWeight: 'bold' }}>{p.tipo || p.origem || 'Saída'}</span>
                                <span style={{ color: '#555' }}>{p.descricao || '—'}</span>
                                <span style={{ color: '#c62828', fontWeight: 'bold' }}>−{fmtMoeda(R(p.valor))}</span>
                                <span style={{ color: '#888', fontFamily: 'monospace' }}>{(p.dataPagamento || p.data || '').substring(0, 10)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Total do m\u00eas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px', paddingTop: '12px' }}>
                  <div style={{ ...s.card, borderLeft: '4px solid #c2185b' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Total L\u00edquido Freelancers</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c2185b' }}>{fmtMoeda(totalFreelancerMes)}</div>
                  </div>
                  <div style={{ ...s.card, borderLeft: '4px solid #1976d2' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Semanas com escala</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>{fechamentosFreelancer.length}</div>
                  </div>
                  <div style={{ ...s.card, borderLeft: '4px solid #43a047' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Freelancers ativos</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#43a047' }}>{freelancers.length}</div>
                  </div>
                </div>

                {/* Fechamento por semana */}
                {fechamentosFreelancer.map((fech) => {
                  const key = fech.dataFechamento;
                  const ef = editFechamento[key] || { combustivel: '0', extra: '0', desconto: '0', obs: '' };
                  const updateEf = (campo: string, val: string) => setEditFechamento(prev => ({
                    ...prev, [key]: { ...ef, [campo]: val }
                  }));
                  return (
                    <div key={key} style={{ ...s.card, marginBottom: '16px', borderTop: '3px solid #c2185b' }}>
                      {/* Cabeçalho da semana */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#c2185b', fontSize: '15px' }}>
                          📅 Semana {fech.semanaLabel}
                        </h4>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', color: '#666' }}>Combustível:</span>
                          <input type="number" step="10" min="0" value={ef.combustivel || '0'}
                            onChange={e => updateEf('combustivel', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                          <span style={{ fontSize: '13px', color: '#666' }}>Extra:</span>
                          <input type="number" step="10" min="0" value={ef.extra || '0'}
                            onChange={e => updateEf('extra', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                          <span style={{ fontSize: '13px', color: '#666' }}>Desconto:</span>
                          <input type="number" step="10" min="0" value={ef.desconto || '0'}
                            onChange={e => updateEf('desconto', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                        </div>
                      </div>

                      {/* Tabela da semana */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr>
                              {['Freelancer', 'PIX / Tel', 'Dias (código)', 'Dobras', 'Valor/Dobra', 'Total Dobras', 'Transp.', 'Desconto', 'Líquido', 'Status', 'Ações'].map(h => (
                                <th key={h} style={s.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fech.freelancers.map((fr, fi) => {
                              const frFolhaSalva = folhasDB.find((f: any) =>
                                f.colaboradorId === fr.id && f.mes === mesAno && f.semana === fech.dataFechamento
                              );
                              const frIsPago = frFolhaSalva?.pago || fr.pago || false;
                              const frDataPgto = frFolhaSalva?.dataPagamento;
                              return (
                              <tr key={fr.id} style={{ backgroundColor: (fr.pendentesAnteriores?.length > 0) ? '#fffde7' : (fi % 2 === 0 ? '#fafafa' : 'white'), borderLeft: fr.pendentesAnteriores?.length > 0 ? '3px solid #f9a825' : '3px solid transparent' }}>
                                <td style={{ ...s.td, fontWeight: 'bold' }}>
                                  {fr.nome}
                                  {fr.pendentesAnteriores?.length > 0 && (
                                    <span style={{ marginLeft: '6px', fontSize: '10px', color: '#f57f17', fontWeight: 'bold' }}
                                      title={`${fr.pendentesAnteriores.length} pendência(s) de meses anteriores a descontar`}>
                                      ⏳ {fr.pendentesAnteriores.length} pend.
                                    </span>
                                  )}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px' }}>
                                  {fr.chavePix && <div>💳 {fr.chavePix}</div>}
                                  {fr.telefone && <div>📱 {fr.telefone}</div>}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px', color: '#555', maxWidth: '200px' }}>
                                  {fr.diasCodigo || '—'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>
                                  {fr.dobras}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right' }}>
                                  {(fr.valorDia > 0 || fr.valorNoite > 0)
                                    ? <><span style={{ color: '#e65100' }}>☀️{fmt(fr.valorDia)}</span><br/><span style={{ color: '#3949ab' }}>🌙{fmt(fr.valorNoite)}</span></>
                                    : <>R$ {fmt(fr.valorDobra)}</>}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#1976d2', fontSize: '13px' }}>
                                  {fmtMoeda(fr.total)}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: '11px' }}>
                                  {fr.totalTransporte > 0 ? (
                                    <div>
                                      <div style={{ color: '#1565c0' }} title="Transporte calculado (dias trabalhados × valor/dia)">
                                        📦 {fmtMoeda(fr.totalTransporte)}
                                      </div>
                                      {fr.transporteAdiantado > 0 && (
                                        <div style={{ color: '#e65100', fontSize: '10px' }} title="Já pago via Adiantamento Transporte em Saídas">
                                          ✔ {fmtMoeda(fr.transporteAdiantado)} pago
                                        </div>
                                      )}
                                      {fr.transporteAdiantado > 0 && (
                                        <div style={{ color: fr.transporteSaldo > 0 ? '#2e7d32' : '#999', fontWeight: 'bold', fontSize: '10px' }}>
                                          → {fr.transporteSaldo > 0 ? `saldo ${fmtMoeda(fr.transporteSaldo)}` : 'quitado'}
                                        </div>
                                      )}
                                    </div>
                                  ) : '—'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', color: fr.saidasDesconto > 0 ? '#c62828' : '#aaa', fontSize: '12px' }}>
                                  {fr.saidasDesconto > 0 ? (
                                    <span title={fr.saidasDetalhe.map(d => `${d.descricao}: R$${fmt(d.valor)}`).join(' | ')}>
                                      −{fmtMoeda(fr.saidasDesconto)}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '13px' }}>
                                  {fmtMoeda(fr.totalLiquido)}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center' }}>
                                  <span style={frIsPago ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff9c4', '#f57f17')}>
                                    {frIsPago ? '✅ Pago' : '⏳ Pend.'}
                                  </span>
                                  {frIsPago && frDataPgto && (
                                    <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>{frDataPgto}</div>
                                  )}
                                </td>
                                <td style={s.td}>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => {
                                        const fechFim = new Date(fech.dataFechamento + 'T12:00:00');
                                        const fechIni = new Date(fechFim);
                                        fechIni.setDate(fechIni.getDate() - 6);
                                        const isoIni = fechIni.toISOString().split('T')[0];
                                        const escalasSemana = escalas.filter(e =>
                                          e.colaboradorId === fr.id && e.data >= isoIni && e.data <= fech.dataFechamento
                                        );
                                        // Filter saídas for this freelancer in this week
                                        // Use dataPagamento OR data (creation date) for matching
                                        const saidasSemana = saidasPeriodo.filter((s2: any) => {
                                          const sColabId = s2.colaboradorId || s2.colabId;
                                          if (sColabId !== fr.id) return false;
                                          const sData = s2.dataPagamento || s2.data || '';
                                          return sData >= isoIni && sData <= fech.dataFechamento;
                                        });
                                        setDetalheFreelancer({ fr, semana: fech.semanaLabel, escalas: escalasSemana, saidaItems: saidasSemana });
                                      }}
                                      style={{ ...s.btn('#c2185b'), padding: '3px 8px', fontSize: '11px' }}
                                      title="Ver detalhamento">
                                      📋 Ver
                                    </button>
                                    <button
                                      disabled={salvando}
                                      onClick={async () => {
                                        if (!frIsPago) {
                                          // Open confirmation modal with editable date
                                          setModalFreelancerPgto({ fr, fech });
                                          return;
                                        }
                                        // Desfazer pagamento diretamente
                                        setSalvando(true);
                                        try {
                                          const obsValor = (fr.valorDia > 0 || fr.valorNoite > 0)
                                            ? `D=R$${fmt(fr.valorDia)} N=R$${fmt(fr.valorNoite)}`
                                            : `R$${fmt(fr.valorDobra)}/dobra`;
                                          const payload = {
                                            colaboradorId: fr.id, mes: mesAno,
                                            semana: fech.dataFechamento, unitId,
                                            pago: false,
                                            dataPagamento: null,
                                            valorBruto: fr.total,
                                            valorTransporte: fr.transporteSaldo || 0,
                                            transporteCalculado: fr.totalTransporte || 0,
                                            transporteAdiantado: fr.transporteAdiantado || 0,
                                            desconto: fr.saidasDesconto || 0,
                                            totalFinal: fr.totalLiquido,
                                            obs: `Freelancer sem. ${fech.semanaLabel} – ${fr.dobras} dobras – ${obsValor}${fr.transporteAdiantado > 0 ? ` – Transp. adiant.: R$${fmt(fr.transporteAdiantado)}` : ''}${fr.saidasDesconto > 0 ? ` – Desc. saídas: R$${fmt(fr.saidasDesconto)}` : ''}`,
                                          };
                                          const resp = await fetch(`${apiUrl}/folha-pagamento`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                            body: JSON.stringify(payload),
                                          });
                                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                          await carregarDados();
                                        } catch (err) { alert('Erro ao salvar status: ' + err); }
                                        finally { setSalvando(false); }
                                      }}
                                      style={{ ...s.btn(frIsPago ? '#e53935' : '#43a047'), padding: '3px 8px', fontSize: '11px' }}
                                    >
                                      {frIsPago ? '↩ Desfazer' : '✅ Pagar'}
                                    </button>
                                    {fr.chavePix && (
                                      <button onClick={() => navigator.clipboard.writeText(fr.chavePix!)}
                                        style={{ ...s.btn('#1565c0'), padding: '3px 8px', fontSize: '11px' }}>
                                        💳 PIX
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {/* Linha de transporte adiantado (se houver) */}
                            {(fech.totalTransporteAdiantado || 0) > 0 && (
                              <tr style={{ backgroundColor: '#fff8e1' }}>
                                <td style={{ padding: '6px 8px', color: '#e65100', fontSize: '11px' }} colSpan={5}>🚗 Transporte calculado</td>
                                <td colSpan={1} />
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1565c0', fontSize: '11px' }}>
                                  {fmtMoeda(fech.totalTransporteCalculado || 0)}
                                </td>
                                <td colSpan={4} />
                              </tr>
                            )}
                            {(fech.totalTransporteAdiantado || 0) > 0 && (
                              <tr style={{ backgroundColor: '#fff8e1' }}>
                                <td style={{ padding: '6px 8px', color: '#e65100', fontSize: '11px' }} colSpan={5}>✔ Transporte já pago (adiantado via Saídas)</td>
                                <td colSpan={1} />
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e65100', fontSize: '11px' }}>
                                  −{fmtMoeda(fech.totalTransporteAdiantado || 0)}
                                </td>
                                <td colSpan={4} />
                              </tr>
                            )}
                            <tr style={{ backgroundColor: '#880e4f', color: 'white', fontWeight: 'bold' }}>
                              <td style={{ padding: '8px' }} colSpan={5}>SUBTOTAL DOBRAS</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#f48fb1' }}>
                                {fmtMoeda(fech.totalSemana)}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#90caf9', fontSize: '11px' }}>
                                {fech.totalTransporte > 0
                                  ? <span title={`Calculado: ${fmtMoeda(fech.totalTransporteCalculado||0)}${(fech.totalTransporteAdiantado||0) > 0 ? ` | Adiantado: −${fmtMoeda(fech.totalTransporteAdiantado||0)}` : ''}`}>
                                      +{fmtMoeda(fech.totalTransporte)}{(fech.totalTransporteAdiantado||0) > 0 ? ' *' : ''}
                                    </span>
                                  : (fech.totalTransporteCalculado||0) > 0 ? <span style={{ color: '#a5d6a7' }}>✔ quitado</span> : '—'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ef9a9a' }}>
                                {fech.totalSaidasDesconto > 0 ? `−${fmtMoeda(fech.totalSaidasDesconto)}` : '—'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7', fontWeight: 'bold' }}>
                                {fmtMoeda(fech.totalSemana + fech.totalTransporte - fech.totalSaidasDesconto)}
                              </td>
                              <td colSpan={2} style={{ padding: '8px' }} />
                            </tr>
                            {fech.totalSaidasDesconto > 0 && (
                              <tr style={{ backgroundColor: '#ffebee' }}>
                                <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#c62828' }} colSpan={11}>
                                  ⚠️ Descontos automáticos de Saídas ("A receber") incluídos no Líquido. Veja tooltip na coluna Desconto por colaborador.
                                </td>
                              </tr>
                            )}
                            {(parseFloat(ef.combustivel || '0') > 0 || parseFloat(ef.extra || '0') > 0 || parseFloat(ef.desconto || '0') > 0) && (
                              <>
                                {parseFloat(ef.combustivel || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#fff3e0' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#e65100' }} colSpan={8}>⛽ Combustível (ajuste manual)</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>−{fmtMoeda(parseFloat(ef.combustivel || '0'))}</td>
                                    <td colSpan={2} />
                                  </tr>
                                )}
                                {parseFloat(ef.extra || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#e8f5e9' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#2e7d32' }} colSpan={8}>➕ Extra (ajuste manual)</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2e7d32' }}>+{fmtMoeda(parseFloat(ef.extra || '0'))}</td>
                                    <td colSpan={2} />
                                  </tr>
                                )}
                                {parseFloat(ef.desconto || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#fce4ec' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#c62828' }} colSpan={8}>➖ Desconto (ajuste manual)</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>−{fmtMoeda(parseFloat(ef.desconto || '0'))}</td>
                                    <td colSpan={2} />
                                  </tr>
                                )}
                                <tr style={{ backgroundColor: '#1b5e20', color: 'white', fontWeight: 'bold' }}>
                                  <td style={{ padding: '8px' }} colSpan={8}>TOTAL LÍQUIDO SEMANA</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                                    {fmtMoeda(fech.totalLiquido)}
                                  </td>
                                  <td colSpan={2} />
                                </tr>
                              </>
                            )}
                          </tfoot>
                        </table>
                      </div>

                      {/* Observação */}
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>📝 Obs:</span>
                        <input type="text" placeholder="Ex: Sangria, adiantamento, pendência..." value={ef.obs || ''}
                          onChange={e => updateEf('obs', e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }} />
                      </div>
                    </div>
                  );
                })}

                {/* Resumo mensal de freelancers */}
                <div style={{ ...s.card, borderTop: '3px solid #1976d2' }}>
                  <h4 style={{ marginTop: 0, color: '#1976d2' }}>📊 Consolidado do Mês</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Freelancer', 'PIX', 'Total Dobras', 'Total R$'].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {freelancers.map((fr, fi) => {
                        let totalDobras = 0;
                        let totalMesLiquido = 0;
                        let totalDescontoMes = 0;
                        for (const fech of fechamentosFreelancer) {
                          const frSem = fech.freelancers.find(x => x.id === fr.id);
                          if (frSem) {
                            totalDobras += frSem.dobras;
                            totalMesLiquido += frSem.totalLiquido;
                            totalDescontoMes += frSem.saidasDesconto || 0;
                          }
                        }
                        if (totalDobras === 0) return null;
                        return (
                          <tr key={fr.id} style={{ backgroundColor: fi % 2 === 0 ? '#fafafa' : 'white' }}>
                            <td style={{ ...s.td, fontWeight: 'bold' }}>{fr.nome}</td>
                            <td style={{ ...s.td, fontSize: '11px' }}>{fr.chavePix || '—'}</td>
                            <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>{totalDobras}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#c2185b', fontSize: '13px' }}>
                              {fmtMoeda(totalMesLiquido)}
                              {totalDescontoMes > 0 && <div style={{ fontSize: '10px', color: '#c62828', fontWeight: 'normal' }}>(desc. {fmtMoeda(totalDescontoMes)})</div>}
                            </td>
                          </tr>
                        );
                      }).filter(Boolean)}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px' }} colSpan={3}>TOTAL FREELANCERS DO MÊS</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>{fmtMoeda(totalFreelancerMes)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
}
