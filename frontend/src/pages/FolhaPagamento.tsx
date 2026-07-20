import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';
import { isFeriado } from '../utils/feriados';
import { fetchAuth } from '../utils/fetchAuth';
import {
  semanasFechamento as semanasFechamentoEngine,
  fmtDataBR as fmtDataBREngine,
  fmtDataISO as fmtDataISOEngine,
  calcularFolhaCLT,
  calcularVariavelMotoboy,
  montarPayslipFreelancer,
  encontrarAdiantamentoIdAlvo,
  montarPayslipCLT,
  montarPayslipDobrasCLT,
  montarChecklistCLT,
} from '../engine';
import type { ControleDiaMotoboy } from '../engine';


/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface AcordoTurnoTabela {
  [dia: string]: { D?: number; N?: number; DN?: number };
}

interface AcordoFreelancer {
  // valor_dia_noite
  valorDia?: number;
  valorNoite?: number;
  // motoboy
  chegadaDia?: number;
  chegadaNoite?: number;
  valorEntrega?: number;
  // valor_turno
  tabela?: AcordoTurnoTabela;
}

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
  valorDia?: number;      // CLT: valor dobra-dia; Freelancer: valor por dobra (retrocompat)
  valorNoite?: number;    // CLT: valor dobra-noite
  valorTransporte?: number;
  periculosidade?: number;
  unitId?: string;
  ativo?: boolean;
  // Tipos de acordo freelancer
  isMotoboy?: boolean;
  tipoAcordo?: 'motoboy' | 'valor_turno' | 'valor_dia_noite';
  acordo?: AcordoFreelancer;
}

interface Motoboy extends Colaborador {
  placa?: string;
  vinculo?: 'CLT' | 'Freelancer';
  comissao?: number;
  /** Freelancer: valor fixo por dia trabalhado */
  valorChegada?: number;
  /** Freelancer: valor fixo por turno Dia trabalhado */
  valorChegadaDia?: number;
  /** Freelancer: valor fixo por turno Noite trabalhado */
  valorChegadaNoite?: number;
  /** Freelancer: valor por entrega realizada */
  valorEntrega?: number;
  /** Opção A: id do colaborador correspondente (sempre = id quando motoboy = colaborador) */
  colaboradorId?: string;
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
  // Campos opcionais calculados por preencherControleComSaidas (módulo Motoboys)
  chegadaDia?: number;
  chegadaNoite?: number;
  salDia?: number;
  diaSemana?: number;
}

/** Escala de um colaborador/freelancer em um dia */
interface EscalaItem {
  colaboradorId: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  presenca?: 'presente' | 'falta' | 'falta_justificada';
  presencaNoite?: 'presente' | 'falta' | 'falta_justificada';
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
  /** Sal.Contr.INSS = Math.floor(salBase + periculosidade + feriados) — base usada pela contabilidade */
  salContrInss: number;
  /** Desconto Vale Transporte (Cód.109) = mín(6% salBase, VT mensal cadastrado) */
  valeTransporte: number;
  contrAssistencial: number;
  adiantamentoSalario: number;
  adiantamentoValor: number;
  diferencaSalario: number;
  /** Feriados trabalhados no mês (cod 1311 do PDF) - dobra do dia */
  feriadosTrab?: number;
  /** Valor cod 1311 = feriadosTrab * salDia (já considerado em totalVencimentos) */
  feriadosValor?: number;
  variavelAte19: number;
  variavelDe20a31: number;
  /** Variável 20-31 do mês ANTERIOR (entra no Pgto Dia 5) */
  variavelDe20a31MesAnt?: number;
  totalVariavel: number;
  pgtosDia20: number;
  pgtosDia05: number;
  outrosPgtos: number;
  saldoFinal: number;
  pago: boolean;
  dataPagamento?: string;
  // Pagamentos segregados: fixo (contabilidade) e variavel (motoboys/dobras)
  pagoAdiantamento: boolean;
  dataPgtoAdiantamento?: string;
  pagoVariavel: boolean;
  dataPgtoVariavel?: string;
  // Conferência contábil: campos do PDF (Cód.16 = 40% salBase, arredondamentos)
  adtoContabil: number;        // Cód.16: 40% exato do salário base (sem periculosidade)
  arredondamentoPos: number;   // Cód.19: centavos positivos para fechar no inteiro
  arredondamentoNeg: number;   // Cód.20: centavos negativos do período anterior
  adtoLiquido: number;         // Líquido que a contabilidade paga (número inteiro)
  // Rubricas do holerite (importadas do PDF quando conferido)
  rubricas?: Array<{ codigo: string; descricao: string; referencia: string; vencimento: number; desconto: number }>;
  // Log de pagamentos (PIX/Dinheiro/Misto)
  logPagamentos?: PagamentoRegistrado[];
  // Conferência contábil (importação EMS)
  conferido?: boolean;          // Conferido pela contabilidade
  valorLiquidoContabil?: number; // Líquido do holerite (fonte: contabilidade)
  fonteContabil?: boolean;       // true = valores vieram da contabilidade, não calculados
  // Adiantamento especial
  saldoEspecialAberto: number;    // Saldo de adiantamento especial em aberto
  raw?: any;
}

/** Registro individual de pagamento (PIX, Dinheiro ou parte de cada) */
interface PagamentoRegistrado {
  id: string;           // uuid gerado no frontend
  data: string;         // AAAA-MM-DD
  valor: number;
  forma: 'PIX' | 'Dinheiro' | 'Misto';
  valorPix?: number;    // só quando forma=Misto
  valorDinheiro?: number;
  tipo: 'Adiantamento' | 'Variável' | 'Outro';
  obs?: string;
}

/** Resumo semanal de fechamento para freelancers */
interface FechamentoSemanalFreelancer {
  semanaLabel: string;           // Ex: "01/03 - 07/03"
  dataFechamento: string;        // YYYY-MM-DD (pode ser customizado)
  dataFechamentoBase: string;    // YYYY-MM-DD original (chave do editFechamento)
  dataInicioBase: string;        // YYYY-MM-DD início original da semana
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
    totalLiquido: number;           // total dobras + transporteSaldo + caixinha - saidasDesconto
    saidasDesconto: number;         // total de saídas "A receber" / "Consumo Interno" (descontos)
    saidasDetalhe: { descricao: string; valor: number; data: string }[]; // detalhes desconto
    caixinhaTotal: number;          // 🪙 caixinha a pagar ao colaborador (crédito)
    caixinhaDetalhe: { descricao: string; valor: number; data: string }[]; // detalhes caixinha
    pendentesAnteriores: any[];     // Saídas pendentes de meses anteriores a descontar
    saldoEspecialAberto: number;    // Saldo de adiantamento especial em aberto (histórico)
    diasPagos: { data: string; turno: string; valor: number }[];         // dias pendentes (a pagar)
    diasJaPagosDetalhe: { data: string; turno: string; valor: number }[]; // dias já pagos anteriormente
    totalJaPago: number;            // valor já pago em outros registros no período
    totalBrutoPeriodo: number;      // total bruto completo (pendente + já pago)
    totalDobrasExib: number;        // contagem de dobras do período completo
    periodoInicio: string;          // YYYY-MM-DD início real do período pago
    periodoFim: string;             // YYYY-MM-DD fim real do período pago
    diasCodigo: string;             // Ex: "Ter D | Qui DN | Sex DN | Sáb D"
    pago?: boolean;
  }[];
  totalSemana: number;                // bruto do período completo (pendente + já pago)
  totalSemanaPendente?: number;        // só o que resta pagar
  totalCaixinha: number;               // soma das caixinhas a pagar da semana
  totalTransporte: number;             // saldo a pagar (calculado - adiantado)
  totalTransporteCalculado?: number;   // transporte bruto pelos dias trabalhados
  totalTransporteAdiantado?: number;   // total já pago via "Adiantamento Transporte"
  totalCombustivel: number;
  totalExtra: number;
  totalDesconto: number;
  totalSaidasDesconto: number;         // soma dos descontos de saídas (A receber / Consumo)
  totalLiquido: number;
  observacao?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const R = (v: any) => parseFloat(v) || 0;
const isMigradoReg  = (r: any) => r.migrado   === true || r.migrado   === 'True' || r.migrado   === 'true';
const isEstornadoReg = (r: any) => r.estornado === true || r.estornado === 'True' || r.estornado === 'true';
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
/**
 * INSS, semanas, formatadores: importados do engine centralizado.
 * Não definir funções de cálculo localmente — usar engine/.
 *
 * Tabela progressiva INSS 2026 — faixa 1 = R$ 1.621,00.
 * Referência: engine/inss.ts (FONTE ÚNICA)
 */
const semanasFechamento = semanasFechamentoEngine;
const fmtDataBR = (d: Date) => fmtDataBREngine(d);
const fmtDataISO = (d: Date) => fmtDataISOEngine(d);

/**
 * Conta dobras e dias trabalhados de um freelancer em um conjunto de escalas.
 * Regra única: SOMENTE presença = 'presente' conta.
 *  - presença = 'presente'         → conta
 *  - presença = 'falta'/'falta_j.' → não conta
 *  - presença = undefined/null      → não conta (exige confirmação explícita)
 */
const ISO_HOJE_FP = new Date().toISOString().split('T')[0];

// Retorna o status de presença de uma escala.
// Para DiaNoite com turnos parcialmente presentes, retorna 'presente_parcial'
// para que o cálculo pague apenas o turno efetivamente trabalhado.
function statusPresencaEscala(esc?: EscalaItem): 'presente' | 'presente_parcial' | 'falta' | 'falta_justificada' | undefined {
  if (!esc) return undefined;
  if (esc.turno === 'Noite') return (esc.presencaNoite || esc.presenca) as any;
  if (esc.turno === 'DiaNoite') {
    const pD  = esc.presenca;
    const pN  = esc.presencaNoite;
    const diaPresente   = pD === 'presente';
    const noitePresente = pN === 'presente';
    // Ambos presentes → DiaNoite completo
    if (diaPresente && noitePresente) return 'presente';
    // Um presente, outro falta/vazio → parcial (paga só quem foi)
    if (diaPresente || noitePresente) return 'presente_parcial';
    // Ambos falta/justificada
    if (pD === 'falta_justificada' || pN === 'falta_justificada') return 'falta_justificada';
    if (pD === 'falta' || pN === 'falta') return 'falta';
    // Nenhum marcado
    return pD || pN as any || undefined;
  }
  return esc.presenca as any;
}

function contarDobras(escalas: EscalaItem[], freelancerId: string): { dobras: number; diasCodigo: string; diasTrabalhados: number } {
  const linhas: string[] = [];
  let dobras = 0;
  let diasTrabalhados = 0;
  const dias = escalas
    .filter(e =>
      e.colaboradorId === freelancerId &&
      e.turno !== 'Folga' &&
      (statusPresencaEscala(e) === 'presente' || statusPresencaEscala(e) === 'presente_parcial')
    )
    .sort((a,b) => a.data.localeCompare(b.data));
  for (const esc of dias) {
    const status = statusPresencaEscala(esc);
    const efetivaTurno = (esc.turno === 'DiaNoite' && status === 'presente_parcial')
      ? (esc.presenca === 'presente' ? 'Dia' : 'Noite')
      : esc.turno;
    const dow = new Date(esc.data + 'T12:00:00').getDay();
    const label = `${DIAS_SEMANA_ABREV[dow]} ${efetivaTurno === 'DiaNoite' ? 'DN' : efetivaTurno === 'Dia' ? 'D' : efetivaTurno === 'Noite' ? 'N' : 'F'}`;
    linhas.push(label);
    diasTrabalhados++;
    if (efetivaTurno === 'DiaNoite') dobras += 1;
    else if (efetivaTurno === 'Dia' || efetivaTurno === 'Noite') dobras += 0.5;
  }
  return { dobras, diasCodigo: linhas.join(' | '), diasTrabalhados };
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function FolhaPagamento() {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user, email: authEmail } = useAuth() as any;
  const unitId = activeUnit?.id || (user as any)?.unitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  // Filtro global de período custom (sobrepõe mesAno quando preenchido)
  const [periodoIni, setPeriodoIni] = useState<string>('');
  const [periodoFim, setPeriodoFim] = useState<string>('');
  const periodoCustomAtivo = !!(periodoIni && periodoFim);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'clt' | 'freelancers' | 'dobras' | 'auditoria-clt'>('clt');
  // Expansão de grupos na aba Auditoria CLT
  const [auditoriaCLTExpandidos, setAuditoriaCLTExpandidos] = useState<Set<string>>(new Set());
  const toggleAuditoriaCLT = (id: string) =>
    setAuditoriaCLTExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [controlesMap, setControlesMap] = useState<Record<string, ControleDia[]>>({});
  const [escalas, setEscalas] = useState<EscalaItem[]>([]);
  const [folhasDB, setFolhasDB] = useState<any[]>([]);
  const [folhasLocais, setFolhasLocais] = useState<FolhaMensal[]>([]);
  const [fechamentosFreelancer, setFechamentosFreelancer] = useState<FechamentoSemanalFreelancer[]>([]);
  // Saídas do período para cruzamento com motoboys
  const [saidasPeriodo, setSaidasPeriodo] = useState<any[]>([]);
  // Saídas do mês completo (para cálculo de adiantamento transporte quando período custom ativo)
  const [saidasMesCompleto, setSaidasMesCompleto] = useState<any[]>([]);
  // Ref para acesso síncrono ao saidasPeriodo dentro do useMemo do modal (evita closure stale)
  const saidasPeriodoRef = React.useRef<any[]>([]);
  useEffect(() => { saidasPeriodoRef.current = saidasPeriodo; }, [saidasPeriodo]);
  const [saldosEspeciais, setSaldosEspeciais] = useState<Record<string, number>>({});
  // Saídas pendentes de meses anteriores (pago=false)
  const [saidasPendentesAnt, setSaidasPendentesAnt] = useState<any[]>([]);

  const [detalheSelecionado, setDetalheSelecionado] = useState<FolhaMensal | null>(null);
  const [historicoColabId, setHistoricoColabId] = useState<string | null>(null);
  const [historicoItems, setHistoricoItems] = useState<any[]>([]);
  const [detalheFreelancer, setDetalheFreelancer] = useState<{fr: any; semana: string; escalas: any[]; saidaItems?: any[]} | null>(null);
  // Edição/exclusão inline de saída no Detalhamento Freelancer
  const [saidaInlineEdit, setSaidaInlineEdit] = useState<any | null>(null);
  // Modal confirmar pagamento freelancer (com data editável)
  const [modalFreelancerPgto, setModalFreelancerPgto] = useState<{fr: any; fech: FechamentoSemanalFreelancer} | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [salvando, setSalvando] = useState(false);

  // Campos editáveis do fechamento semanal (combustível, extra, desconto, obs)
  const [editFechamento, setEditFechamento] = useState<Record<string, { combustivel: string; extra: string; desconto: string; obs: string; dataIniCustom?: string; dataFimCustom?: string }>>({});

  // Interface DobraSemanalCLT (used inline in tab)
  // Valores editados pelo gestor (valorDia, valorNoite, totalBruto overrides)
  const [editDobras, setEditDobras] = useState<Record<string, { valorBruto?: string; valorTransporte?: string; obs?: string }>>({});
  // Filtro de período da aba Dobras CLT
  const [dobrasFiltroIni, setDobrasFiltroIni] = useState<string>('');
  const [dobrasFiltroFim, setDobrasFiltroFim] = useState<string>('');

  // ── Modal Pagamento Dobras CLT ──
  interface ModalDobrasCLT {
    pessoa: any; semana: { inicio: string; fim: string; label: string };
    bruto: number; transporte: number; totalFinal: number; obs: string;
  }
  const [modalDobras, setModalDobras] = useState<ModalDobrasCLT | null>(null);
  const [checkItemsDobras, setCheckItemsDobras] = useState<CheckItemCLT[]>([]);
  const [abaterEspDobras, setAbaterEspDobras] = useState(false);
  const [vlAbateDobras, setVlAbateDobras] = useState('');

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno, periodoIni, periodoFim]);

  const abrirHistorico = async (colaboradorId: string) => {
    try {
      const r = await fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&colaboradorId=${colaboradorId}`, {
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
  const responsavelEmail = authEmail || (user as any)?.email || localStorage.getItem('user_email') || 'sistema';
  const responsavelId    = localStorage.getItem('user_id') || '';
  const responsavelNome  = (user as any)?.nome || (user as any)?.name || responsavelEmail;
  // Helper: campos de auditoria a anexar em todo POST/PUT
  const auditoriaCampos = () => ({ responsavelId, responsavelNome, responsavelEmail });

  // Lista de meses (YYYY-MM) entre dois ISO dates, inclusivo
  const mesesNoRange = (iniIso: string, fimIso: string): string[] => {
    const [ai, mi] = iniIso.split('-').map(Number);
    const [af, mf] = fimIso.split('-').map(Number);
    const out: string[] = [];
    let y = ai, m = mi;
    while (y < af || (y === af && m <= mf)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Determinar período de carregamento
      // - Modo mensal: cobre o mês inteiro de mesAno
      // - Modo período custom: cobre todos os meses tocados pelo range (1 ou 2+)
      const [ano, mes] = mesAno.split('-').map(Number);
      const mesalMesAnoInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
      const mesalMesAnoFim    = new Date(ano, mes, 0).toISOString().split('T')[0];
      const dataInicio = periodoCustomAtivo ? periodoIni : mesalMesAnoInicio;
      const dataFim    = periodoCustomAtivo ? periodoFim : mesalMesAnoFim;

      // Meses tocados pelo período (para fetch de folha/escalas/controle-motoboy)
      // SEMPRE inclui o mês anterior também, pois o pagamento Dia 5 fecha o mês anterior
      // (Grid 2 do CLT: Variavel 20-31 do mês anterior + dif salário + INSS)
      const mesAnterior = (() => {
        const [a, m] = mesAno.split('-').map(Number);
        const d = new Date(a, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();
      const mesesAlvo = periodoCustomAtivo
        ? mesesNoRange(periodoIni, periodoFim)
        : [mesAnterior, mesAno];

      // Previous 3 months to catch pending saídas (a partir do início efetivo)
      const [aIni, mIni] = dataInicio.split('-').map(Number);
      const prevDate = new Date(aIni, mIni - 4, 1);
      const prevIni  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

      // Histórico longo para cálculo de saldo de adiantamento especial (24 meses)
      const histLongoDate = new Date(aIni, mIni - 25, 1);
      const histLongoIni = `${histLongoDate.getFullYear()}-${String(histLongoDate.getMonth() + 1).padStart(2, '0')}-01`;

      const auth = { headers: { Authorization: `Bearer ${token()}` } };
      // Fetches de folha/escalas/controle-motoboy precisam ser por mês (backend filtra por &mes=)
      const folhaFetches = mesesAlvo.map(mm =>
        fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mm}`, auth).catch(() => null)
      );
      const escalaFetches = mesesAlvo.map(mm =>
        fetchAuth(`${apiUrl}/escalas?unitId=${unitId}&mes=${mm}`, auth).catch(() => null)
      );
      // Quando período custom ativo, buscar também o mês completo para adiantamentos de transporte
      const rSMes = periodoCustomAtivo
        ? fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${mesalMesAnoInicio}&dataFim=${mesalMesAnoFim}`, auth).catch(() => null)
        : null;

      const [rC, foRs, esRs, rS, rSPend, rSHist, rSMesResult] = await Promise.all([
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, auth),
        Promise.all(folhaFetches),
        Promise.all(escalaFetches),
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, auth).catch(() => null),
        // Pending saídas from previous 3 months
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${prevIni}&dataFim=${dataInicio}`, auth).catch(() => null),
        // Histórico longo para saldo de adiantamento especial
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${histLongoIni}&dataFim=${dataFim}`, auth).catch(() => null),
        // Saídas do mês completo (usado para adiantamento transporte quando período custom ativo)
        rSMes || Promise.resolve(null),
      ]);


      const dC = await rC.json();
      const todosColabs: Colaborador[] = (Array.isArray(dC) ? dC : []).filter((c: Colaborador) => c.ativo !== false);
      // Separate CLT from Freelancer
      const colabs = todosColabs.filter(c => c.tipoContrato !== 'Freelancer');
      setColaboradores(colabs);
      // Freelancers are colaboradores with tipoContrato='Freelancer'
      setFreelancers(todosColabs.filter(c => c.tipoContrato === 'Freelancer'));

      // ── OPÇÃO A: Motoboys derivados de colaboradores com isMotoboy=true ──
      // Fonte única de verdade: gres-prod-colaboradores. Não lê mais gres-prod-motoboys.
      const colabsMapFolha: Record<string, any> = {};
      for (const c of todosColabs) {
        if ((c as any).cpf) colabsMapFolha[(c as any).cpf] = c;
        colabsMapFolha[c.id] = c;
      }
      const motos: Motoboy[] = todosColabs
        .filter(c => (c as any).isMotoboy === true || ((c as any).cargo || '').toLowerCase() === 'motoboy')
        .map((c: any) => ({
          id: c.id,
          colaboradorId: c.id,
          nome: c.nome,
          cpf: c.cpf,
          cargo: c.cargo,
          tipoContrato: c.tipoContrato,
          ativo: c.ativo !== false,
          unitId: c.unitId,
          isMotoboy: true,
          // CRÍTICO: copiar salário e periculosidade do cadastro (estavam zerados)
          salario: R(c.salario) || 0,
          periculosidade: R(c.periculosidade) || 0,
          contribuicaoAssistencial: R(c.contribuicaoAssistencial) || 0,
          // Compat com Motoboy interface
          valorDia: R(c.valorDia) || 0,
          valorNoite: R(c.valorNoite) || 0,
          valorChegadaDia:   R(c.valorChegadaDia)   || R(c.valorDia)   || 0,
          valorChegadaNoite: R(c.valorChegadaNoite) || R(c.valorNoite) || 0,
          valorEntrega:      R(c.valorEntrega) || R(c.valorTransporte) || 0,
          valorTransporte:   R(c.valorTransporte) || 0,
          vinculo: c.tipoContrato === 'Freelancer' ? 'Freelancer' : 'CLT',
          chavePix: c.chavePix,
        } as Motoboy));
      setMotoboys(motos);

      // Mesclar escalas de todos os meses tocados pelo período
      {
        const escalasAcc: any[] = [];
        for (const r of esRs) {
          if (!r?.ok) continue;
          try {
            const dE = await r.json();
            if (Array.isArray(dE)) escalasAcc.push(...dE);
          } catch { /* ignore */ }
        }
        setEscalas(escalasAcc);
      }

      // controle-motoboy: precisa buscar por motoboy + cada mês do range
      const ctrlMap: Record<string, ControleDia[]> = {};
      await Promise.all(motos.map(async m => {
        try {
          const partes = await Promise.all(mesesAlvo.map(mm =>
            fetchAuth(`${apiUrl}/controle-motoboy?motoboyId=${m.id}&mes=${mm}&unitId=${unitId}`, auth)
              .then(r => r.ok ? r.json() : [])
              .catch(() => [])
          ));
          const d: ControleDia[] = partes.flat() as ControleDia[];
          // Indexar pelo ID do motoboy E pelo CPF (para cruzar com colaborador)
          ctrlMap[m.id] = d as ControleDia[];
          if (m.cpf) ctrlMap[m.cpf] = d as ControleDia[];
        } catch { ctrlMap[m.id] = []; }
      }));
      setControlesMap(ctrlMap);

      // Mesclar folhas-pagamento de todos os meses tocados
      {
        const folhasAcc: any[] = [];
        for (const r of foRs) {
          if (!r?.ok) continue;
          try {
            const dF = await r.json();
            if (Array.isArray(dF)) folhasAcc.push(...dF);
          } catch { /* ignore */ }
        }
        setFolhasDB(folhasAcc);
      }

      // Carregar saídas do período
      if (rS?.ok) {
        const dS = await rS.json();
        setSaidasPeriodo(Array.isArray(dS) ? dS : []);
      } else {
        setSaidasPeriodo([]);
      }

      // Saídas do mês completo: se período custom ativo usa rSMesResult, senão = saidasPeriodo
      if (rSMesResult?.ok) {
        const dSM = await rSMesResult.json();
        setSaidasMesCompleto(Array.isArray(dSM) ? dSM : []);
      } else {
        // Período normal = rS já cobre o mês inteiro
        setSaidasMesCompleto([]);
      }

      // Carregar saídas pendentes de meses anteriores
      if (rSPend?.ok) {
        const dSP = await rSPend.json();
        const pendentes = (Array.isArray(dSP) ? dSP : []).filter((s: any) => s.pago === false);
        setSaidasPendentesAnt(pendentes);
      } else {
        setSaidasPendentesAnt([]);
      }

      // Calcular saldo de adiantamento especial por colaborador (histórico longo)
      if (rSHist?.ok) {
        const dSH = await rSHist.json();
        const hist = Array.isArray(dSH) ? dSH : [];
        const saldos: Record<string, number> = {};
        for (const s of hist) {
          const tipo = s.tipo || s.origem || s.referencia || '';
          const colId = s.colaboradorId || s.colabId;
          if (!colId) continue;
          if (tipo === 'Adiantamento Especial') {
            saldos[colId] = (saldos[colId] || 0) + (parseFloat(s.valor) || 0);
          } else if (tipo === 'Desconto Adiantamento Especial') {
            saldos[colId] = (saldos[colId] || 0) - (parseFloat(s.valor) || 0);
          }
        }
        // Manter apenas saldos positivos (dívida ainda em aberto)
        Object.keys(saldos).forEach(k => { if (saldos[k] <= 0) delete saldos[k]; });
        setSaldosEspeciais(saldos);
        // Forçar recálculo dos fechamentos freelancer com os saldos recém-calculados
        // (evita race condition onde o estado ainda não foi atualizado)
        calcularFechamentosFreelancer(saldos);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Freelancers state (derived from colaboradores)
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);

  // Recalcular folhas CLT (incluir 'escalas' como dependência para detectar feriados trabalhados)
  useEffect(() => {
    setFolhasLocais(calcularTodasFolhas());
  }, [colaboradores, motoboys, controlesMap, folhasDB, mesAno, saidasPeriodo, escalas]);

  // Recalcular fechamentos freelancer
  useEffect(() => {
    if (freelancers.length > 0) {
      calcularFechamentosFreelancer();
    }
  }, [freelancers, escalas, mesAno, periodoIni, periodoFim, saidasPendentesAnt, folhasDB, saidasPeriodo]);

  /* ── Cálculo CLT ─────────────────────────────────────────── */
  const calcularTodasFolhas = (): FolhaMensal[] => {
    const folhas: FolhaMensal[] = [];

    // ── Helper: buscar registro salvo no DDB (CLT mensal, sem semana, sem freelancer) ──
    const buscarSalva = (colabId: string) => folhasDB.find(f =>
      f.colaboradorId === colabId
      && f.mes === mesAno
      && !f.semana
      && f.tipo !== 'freelancer-dia'
      && f.tipo !== 'freelancer-noite'
    );

    // ── Helper: montar campos de estado/pagamento a partir do registro salvo ──
    const montarEstadoPagamento = (colabId: string, salva: any) => ({
      saldoEspecialAberto: parseFloat((saldosEspeciais[colabId] || 0).toFixed(2)),
      pago: salva?.pago === true,
      dataPagamento: salva?.dataPagamento,
      pagoAdiantamento: salva?.pagoAdiantamento === true
        || (salva?.pago === true && salva?.pagoAdiantamento === undefined && salva?.pagoVariavel === undefined),
      dataPgtoAdiantamento: salva?.dataPgtoAdiantamento
        || (salva?.pago === true && salva?.pagoAdiantamento === undefined ? salva?.dataPagamento : undefined),
      pagoVariavel: salva?.pagoVariavel === true,
      dataPgtoVariavel: salva?.dataPgtoVariavel,
      logPagamentos: salva?.logPagamentos || [],
    });

    // ═══ CLT NÃO-MOTOBOY ═══
    for (const c of colaboradores) {
      const isMotoboy = motoboys.some(m => m.id === c.id || m.cpf === c.cpf);
      if (isMotoboy) continue;

      // Feriados trabalhados (do componente: escalas + isFeriado)
      const escalasMes = escalas.filter(e =>
        e.colaboradorId === c.id && (e.data || '').startsWith(mesAno)
      );
      const feriadosTrab = escalasMes.filter(e =>
        isFeriado(e.data) && (e.presenca === 'presente' || e.presencaNoite === 'presente')
      ).length;

      const salva = buscarSalva(c.id);

      // ── ENGINE: cálculo puro ──
      const calc = calcularFolhaCLT({
        colaborador: {
          id: c.id, nome: c.nome, cpf: c.cpf, chavePix: c.chavePix, cargo: c.cargo,
          salario: R(c.salario),
          periculosidade: R(c.periculosidade),
          contribuicaoAssistencial: R((c as any).contribuicaoAssistencial),
          valorTransporte: R((c as any).valorTransporte),
          isMotoboy: false,
        },
        mesAno,
        feriadosTrab,
        folhaSalva: salva as any,
      });

      folhas.push({
        colaboradorId: c.id, nome: c.nome, cpf: c.cpf, chavePix: c.chavePix, cargo: c.cargo,
        tipoContrato: c.tipoContrato || 'CLT',
        salarioBase: calc.salarioBase, periculosidade: calc.periculosidadeValor,
        inss: calc.inss, salContrInss: calc.salContrInss,
        valeTransporte: calc.valeTransporte, contrAssistencial: calc.contrAssistencial,
        adiantamentoSalario: 40, adiantamentoValor: calc.adiantamentoValor,
        adtoContabil: calc.adtoContabil, adtoLiquido: calc.adtoLiquido,
        arredondamentoPos: calc.arredondamentoPos, arredondamentoNeg: calc.arredondamentoNeg,
        diferencaSalario: calc.diferencaSalario,
        feriadosTrab, feriadosValor: calc.feriadosValor,
        variavelAte19: 0, variavelDe20a31: 0, variavelDe20a31MesAnt: 0, totalVariavel: 0,
        pgtosDia20: calc.adiantamentoValor, pgtosDia05: calc.pgtosDia05,
        outrosPgtos: 0, saldoFinal: calc.saldoFinal,
        conferido: calc.conferido,
        valorLiquidoContabil: calc.valorLiquidoContabil || undefined,
        fonteContabil: calc.fonteContabil,
        rubricas: calc.holerite.rubricas,
        ...montarEstadoPagamento(c.id, salva),
        raw: c,
      });
    }

    // ═══ MOTOBOY CLT ═══
    for (const m of motoboys) {
      if (m.vinculo === 'Freelancer') continue;
      const controle: ControleDia[] = controlesMap[m.id] || [];

      // Feriados trabalhados
      const colabIdMot = m.colaboradorId || m.id;
      const escalasMesM = escalas.filter(e =>
        (e.colaboradorId === m.id || e.colaboradorId === colabIdMot)
        && (e.data || '').startsWith(mesAno)
      );
      const feriadosTrabM = escalasMesM.filter(e =>
        isFeriado(e.data) && (e.presenca === 'presente' || e.presencaNoite === 'presente')
      ).length;

      const salva = buscarSalva(m.id);

      // ── ENGINE: cálculo CLT puro (salário, INSS, VT, adiantamento, override contábil) ──
      const calc = calcularFolhaCLT({
        colaborador: {
          id: m.id, nome: m.nome, cpf: m.cpf, chavePix: m.chavePix, cargo: m.cargo || 'Motoboy',
          salario: R(m.salario),
          periculosidade: R(m.periculosidade ?? 30),
          contribuicaoAssistencial: R((m as any).contribuicaoAssistencial) || 32.62,
          valorTransporte: R((m as any).valorTransporte),
          isMotoboy: true,
        },
        mesAno,
        feriadosTrab: feriadosTrabM,
        folhaSalva: salva as any,
      });

      // ── ENGINE: variável motoboy (entregas + caixinhas por período) ──
      // Converter controle local (ControleDia) para engine format (ControleDiaMotoboy)
      const controlesEngine: ControleDiaMotoboy[] = controle.map(l => ({
        data: l.data,
        entDia: R(l.entDia), entNoite: R(l.entNoite),
        caixinhaDia: R(l.caixinhaDia), caixinhaNoite: R(l.caixinhaNoite),
      }));
      const varResult = calcularVariavelMotoboy({
        controles: controlesEngine,
        valorEntrega: R(m.valorEntrega),
        mesAno,
        dividirPorPeriodo: true,
      });

      // Fallback: saídas do motoboy quando não há controle
      let { varAte19, varDe20a31, varDe20a31MesAnt, totalMesAtual: totalVariavel } = varResult;
      const saidasMotoboy = saidasPeriodo.filter(s => s.colaboradorId === m.id);
      const totalPagoSaidas = saidasMotoboy.reduce((sum: number, s: any) => sum + R(s.valor), 0);

      if (controle.length === 0 && saidasMotoboy.length > 0) {
        const dia19 = `${mesAno}-19`;
        varAte19 = 0; varDe20a31 = 0;
        for (const s of saidasMotoboy) {
          if ((s.data || '') <= dia19) varAte19 += R(s.valor);
          else varDe20a31 += R(s.valor);
        }
        varAte19 = parseFloat(varAte19.toFixed(2));
        varDe20a31 = parseFloat(varDe20a31.toFixed(2));
        totalVariavel = parseFloat((varAte19 + varDe20a31).toFixed(2));
      }

      // Motoboy: pgto dia 05 = variável 20-31 + difSal - descontos (ou contábil)
      const descontos = calc.inss + calc.contrAssistencial + calc.valeTransporte;
      const difSal = calc.diferencaSalario;
      const salBrutoMot = calc.salarioBase * (1 + R(m.periculosidade ?? 30) / 100) + calc.feriadosValor;
      const saldoFinal = parseFloat((totalVariavel + salBrutoMot - descontos).toFixed(2));
      const pgtosDia05 = parseFloat(Math.max(0, varDe20a31 + difSal - descontos).toFixed(2));
      const pgtosDia05Final = calc.conferido ? calc.valorLiquidoContabil : pgtosDia05;
      const saldoFinalFinal = calc.conferido ? calc.valorLiquidoContabil : saldoFinal;

      folhas.push({
        colaboradorId: m.id, nome: m.nome, cpf: m.cpf, chavePix: m.chavePix, cargo: m.cargo || 'Motoboy',
        tipoContrato: 'CLT', vinculo: m.vinculo,
        salarioBase: calc.salarioBase, periculosidade: calc.periculosidadeValor,
        inss: calc.inss, salContrInss: calc.salContrInss,
        valeTransporte: calc.valeTransporte, contrAssistencial: calc.contrAssistencial,
        feriadosTrab: feriadosTrabM, feriadosValor: calc.feriadosValor,
        adiantamentoSalario: 40, adiantamentoValor: calc.adiantamentoValor,
        diferencaSalario: difSal,
        adtoContabil: calc.adtoContabil, adtoLiquido: calc.adtoLiquido,
        arredondamentoPos: calc.arredondamentoPos, arredondamentoNeg: calc.arredondamentoNeg,
        variavelAte19: varAte19, variavelDe20a31: varDe20a31,
        variavelDe20a31MesAnt: varDe20a31MesAnt, totalVariavel,
        pgtosDia20: varAte19 + calc.adiantamentoValor, pgtosDia05: pgtosDia05Final,
        outrosPgtos: totalPagoSaidas, saldoFinal: saldoFinalFinal,
        conferido: calc.conferido,
        valorLiquidoContabil: calc.valorLiquidoContabil || undefined,
        fonteContabil: calc.fonteContabil,
        rubricas: calc.holerite.rubricas,
        ...montarEstadoPagamento(m.id, salva),
        raw: m,
      });
    }
    return folhas.sort((a, b) => a.nome.localeCompare(b.nome));
  };

  /* ── Cálculo Freelancers ─────────────────────────────────── */
  const calcularFechamentosFreelancer = (saldosOverride?: Record<string, number>) => {
    const saldosEfetivos = saldosOverride ?? saldosEspeciais;
    let semanas: { inicio: Date; fim: Date }[];
    if (periodoCustomAtivo) {
      // Período custom: gera UMA única "semana" cobrindo EXATAMENTE o range selecionado.
      // (resolve o caso de ranges que cruzam meses ou não se alinham com semanas civis)
      semanas = [{
        inicio: new Date(periodoIni + 'T00:00:00'),
        fim:    new Date(periodoFim + 'T00:00:00'),
      }];
    } else {
      const [ano, mes] = mesAno.split('-').map(Number);
      semanas = semanasFechamento(ano, mes);
    }

    // Dias já pagos neste mês - NOVO MODELO: 1 registro por dia/turno (tipo='freelancer-dia')
    // Formato id: folha-{colabId}-{YYYY-MM-DD}-{Dia|Noite}
    // Legado (diasPagos embutido): também absorvido para retrocompatível
    // Estrutura: colabId → Set<"YYYY-MM-DD"> (qualquer turno pago nesse dia conta)
    // Detalhe por turno: colabId → Map<"YYYY-MM-DD-Turno", {valor, dataPagamento, formaPagamento}>
    const diasJaPagosPorColab: Record<string, Set<string>> = {};  // data paga (qualquer turno)
    const turnosPagosPorColab: Record<string, Map<string, {valor: number; dataPagamento: string; forma: string}>> = {};

    for (const reg of folhasDB) {
      if (!reg.colaboradorId || !reg.pago) continue;
      if (isMigradoReg(reg))   continue;  // ignorar registros legados migrados
      if (isEstornadoReg(reg)) continue;  // ignorar registros vazios/cancelados (estornado=true)
      const cid = reg.colaboradorId;
      if (!diasJaPagosPorColab[cid]) diasJaPagosPorColab[cid] = new Set();
      if (!turnosPagosPorColab[cid]) turnosPagosPorColab[cid] = new Map();

      // ─ NOVO MODELO: registros granulares (id começa com 'folha-' e tem data no id)
      if (typeof reg.id === 'string' && reg.id.startsWith('folha-') && reg.data && reg.turno) {
        diasJaPagosPorColab[cid].add(reg.data);
        const chave = `${reg.data}-${reg.turno}`;
        turnosPagosPorColab[cid].set(chave, {
          valor: R(reg.valor),
          dataPagamento: reg.dataPagamento || '',
          forma: reg.formaPagamento || 'PIX',
        });
        continue;
      }

      // ─ LEGADO: diasPagos embutido
      if (Array.isArray(reg.diasPagos) && reg.diasPagos.length > 0) {
        for (const dp of reg.diasPagos) {
          if (!dp?.data) continue;
          diasJaPagosPorColab[cid].add(dp.data);
          const turno = dp.turno || 'Dia';
          // DiaNoite legado: marcar ambos
          const turnos = (turno === 'DiaNoite' || turno === 'DN') ? ['Dia','Noite'] : [turno];
          for (const t of turnos) {
            turnosPagosPorColab[cid].set(`${dp.data}-${t}`, {
              valor: R(dp.valor) / turnos.length,
              dataPagamento: reg.dataPagamento || '',
              forma: reg.formaPagamento || 'PIX',
            });
          }
        }
      }
    }

    const fechamentos: FechamentoSemanalFreelancer[] = semanas.map(({ inicio, fim }) => {
      const isoInicioBase = fmtDataISO(inicio);
      const isoFimBase = fmtDataISO(fim);
      // Período CUSTOM GLOBAL: range é a única fonte de verdade, ignora editFechamento
      // Período MENSAL: respeita ajustes manuais salvos no editFechamento
      const efBase = periodoCustomAtivo ? {} : (editFechamento[isoFimBase] || {});
      let isoInicio = (efBase as any).dataIniCustom || isoInicioBase;
      let isoFim    = (efBase as any).dataFimCustom || isoFimBase;
      // Label dinâmico reflete o período real
      const [iniD, iniM] = isoInicio.split('-').slice(1).map(Number);
      const [fimD, fimM] = isoFim.split('-').slice(1).map(Number);
      const labelPeriodo = `${String(iniD).padStart(2,'0')}/${String(iniM).padStart(2,'0')} - ${String(fimD).padStart(2,'0')}/${String(fimM).padStart(2,'0')}`;

      const frList = freelancers.map(f => {
        // ── Detectar se é motoboy Freelancer (usa controle-motoboy, não escalas) ──
        const fCpf = (f as any).cpf || '';
        const motoboyMatch = motoboys.find(m =>
          m.id === f.id || (fCpf && m.cpf === fCpf)
        );
        const isMotoboy = !!motoboyMatch || (f as any).cargo === 'Motoboy';
        const motoboyId = motoboyMatch?.id || f.id;
        // Controle indexado por ID do motoboy ou por CPF
        const ctrlLinhas: ControleDia[] =
          controlesMap[motoboyId] || (fCpf ? controlesMap[fCpf] : undefined) || [];

        const vDia   = R(f.valorDia);
        const vNoite = R(f.valorNoite);
        const vEntrega = R((f as any).valorTransporte); // para motoboy: valor por entrega
        const vDobra = R((f as any).valorDobra) || 120;
        const usaTurno = vDia > 0 || vNoite > 0;

        // Analítico: diasPagos = dias pendentes (a pagar agora)
        const diasPagos: { data: string; turno: string; valor: number }[] = [];
        // Analítico: diasJaPagosDetalhe = dias que já foram pagos anteriormente
        const diasJaPagosDetalhe: { data: string; turno: string; valor: number }[] = [];

        let total = 0;
        let totalJaPago = 0;
        let dobras = 0;
        let diasTrabalhados = 0;
        let diasCodigo = '';

        const diasJaPagos = diasJaPagosPorColab[f.id] || new Set<string>();

        // Caixinha vinda do controle-motoboy (lançada manualmente na grade pelo operador)
        let caixinhaCtrlMotoboy = 0;
        const caixinhaCtrlDetalhe: { descricao: string; valor: number; data: string }[] = [];

        if (isMotoboy && (vDia > 0 || vNoite > 0 || vEntrega > 0)) {
          // ── Cálculo baseado em controle-motoboy ──────────────────────────────
          const linhasSemana = ctrlLinhas.filter(l => l.data >= isoInicio && l.data <= isoFim);

          for (const linha of linhasSemana) {
            const jaPago = diasJaPagos.has(linha.data);
            // Respeita chegadaDia/chegadaNoite salvos (operador marcou checkbox no Controle)
            // Fallback: se há entrega mas chegada não foi marcada, usa valor do cadastro
            const chegD = R(linha.chegadaDia)   > 0 ? R(linha.chegadaDia)   : (R(linha.entDia)   > 0 ? vDia   : 0);
            const chegN = R(linha.chegadaNoite) > 0 ? R(linha.chegadaNoite) : (R(linha.entNoite) > 0 ? vNoite : 0);
            const temDia   = chegD > 0 || R(linha.entDia)   > 0;
            const temNoite = chegN > 0 || R(linha.entNoite) > 0;
            const totalEntregas = (R(linha.entDia) + R(linha.entNoite)) * vEntrega;
            const caixinhaLinha = R(linha.caixinhaDia) + R(linha.caixinhaNoite);
            const vlLinha = parseFloat((chegD + chegN + totalEntregas).toFixed(2));

            // Turno de exibição
            const turno = (temDia && temNoite) ? 'DiaNoite' : temDia ? 'Dia' : temNoite ? 'Noite' : 'Dia';

            if (jaPago) {
              totalJaPago += vlLinha;
              diasJaPagosDetalhe.push({ data: linha.data, turno, valor: vlLinha });
            } else if (vlLinha > 0) {
              total += vlLinha;
              diasPagos.push({ data: linha.data, turno, valor: vlLinha });
              dobras += (temDia && temNoite) ? 2 : 1;
              diasTrabalhados++;
            }

            // Caixinha do controle-motoboy: agrega como crédito (não paga, pra não duplicar)
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
          diasCodigo = diasPagos.map(d => d.data.slice(8)).join(',');
        } else {
          // ── Cálculo baseado em escalas (freelancer padrão) ───────────────────
          const escalasSemana = escalas.filter(e =>
            e.colaboradorId === f.id && e.data >= isoInicio && e.data <= isoFim
          );
          ({ diasCodigo } = contarDobras(escalasSemana, f.id));

          const escalasSemanaConfirmadas = escalasSemana.filter(e =>
            e.turno !== 'Folga' &&
            (statusPresencaEscala(e) === 'presente' || statusPresencaEscala(e) === 'presente_parcial')
          );
          // Para escalas DiaNoite: verificar cada turno individualmente
          // turnosPagosPorColab usa chave "{data}-{Dia|Noite}"
          const turnPagos = turnosPagosPorColab[f.id] || new Map();
          const isTurnoPago = (data: string, turno: 'Dia' | 'Noite') =>
            turnPagos.has(`${data}-${turno}`);

          // Expandir escalas em unidades de turno simples para checagem granular
          type TurnoUnit = { data: string; turno: 'Dia' | 'Noite'; esc: EscalaItem };
          const turnosUnidade: TurnoUnit[] = [];
          for (const esc of escalasSemanaConfirmadas) {
            const st = statusPresencaEscala(esc);
            if (esc.turno === 'DiaNoite') {
              // presente_parcial: só o turno com presença marcada
              if (st === 'presente_parcial') {
                const t = esc.presenca === 'presente' ? 'Dia' : 'Noite';
                turnosUnidade.push({ data: esc.data, turno: t, esc });
              } else {
                turnosUnidade.push({ data: esc.data, turno: 'Dia',   esc });
                turnosUnidade.push({ data: esc.data, turno: 'Noite', esc });
              }
            } else {
              const t = (esc.turno === 'Noite' ? 'Noite' : 'Dia') as 'Dia' | 'Noite';
              turnosUnidade.push({ data: esc.data, turno: t, esc });
            }
          }

          const escalasPendentes = turnosUnidade.filter(u => !isTurnoPago(u.data, u.turno));
          const escalasJaPagas   = turnosUnidade.filter(u =>  isTurnoPago(u.data, u.turno));

          // calcValorTurno: valor por turno simples Dia ou Noite
          const calcValorTurno = (esc: EscalaItem, efetivaTurno: 'Dia' | 'Noite'): number => {
            if ((f as any).tipoAcordo === 'valor_turno' && (f as any).acordo?.tabela) {
              const tabela: AcordoTurnoTabela = (f as any).acordo.tabela;
              const DOW_K = ['dom','seg','ter','qua','qui','sex','sab'];
              const dow2 = new Date(esc.data + 'T12:00:00').getDay();
              const vals = tabela[DOW_K[dow2]] || {};
              return efetivaTurno === 'Dia' ? R(vals.D) : R(vals.N);
            }
            if (usaTurno) return efetivaTurno === 'Dia' ? vDia : vNoite;
            return parseFloat(vDobra.toFixed(2));
          };

          for (const u of escalasPendentes) {
            const v = calcValorTurno(u.esc, u.turno);
            total += v;
            diasPagos.push({ data: u.data, turno: u.turno, valor: v });
          }
          for (const u of escalasJaPagas) {
            const v = calcValorTurno(u.esc, u.turno);
            totalJaPago += v;
            diasJaPagosDetalhe.push({ data: u.data, turno: u.turno, valor: v });
          }
          total = parseFloat(total.toFixed(2));
          totalJaPago = parseFloat(totalJaPago.toFixed(2));

          dobras = diasPagos.reduce((s, d) => {
            if (d.turno === 'Dia' || d.turno === 'Noite') return s + 1;
            return s;
          }, 0) / 2;  // converte turnos em dobras (2 turnos = 1 dobra)
          dobras = parseFloat(dobras.toFixed(1));
          diasTrabalhados = new Set(escalasPendentes.map(u => u.data)).size;
        }

        // valorDobra para exibição
        const valorDobra = usaTurno ? (vDia + vNoite) : vDobra;
        // Transporte (deslocamento diário): valorTransporte cadastrado × dias trabalhados
        // Para motoboy freelancer: o `valorEntrega` não entra aqui (já conta no `total` via chegada+entregas)
        // Mas exibimos as entregas em campo separado pra conferência com o módulo de motoboys.
        const valorTransporte = R(f.valorTransporte);
        const totalTransporte = parseFloat((valorTransporte * diasTrabalhados).toFixed(2));
        // Total de entregas do motoboy (apenas exibição/conferência, não entra no líquido)
        let totalEntregasMotoboy = 0;
        if (isMotoboy) {
          const linhasMot = ctrlLinhas.filter(l => l.data >= isoInicio && l.data <= isoFim);
          for (const linha of linhasMot) {
            if (diasJaPagos.has(linha.data)) continue;
            totalEntregasMotoboy += (R(linha.entDia) + R(linha.entNoite)) * vEntrega;
          }
          totalEntregasMotoboy = parseFloat(totalEntregasMotoboy.toFixed(2));
        }

        // Helper: data efetiva da saída (dataPagamento ou data de lançamento)
        const saidaData = (s: any) => s.dataPagamento || s.data || '';

        // ── Controle de adiantamento de transporte ──────────────────────────
        // O adiantamento pode ter sido feito em qualquer momento do mês (normalmente no início),
        // não apenas dentro da janela da semana atual.
        //
        // Lógica:
        // - adiantadoMes: total pago via saída "Adiantamento Transporte" no mês
        // - pago em semanas anteriores: soma dos valorTransporte já registrados em folha-pagamento
        // - saldo disponível do adiantamento = adiantadoMes - o que já foi abatido em semanas anteriores
        // - transporteSaldo desta semana = max(0, totalTransporte - saldo disponível)

        // 1. Total adiantado no mês todo
        // Usa saidasMesCompleto quando período custom está ativo (saidasPeriodo seria só a semana)
        const fonteSaidasTransp = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPeriodo;
        const saidasTransporteMes = fonteSaidasTransp.filter((s: any) =>
          s.colaboradorId === f.id &&
          (s.tipo || s.origem || s.referencia || '') === 'Adiantamento Transporte'
        );
        const transporteAdiantadoMes = parseFloat(
          saidasTransporteMes.reduce((sum: number, s: any) => sum + R(s.valor), 0).toFixed(2)
        );

        // 2. Dias únicos já pagos ANTES desta semana (via granulares no banco)
        //    Usar folhasDB (granulares reais) em vez de escalas — evita sobrestimar
        //    dias quando o adiantamento foi feito antes do início da semana
        const granularesPagosAnteriores = folhasDB.filter((reg: any) =>
          reg.colaboradorId === f.id &&
          reg.tipo === 'freelancer-dia' &&
          reg.pago === true &&
          reg.data && reg.data < isoInicio  // dias ANTES desta semana
        );
        // Dias únicos = set de datas (DiaNoite em 1 dia = 1 dia de transporte)
        const diasUnicosAnteriores = new Set<string>(granularesPagosAnteriores.map((r: any) => r.data));
        const transporteSemanasAnteriores = diasUnicosAnteriores.size * R(f.valorTransporte);

        // 3. Saldo do adiantamento ainda disponível para esta semana
        const adiantamentoDisponivel = parseFloat(Math.max(0, transporteAdiantadoMes - transporteSemanasAnteriores).toFixed(2));

        // 4. Saldo desta semana = o que não foi coberto pelo adiantamento
        const transporteAdiantado = adiantamentoDisponivel;
        const transporteSaldo = parseFloat(Math.max(0, totalTransporte - adiantamentoDisponivel).toFixed(2));

        // 🪙 Caixinha a receber: o restaurante coletou a gorjeta e DEVE pagar ao colaborador
        // é um CRÉDITO (soma ao líquido), não um desconto
        const TIPOS_CAIXINHA = ['Caixinha'];
        const saidasCaixinhaFr = saidasPeriodo.filter((s: any) =>
          s.colaboradorId === f.id &&
          TIPOS_CAIXINHA.includes(s.tipo || s.origem || s.referencia || '') &&
          saidaData(s) >= isoInicio &&
          saidaData(s) <= isoFim
        );
        const caixinhaSaidas = parseFloat(
          saidasCaixinhaFr.reduce((sum: number, s: any) => sum + R(s.valor), 0).toFixed(2)
        );
        // Total de caixinha = saídas (Caixinha) + caixinha lançada no controle-motoboy
        const caixinhaTotal = parseFloat((caixinhaSaidas + caixinhaCtrlMotoboy).toFixed(2));
        const caixinhaDetalhe = [
          ...saidasCaixinhaFr.map((s: any) => ({
            descricao: `🪙 Caixinha: ${s.descricao || 'Gorjeta'}`,
            valor: R(s.valor),
            data: saidaData(s),
          })),
          ...caixinhaCtrlDetalhe,
        ];

        // Descontos reais do colaborador: vale/empréstimo, consumo e parcelas de adiantamento especial
        // 'Caixinha' permanece como crédito e não entra nesta lista
        // Usar fonte expandida (mês completo) + range +2 dias para pegar saídas criadas no dia do pagamento
        const TIPOS_DESCONTO_FREELANCER = ['A pagar', 'A receber', 'Consumo Interno', 'Desconto Adiantamento Especial'];
        const fonteSaidasDesc = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPeriodo;
        const fimExpandido = new Date(new Date(isoFim+'T12:00:00').getTime()+2*864e5).toISOString().slice(0,10);
        const saidasDescFreelancer = fonteSaidasDesc.filter((s: any) => {
          const t = s.tipo || s.origem || s.referencia || '';
          if (s.colaboradorId !== f.id) return false;
          if (!TIPOS_DESCONTO_FREELANCER.includes(t)) return false;
          if (saidaData(s) < isoInicio || saidaData(s) > fimExpandido) return false;
          // Mostrar Desconto Adiantamento Especial sempre (inclusive já abatido) — é informação real do pagamento
          return true;
        });
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

        // Liquid = dobras pendentes + transporte saldo + caixinha - descontos (o que resta a pagar)
        const totalLiquido = parseFloat((total + transporteSaldo + caixinhaTotal - saidasDesconto).toFixed(2));

        // Total bruto do período inteiro (pendente + já pago) - para exibição na linha
        const totalBrutoPeriodo = parseFloat((total + totalJaPago).toFixed(2));
        const totalDobrasExib = dobras + diasJaPagosDetalhe.reduce((s, d) => {
          if (d.turno === 'DiaNoite') return s + 2;
          if (d.turno === 'Dia' || d.turno === 'Noite') return s + 1;
          return s;
        }, 0);

        // Saldo de adiantamento especial em aberto (toda a vida do colaborador)
        const saldoEspecialAberto = parseFloat((saldosEfetivos[f.id] || 0).toFixed(2));

        return {
          id: f.id, nome: f.nome, chavePix: f.chavePix,
          telefone: f.celular || f.telefone,
          // Tipo de acordo (para cálculo correto no modal de detalhe)
          tipoAcordo: (f as any).tipoAcordo || null,
          acordo: (f as any).acordo || null,
          dobras, valorDobra, valorDia: vDia, valorNoite: vNoite,
          valorTransporte, totalTransporte,
          totalEntregasMotoboy,       // motoboy: entregas × valorEntrega (só exibição)
          isMotoboy,                  // flag para a coluna de transporte saber
          transporteAdiantadoMes,     // total do adiantamento no mês (para o banner do modal)
          transporteSemanasAnteriores, // já consumido em semanas anteriores (para o banner)
          transporteAdiantado, transporteSaldo,
          total, totalLiquido, saidasDesconto, saidasDetalhe,
          totalBrutoPeriodo, totalDobrasExib, // para exibição mostrando o período completo
          caixinhaTotal, caixinhaDetalhe,
          diasCodigo, diasTrabalhados,
          pendentesAnteriores,
          saldoEspecialAberto,
          diasPagos,             // dias PENDENTES a pagar agora
          diasJaPagosDetalhe,    // dias já pagos anteriormente (para exibição/auditoria)
          totalJaPago,           // valor já pago em outros registros no período
          periodoInicio: isoInicio,
          periodoFim:    isoFim,
          pago: false,
        };
      // Manter freelancers com dobras pendentes OU com dias já pagos no período (para visibilidade)
      }).filter(fr => fr.dobras > 0 || fr.diasJaPagosDetalhe.length > 0);

      const key = isoFimBase; // chave sempre baseada no fim original da semana
      const ef = editFechamento[key] || {};
      const combustivel = parseFloat(ef.combustivel || '0') || 0;
      const extra = parseFloat(ef.extra || '0') || 0;
      const desconto = parseFloat(ef.desconto || '0') || 0;
      // totalSemana: soma pendentes + já pagos (totalBrutoPeriodo) para o subtotal refletir o período completo
      const totalSemana          = frList.reduce((s, fr) => s + (fr.totalBrutoPeriodo ?? fr.total), 0);
      // totalSemanaPendente: só o que ainda falta pagar (usado no Líquido a pagar)
      const totalSemanaPendente  = frList.reduce((s, fr) => s + fr.total, 0);
      // totalTransporteSemana: transporte bruto total do período (inclui já pagos)
      const totalTransporteSemana    = frList.reduce((s, fr) => s + (fr.totalTransporte || 0), 0);
      // Para o subtotal exibir o transporte do período completo:
      // diasTrabalhados × valorTransporte de cada um (já é o que totalTransporte representa)
      const totalTransporteAdiantado = frList.reduce((s, fr) => s + (fr.transporteAdiantado || 0), 0);
      const totalTransporteSaldo     = frList.reduce((s, fr) => s + (fr.transporteSaldo || 0), 0);
      const totalSaidasDesconto      = frList.reduce((s, fr) => s + (fr.saidasDesconto || 0), 0);
      const totalCaixinhaSemana      = frList.reduce((s, fr) => s + (fr.caixinhaTotal || 0), 0);

      return {
        semanaLabel: periodoCustomAtivo
          ? labelPeriodo
          : ((efBase as any).dataIniCustom || (efBase as any).dataFimCustom) ? `${labelPeriodo} ✏️` : `${fmtDataBR(inicio)} - ${fmtDataBR(fim)}`,
        dataFechamento: isoFim, // usa o fim efetivo como chave de pagamento
        dataFechamentoBase: isoFimBase, // chave original (sempre da semana, para editFechamento)
        dataInicioBase: isoInicio, // início efetivo (já clipado se período global ativo)
        dataFimEfetivo: isoFim,    // fim efetivo (já clipado se período global ativo)
        freelancers: frList,
        totalSemana,               // bruto do período completo (pendente + já pago) — subtotal
        totalSemanaPendente,       // só o que resta pagar — Líquido a pagar
        totalCaixinha: totalCaixinhaSemana,
        totalTransporte: totalTransporteSaldo,
        totalTransporteCalculado: totalTransporteSemana,
        totalTransporteAdiantado,
        totalCombustivel: combustivel,
        totalExtra: extra,
        totalDesconto: desconto,
        totalSaidasDesconto,
        totalLiquido: totalSemanaPendente + totalTransporteSaldo + totalCaixinhaSemana - totalSaidasDesconto + extra - desconto,
        observacao: ef.obs,
      };
    });

    setFechamentosFreelancer(fechamentos.filter(f => f.freelancers.length > 0));
  };

  // Recalcular fechamentos quando editFechamento, saidas ou escalas mudam
  useEffect(() => {
    if (freelancers.length > 0 && escalas.length >= 0) calcularFechamentosFreelancer();
  }, [editFechamento, freelancers, escalas, saidasPeriodo, saidasMesCompleto, saidasPendentesAnt, saldosEspeciais, controlesMap, motoboys]);

  /* ── Toggle pago CLT ─────────────────────────────────────── */
  const handleTogglePago = async (folha: FolhaMensal, dataOverride?: string) => {
    const novoPago = !folha.pago;
    const hoje2 = new Date().toISOString().split('T')[0];
    const dataPgtoFinal = novoPago ? (dataOverride || hoje2) : null;
    setSalvando(true);
    try {
      // Registrar no logPagamentos quando marcar como pago
      const existingLogs = folha.logPagamentos || [];
      const newLogs = novoPago ? [
        ...existingLogs,
        { id: Date.now().toString(), data: dataPgtoFinal || hoje2, valor: folha.pgtosDia20, forma: 'PIX' as const, tipo: 'Adiantamento' as const }
      ] : existingLogs;
      const payload = {
        colaboradorId: folha.colaboradorId, mes: mesAno, unitId,
        pago: novoPago, dataPagamento: dataPgtoFinal,
        pagoAdiantamento: novoPago, dataPgtoAdiantamento: dataPgtoFinal,
        saldoFinal: folha.saldoFinal,
        logPagamentos: newLogs,
        ...auditoriaCampos(),
      };
      const resp = await fetchAuth(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!resp?.ok) throw new Error(`HTTP ${resp?.status}: ${await resp?.text().catch(() => 'sem detalhe')}`);
      setFolhasLocais(prev => prev.map(f =>
        f.colaboradorId === folha.colaboradorId
          ? { ...f, pago: novoPago, dataPagamento: novoPago ? (dataOverride || hoje2) : undefined,
              pagoAdiantamento: novoPago, dataPgtoAdiantamento: novoPago ? (dataOverride || hoje2) : undefined,
              logPagamentos: newLogs }
          : f
      ));
    } catch (err: any) { alert(`Erro ao salvar pagamento: ${err?.message || err}. Tente novamente.`); console.error('handleTogglePago error:', err); }
    finally { setSalvando(false); }
  };

  /* ── Toggle pago VARIÁVEL (independente do fixo) ─────────── */
  const handleTogglePagoVariavel = async (folha: FolhaMensal, dataOverride?: string) => {
    const novoPago = !folha.pagoVariavel;
    const hoje2 = new Date().toISOString().split('T')[0];
    const dataPgtoFinal = novoPago ? (dataOverride || hoje2) : null;
    setSalvando(true);
    try {
      // Registrar no logPagamentos quando marcar variável como pago
      const existingLogs = folha.logPagamentos || [];
      const newLogs = novoPago ? [
        ...existingLogs,
        { id: Date.now().toString(), data: dataPgtoFinal || hoje2, valor: folha.pgtosDia05, forma: 'PIX' as const, tipo: 'Variável' as const }
      ] : existingLogs;
      const payload = {
        colaboradorId: folha.colaboradorId, mes: mesAno, unitId,
        pago: folha.pago,
        pagoVariavel: novoPago, dataPgtoVariavel: dataPgtoFinal,
        saldoFinal: folha.saldoFinal,
        logPagamentos: newLogs,
        ...auditoriaCampos(),
      };
      const resp = await fetchAuth(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!resp?.ok) throw new Error(`HTTP ${resp?.status}: ${await resp?.text().catch(() => 'sem detalhe')}`);
      setFolhasLocais(prev => prev.map(f =>
        f.colaboradorId === folha.colaboradorId
          ? { ...f, pagoVariavel: novoPago, dataPgtoVariavel: novoPago ? (dataOverride || hoje2) : undefined,
              logPagamentos: newLogs }
          : f
      ));
    } catch (err: any) { alert(`Erro ao salvar pagamento vari\u00e1vel: ${err?.message || err}. Tente novamente.`); console.error('handleTogglePagoVariavel error:', err); }
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
  // Modal de histórico de pagamentos (lupa 🔍)
  const [modalLogPgto, setModalLogPgto] = useState<FolhaMensal | null>(null);

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
          <h3 style={{ margin: 0, color: '#1565c0' }}>📊 Histórico Analítico - {nome}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999' }}>Nenhum registro de pagamento encontrado.</p>
        ) : (() => {
          // Separar granulares (novo modelo) de legados
          const granulares = items.filter((x: any) => x.tipo === 'freelancer-dia' && x.data);
          const isMigr = (x: any) => x.migrado === true || x.migrado === 'True' || x.migrado === 'true';
          const legados    = items.filter((x: any) => x.tipo !== 'freelancer-dia' && !isMigr(x));

          // Agrupar granulares por semana (campo semana ou derivar da data)
          const semanaGrupos: Record<string, any[]> = {};
          for (const g of granulares) {
            const key = g.semana || g.data?.substring(0, 7) || 'sem-semana';
            if (!semanaGrupos[key]) semanaGrupos[key] = [];
            semanaGrupos[key].push(g);
          }
          // Montar linhas agrupadas
          const linhasGranulares = Object.entries(semanaGrupos).map(([sem, dias]) => ({
            id: `grupo-${sem}`,
            tipo: 'granular-grupo',
            mes: dias[0].mes,
            semana: sem,
            diasDetalhe: dias.sort((a: any, b: any) => a.data.localeCompare(b.data)),
            total: dias.reduce((s: number, d: any) => s + R(d.valor), 0),
            pago: dias.every((d: any) => d.pago),
            parcial: dias.some((d: any) => d.pago) && dias.some((d: any) => !d.pago),
            dataPagamento: dias.filter((d: any) => d.dataPagamento).sort((a: any, b: any) => (b.dataPagamento||'').localeCompare(a.dataPagamento||''))[0]?.dataPagamento || '',
            formaPagamento: dias[0]?.formaPagamento || 'PIX',
          }));

          const todasLinhas = [
            ...linhasGranulares.sort((a, b) => (b.semana||'').localeCompare(a.semana||'')),
            ...legados.sort((a: any, b: any) => (b.semana||b.mes||'').localeCompare(a.semana||a.mes||'')),
          ];
          const totalPago = [
            ...granulares.filter((x: any) => x.pago).map((x: any) => R(x.valor)),
            ...legados.filter((x: any) => x.pago).map((x: any) => R(x.totalFinal || x.saldoFinal)),
          ].reduce((s, v) => s + v, 0);

          return (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                {['Mês', 'Semana', 'Dias/Turnos', 'Valor', 'Status', 'Data Pgto', 'Forma'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todasLinhas.map((item: any, i) => (
                <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : 'white', borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>{item.mes}</td>
                  <td style={{ padding: '6px 8px', color: '#666', fontSize: '11px' }}>{item.semana || '-'}</td>
                  <td style={{ padding: '6px 8px', fontSize: '11px', color: '#444' }}>
                    {item.tipo === 'granular-grupo'
                      ? item.diasDetalhe.map((d: any) => `${d.data.substring(8)}/${d.turno === 'Dia' ? '☀️' : '🌙'}`).join(' · ')
                      : (item.obs || '-').substring(0, 60)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20' }}>
                    {item.tipo === 'granular-grupo'
                      ? fmtMoeda(item.total)
                      : fmtMoeda(item.totalFinal || item.saldoFinal || 0)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {item.tipo === 'granular-grupo' && item.parcial
                      ? <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#fff9c4', color: '#f57f17' }}>🟡 Parcial</span>
                      : <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                          color: item.pago ? '#2e7d32' : '#f57f17' }}>
                          {item.pago ? '✅ Pago' : '⏳ Pendente'}
                        </span>
                    }
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: '11px', color: item.dataPagamento ? '#2e7d32' : '#bbb' }}>
                    {item.dataPagamento || '-'}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 'bold',
                    color: (item.formaPagamento || item.forma) === 'PIX' ? '#1565c0' : '#2e7d32' }}>
                    {item.formaPagamento || item.forma || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '8px' }}>TOTAL PAGO (histórico)</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totalPago)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          </div>
          );
        })()}
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
          <h3 style={{ margin: 0 }}>💰 Resumo Mensal - {f.nome.split(' ')[0]}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
          {f.cargo} · {f.tipoContrato} · {mesAno}
        </div>

        {(() => {
          // Sal.Contr.INSS = base real da contabilidade (truncado no inteiro)
          const salContrInss = f.salContrInss ?? Math.floor(f.salarioBase + f.periculosidade + (f.feriadosValor || 0));
          const fgts = parseFloat((salContrInss * 0.08).toFixed(2)); // FGTS 8% sobre Sal.Contr.INSS
          const totalVencimentos = f.salarioBase + f.periculosidade + (f.feriadosValor || 0) + f.totalVariavel
            + (f.arredondamentoPos || 0);
          const totalDescontos = f.inss + f.contrAssistencial + f.adiantamentoValor
            + (f.valeTransporte || 0)
            + (f.arredondamentoNeg || 0);
          const liquidoMes = totalVencimentos - totalDescontos;
          return (
            <>
              {/* Holerith estilo PDF da contabilidade */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', width: '50px' }}>Cód.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#a5d6a7' }}>Vencimentos</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#ef9a9a' }}>Descontos</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Vencimentos */}
                  <tr style={{ backgroundColor: '#fafafa' }}>
                    <td style={{ padding: '4px 8px' }}>1</td><td style={{ padding: '4px 8px' }}>Salário</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(f.salarioBase)}</td><td />
                  </tr>
                  {f.periculosidade > 0 && (
                    <tr><td style={{ padding: '4px 8px' }}>9</td><td style={{ padding: '4px 8px' }}>Adic. Periculosidade</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(f.periculosidade)}</td><td /></tr>
                  )}
                  {(f.feriadosTrab || 0) > 0 && (
                    <tr style={{ backgroundColor: '#f3e5f5' }}>
                      <td style={{ padding: '4px 8px' }}>1311</td>
                      <td style={{ padding: '4px 8px' }}>Feriado ({f.feriadosTrab} dia{(f.feriadosTrab || 0) > 1 ? 's' : ''})</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#6a1b9a', fontWeight: 'bold' }}>{fmtMoeda(f.feriadosValor || 0)}</td><td />
                    </tr>
                  )}
                  {f.variavelAte19 > 0 && (
                    <tr style={{ backgroundColor: '#fafafa' }}><td style={{ padding: '4px 8px' }}>—</td><td style={{ padding: '4px 8px' }}>Variável até dia 19</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(f.variavelAte19)}</td><td /></tr>
                  )}
                  {f.variavelDe20a31 > 0 && (
                    <tr><td style={{ padding: '4px 8px' }}>—</td><td style={{ padding: '4px 8px' }}>Variável 20-31</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(f.variavelDe20a31)}</td><td /></tr>
                  )}
                  {f.arredondamentoPos > 0 && (
                    <tr style={{ backgroundColor: '#fafafa' }}><td style={{ padding: '4px 8px' }}>16</td><td style={{ padding: '4px 8px' }}>Arredondamento Atual</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(f.arredondamentoPos)}</td><td /></tr>
                  )}
                  {/* Descontos */}
                  <tr style={{ backgroundColor: '#fff3e0' }}>
                    <td style={{ padding: '4px 8px' }}>11</td>
                    <td style={{ padding: '4px 8px' }}>INSS sobre Salário <span style={{ color: '#888', fontSize: '10px' }}>(base: {fmtMoeda(salContrInss)})</span></td>
                    <td /><td style={{ padding: '4px 8px', textAlign: 'right', color: '#c62828' }}>{fmtMoeda(f.inss)}</td>
                  </tr>
                  <tr><td style={{ padding: '4px 8px' }}>12</td><td style={{ padding: '4px 8px' }}>Adiantamento Anterior</td>
                    <td /><td style={{ padding: '4px 8px', textAlign: 'right', color: '#c62828' }}>{fmtMoeda(f.adiantamentoValor)}</td>
                  </tr>
                  {f.arredondamentoNeg > 0 && (
                    <tr style={{ backgroundColor: '#fff3e0' }}><td style={{ padding: '4px 8px' }}>19</td><td style={{ padding: '4px 8px' }}>Arredondamento Anterior</td>
                      <td /><td style={{ padding: '4px 8px', textAlign: 'right', color: '#c62828' }}>{fmtMoeda(f.arredondamentoNeg)}</td></tr>
                  )}
                  {(f.valeTransporte || 0) > 0 && (
                    <tr style={{ backgroundColor: '#e3f2fd' }}>
                      <td style={{ padding: '4px 8px' }}>109</td>
                      <td style={{ padding: '4px 8px' }}>Desc. Vale Transporte <span style={{ color: '#888', fontSize: '10px' }}>(6% sal.)</span></td>
                      <td /><td style={{ padding: '4px 8px', textAlign: 'right', color: '#c62828' }}>{fmtMoeda(f.valeTransporte || 0)}</td>
                    </tr>
                  )}
                  {f.contrAssistencial > 0 && (
                    <tr><td style={{ padding: '4px 8px' }}>{(f.cargo || '').toLowerCase() === 'motoboy' ? '1305' : '1000'}</td><td style={{ padding: '4px 8px' }}>Contr. Assistencial</td>
                      <td /><td style={{ padding: '4px 8px', textAlign: 'right', color: '#c62828' }}>{fmtMoeda(f.contrAssistencial)}</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={2} style={{ padding: '8px' }}>Total Vencimentos</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(totalVencimentos)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(totalDescontos)}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                    <td colSpan={2} style={{ padding: '8px' }}>Líquido do Mês</td>
                    <td colSpan={2} style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(liquidoMes)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* Bases de cálculo (igual ao PDF da contabilidade) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '11px', marginBottom: '10px' }}>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>Sal. Base</div><div>{fmtMoeda(f.salarioBase)}</div></div>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>Sal.Contr.INSS</div><div>{fmtMoeda(salContrInss)}</div></div>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>Base Cálc. FGTS</div><div>{fmtMoeda(salContrInss)}</div></div>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>FGTS do Mês (8%)</div><div style={{ color: '#0288d1', fontWeight: 'bold' }}>{fmtMoeda(fgts)}</div></div>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>Pgto Dia 20</div><div style={{ color: '#fb8c00', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia20)}</div></div>
                <div><div style={{ color: '#666', fontWeight: 'bold' }}>Pgto Dia 5</div><div style={{ color: '#0288d1', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia05)}</div></div>
              </div>
            </>
          );
        })()}

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
  // Hooks must be called unconditionally (React rules) - states are always created
  // even when the modal is not open; they are reset via useEffect when modal opens.
  interface CheckItem { key: string; label: string; valor: number; tipo: 'credito'|'debito'; checked: boolean; }
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [dataLocalFreelancer, setDataLocalFreelancer] = useState(new Date().toISOString().split('T')[0]);
  const [formaFreelancer, setFormaFreelancer] = useState<'PIX' | 'Dinheiro' | 'Misto'>('PIX');
  const [formaFreelancerPix, setFormaFreelancerPix] = useState('');
  const [formaFreelancerDin, setFormaFreelancerDin] = useState('');
  const [abaterEspecial, setAbaterEspecial] = useState(false);
  const [valorAbatimento, setValorAbatimento] = useState('');

  // Reset checklist whenever a new freelancer payment modal opens
  useEffect(() => {
    if (!modalFreelancerPgto) return;
    setFormaFreelancer('PIX');
    setFormaFreelancerPix('');
    setFormaFreelancerDin('');
    setCheckItems([]); // limpa enquanto recarrega
    // Abatimento especial: checkbox desligado por padrão, usuário liga se quiser
    const saldo = modalFreelancerPgto.fr.saldoEspecialAberto || 0;
    setAbaterEspecial(false);
    setValorAbatimento(saldo > 0 ? saldo.toString() : '');
    setDataLocalFreelancer(new Date().toISOString().split('T')[0]);

    // ── Buscar saídas FRESCAS do banco antes de montar o checklist ──
    // Garante que descontos lançados após o último carregarDados() apareçam
    const { fr, fech } = modalFreelancerPgto;
    // isoIni/isoFim dos dias pendentes — usado apenas para referência de contexto
    // O buildChecklist usa rangeIni/rangeFim (semana inteira) para buscar consumos
    void (fr.periodoInicio || fech.dataInicioBase);
    void (fr.periodoFim   || fech.dataFechamentoBase);

    const buildChecklist = (saidasFrescas: any[]) => {
      const TIPOS_DESCONTO = ['A pagar', 'A receber', 'Consumo Interno', 'Desconto Adiantamento Especial'];
      const TIPOS_CAIXINHA = ['Caixinha'];
      const saidaData = (s: any) => s.dataPagamento || s.data || '';
      // Usar os limites EFETIVOS (já clipados ao período custom global, se ativo)
      // para buscar consumos/caixinha. Sem período custom = semana inteira.
      const rangeIni = fech.dataInicioBase;  // início efetivo (clipado se período global)
      const rangeFim = (fech as any).dataFimEfetivo || fech.dataFechamentoBase; // fim efetivo

      // Range expandido +2 dias para pegar saídas do dia do pagamento
      const rangeFimExp = new Date(new Date(rangeFim+'T12:00:00').getTime()+2*864e5).toISOString().slice(0,10);
      const saidasDescFr = saidasFrescas.filter((s: any) => {
        const t = s.tipo || s.origem || s.referencia || '';
        if (s.colaboradorId !== fr.id) return false;
        if (!TIPOS_DESCONTO.includes(t)) return false;
        if (saidaData(s) < rangeIni || saidaData(s) > rangeFimExp) return false;
        // Parcelas de adiantamento especial já quitadas: para checklist de pagamento,
        // excluir se já pago (não cobrar de novo); no grid/detalhamento mostramos como info
        if (t === 'Desconto Adiantamento Especial' && s.adiantamentoId && s.pago === true) return false;
        return true;
      });
      const saidasCaixFr = saidasFrescas.filter((s: any) =>
        s.colaboradorId === fr.id &&
        TIPOS_CAIXINHA.includes(s.tipo || s.origem || s.referencia || '') &&
        saidaData(s) >= rangeIni && saidaData(s) <= rangeFim
      );

      const descDetalhe = saidasDescFr.map((s: any) => ({ descricao: s.descricao || s.tipo || 'Desconto', valor: R(s.valor), data: saidaData(s) }));
      const caixDetalhe = saidasCaixFr.map((s: any) => ({ descricao: `Caixinha: ${s.descricao || 'Gorjeta'}`, valor: R(s.valor), data: saidaData(s) }));

      const obsValor = (fr.valorDia > 0 || fr.valorNoite > 0)
        ? `☀️ R$${fmt(fr.valorDia)}/dia + 🌙 R$${fmt(fr.valorNoite)}/noite`
        : `R$${fmt(fr.valorDobra)}/dobra`;

      // Transporte: mostrar sempre que há dias trabalhados com valorTransporte > 0
      // Mesmo quando saldo = R$0 (coberto por adiantamento), exibir breakdown informativo
      const totalTransporteSemana = parseFloat((fr.diasTrabalhados * R(fr.valorTransporte)).toFixed(2));
      const transpAdtoCoberto     = parseFloat(Math.min(fr.transporteAdiantado, totalTransporteSemana).toFixed(2));
      const transpLabelDetalhado  = totalTransporteSemana > 0
        ? (fr.transporteAdiantado > 0
            ? `🚗 Transporte: ${fr.diasTrabalhados} dias × R$${fmt(R(fr.valorTransporte))} = R$${fmt(totalTransporteSemana)}${transpAdtoCoberto > 0 ? ` — coberto pelo adto (R$${fmt(transpAdtoCoberto)}) — saldo: R$${fmt(fr.transporteSaldo)}` : ''}`
            : `🚗 Transporte: ${fr.diasTrabalhados} dias × R$${fmt(R(fr.valorTransporte))} = R$${fmt(totalTransporteSemana)}`)
        : '';

      // Caixinha do controle-motoboy: já calculada em fr.caixinhaDetalhe (não vem de Saídas)
      // Junta com caixinha de saídas para montar checkItems unificados
      const caixCtrlItems = (fr.caixinhaDetalhe || []).map((d: any, i: number) => ({
        key: `caix_ctrl_${i}`,
        label: `🪙 ${d.descricao || 'Caixinha'} (${d.data})`,
        valor: d.valor,
        tipo: 'credito' as const,
        checked: true,
      }));

      const items: CheckItem[] = [
        { key: 'dobras', label: `Dobras (${fr.dobras}× ${obsValor})`, valor: fr.total, tipo: 'credito', checked: true },
        // Transporte: item ativo só quando há saldo real a pagar; sempre visível como info quando coberto por adto
        ...(totalTransporteSemana > 0 ? [{
          key: 'transporte',
          label: transpLabelDetalhado,
          valor: fr.transporteSaldo,  // 0 quando coberto pelo adiantamento
          tipo: 'credito' as const,
          checked: fr.transporteSaldo > 0,  // pré-marcado só se há saldo real
        }] : []),
        // Caixinha do controle-motoboy (só se não vier duplicada via saídas)
        ...caixCtrlItems,
        // Caixinha de Saídas (freelancers não-motoboy); motoboy usa caixCtrlItems acima
        ...(caixCtrlItems.length === 0 ? caixDetalhe.map((d, i) => ({
          key: `caix_${i}`,
          label: `🪙 ${d.descricao} (${d.data})`,
          valor: d.valor,
          tipo: 'credito' as const,
          checked: true,
        })) : []),
        ...descDetalhe.map((d, i) => ({ key: `desc_${i}`, label: `🔴 Desconto: ${d.descricao} (${d.data})`, valor: d.valor, tipo: 'debito' as const, checked: true })),
        ...(fr.pendentesAnteriores || []).map((p: any, i: number) => ({
          key: `pend_${i}`,
          label: `⏳ Pendente anterior: [${p.tipo || p.origem}] ${p.descricao || ''} (${(p.dataPagamento || p.data || '').substring(0, 10)})`,
          valor: R(p.valor),
          tipo: 'debito' as const,
          checked: false,
        })),
      ];
      setCheckItems(items);
    };

    // Buscar saídas frescas para o período do freelancer
    const mesAnoLocal = mesAno;
    const [ano, mes] = mesAnoLocal.split('-').map(Number);
    const dataInicio = `${mesAnoLocal}-01`;
    const ultimoDia  = new Date(ano, mes, 0).getDate();
    const dataFim    = `${mesAnoLocal}-${String(ultimoDia).padStart(2,'0')}`;

    fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then((saidasFrescas: any[]) => {
        // Atualiza também o estado global para que o grid reflita os dados novos
        setSaidasPeriodo(Array.isArray(saidasFrescas) ? saidasFrescas : []);
        buildChecklist(Array.isArray(saidasFrescas) ? saidasFrescas : []);
      })
      .catch(() => {
        // Se falhar, usa os dados em cache
        buildChecklist(saidasPeriodo);
      });
  }, [modalFreelancerPgto]);

  // Renderizado como JSX inline (não como subcomponente) para evitar remontagem
  // que faz inputs perderem foco a cada keystroke.
  const totalSelecionadoFreelancer = checkItems.reduce((sum, item) => {
    if (!item.checked) return sum;
    return item.tipo === 'credito' ? sum + item.valor : sum - item.valor;
  }, 0);
  // Valor efetivamente a desembolsar = total dos itens - abatimento do adiantamento especial
  const vlAbateFreelancer = abaterEspecial ? (parseFloat(valorAbatimento) || 0) : 0;
  const totalADesembolsarFreelancer = Math.max(0, totalSelecionadoFreelancer - vlAbateFreelancer);
  const toggleItemFreelancer = (key: string) => {
    setCheckItems(prev => prev.map(it => it.key === key ? { ...it, checked: !it.checked } : it));
  };
  const modalConfirmarPgtoFreelancerJSX = !modalFreelancerPgto ? null : (() => {
    const { fr, fech } = modalFreelancerPgto;
    const totalSelecionado = totalSelecionadoFreelancer;
    const toggleItem = toggleItemFreelancer;

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

          {/* Conta Transporte — saldo separado, não entra na conta da semana */}
          {(fr.transporteAdiantadoMes > 0 || fr.totalTransporte > 0) && (
            <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderLeft: '4px solid #388e3c', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', color: '#2e7d32', fontSize: '13px' }}>🚗 Conta Transporte (saldo separado)</div>
                <span style={{ fontSize: '10px', color: '#666', fontStyle: 'italic' }}>não impacta o total da semana</span>
              </div>
              <div style={{ color: '#1b5e20', lineHeight: '1.7', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
                <div>📥 Adiantado no mês: <strong>{fmtMoeda(fr.transporteAdiantadoMes)}</strong></div>
                <div>✅ Consumido sem. anter.: <strong>{fmtMoeda(fr.transporteSemanasAnteriores || 0)}</strong></div>
                <div>💰 Disponível p/ esta sem.: <strong style={{color: fr.transporteAdiantado > 0 ? '#388e3c' : '#c62828'}}>{fmtMoeda(fr.transporteAdiantado)}</strong></div>
                <div>🚗 Transp. desta semana: <strong>{fmtMoeda(fr.diasTrabalhados * R(fr.valorTransporte))}</strong></div>
              </div>
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #c8e6c9', fontWeight: 'bold' }}>
                {fr.transporteSaldo === 0 && fr.transporteAdiantado >= fr.diasTrabalhados * R(fr.valorTransporte)
                  ? <span style={{color:'#388e3c'}}>✔ Totalmente coberto pelo adiantamento — nada a pagar nesta sem.</span>
                  : fr.transporteSaldo > 0
                  ? <span style={{color:'#c62828'}}>⚠ A pagar nesta sem.: {fmtMoeda(fr.transporteSaldo)} (somado ao total da semana)</span>
                  : <span style={{color:'#666'}}>Sem movimentação de transporte nesta sem.</span>
                }
                {fr.transporteAdiantadoMes > 0 && fr.transporteAdiantado > (fr.diasTrabalhados * R(fr.valorTransporte)) && (
                  <div style={{color:'#388e3c', fontSize:'11px', marginTop:'2px'}}>
                    💡 Sobra de adto. transp. não consumida: {fmtMoeda(fr.transporteAdiantado - fr.diasTrabalhados * R(fr.valorTransporte))} (não carrega para o mês seguinte)
                  </div>
                )}
              </div>
            </div>
          )}

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
                    {item.tipo === 'credito' ? '+' : '-'}{fmtMoeda(item.valor)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Total selecionado */}
          <div style={{ backgroundColor: totalSelecionado >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>
                {vlAbateFreelancer > 0 ? '🧾 Subtotal bruto:' : '💰 Total a pagar:'}
              </span>
              <span style={{ fontSize: vlAbateFreelancer > 0 ? '15px' : '20px', fontWeight: 'bold', color: totalSelecionado >= 0 ? '#2e7d32' : '#c62828' }}>
                {fmtMoeda(Math.max(0, totalSelecionado))}
              </span>
            </div>
            {vlAbateFreelancer > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#7c3aed' }}>➖ Abatimento adto. especial:</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#7c3aed' }}>-{fmtMoeda(vlAbateFreelancer)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', borderTop: '1px solid #c3d9c3', paddingTop: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>💰 A desembolsar:</span>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: totalADesembolsarFreelancer >= 0 ? '#2e7d32' : '#c62828' }}>
                    {fmtMoeda(totalADesembolsarFreelancer)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Abatimento de Adiantamento Especial */}
          {(fr.saldoEspecialAberto || 0) > 0 && (
            <div style={{ backgroundColor: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <input type="checkbox" id="abaterCheck" checked={abaterEspecial}
                  onChange={e => { setAbaterEspecial(e.target.checked); if (!e.target.checked) setValorAbatimento(''); }}
                  style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer' }} />
                <label htmlFor="abaterCheck" style={{ fontWeight: 700, color: '#5b21b6', fontSize: '13px', cursor: 'pointer' }}>
                  ➖ Abater Adiantamento Especial em aberto
                </label>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#7c3aed', fontWeight: 700 }}>
                  Saldo: {fmtMoeda(fr.saldoEspecialAberto)}
                </span>
              </div>
              {abaterEspecial && (
                <div style={{ marginTop: '6px' }}>
                  <label style={{ ...s.label, fontSize: '11px', color: '#5b21b6' }}>Valor a abater neste pagamento (R$)</label>
                  <input type="number" step="0.01" min="0.01"
                    max={fr.saldoEspecialAberto.toString()}
                    value={valorAbatimento}
                    placeholder={`máx. ${fmtMoeda(fr.saldoEspecialAberto)}`}
                    onChange={e => setValorAbatimento(e.target.value)}
                    style={{ ...s.input, fontSize: '12px', padding: '6px', borderColor: '#a78bfa' }} />
                  <div style={{ fontSize: '11px', color: '#6d28d9', marginTop: '4px' }}>
                    Saldo restante após abatimento: <strong>{fmtMoeda(Math.max(0, fr.saldoEspecialAberto - (parseFloat(valorAbatimento) || 0)))}</strong>
                  </div>
                  {/* Aviso quando o total dos itens não cobre o abatimento (saldo devedor) */}
                  {(() => {
                    const vlAbate = parseFloat(valorAbatimento) || 0;
                    const saldoDevedor = vlAbate - Math.max(0, totalSelecionado);
                    return saldoDevedor > 0 ? (
                      <div style={{ marginTop: '6px', padding: '6px 10px', background: '#fff3e0', borderRadius: '5px', fontSize: '11px', color: '#e65100', border: '1px solid #ffcc80' }}>
                        ⚠️ O abatimento de {fmtMoeda(vlAbate)} supera o líquido dos itens selecionados ({fmtMoeda(Math.max(0, totalSelecionado))}).
                        Isso registra uma <strong>dívida de {fmtMoeda(saldoDevedor)}</strong> a ser compensada em pagamentos futuros — o desembolso desta vez será R$ 0,00.
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#6d28d9' }}>
                i️ O desconto será lançado automaticamente como <strong>Desconto Adiantamento Especial</strong> nas Saídas.
              </div>
            </div>
          )}

          {/* Forma de pagamento */}
          <div style={{ marginBottom: '14px' }}>
            <label style={s.label}>💳 Forma de pagamento</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {(['PIX', 'Dinheiro', 'Misto'] as const).map(f => (
                <button key={f} onClick={() => setFormaFreelancer(f)}
                  style={{ flex: 1, padding: '8px 6px', border: `2px solid ${formaFreelancer === f ? '#c2185b' : '#e0e0e0'}`, borderRadius: '6px',
                    background: formaFreelancer === f ? '#fce4ec' : 'white', fontWeight: formaFreelancer === f ? 700 : 400,
                    cursor: 'pointer', fontSize: '12px', color: formaFreelancer === f ? '#880e4f' : '#555' }}>
                  {f === 'PIX' ? '📱 PIX' : f === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'}
                </button>
              ))}
            </div>
            {formaFreelancer === 'Misto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...s.label, fontSize: '11px' }}>Valor em PIX (R$)</label>
                  <input type="number" step="0.01" min="0" value={formaFreelancerPix} placeholder="0,00"
                    onChange={e => setFormaFreelancerPix(e.target.value)} style={{ ...s.input, fontSize: '12px', padding: '6px' }} />
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: '11px' }}>Valor em Dinheiro (R$)</label>
                  <input type="number" step="0.01" min="0" value={formaFreelancerDin} placeholder="0,00"
                    onChange={e => setFormaFreelancerDin(e.target.value)} style={{ ...s.input, fontSize: '12px', padding: '6px' }} />
                </div>
              </div>
            )}
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

          {/* Aviso saldo negativo: restaurante tem crédito */}
          {totalSelecionado < 0 && (
            <div style={{ backgroundColor: '#fff3e0', border: '1px solid #ff9800', borderRadius: '6px', padding: '10px 14px', marginBottom: '10px', fontSize: '12px', color: '#e65100' }}>
              ⚠️ <strong>Saldo negativo: R$ {fmtMoeda(Math.abs(totalSelecionado))}</strong> a favor do restaurante.<br/>
              Os descontos excedem o valor a pagar neste fechamento. Você pode:<br/>
              • Registrar o fechamento assim (saldo devedor fica pendente para o próximo período)<br/>
              • Desmarcar descontos que serão abatidos depois
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              disabled={salvando}
              onClick={async () => {
                setModalFreelancerPgto(null);
                setSalvando(true);
                try {
                  const creditoItems = checkItems.filter(it => it.checked && it.tipo === 'credito');
                  const debitoItems  = checkItems.filter(it => it.checked && it.tipo === 'debito');
                  const totalCredito = creditoItems.reduce((s, it) => s + it.valor, 0);
                  const totalDebito  = debitoItems.reduce((s, it) => s + it.valor, 0);
                  // Abatimento do adiantamento especial reduz o valor efetivamente pago
                  const vlAbate      = abaterEspecial ? (parseFloat(valorAbatimento) || 0) : 0;
                  // totalFinal usado na obs e para referência de conferência
                  const _totalFinal  = Math.max(0, totalCredito - totalDebito - vlAbate); void _totalFinal;

                  const inclTransporte = checkItems.find(it => it.key === 'transporte')?.checked ?? false;
                  const inclDobras     = checkItems.find(it => it.key === 'dobras')?.checked ?? false;
                  // Caixinha items checked (crédito)
                  const caixinhaChecked = checkItems
                    .filter(it => it.checked && it.key.startsWith('caix_'))
                    .reduce((s, it) => s + it.valor, 0);

                  // ─ NOVO MODELO: 1 POST por dia/turno selecionado (dobras) ──────────────────
                  // Monta array de dias a partir dos diasPagos pendentes (somente os de dobras)
                  // Resolver valor por turno respeitando acordo.tabela
                  const DOW_K_PAG = ['dom','seg','ter','qua','qui','sex','sab'];
                  const resolverValTurnoPag = (data: string, turno: 'Dia' | 'Noite'): number => {
                    if (fr.tipoAcordo === 'valor_turno' && fr.acordo?.tabela) {
                      const dow = new Date(data + 'T12:00:00').getDay();
                      const vals = (fr.acordo.tabela as any)[DOW_K_PAG[dow]] || {};
                      return turno === 'Dia' ? R(vals.D) : R(vals.N);
                    }
                    if (R(fr.valorDia) > 0 || R(fr.valorNoite) > 0) return turno === 'Dia' ? R(fr.valorDia) : R(fr.valorNoite);
                    return R(fr.valorDobra) || 120;
                  };

                  const diasParaPagar: {data: string; turno: string; valor: number; tipoCodigo: string}[] = [];
                  if (inclDobras && fr.diasPagos) {
                    for (const dp of fr.diasPagos) {
                      const turno = dp.turno || 'Dia';
                      // DiaNoite já vem expandido em registros separados Dia/Noite
                      // mas pode ainda vir agrupado — expandir
                      if (turno === 'DiaNoite' || turno === 'DN') {
                        diasParaPagar.push({ data: dp.data, turno: 'Dia',   valor: resolverValTurnoPag(dp.data, 'Dia'), tipoCodigo: 'freelancer-dia' });
                        diasParaPagar.push({ data: dp.data, turno: 'Noite', valor: resolverValTurnoPag(dp.data, 'Noite'), tipoCodigo: 'freelancer-noite' });
                      } else {
                        diasParaPagar.push({ data: dp.data, turno, valor: dp.valor, tipoCodigo: turno === 'Dia' ? 'freelancer-dia' : 'freelancer-noite' });
                      }
                    }
                  }

                  const obsLabel2 = fr.tipoAcordo === 'valor_turno'
                    ? `tabela variável (${diasParaPagar.map(d=>`${d.data.slice(8)}/${d.data.slice(5,7)}${d.turno==='Dia'?'D':'N'}=R$${fmt(d.valor)}`).join(', ')})`
                    : (fr.valorDia > 0 || fr.valorNoite > 0)
                      ? `D=R$${fmt(fr.valorDia)} N=R$${fmt(fr.valorNoite)}`
                      : `R$${fmt(fr.valorDobra)}/dobra`;

                  // Envia todos os turnos de uma vez (backend itera e salva 1 registro por turno)
                  // Transporte é enviado como lote separado (logo abaixo) com o mesmo pagamentoId

                  // ── Campos estruturados para auditoria do PIX (Opção B) ──────────────
                  // Calculados aqui e enviados no payload para evitar dependência do campo obs
                  const valorAbatEsp      = vlAbate;

                  // ── PAYSLIP: engine calcula tudo (mesma função que FreelancerPagamento usa) ──
                  const psResult2 = montarPayslipFreelancer({
                    checkItems: checkItems.map(it => ({...it, tipo: it.tipo as 'credito'|'debito'})),
                    abatimentoEspecial: valorAbatEsp,
                    isMotoboy: fr.isMotoboy === true,
                    ctrlLinhasDetalhe: fr.ctrlLinhasDetalhe,
                    diasPagos: fr.diasPagos,
                    caixinhaDetalhe: fr.caixinhaDetalhe,
                    saidasDetalhe: debitoItems.map((di: any) => ({ descricao: di.label || 'Desconto', valor: di.valor })),
                    transporteSaldo: fr.transporteSaldo || 0,
                    inclTransporte: inclTransporte,
                    diasTrabalhados: fr.diasTrabalhados || 0,
                  });
                  const valorBrutoLote = psResult2.bruto;
                  const valorDescSaidas = psResult2.descontos;
                  const valorLiquido = psResult2.liquido;

                  const obsText2 = `Freelancer sem. ${fech.semanaLabel} - ${fr.dobras} dobras - ${obsLabel2} - ${formaFreelancer}${fr.transporteAdiantado > 0 ? ` - Transp. adiant.: R$${fmt(fr.transporteAdiantado)}` : ''}${caixinhaChecked > 0 ? ` - Caixinha: +R$${fmt(caixinhaChecked)}` : ''}${totalDebito > 0 ? ` - Desc. saídas: R$${fmt(totalDebito)}` : ''}${vlAbate > 0 ? ` - Abat. adto.esp.: R$${fmt(vlAbate)}` : ''} - Líquido: R$${fmt(valorLiquido)}`;

                  /* ── P0.4: Montar operações para pagamento atômico ── */
                  const operacoes: any[] = [];

                  // 1) Turnos
                  for (const dp of diasParaPagar) {
                    operacoes.push({ tipo:'folha-turno', data:dp.data, turno:dp.turno, valor:dp.valor, tipoCodigo:dp.tipoCodigo, obs:obsText2 });
                  }

                  // 2) Transporte
                  if (inclTransporte && fr.transporteSaldo > 0) {
                    operacoes.push({ tipo:'folha-transporte', data:fech.dataFechamento, valor:fr.transporteSaldo, obs:`Transporte sem. ${fech.semanaLabel} - ${fr.diasPagos?.length||0} dias - R$${fmt(fr.transporteSaldo)}` });
                  }

                  // 3) Desconto Transporte por dia
                  const valorTransporteColab = R(fr.valorTransporte);
                  if (valorTransporteColab > 0 && inclDobras && fr.diasPagos && fr.diasPagos.length > 0) {
                    const diasUnicosSemana = Array.from(new Set(fr.diasPagos.map((dp: any) => dp.data))).sort() as string[];
                    let saldoDispAtual = R(fr.transporteAdiantado);
                    for (const data of diasUnicosSemana) {
                      const excede = saldoDispAtual < valorTransporteColab;
                      operacoes.push({ tipo:'saida-criar', tipoSaida:'Desconto Transporte', descricao:`Transporte do dia ${data} (consumo do adto.)`, valor:valorTransporteColab, data, dataPagamento:data, pago:true, excedeAdto:excede, responsavel:responsavelEmail, responsavelId, obs:`Auto-gerado ao confirmar pagamento sem. ${fech.semanaLabel}${excede?' [excede adto]':''}` });
                      saldoDispAtual = Math.max(0, saldoDispAtual - valorTransporteColab);
                    }
                  }

                  // 4) Abatimento especial — busca TODO histórico para encontrar contrato correto
                  if (abaterEspecial && vlAbate > 0) {
                    let adtoIdAlvo2: string | undefined;
                    try {
                      const rHistFr = await fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&colaboradorId=${fr.id}`, {headers:{Authorization:`Bearer ${token()}`}});
                      if (rHistFr.ok) {
                        const todasSaidasFr = await rHistFr.json();
                        adtoIdAlvo2 = encontrarAdiantamentoIdAlvo(
                          (Array.isArray(todasSaidasFr)?todasSaidasFr:[]).map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
                          fr.id,
                        );
                      }
                    } catch { /* fallback abaixo */ }
                    if (!adtoIdAlvo2) {
                      const fonteSaidas3 = saidasMesCompleto.length > 0 ? saidasMesCompleto : saidasPeriodo;
                      adtoIdAlvo2 = encontrarAdiantamentoIdAlvo(
                        fonteSaidas3.map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
                        fr.id,
                      );
                    }
                    operacoes.push({ tipo:'saida-criar', tipoSaida:'Desconto Adiantamento Especial', descricao:`Abatimento adto. especial - pgto sem. ${fech.semanaLabel}`, valor:vlAbate, data:dataLocalFreelancer, dataPagamento:dataLocalFreelancer, pago:true, responsavel:responsavelEmail, responsavelId, obs:`Abatido no pagamento da semana ${fech.semanaLabel}`, adiantamentoId: adtoIdAlvo2 || undefined });
                  }

                  // 5) Payslip com composição (vem do engine — mesma função que FreelancerPagamento)
                  const semLabel2 = fech.semanaLabel || mesAno;
                  const periodoKey2 = `${mesAno}-${semLabel2.replace(/[^\w]/g,'')}`;
                  operacoes.push({
                    tipo:'payslip', periodo:periodoKey2,
                    periodoInicio:periodoIni||mesAno+'-01', periodoFim:periodoFim||mesAno+'-31',
                    bruto:valorBrutoLote, transporte:psResult2.transporte,
                    descontos:valorDescSaidas, liquido:valorLiquido,
                    nomeColaborador:fr.nome,
                    tipoContrato: 'Freelancer',
                    composicao: psResult2.composicao,
                  });

                  // ── Enviar tudo de uma vez (atômico) ──
                  const resp = await fetchAuth(`${apiUrl}/pagamento-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                    body: JSON.stringify({
                      colaboradorId: fr.id, unitId, mes: mesAno, semana: fech.dataFechamento,
                      dataPagamento: dataLocalFreelancer, formaPagamento: formaFreelancer,
                      ...auditoriaCampos(),
                      valorBruto: valorBrutoLote, valorDescSaidas, valorAbatEsp, valorLiquido,
                      obs: obsText2,
                      operacoes,
                    }),
                  });
                  if (!resp.ok) {
                    const errData = await resp.json().catch(()=>null);
                    throw new Error(errData?.message || `HTTP ${resp.status}`);
                  }

                  await carregarDados();
                } catch (err) { alert('Erro ao salvar pagamento: ' + err); }
                finally { setSalvando(false); }
              }}
              style={{ ...s.btn('#43a047'), flex: 1 }}>
              {salvando ? '⏳ Salvando...' : `✅ Confirmar ${fmtMoeda(totalADesembolsarFreelancer)}`}
            </button>
            <button onClick={() => setModalFreelancerPgto(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  })();

  /* ── Modal detalhe Freelancer ────────────────────────────── */
  /* Classificação contábil das saídas em 3 contas separadas:
     - SEMANA: A receber, Consumo Interno, Caixinha, A pagar (crédito avulso). Compensa com dobras da semana.
     - TRANSPORTE: Adiantamento Transporte vs. transporte gerado pelos dias trabalhados. Não impacta semana.
     - ESPECIAL: Adiantamento Especial (saldo aberto), Desconto Adto Especial (parcelas). Não impacta semana.
  */
  const CONTA_TRANSPORTE_TIPOS = new Set(['Adiantamento Transporte', 'Desconto Transporte']);
  const CONTA_ESPECIAL_TIPOS   = new Set(['Adiantamento Especial', 'Desconto Adiantamento Especial']);
  const tipoSaida = (s: any) => (s.tipo || s.origem || s.referencia || '').trim();
  const contaDaSaida = (s: any): 'transporte' | 'especial' | 'semana' => {
    const t = tipoSaida(s);
    if (CONTA_TRANSPORTE_TIPOS.has(t)) return 'transporte';
    if (CONTA_ESPECIAL_TIPOS.has(t))   return 'especial';
    return 'semana';
  };
  // Débito (-) ou Crédito (+) do ponto de vista do colaborador
  const TIPOS_DEBITO_FR = new Set(['A receber', 'Consumo Interno', 'Desconto', 'Desconto Transporte', 'Desconto Adiantamento Especial', 'Sangria']);
  const sinalDaSaida = (s: any): 'debito' | 'credito' => TIPOS_DEBITO_FR.has(tipoSaida(s)) ? 'debito' : 'credito';

  const ModalDetalheFreelancer = ({ data, onClose }: { data: { fr: any; semana: string; escalas: any[]; saidaItems?: any[] }; onClose: () => void }) => {
    const { fr, semana, escalas: escs, saidaItems } = data;
    const vDia   = R(fr.valorDia)   || 0;
    const vNoite = R(fr.valorNoite) || 0;
    const usaTurno = vDia > 0 || vNoite > 0;
    const valorDobra = usaTurno ? (vDia + vNoite) : (R(fr.valorDobra) || R(fr.valorDia) || 120);
    const DIAS_ABR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const DOW_KEY_DET = ['dom','seg','ter','qua','qui','sex','sab'];
    // Set de dias já pagos (do objeto fr calculado)
    const diasPagosSet = new Set((fr.diasJaPagosDetalhe || []).map((d: any) => d.data));
    // Filtrar apenas escalas com presença confirmada (total ou parcial) OU já pagas
    const escsVisiveis = escs.filter(e =>
      statusPresencaEscala(e) === 'presente' ||
      statusPresencaEscala(e) === 'presente_parcial' ||
      diasPagosSet.has(e.data)
    );
    const linhas = escsVisiveis.map(e => {
      const status = statusPresencaEscala(e);
      // Para DiaNoite parcial: usar apenas o turno efetivamente presente
      const efetivaTurno = (e.turno === 'DiaNoite' && status === 'presente_parcial')
        ? (e.presenca === 'presente' ? 'Dia' : 'Noite')
        : e.turno;
      const dow = new Date(e.data + 'T12:00:00').getDay();
      const turnoLabel = efetivaTurno === 'DiaNoite' ? 'DN (D+N)' : efetivaTurno === 'Dia' ? 'Dia' : efetivaTurno === 'Noite' ? 'Noite' : efetivaTurno;
      const dobras = efetivaTurno === 'DiaNoite' ? 1 : (efetivaTurno === 'Dia' || efetivaTurno === 'Noite') ? 0.5 : 0;
      let valor = 0;
      // valor_turno: busca valor exato da tabela por dia da semana
      if (fr.tipoAcordo === 'valor_turno' && fr.acordo?.tabela) {
        const diaKey = DOW_KEY_DET[dow];
        const vals = fr.acordo.tabela[diaKey] || {};
        if (efetivaTurno === 'DiaNoite') valor = R(vals.DN) || (R(vals.D) + R(vals.N));
        else if (efetivaTurno === 'Dia')   valor = R(vals.D);
        else if (efetivaTurno === 'Noite') valor = R(vals.N);
      } else if (usaTurno) {
        if (efetivaTurno === 'DiaNoite') valor = vDia + vNoite;
        else if (efetivaTurno === 'Dia')   valor = vDia;
        else if (efetivaTurno === 'Noite') valor = vNoite;
      } else {
        valor = dobras * valorDobra;
      }
      const jaPago = diasPagosSet.has(e.data);
      return { data: e.data, dia: DIAS_ABR[dow], turno: turnoLabel, dobras, valor, jaPago };
    }).filter(l => l.dobras > 0)
      .sort((a, b) => a.data.localeCompare(b.data)); // ordenar por data
    const totalDobras = linhas.reduce((s, l) => s + l.dobras, 0);
    const totalValor  = linhas.reduce((s, l) => s + l.valor,  0);
    const totalPago   = linhas.filter(l =>  l.jaPago).reduce((s, l) => s + l.valor, 0);
    const totalPendente = totalValor - totalPago;

    /* ── CONTAS SEPARADAS ────────────────────────────────────
       Cada saída da semana cai em UMA das 3 contas. Nada é "misturado". */
    const todasSaidas = (saidaItems || []);
    const saidasSemanaAcc = todasSaidas.filter(s => contaDaSaida(s) === 'semana');
    const saidasEspecialAcc = todasSaidas.filter(s => contaDaSaida(s) === 'especial');

    // Conta SEMANA: dobras pendentes − débitos da semana + créditos avulsos da semana
    const debitosSemana  = saidasSemanaAcc.filter(s => sinalDaSaida(s) === 'debito').reduce((sum, s) => sum + R(s.valor), 0);
    const creditosSemana = saidasSemanaAcc.filter(s => sinalDaSaida(s) === 'credito').reduce((sum, s) => sum + R(s.valor), 0);
    const saldoSemana = parseFloat((totalPendente + creditosSemana - debitosSemana).toFixed(2));

    // Conta TRANSPORTE: dias trabalhados pendentes × valorTransporte vs. adiantamento disponível
    // Reusa os campos já calculados em fr (cobre todo o mês, inclusive semanas anteriores)
    const linhasPendentes = linhas.filter(l => !l.jaPago);
    const transporteGeradoSemana = parseFloat((R(fr.valorTransporte) * linhasPendentes.length).toFixed(2));
    const transporteAdiantadoMes = R(fr.transporteAdiantadoMes);
    const transporteJaConsumido  = R(fr.transporteSemanasAnteriores);
    const transporteAdiantadoDisponivel = parseFloat(Math.max(0, transporteAdiantadoMes - transporteJaConsumido).toFixed(2));
    // Saldo de transporte após a semana: positivo = colab a receber, negativo = empresa pagou a mais
    const transporteAposSemana = parseFloat((transporteGeradoSemana - transporteAdiantadoDisponivel).toFixed(2));
    const saldoTransporte = transporteAposSemana > 0 ? transporteAposSemana : 0; // só paga se positivo
    const sobraAdtoTransporte = transporteAposSemana < 0 ? Math.abs(transporteAposSemana) : 0;

    // Conta ESPECIAL: saldo em aberto + débitos lançados na semana (parcelas)
    const especialDebitos = saidasEspecialAcc.filter(s => sinalDaSaida(s) === 'debito').reduce((sum, s) => sum + R(s.valor), 0);
    const especialCreditos = saidasEspecialAcc.filter(s => sinalDaSaida(s) === 'credito').reduce((sum, s) => sum + R(s.valor), 0);
    const saldoEspecialAberto = R(fr.saldoEspecialAberto);

    // TOTAL A PAGAR = saldo da semana + saldo de transporte (positivo)
    const totalAPagar = parseFloat((saldoSemana + saldoTransporte).toFixed(2));
    const semanaNegativa = saldoSemana < 0;

    // Helpers de UI
    const Card = ({ titulo, cor, fundo, children }: { titulo: string; cor: string; fundo: string; children: any }) => (
      <div style={{ flex: 1, minWidth: '200px', backgroundColor: fundo, borderRadius: '8px', padding: '10px 12px', borderLeft: `4px solid ${cor}` }}>
        <div style={{ fontSize: '11px', color: cor, fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{titulo}</div>
        <div style={{ fontSize: '12px', color: '#333', lineHeight: '1.6' }}>{children}</div>
      </div>
    );
    const Linha = ({ label, valor, sinal, destaque }: { label: string; valor: number; sinal?: '+' | '-' | ''; destaque?: boolean }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: destaque ? 'bold' : 'normal', borderTop: destaque ? '1px solid #ccc' : 'none', paddingTop: destaque ? '4px' : '0', marginTop: destaque ? '4px' : '0' }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'monospace' }}>{sinal === '-' ? '−' : sinal === '+' ? '+' : ''}{fmtMoeda(valor)}</span>
      </div>
    );

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
        <div style={{ ...s.card, maxWidth: '780px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#c2185b' }}>🎯 Detalhamento Freelancer</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
            <strong>{fr.nome}</strong> · Semana {semana}
            {fr.tipoAcordo === 'valor_turno'
              ? <> · 📅 Tabela por dia da semana</>
              : usaTurno
              ? <> · ☀️ R$ {fmt(vDia)}/dia · 🌙 R$ {fmt(vNoite)}/noite</>
              : <> · R$ {fmt(valorDobra)}/dobra</>}
            {R(fr.valorTransporte) > 0 && <> · 🚗 R$ {fmt(R(fr.valorTransporte))}/dia trab.</>}
          </div>

          {/* === 3 CONTAS SEPARADAS === */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <Card titulo="💼 Conta da Semana" cor="#1565c0" fundo="#e3f2fd">
              <Linha label="Dobras pendentes" valor={totalPendente} sinal="+" />
              {creditosSemana > 0 && <Linha label="Créditos avulsos" valor={creditosSemana} sinal="+" />}
              {debitosSemana > 0 && <Linha label="Descontos" valor={debitosSemana} sinal="-" />}
              <Linha label={semanaNegativa ? '⚠️ Saldo (devedor)' : 'Saldo da semana'} valor={Math.abs(saldoSemana)} sinal={semanaNegativa ? '-' : '+'} destaque />
            </Card>
            <Card titulo="🚗 Conta Transporte" cor="#388e3c" fundo="#e8f5e9">
              {transporteAdiantadoMes > 0 && <Linha label="Adto. transporte (mês)" valor={transporteAdiantadoMes} sinal="+" />}
              {transporteJaConsumido > 0 && <Linha label="Já consumido (sem. anter.)" valor={transporteJaConsumido} sinal="-" />}
              <Linha label={`Transp. desta sem. (${linhasPendentes.length} dias)`} valor={transporteGeradoSemana} sinal="-" />
              <Linha label={saldoTransporte > 0 ? '💡 A pagar nesta sem.' : sobraAdtoTransporte > 0 ? '✅ Sobra de adto.' : 'Saldo'} valor={Math.max(saldoTransporte, sobraAdtoTransporte)} sinal={saldoTransporte > 0 ? '+' : ''} destaque />
            </Card>
            <Card titulo="💰 Adto. Especial" cor="#7b1fa2" fundo="#f3e5f5">
              <Linha label="Saldo aberto (acumul.)" valor={saldoEspecialAberto} sinal={saldoEspecialAberto > 0 ? '-' : ''} />
              {especialCreditos > 0 && <Linha label="Novo adto. nesta sem." valor={especialCreditos} sinal="+" />}
              {especialDebitos > 0 && <Linha label="Parcela abatida" valor={especialDebitos} sinal="+" />}
              <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '4px' }}>ℹ️ Conta separada — não entra no total da semana</div>
            </Card>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#c2185b', color: 'white' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
                <th style={{ padding: '6px 8px' }}>Dia</th>
                <th style={{ padding: '6px 8px' }}>Turno</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Dobras</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} style={{ backgroundColor: l.jaPago ? '#f1f8e9' : (i % 2 === 0 ? '#fafafa' : 'white'), borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: l.jaPago ? '#888' : '#333' }}>{l.data}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: l.jaPago ? '#aaa' : '#555' }}>{l.dia}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                      backgroundColor: l.dobras === 1 ? '#e8f5e9' : '#fff9c4',
                      color: l.dobras === 1 ? '#2e7d32' : '#f57f17' }}>
                      {l.turno}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: l.jaPago ? '#aaa' : '#333' }}>{l.dobras}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: l.jaPago ? '#aaa' : '#1976d2', fontWeight: 'bold',
                    textDecoration: l.jaPago ? 'line-through' : 'none' }}>{fmtMoeda(l.valor)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {l.jaPago
                      ? <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }}>✅ Pago</span>
                      : <span style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }}>⏳ Pendente</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#880e4f', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '8px' }}>SUBTOTAL DOBRAS</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{totalDobras}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f48fb1' }}>{fmtMoeda(totalValor)}</td>
                <td />
              </tr>
              {totalPago > 0 && (
                <tr style={{ backgroundColor: '#388e3c', color: 'white' }}>
                  <td colSpan={4} style={{ padding: '6px 8px' }}>✅ Já pago em pagamento(s) anterior(es)</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c8e6c9' }}>-{fmtMoeda(totalPago)}</td>
                  <td />
                </tr>
              )}
              <tr style={{ backgroundColor: semanaNegativa ? '#c62828' : '#0d47a1', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                <td colSpan={4} style={{ padding: '8px' }}>
                  {semanaNegativa
                    ? '⚠️ COLAB. EM DÉBITO (saldo a abater)'
                    : `TOTAL A PAGAR ${totalPago > 0 || saldoTransporte > 0 ? '(saldo final)' : ''}`}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: semanaNegativa ? '#ffcdd2' : '#a5d6a7' }}>
                  {semanaNegativa ? '−' : ''}{fmtMoeda(Math.abs(totalAPagar))}
                </td>
                <td />
              </tr>
              {semanaNegativa && (
                <tr style={{ backgroundColor: '#fff3e0', color: '#e65100', fontSize: '11px', fontStyle: 'italic' }}>
                  <td colSpan={6} style={{ padding: '6px 8px' }}>
                    💡 Débitos da semana superam as dobras. Por padrão vira <strong>pendênte</strong> para a próxima semana — você pode editar o status caso a caso.
                  </td>
                </tr>
              )}
            </tfoot>
          </table>

          {/* Saídas lançadas para o colaborador na semana — com edição/exclusão inline */}
          {todasSaidas.length > 0 && (
            <div style={{ marginTop: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
              <strong style={{ color: '#e65100' }}>📋 Saídas da Semana ({todasSaidas.length}):</strong>
              <table style={{ width: '100%', marginTop: '6px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e65100', color: 'white' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Conta</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Data</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {todasSaidas.map((s2: any, idx: number) => {
                    const conta = contaDaSaida(s2);
                    const sinal = sinalDaSaida(s2);
                    const tipo  = tipoSaida(s2);
                    const contaCfg = conta === 'transporte' ? { lbl: '🚗 Transp.',  bg: '#e8f5e9', fg: '#2e7d32' }
                                  : conta === 'especial'   ? { lbl: '💰 Especial', bg: '#f3e5f5', fg: '#7b1fa2' }
                                  :                          { lbl: '💼 Semana',   bg: '#e3f2fd', fg: '#1565c0' };
                    return (
                      <tr key={s2.id || idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff8f0' : 'white', borderBottom: '1px solid #ffe0b2' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: contaCfg.bg, color: contaCfg.fg }}>{contaCfg.lbl}</span>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: sinal === 'debito' ? '#ffebee' : '#fff3e0',
                            color: sinal === 'debito' ? '#c62828' : '#e65100' }}>
                            {tipo}
                          </span>
                        </td>
                        <td style={{ padding: '4px 6px', color: '#555' }}>{s2.descricao || '-'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 'bold',
                          color: sinal === 'debito' ? '#c62828' : '#2e7d32' }}>
                          {sinal === 'debito' ? '−' : '+'}{fmtMoeda(R(s2.valor))}
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>{s2.dataPagamento || s2.data || '-'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              onClick={() => setSaidaInlineEdit({ ...s2, _conta: conta })}
                              style={{ ...s.btn('#f57c00'), padding: '2px 6px', fontSize: '10px' }}
                              title="Editar (mudar tipo, valor, status)">✏️</button>
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Excluir lançamento "${tipo} — ${s2.descricao || ''}" no valor de ${fmtMoeda(R(s2.valor))}?\n\nEssa ação não pode ser desfeita.`)) return;
                                try {
                                  const res = await fetchAuth(`${apiUrl}/saidas/${s2.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
                                  if (res.ok) { alert('✅ Lançamento excluído.'); onClose(); carregarDados(); }
                                  else { alert('Erro ao excluir.'); }
                                } catch { alert('Erro de rede ao excluir.'); }
                              }}
                              style={{ ...s.btn('#c62828'), padding: '2px 6px', fontSize: '10px' }}
                              title="Excluir lançamento">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '6px', fontSize: '10px', color: '#5d4037', fontStyle: 'italic' }}>
                💡 <strong>Conta</strong>: indica em qual saldo o lançamento entra. Transporte e Adto. Especial têm saldos próprios e não impactam o total da semana.
              </div>
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
                      <td style={{ padding: '4px 6px', color: '#555' }}>{p.descricao || '-'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>
                        -{fmtMoeda(R(p.valor))}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>
                        {p.dataPagamento || p.data || '-'}
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

  /* ── Mini-modal: edição inline de Saída (a partir do Detalhamento) ── */
  const ModalSaidaInline = () => {
    if (!saidaInlineEdit) return null;
    const TIPOS_TODOS = [
      // Créditos (pago AO colaborador)
      'A pagar', 'Adiantamento Salário', 'Adiantamento Transporte', 'Adiantamento Especial', 'Caixinha',
      // Débitos (descontado DO colaborador)
      'A receber', 'Consumo Interno', 'Desconto', 'Desconto Transporte', 'Desconto Adiantamento Especial', 'Sangria',
    ];
    const isDebito = TIPOS_DEBITO_FR.has(saidaInlineEdit.tipo);
    const conta = contaDaSaida(saidaInlineEdit);
    const handleSave = async () => {
      try {
        const payload = {
          ...saidaInlineEdit,
          tipo:       saidaInlineEdit.tipo,
          origem:     saidaInlineEdit.tipo,
          referencia: saidaInlineEdit.tipo,
          valor:      parseFloat(String(saidaInlineEdit.valor)) || 0,
          descricao:  saidaInlineEdit.descricao || '',
          dataPagamento: saidaInlineEdit.dataPagamento || saidaInlineEdit.data,
        };
        const res = await fetchAuth(`${apiUrl}/saidas/${saidaInlineEdit.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          alert('✅ Lançamento atualizado.');
          setSaidaInlineEdit(null);
          setDetalheFreelancer(null); // fecha o detalhe para forçar reabertura com dados frescos
          carregarDados();
        } else {
          const err = await res.json().catch(() => ({}));
          alert('Erro ao atualizar: ' + (err.error || res.status));
        }
      } catch { alert('Erro de rede ao atualizar.'); }
    };
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setSaidaInlineEdit(null)}>
        <div style={{ ...s.card, maxWidth: '460px', width: '94%' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#f57c00' }}>✏️ Editar Lançamento</h3>
            <button onClick={() => setSaidaInlineEdit(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={s.label}>Categoria / Tipo *</label>
              <select
                value={saidaInlineEdit.tipo}
                onChange={e => setSaidaInlineEdit({ ...saidaInlineEdit, tipo: e.target.value })}
                style={s.select}>
                <optgroup label="➕ Crédito (pago AO colaborador)">
                  {TIPOS_TODOS.filter(t => !TIPOS_DEBITO_FR.has(t)).map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
                <optgroup label="➖ Débito (desconto DO colaborador)">
                  {TIPOS_TODOS.filter(t => TIPOS_DEBITO_FR.has(t)).map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
              <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 'bold',
                color: isDebito ? '#c62828' : '#2e7d32' }}>
                {isDebito ? '➖ Débito — será descontado do colaborador' : '➕ Crédito — será pago ao colaborador'}
                <span style={{ marginLeft: '8px', color: '#666', fontWeight: 'normal' }}>
                  · Conta: {conta === 'transporte' ? '🚗 Transporte' : conta === 'especial' ? '💰 Adto. Especial' : '💼 Semana'}
                </span>
              </div>
            </div>

            <div>
              <label style={s.label}>Descrição</label>
              <input type="text" value={saidaInlineEdit.descricao || ''}
                onChange={e => setSaidaInlineEdit({ ...saidaInlineEdit, descricao: e.target.value })}
                style={s.input} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={s.label}>Valor (R$) *</label>
                <input type="number" step="0.01" min="0" value={saidaInlineEdit.valor}
                  onChange={e => setSaidaInlineEdit({ ...saidaInlineEdit, valor: e.target.value })}
                  style={s.input} />
              </div>
              <div>
                <label style={s.label}>Data</label>
                <input type="date" value={saidaInlineEdit.dataPagamento || saidaInlineEdit.data || ''}
                  onChange={e => setSaidaInlineEdit({ ...saidaInlineEdit, dataPagamento: e.target.value, data: e.target.value })}
                  style={s.input} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setSaidaInlineEdit(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
            <button onClick={handleSave} style={s.btn('#43a047')}>💾 Salvar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Modal Confirmar Pagamento CLT (com data editável) ── */
  // Hook called unconditionally (React rules) - state persists across renders
  /* ── Estado do modal de pagamento CLT — checklist igual ao Freelancer ── */
  interface CheckItemCLT { key: string; label: string; valor: number; tipo: 'credito'|'debito'|'info'; checked: boolean; }
  const [checkItemsCLT, setCheckItemsCLT] = useState<CheckItemCLT[]>([]);
  const [modalPgtoTipo, setModalPgtoTipo] = useState<'Adiantamento' | 'Variável'>('Adiantamento');
  interface LinhaPgto { id: string; data: string; forma: 'PIX' | 'Dinheiro' | 'Misto'; valor: string; valorPix: string; valorDinheiro: string; obs: string; }
  const novaPgtoLinha = (): LinhaPgto => ({ id: Date.now().toString(), data: new Date().toISOString().split('T')[0], forma: 'PIX', valor: '', valorPix: '', valorDinheiro: '', obs: '' });
  const [pgtoLinhas, setPgtoLinhas] = useState<LinhaPgto[]>([novaPgtoLinha()]);
  // Abatimento de adiantamento especial no pagamento CLT
  const [abaterEspecialCLT, setAbaterEspecialCLT] = useState(false);
  const [valorAbatimentoCLT, setValorAbatimentoCLT] = useState('');
  // overrides e descontosIncluidos removidos — modal CLT agora usa checklist igual ao Freelancer

  // Monta checklist CLT ao abrir o modal (busca saídas frescas)
  useEffect(() => {
    if (!modalPagamento) return;
    setCheckItemsCLT([]);
    const f = modalPagamento;

    const buildChecklistCLT = (saidasFrescas: any[], tipo: 'Adiantamento' | 'Variável') => {
      const saidasCol = saidasFrescas
        .filter((s: any) => s.colaboradorId === f.colaboradorId)
        .map((s: any) => ({ tipo: s.tipo || s.origem || '', descricao: s.descricao || '', valor: R(s.valor), data: s.data || '', pagamentoIdLigado: s.pagamentoIdLigado }));

      const items = montarChecklistCLT({
        calc: f,
        tipoPagamento: tipo,
        variavelAte19: f.variavelAte19 || 0,
        variavelDe20a31: f.variavelDe20a31 || 0,
        saidasColaborador: saidasCol,
      });
      setCheckItemsCLT(items);
    };

    const tipo = modalPgtoTipo;
    fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${mesAno}-01&dataFim=${mesAno}-31`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then((fresh: any[]) => {
        setSaidasPeriodo(Array.isArray(fresh) ? fresh : []);
        buildChecklistCLT(Array.isArray(fresh) ? fresh : [], tipo);
      })
      .catch(() => buildChecklistCLT(saidasPeriodoRef.current, tipo));
  }, [modalPagamento, modalPgtoTipo]);

  useEffect(() => {
    if (modalPagamento) {
      // Abrir no tipo correto: se Dia 20 já pago, ir direto pro Dia 5
      const tipoInicial = modalPagamento.pagoAdiantamento ? 'Variável' : 'Adiantamento';
      setModalPgtoTipo(tipoInicial as 'Adiantamento' | 'Variável');
      setPgtoLinhas([novaPgtoLinha()]);
      // Abatimento especial CLT: checkbox desligado por padrão, usuário liga se quiser
      const saldoEsp = modalPagamento.saldoEspecialAberto || 0;
      setAbaterEspecialCLT(false);
      setValorAbatimentoCLT(saldoEsp > 0 ? saldoEsp.toString() : '');
    }
  }, [modalPagamento]);

  const toggleItemCLT = (key: string) =>
    setCheckItemsCLT(prev => prev.map(it =>
      it.key === key && it.tipo !== 'info' ? { ...it, checked: !it.checked } : it
    ));

  const salvarPagamentoModal = async () => {
    if (!modalPagamento) return;
    const hoje2 = new Date().toISOString().split('T')[0];
    const registros: PagamentoRegistrado[] = pgtoLinhas
      .filter(l => parseFloat(l.valor) > 0)
      .map(l => ({
        id: l.id,
        data: l.data || hoje2,
        valor: parseFloat(l.valor),
        forma: l.forma,
        valorPix: l.forma === 'Misto' ? parseFloat(l.valorPix) || 0 : undefined,
        valorDinheiro: l.forma === 'Misto' ? parseFloat(l.valorDinheiro) || 0 : undefined,
        tipo: modalPgtoTipo,
        obs: l.obs || undefined,
      }));
    if (registros.length === 0) { alert('Adicione ao menos um pagamento com valor.'); return; }
    const dataPrimeiro = registros[0].data;
    setSalvando(true);
    try {
      const existingLogs = modalPagamento.logPagamentos || [];
      // Proteção contra duplicação: verificar se registro já existe (mesma data+valor+tipo)
      const existingKeys = new Set(existingLogs.map((l: any) => `${l.data}__${l.valor}__${l.tipo}`));
      const novos = registros.filter(r => !existingKeys.has(`${r.data}__${r.valor}__${r.tipo}`));
      if (novos.length === 0) { alert('Esses lançamentos já foram registrados.'); setSalvando(false); return; }
      const newLogs = [...existingLogs, ...novos];
      const isPagoAdto = modalPgtoTipo === 'Adiantamento' ? true : (modalPagamento.pagoAdiantamento);
      const isPagoVar = modalPgtoTipo === 'Variável' ? true : (modalPagamento.pagoVariavel);
      const payload = {
        colaboradorId: modalPagamento.colaboradorId,
        mes: mesAno, unitId,
        pago: isPagoAdto,
        dataPagamento: isPagoAdto ? dataPrimeiro : modalPagamento.dataPagamento,
        pagoAdiantamento: isPagoAdto,
        dataPgtoAdiantamento: isPagoAdto ? dataPrimeiro : modalPagamento.dataPgtoAdiantamento,
        pagoVariavel: isPagoVar,
        dataPgtoVariavel: isPagoVar ? dataPrimeiro : modalPagamento.dataPgtoVariavel,
        saldoFinal: modalPagamento.saldoFinal,
        logPagamentos: newLogs,
        // Campos calculados para integridade do extrato
        inssValor: modalPagamento.inss || undefined,
        contrAssist: modalPagamento.contrAssistencial || undefined,
        feriadoContabil: modalPagamento.feriadosValor || undefined,
        salContrInss: modalPagamento.salContrInss || undefined,
        valorBruto: modalPagamento.salarioBase || undefined,
      };
      const resp = await fetchAuth(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!resp?.ok) {
        const errText = await resp?.text().catch(() => 'sem detalhe');
        throw new Error(`Servidor retornou ${resp?.status}: ${errText}`);
      }
      // Abatimento de adiantamento especial: cria saída de desconto
      const vlAbateCLT = abaterEspecialCLT ? (parseFloat(valorAbatimentoCLT) || 0) : 0;
      if (vlAbateCLT > 0) {
        const hoje3 = new Date().toISOString().split('T')[0];
        // Buscar todo histórico para encontrar contrato correto
        let adtoIdCLT: string | undefined;
        try {
          const rHistCLT = await fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&colaboradorId=${modalPagamento.colaboradorId}`, {headers:{Authorization:`Bearer ${token()}`}});
          if (rHistCLT.ok) {
            const todasCLT = await rHistCLT.json();
            adtoIdCLT = encontrarAdiantamentoIdAlvo(
              (Array.isArray(todasCLT)?todasCLT:[]).map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
              modalPagamento.colaboradorId,
            );
          }
        } catch { /* fallback */ }
        if (!adtoIdCLT) {
          adtoIdCLT = encontrarAdiantamentoIdAlvo(
            saidasMesCompleto.map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
            modalPagamento.colaboradorId,
          );
        }
        try {
          await fetchAuth(`${apiUrl}/saidas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({
              unitId,
              colaboradorId: modalPagamento.colaboradorId,
              tipo: 'Desconto Adiantamento Especial',
              descricao: `Abatimento adto. especial - folha CLT ${mesAno}`,
              valor: vlAbateCLT,
              data: hoje3,
              dataPagamento: hoje3,
              pago: true,
              responsavel: localStorage.getItem('user_email') || '',
              obs: `Abatido no pagamento ${modalPgtoTipo} da folha CLT ${mesAno}`,
              adiantamentoId: adtoIdCLT || undefined,
            }),
          });
        } catch (e) { console.error('Erro ao registrar abatimento especial:', e); }
      }
      // ── Fase 3: Gerar Payslip CLT (via engine) ──
      try {
        const mp = modalPagamento;
        const tipoPs = modalPgtoTipo === 'Adiantamento' ? 'adiantamento' : 'variavel';

        // Montar saídas operacionais do colaborador
        const saidasColPs = saidasMesCompleto
          .filter((s: any) => s.colaboradorId === mp.colaboradorId)
          .map((s: any) => ({ tipo: s.tipo || s.origem || '', descricao: s.descricao || '', valor: parseFloat(s.valor) || 0, data: s.data, id: s.id, pagamentoIdLigado: s.pagamentoIdLigado }));

        const psResultCLT = montarPayslipCLT({
          checkItems: checkItemsCLT.map(it => ({ key: it.key, label: it.label, valor: it.valor, tipo: it.tipo as 'credito'|'debito'|'info', checked: it.checked })),
          abatimentoEspecial: vlAbateCLT,
          tipoPagamento: tipoPs as 'adiantamento' | 'variavel',
          rubricas: mp.rubricas,
          conferido: mp.conferido,
          salarioBase: mp.salarioBase || 0,
          periculosidade: mp.periculosidade || 0,
          feriadosValor: mp.feriadosValor || 0,
          inss: mp.inss || 0,
          contrAssistencial: mp.contrAssistencial || 0,
          valeTransporte: mp.valeTransporte || 0,
          variavelAte19: mp.variavelAte19 || 0,
          variavelDe20a31: mp.variavelDe20a31 || 0,
          saidasOperacionais: saidasColPs,
          logPagamentos: newLogs.map((l: any) => ({ data: l.data, valor: l.valor, forma: l.forma, tipo: l.tipo, obs: l.obs })),
          mes: mesAno,
          nome: mp.nome,
          cargo: mp.cargo,
          cpf: mp.cpf,
          chavePix: mp.chavePix,
        });

        const rubricasPs = mp.rubricas || [];
        const psOps = [{
          tipo: 'payslip' as const,
          periodo: `${mesAno}-clt-${tipoPs}`,
          periodoInicio: `${mesAno}-01`,
          periodoFim: `${mesAno}-${new Date(parseInt(mesAno.split('-')[0]), parseInt(mesAno.split('-')[1]), 0).getDate()}`,
          bruto: psResultCLT.bruto,
          transporte: psResultCLT.transporte,
          descontos: psResultCLT.descontos,
          adiantamentos: 0,
          liquido: psResultCLT.liquido,
          nomeColaborador: mp.nome,
          tipoContrato: 'CLT',
          cargo: mp.cargo || '',
          cpf: mp.cpf || '',
          chavePix: mp.chavePix || '',
          tipoPagamento: tipoPs,
          conferido: mp.conferido || false,
          composicao: psResultCLT.composicao,
          ...(rubricasPs.length > 0 ? { rubricas: rubricasPs } : {}),
          ...psResultCLT.extra,
          fonteHolerite: mp.conferido ? 'contabil' : 'calculado',
        }];

        await fetchAuth(`${apiUrl}/pagamento-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({
            colaboradorId: mp.colaboradorId,
            unitId,
            mes: mesAno,
            dataPagamento: dataPrimeiro,
            formaPagamento: novos[0]?.forma || 'PIX',
            operacoes: psOps,
          }),
        });
      } catch (psErr) {
        console.warn('Payslip CLT não gerado (pagamento OK):', psErr);
      }

      // Atualiza folhasLocais E folhasDB para que ao reabrir o modal o estado persista corretamente
      const atualizaFolha = (f: any) => {
        if (f.colaboradorId !== modalPagamento.colaboradorId) return f;
        if (f.mes && f.mes !== mesAno) return f;
        return {
          ...f,
          pagoAdiantamento: isPagoAdto,
          dataPgtoAdiantamento: isPagoAdto ? dataPrimeiro : f.dataPgtoAdiantamento,
          pagoVariavel: isPagoVar,
          dataPgtoVariavel: isPagoVar ? dataPrimeiro : f.dataPgtoVariavel,
          pago: isPagoAdto,
          logPagamentos: newLogs,
        };
      };
      setFolhasLocais(prev => prev.map(atualizaFolha));
      // Sincroniza também folhasDB: garante que na próxima recalculação de folhasLocais
      // (via useEffect que dep. de folhasDB) os dados de pagamento sejam preservados
      setFolhasDB(prev => {
        const idx = prev.findIndex((r: any) =>
          r.colaboradorId === modalPagamento.colaboradorId &&
          (r.mes === mesAno || !r.mes)
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = atualizaFolha(updated[idx]);
          return updated;
        }
        // Registro ainda não existe no DB local — insere para garantir persistência
        return [...prev, {
          colaboradorId: modalPagamento.colaboradorId,
          mes: mesAno, unitId,
          pagoAdiantamento: isPagoAdto,
          dataPgtoAdiantamento: isPagoAdto ? dataPrimeiro : null,
          pagoVariavel: isPagoVar,
          dataPgtoVariavel: isPagoVar ? dataPrimeiro : null,
          pago: isPagoAdto,
          logPagamentos: newLogs,
        }];
      });
      setModalPagamento(null);
    } catch (err: any) {
      console.error('salvarPagamentoModal FALHOU:', err);
      alert(`\u274c Erro ao registrar pagamento: ${err?.message || err}\n\nO pagamento N\u00c3O foi salvo. Tente novamente.`);
    }
    finally { setSalvando(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL UNIFICADO CLT — Extrato de pagamentos + formulário
  // Quando pago: mostra exatamente o que foi pago (log real)
  // Quando pendente: mostra composição + formulário de pagamento
  // ═══════════════════════════════════════════════════════════════════════
  const modalConfirmarPagamentoCLTJSX = useMemo(() => {
    if (!modalPagamento) return null;
    const f = modalPagamento;
    const logs: any[] = f.logPagamentos || [];
    const logsAdto = logs.filter(l => l.tipo === 'Adiantamento');
    const logsVar = logs.filter(l => l.tipo === 'Variável');
    const totalPagoAdto = logsAdto.reduce((s: number, l: any) => s + (parseFloat(l.valor) || 0), 0);
    const totalPagoVar = logsVar.reduce((s: number, l: any) => s + (parseFloat(l.valor) || 0), 0);
    const totalPagoGeral = totalPagoAdto + totalPagoVar;

    const adtoPago = !!f.pagoAdiantamento;
    const varPago = !!f.pagoVariavel;
    const tudoPago = adtoPago && varPago;
    const tipoPendente = !adtoPago ? 'Adiantamento' : !varPago ? 'Variável' : null;

    // Buscar saídas do colaborador para o extrato completo
    const saidasCol = saidasMesCompleto.filter((s: any) => s.colaboradorId === f.colaboradorId);
    const adtoTransportes = saidasCol.filter((s: any) => (s.tipo||'') === 'Adiantamento Transporte');
    const descTransportes = saidasCol.filter((s: any) => (s.tipo||'') === 'Desconto Transporte');
    const consumos = saidasCol.filter((s: any) => (s.tipo||'') === 'Consumo Interno');
    const adtoEspeciais = saidasCol.filter((s: any) => (s.tipo||'') === 'Adiantamento Especial');
    const descEspeciais = saidasCol.filter((s: any) => (s.tipo||'') === 'Desconto Adiantamento Especial');
    const aPagar = saidasCol.filter((s: any) => (s.tipo||'') === 'A pagar' || (s.tipo||'') === 'A receber');
    const totalAdtoTransp = adtoTransportes.reduce((s: number, x: any) => s + (parseFloat(x.valor)||0), 0);
    const totalDescTransp = descTransportes.reduce((s: number, x: any) => s + (parseFloat(x.valor)||0), 0);
    const totalConsumos = consumos.reduce((s: number, x: any) => s + (parseFloat(x.valor)||0), 0);
    const totalDescEsp = descEspeciais.reduce((s: number, x: any) => s + (parseFloat(x.valor)||0), 0);
    const totalAPagar = aPagar.reduce((s: number, x: any) => s + (parseFloat(x.valor)||0), 0);

    // Checklist / formulário (só quando pendente)
    const totalChecklist = checkItemsCLT.reduce((sum, it) => {
      if (!it.checked || it.tipo === 'info') return sum;
      return it.tipo === 'credito' ? sum + it.valor : sum - it.valor;
    }, 0);
    const vlAbateCLTModal = abaterEspecialCLT ? (parseFloat(valorAbatimentoCLT) || 0) : 0;
    const totalADesembolsar = Math.max(0, totalChecklist - vlAbateCLTModal);
    const totalPgtoLinhas = pgtoLinhas.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
    const diff = totalPgtoLinhas - totalADesembolsar;

    const secStyle = (color: string) => ({ border: `1px solid ${color}`, borderRadius: '8px', marginBottom: '12px', overflow: 'hidden' as const });
    const secHeader = (bg: string, color: string) => ({ backgroundColor: bg, padding: '8px 14px', fontSize: '13px', fontWeight: 'bold' as const, color });
    const secBody = { padding: '8px 14px', fontSize: '13px' };
    const row = (label: string, valor: number, color = '#333') => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 'bold', color, minWidth: 90, textAlign: 'right' as const }}>{fmtMoeda(valor)}</span>
      </div>
    );

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalPagamento(null)}>
        <div style={{ ...s.card, maxWidth: '580px', width: '96%', maxHeight: '92vh', overflowY: 'auto', padding: '20px' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#1565c0', fontSize: '16px' }}>🔍 Extrato — {f.nome}</h3>
            <button onClick={() => setModalPagamento(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          {f.chavePix && <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>📲 PIX: <strong>{f.chavePix}</strong></div>}
          <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Referência: {mesAno}</div>

          {/* ── Pagamento Dia 20 ── */}
          <div style={secStyle(adtoPago ? '#4caf50' : '#ff9800')}>
            <div style={secHeader(adtoPago ? '#e8f5e9' : '#fff3e0', adtoPago ? '#2e7d32' : '#e65100')}>
              {adtoPago ? '✅' : '⏳'} Dia 20 — Adiantamento
              {adtoPago && <span style={{ fontWeight: 'normal', fontSize: '12px', marginLeft: 8 }}>({f.dataPgtoAdiantamento || '—'})</span>}
            </div>
            <div style={secBody}>
              {adtoPago ? (<>
                {logsAdto.map((l: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{l.forma === 'PIX' ? '📱 PIX' : l.forma === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'} — {l.data}{l.obs ? ` (${l.obs})` : ''}</span>
                    <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(l.valor)}</span>
                  </div>
                ))}
                {row('Total pago', totalPagoAdto, '#1b5e20')}
              </>) : (
                <span style={{ color: '#e65100' }}>Pendente</span>
              )}
            </div>
          </div>

          {/* ── Pagamento Dia 5 ── */}
          <div style={secStyle(varPago ? '#4caf50' : '#ff9800')}>
            <div style={secHeader(varPago ? '#e8f5e9' : '#fff3e0', varPago ? '#2e7d32' : '#e65100')}>
              {varPago ? '✅' : '⏳'} Dia 5 — Fechamento
              {varPago && <span style={{ fontWeight: 'normal', fontSize: '12px', marginLeft: 8 }}>({f.dataPgtoVariavel || '—'})</span>}
            </div>
            <div style={secBody}>
              {varPago ? (<>
                {logsVar.map((l: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{l.forma === 'PIX' ? '📱 PIX' : l.forma === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'} — {l.data}{l.obs ? ` (${l.obs})` : ''}</span>
                    <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(l.valor)}</span>
                  </div>
                ))}
                {row('Total pago', totalPagoVar, '#1b5e20')}
              </>) : (
                <span style={{ color: '#e65100' }}>Pendente</span>
              )}
            </div>
          </div>

          {/* ── Adiantamentos de Transporte ── */}
          {adtoTransportes.length > 0 && (
            <div style={secStyle('#1565c0')}>
              <div style={secHeader('#e3f2fd', '#1565c0')}>🚗 Adiantamentos de Transporte</div>
              <div style={secBody}>
                {adtoTransportes.map((s2: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>{s2.data} — {s2.descricao || 'Adiantamento'} {s2.pago === false ? '⚠️ não pago' : ''}</span>
                    <span style={{ fontWeight: 'bold', color: '#1565c0' }}>{fmtMoeda(s2.valor)}</span>
                  </div>
                ))}
                {row('Total adiantado', totalAdtoTransp, '#1565c0')}
                {totalDescTransp > 0 && row('(-) Já descontado', totalDescTransp, '#c62828')}
                {row('Saldo transporte', Math.max(0, totalAdtoTransp - totalDescTransp), totalAdtoTransp - totalDescTransp > 0 ? '#e65100' : '#2e7d32')}
              </div>
            </div>
          )}

          {/* ── Descontos (consumo, A pagar) ── */}
          {(consumos.length > 0 || aPagar.length > 0) && (
            <div style={secStyle('#e53935')}>
              <div style={secHeader('#ffebee', '#c62828')}>🔴 Descontos operacionais</div>
              <div style={secBody}>
                {consumos.map((s2: any, i: number) => (
                  <div key={`c${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>🍔 {s2.data} — {s2.descricao || 'Consumo Interno'}</span>
                    <span style={{ fontWeight: 'bold', color: '#c62828' }}>-{fmtMoeda(s2.valor)}</span>
                  </div>
                ))}
                {aPagar.map((s2: any, i: number) => (
                  <div key={`a${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>📋 {s2.data} — {s2.descricao || s2.tipo}</span>
                    <span style={{ fontWeight: 'bold', color: '#c62828' }}>-{fmtMoeda(s2.valor)}</span>
                  </div>
                ))}
                {row('Total descontos', totalConsumos + totalAPagar, '#c62828')}
              </div>
            </div>
          )}

          {/* ── Adiantamento Especial ── */}
          {(adtoEspeciais.length > 0 || descEspeciais.length > 0) && (
            <div style={secStyle('#7b1fa2')}>
              <div style={secHeader('#f3e5f5', '#7b1fa2')}>💜 Adiantamento Especial</div>
              <div style={secBody}>
                {adtoEspeciais.map((s2: any, i: number) => (
                  <div key={`ae${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>{s2.data} — {s2.descricao || 'Adiantamento'}</span>
                    <span style={{ fontWeight: 'bold', color: '#7b1fa2' }}>{fmtMoeda(s2.valor)}</span>
                  </div>
                ))}
                {descEspeciais.map((s2: any, i: number) => (
                  <div key={`de${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>{s2.data} — {s2.descricao || 'Abatimento'}</span>
                    <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>-{fmtMoeda(s2.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ CONSOLIDADO ═══ */}
          <div style={{ backgroundColor: '#e3f2fd', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', border: '2px solid #1565c0' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1565c0', marginBottom: '8px' }}>📊 Consolidado do mês</div>
            {totalPagoAdto > 0 && row('Dia 20 (Adiantamento)', totalPagoAdto, '#2e7d32')}
            {totalPagoVar > 0 && row('Dia 5 (Fechamento)', totalPagoVar, '#2e7d32')}
            {totalAdtoTransp > 0 && row('Adiantamentos Transporte', totalAdtoTransp, '#1565c0')}
            {(totalConsumos + totalAPagar) > 0 && row('(-) Descontos operacionais', totalConsumos + totalAPagar, '#c62828')}
            {totalDescEsp > 0 && row('(-) Abatimento adto. especial', totalDescEsp, '#7b1fa2')}
            <div style={{ borderTop: '2px solid #1565c0', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#1565c0' }}>Total pago (PIX/Dinheiro)</span>
              <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#1b5e20' }}>{fmtMoeda(totalPagoGeral)}</span>
            </div>
            {!tudoPago && (
              <div style={{ fontSize: '12px', color: '#e65100', marginTop: '6px' }}>
                ⚠️ Falta: {!adtoPago ? 'Dia 20' : ''}{!adtoPago && !varPago ? ' + ' : ''}{!varPago ? 'Dia 5' : ''}
              </div>
            )}
          </div>

          {/* ═══ FORMULÁRIO DE PAGAMENTO (só se pendente) ═══ */}
          {!tudoPago && (<>
            <div style={{ borderTop: '2px solid #1565c0', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px', color: '#1565c0', fontSize: '14px' }}>
                💳 Registrar Pagamento — {tipoPendente === 'Adiantamento' ? 'Dia 20 (Adiantamento)' : 'Dia 5 (Fechamento)'}
              </h4>
              {!adtoPago && !varPago && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {(['Adiantamento', 'Variável'] as const).map(t => (
                    <button key={t} onClick={() => setModalPgtoTipo(t)}
                      style={{ ...s.btn(modalPgtoTipo === t ? '#1b5e20' : '#9e9e9e'), padding: '6px 16px', fontSize: '13px',
                        outline: modalPgtoTipo === t ? '2px solid #1b5e20' : 'none' }}>
                      {t === 'Adiantamento' ? '🏦 Dia 20' : '💰 Dia 5'}
                    </button>
                  ))}
                </div>
              )}
              {/* Composição */}
              <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', marginBottom: '14px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f5f5f5', padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', borderBottom: '1px solid #e0e0e0' }}>
                  📋 Composição
                </div>
                {checkItemsCLT.some(it => it.tipo === 'info') && (() => {
                  const infoItems = checkItemsCLT.filter(it => it.tipo === 'info');
                  return (
                    <div style={{ backgroundColor: '#e3f2fd', borderBottom: '1px solid #90caf9', padding: '8px 14px' }}>
                      {infoItems.map(it => (
                        <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#37474f', padding: '2px 0' }}>
                          <span>{it.label}</span>
                          <span style={{ fontWeight: 'bold', color: it.key === 'racional_40' ? '#c62828' : '#1b5e20', minWidth: 80, textAlign: 'right' }}>
                            {it.key === 'racional_40' ? '− ' : '  '}{fmtMoeda(it.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {checkItemsCLT.filter(it => it.tipo !== 'info').map((item, i, arr) => (
                  <div key={item.key} onClick={() => toggleItemCLT(item.key)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', cursor: 'pointer',
                      backgroundColor: item.checked ? (item.tipo === 'credito' ? '#f1f8e9' : '#fff8f8') : '#fafafa',
                      borderBottom: i < arr.length - 1 ? '1px solid #eee' : 'none', opacity: item.checked ? 1 : 0.5 }}>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleItemCLT(item.key)}
                      onClick={e => e.stopPropagation()} style={{ width: 16, height: 16 }} />
                    <span style={{ flex: 1, fontSize: '13px' }}>{item.label}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', minWidth: 80, textAlign: 'right' }}>
                      {item.tipo === 'credito' ? '+' : '-'} {fmtMoeda(item.valor)}
                    </span>
                  </div>
                ))}
                {(f.saldoEspecialAberto || 0) > 0 && (
                  <div style={{ padding: '8px 14px', backgroundColor: '#f3e5f5', borderTop: '1px solid #ce93d8' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={abaterEspecialCLT}
                        onChange={e => { setAbaterEspecialCLT(e.target.checked); if (!e.target.checked) setValorAbatimentoCLT(''); }}
                        style={{ width: 16, height: 16 }} />
                      <span>➖ Abater Adiantamento Especial</span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#7b1fa2' }}>Saldo: {fmtMoeda(f.saldoEspecialAberto)}</span>
                    </label>
                    {abaterEspecialCLT && (
                      <input type="number" step="0.01" min="0" max={(f.saldoEspecialAberto||0).toString()}
                        value={valorAbatimentoCLT} onChange={e => setValorAbatimentoCLT(e.target.value)}
                        style={{ width: 160, padding: '6px', border: '1px solid #ce93d8', borderRadius: 4, fontSize: 14, marginTop: 6 }} />
                    )}
                  </div>
                )}
                <div style={{ padding: '8px 14px', backgroundColor: '#e8f5e9', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #c8e6c9' }}>
                  <span style={{ fontSize: '13px' }}>Total a pagar:</span>
                  <strong style={{ fontSize: '16px', color: '#1b5e20' }}>{fmtMoeda(totalADesembolsar)}</strong>
                </div>
              </div>
              {/* Lançamentos */}
              <div style={{ marginBottom: '10px' }}>
                {pgtoLinhas.map((linha, idx) => (
                  <div key={linha.id} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '8px', border: '1px solid #e0e0e0', borderRadius: 6, marginBottom: 6, backgroundColor: '#fafafa' }}>
                    <div style={{ flex: '0 0 110px' }}>
                      <label style={{ fontSize: 11, color: '#666' }}>Data</label>
                      <input type="date" value={linha.data} onChange={e => setPgtoLinhas(p => p.map((l,i) => i===idx?{...l,data:e.target.value}:l))} style={{ ...s.input, fontSize: 12, padding: '5px' }} />
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <label style={{ fontSize: 11, color: '#666' }}>Forma</label>
                      <select value={linha.forma} onChange={e => setPgtoLinhas(p => p.map((l,i) => i===idx?{...l,forma:e.target.value as any}:l))} style={{ ...s.select, fontSize: 12, padding: '5px' }}>
                        <option value="PIX">📱 PIX</option><option value="Dinheiro">💵 Dinheiro</option><option value="Misto">🔄 Misto</option>
                      </select>
                    </div>
                    <div style={{ flex: '0 0 120px' }}>
                      <label style={{ fontSize: 11, color: '#666' }}>Valor (R$)</label>
                      <input type="number" step="0.01" min="0" value={linha.valor} placeholder="0,00" onChange={e => setPgtoLinhas(p => p.map((l,i) => i===idx?{...l,valor:e.target.value}:l))} style={{ ...s.input, fontSize: 12, padding: '5px' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 90 }}>
                      <label style={{ fontSize: 11, color: '#666' }}>Obs</label>
                      <input type="text" value={linha.obs} placeholder="opcional" onChange={e => setPgtoLinhas(p => p.map((l,i) => i===idx?{...l,obs:e.target.value}:l))} style={{ ...s.input, fontSize: 12, padding: '5px' }} />
                    </div>
                    {pgtoLinhas.length > 1 && <button onClick={() => setPgtoLinhas(p => p.filter((_,i) => i!==idx))} style={{ ...s.btn('#e53935'), padding: '5px 8px', fontSize: 12 }}>🗑</button>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPgtoLinhas(p => [...p, novaPgtoLinha()])} style={{ ...s.btn('#1565c0'), padding: '5px 12px', fontSize: 12 }}>+ Lançamento</button>
                  {totalADesembolsar > 0 && pgtoLinhas[0]?.valor === '' && (
                    <button onClick={() => setPgtoLinhas(p => p.map((l,i) => i===0?{...l,valor:totalADesembolsar.toFixed(2)}:l))} style={{ ...s.btn('#43a047'), padding: '5px 12px', fontSize: 12 }}>↓ {fmtMoeda(totalADesembolsar)}</button>
                  )}
                </div>
              </div>
              <div style={{ backgroundColor: Math.abs(diff) < 0.05 ? '#e8f5e9' : '#fff3e0', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>Lançado: <strong>{fmtMoeda(totalPgtoLinhas)}</strong> | Esperado: <strong>{fmtMoeda(totalADesembolsar)}</strong></span>
                <span style={{ color: Math.abs(diff) < 0.05 ? '#2e7d32' : '#c62828', fontWeight: 'bold' }}>
                  {Math.abs(diff) < 0.05 ? '✅' : diff > 0 ? `+${fmtMoeda(diff)}` : `-${fmtMoeda(Math.abs(diff))}`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setModalPagamento(null)} style={s.btn('#9e9e9e')}>Fechar</button>
                <button onClick={salvarPagamentoModal} disabled={salvando || totalPgtoLinhas <= 0} style={s.btn('#43a047')}>
                  {salvando ? '⏳ Salvando...' : '✅ Confirmar'}
                </button>
              </div>
            </div>
          </>)}
          {tudoPago && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setModalPagamento(null)} style={s.btn('#1565c0')}>Fechar</button></div>}
        </div>
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalPagamento, modalPgtoTipo, pgtoLinhas, checkItemsCLT, salvando, mesAno, abaterEspecialCLT, valorAbatimentoCLT, saidasMesCompleto]);

  /* ── Modal Histórico de Pagamentos CLT (🔍) ──────────────────────────────── */
  const modalLogPgtoJSX = !modalLogPgto ? null : (() => {
    const f = modalLogPgto;
    const logs = f.logPagamentos || [];
    const totalPago = logs.reduce((s, p) => s + (p.valor || 0), 0);

    // Calcular adto transporte igual ao buildChecklistCLT
    const saidasCol = saidasPeriodoRef.current.filter((s: any) => s.colaboradorId === f.colaboradorId);
    const adtoTransp = saidasCol
      .filter((s: any) => s.pago === true && [16, '16'].includes(s.codigoDesconto) && s.tipo === 'adto')
      .reduce((acc: number, s: any) => acc + (R(s.totalFinal) || R(s.valorBruto) || 0), 0);

    // Composição Dia 20
    const itens20: { label: string; valor: number; tipo: 'credito' | 'debito' }[] = [
      { label: '💵 Adiantamento Salário (40%)', valor: f.adtoLiquido, tipo: 'credito' },
      { label: '🛵 Variável ≤19 (entregas + caixinha)', valor: f.variavelAte19 || 0, tipo: 'credito' },
      ...(adtoTransp > 0 ? [{ label: '🚗 Adto Transporte (desconto)', valor: adtoTransp, tipo: 'debito' as const }] : []),
    ];
    const total20Calc = itens20.reduce((s, i) => i.tipo === 'credito' ? s + i.valor : s - i.valor, 0);

    // Composição Dia 5
    const difSalLabel5 = f.periculosidade > 0
      ? '💰 Diferença Salário (60% + periculosidade)'
      : '💰 Diferença Salário (60% sal. base)';
    const itens5: { label: string; valor: number; tipo: 'credito' | 'debito' }[] = [
      { label: difSalLabel5, valor: parseFloat((f.salarioBase * 0.60 + f.periculosidade).toFixed(2)), tipo: 'credito' },
      ...((f.feriadosValor || 0) > 0 ? [{ label: `🟣 Feriado trabalhado (Cód.1311 — ${f.feriadosTrab} dia${(f.feriadosTrab||0)>1?'s':''})`, valor: f.feriadosValor || 0, tipo: 'credito' as const }] : []),
      { label: '🛵 Variável 20–31 (entregas + caixinha)', valor: f.variavelDe20a31 || 0, tipo: 'credito' },
      { label: '(-) Adiantamento Anterior (Cód.12 — 40%)', valor: f.adtoLiquido || f.adiantamentoValor || 0, tipo: 'debito' },
      { label: '(-) INSS', valor: f.inss || 0, tipo: 'debito' },
      ...(f.contrAssistencial > 0 ? [{ label: '(-) Contr. Assistencial', valor: f.contrAssistencial, tipo: 'debito' as const }] : []),
      ...((f.valeTransporte || 0) > 0 ? [{ label: '(-) Desc. Vale Transporte (Cód.109)', valor: f.valeTransporte, tipo: 'debito' as const }] : []),
    ];
    const total5Calc = itens5.reduce((s, i) => i.tipo === 'credito' ? s + i.valor : s - i.valor, 0);

    const ItemRow = ({ label, valor, tipo }: { label: string; valor: number; tipo: 'credito' | 'debito' }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid #eee', fontSize: 13 }}>
        <span style={{ color: '#444' }}>{label}</span>
        <span style={{ fontWeight: 'bold', color: tipo === 'credito' ? '#2e7d32' : '#c62828', minWidth: 80, textAlign: 'right' }}>
          {tipo === 'credito' ? '+' : '-'} {fmtMoeda(valor)}
        </span>
      </div>
    );

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 10003, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalLogPgto(null)}>
        <div style={{ ...s.card, maxWidth: '580px', width: '96%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
          onClick={e => e.stopPropagation()}>

          {/* Cabeçalho */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#37474f' }}>🔍 Extrato de Pagamentos</h3>
            <button onClick={() => setModalLogPgto(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ backgroundColor: '#eceff1', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            <strong>{f.nome}</strong> &middot; {f.cargo}
            {f.chavePix && <span style={{ marginLeft: 10, fontSize: 11, color: '#555' }}>📲 PIX: {f.chavePix}</span>}
          </div>

          {/* ── Dia 20 — Adiantamento ── */}
          <div style={{ border: `2px solid ${f.pagoAdiantamento ? '#a5d6a7' : '#ffcc80'}`, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ backgroundColor: f.pagoAdiantamento ? '#e8f5e9' : '#fff3e0', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 'bold', fontSize: 13, color: '#fb8c00' }}>💸 Pagamento Dia 20 — Adiantamento</span>
                {f.dataPgtoAdiantamento && <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>pago em {f.dataPgtoAdiantamento}</span>}
              </div>
              <span style={{ fontWeight: 'bold', fontSize: 13, color: f.pagoAdiantamento ? '#2e7d32' : '#e65100' }}>
                {f.pagoAdiantamento ? '✅ Pago' : '⏳ Pendente'}
              </span>
            </div>
            {itens20.map((it, i) => <ItemRow key={i} {...it} />)}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: '#fff8e1', fontWeight: 'bold', fontSize: 13, borderTop: '2px solid #ffe082' }}>
              <span>Total Dia 20:</span>
              <span style={{ color: '#e65100' }}>{fmtMoeda(Math.max(0, total20Calc))}</span>
            </div>
          </div>

          {/* ── Dia 5 — Fechamento ── */}
          <div style={{ border: `2px solid ${f.pagoVariavel ? '#a5d6a7' : '#90caf9'}`, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ backgroundColor: f.pagoVariavel ? '#e8f5e9' : '#e3f2fd', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 'bold', fontSize: 13, color: '#0288d1' }}>💰 Pagamento Dia 5 — Fechamento</span>
                {f.dataPgtoVariavel && <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>pago em {f.dataPgtoVariavel}</span>}
              </div>
              <span style={{ fontWeight: 'bold', fontSize: 13, color: f.pagoVariavel ? '#2e7d32' : '#e65100' }}>
                {f.pagoVariavel ? '✅ Pago' : '⏳ Pendente'}
              </span>
            </div>
            {itens5.map((it, i) => <ItemRow key={i} {...it} />)}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', backgroundColor: '#e3f2fd', fontWeight: 'bold', fontSize: 13, borderTop: '2px solid #90caf9' }}>
              <span>Total Dia 5:</span>
              <span style={{ color: '#0288d1' }}>{fmtMoeda(Math.max(0, total5Calc))}</span>
            </div>
          </div>

          {/* ── Lançamentos registrados ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#333', marginBottom: 8 }}>
              📜 Lançamentos registrados ({logs.length})
            </div>
            {logs.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#999', backgroundColor: '#fafafa', borderRadius: 6, border: '1px dashed #ddd', fontSize: 13 }}>
                Nenhum pagamento registrado ainda
              </div>
            ) : (
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f5f5f5', padding: '6px 12px', fontSize: 11, fontWeight: 'bold', color: '#555', borderBottom: '1px solid #e0e0e0', display: 'grid', gridTemplateColumns: '90px 80px 80px 1fr 60px', gap: 8 }}>
                  <span>Data</span><span>Forma</span><span>Valor</span><span>Obs</span><span>Tipo</span>
                </div>
                {logs.map((p, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '90px 80px 80px 1fr 60px', gap: 8,
                    alignItems: 'center', padding: '9px 12px',
                    backgroundColor: i % 2 === 0 ? '#fafafa' : 'white',
                    borderBottom: i < logs.length - 1 ? '1px solid #eee' : 'none',
                    fontSize: 12,
                  }}>
                    <span style={{ color: '#555' }}>{p.data}</span>
                    <span style={{ padding: '2px 7px', borderRadius: 10, textAlign: 'center',
                      backgroundColor: p.forma === 'PIX' ? '#e3f2fd' : p.forma === 'Dinheiro' ? '#e8f5e9' : '#fff3e0',
                      color: p.forma === 'PIX' ? '#1565c0' : p.forma === 'Dinheiro' ? '#2e7d32' : '#e65100' }}>
                      {p.forma === 'PIX' ? '📱 PIX' : p.forma === 'Dinheiro' ? '💵' : '🔄'}
                    </span>
                    <span style={{ fontWeight: 'bold', color: '#1b5e20' }}>{fmtMoeda(p.valor)}</span>
                    <span style={{ color: '#888', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.obs || '-'}</span>
                    <span style={{ fontSize: 10, color: '#9e9e9e', backgroundColor: '#f5f5f5', padding: '1px 5px', borderRadius: 8, textAlign: 'center' }}>{p.tipo || '-'}</span>
                  </div>
                ))}
                <div style={{ padding: '9px 12px', backgroundColor: '#e8f5e9', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13, borderTop: '2px solid #a5d6a7' }}>
                  <span>Total pago:</span>
                  <span style={{ color: '#1b5e20' }}>{fmtMoeda(totalPago)}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setModalLogPgto(null)} style={s.btn('#9e9e9e')}>Fechar</button>
          </div>
        </div>
      </div>
    );
  })();

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="💰 Folha de Pagamento" showBack={true} />
      {modalConfirmarPagamentoCLTJSX}
      {modalConfirmarPgtoFreelancerJSX}
      {modalLogPgtoJSX}
      {detalheSelecionado && <ModalDetalhe f={detalheSelecionado} onClose={() => setDetalheSelecionado(null)} />}
      {detalheFreelancer && <ModalDetalheFreelancer data={detalheFreelancer} onClose={() => setDetalheFreelancer(null)} />}
      <ModalSaidaInline />
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
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
              disabled={periodoCustomAtivo}
              style={{ ...s.input, width: '150px', opacity: periodoCustomAtivo ? 0.5 : 1 }} />
          </div>
          <div style={{ borderLeft: '1px solid #e0e0e0', paddingLeft: '14px' }}>
            <label style={{ ...s.label, color: periodoCustomAtivo ? '#7b1fa2' : '#666' }}>
              Período customizado {periodoCustomAtivo && <span style={{ fontSize: '10px', backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '1px 6px', borderRadius: '8px', marginLeft: '6px' }}>ativo</span>}
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)}
                style={{ ...s.input, width: '140px', borderColor: periodoCustomAtivo ? '#ab47bc' : undefined }} />
              <span style={{ fontSize: '12px', color: '#888' }}>até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                style={{ ...s.input, width: '140px', borderColor: periodoCustomAtivo ? '#ab47bc' : undefined }} />
              {periodoCustomAtivo && (
                <button
                  onClick={() => { setPeriodoIni(''); setPeriodoFim(''); }}
                  style={{ padding: '6px 10px', fontSize: '11px', border: '1px solid #ab47bc', backgroundColor: '#fff', color: '#7b1fa2', borderRadius: '4px', cursor: 'pointer' }}
                  title="Limpar período e voltar ao filtro mensal"
                >✕ limpar</button>
              )}
            </div>
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={folhasFiltradas.length === 0 && fechamentosFreelancer.length === 0} style={s.btn('#7b1fa2')}>
            📥 XLSX
          </button>
          <button onClick={() => navigate('/modulos/extrato')} style={s.btn('#00838f')}>
            📋 Extrato
          </button>
          {periodoCustomAtivo && (
            <div style={{ width: '100%', padding: '8px 12px', backgroundColor: '#fff3e0', borderRadius: '6px', borderLeft: '3px solid #fb8c00', fontSize: '12px', color: '#5d4037' }}>
              ⚠️ <strong>Período customizado ativo</strong> ({periodoIni} a {periodoFim}) — aplicado às abas <strong>Freelancers</strong> e <strong>Dobras CLT</strong>. A aba <strong>Colaboradores CLT</strong> continua mensal (regime de adiantamento dia 20 + diferença dia 05).
            </div>
          )}
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
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button style={s.tab(aba === 'clt')} onClick={() => setAba('clt')}>🧾 Colaboradores CLT</button>
          <button style={s.tab(aba === 'dobras')} onClick={() => setAba('dobras')}>
            📅 Dobras Semanais CLT
          </button>
          <button style={s.tab(aba === 'auditoria-clt')} onClick={() => setAba('auditoria-clt')}>
            🔍 Auditoria CLT
          </button>
          {/* Freelancers agora têm módulo dedicado — botão de atalho */}
          <button
            onClick={() => navigate('/modulos/freelancer-pagamento')}
            style={{
              padding: '10px 18px', border: '2px solid #2e7d32', cursor: 'pointer',
              fontWeight: 'bold', borderRadius: '4px 4px 0 0',
              backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '13px',
            }}
            title="Abre o módulo dedicado de pagamento de Freelancers com auditoria completa">
            🎯 Freelancers ↗
          </button>
          {/* Motoboys — botão de auditoria */}
          <button
            onClick={() => navigate('/modulos/motoboy-auditoria')}
            style={{
              padding: '10px 18px', border: '2px solid #1b5e20', cursor: 'pointer',
              fontWeight: 'bold', borderRadius: '4px 4px 0 0',
              backgroundColor: '#e8f5e9', color: '#1b5e20', fontSize: '13px',
            }}
            title="Auditoria linha a linha de Motoboys (CLT e Freelancer)">
            🏍️ Motoboys ↗
          </button>
        </div>

        {/* ── ABA CLT ─────────────────────────────────────────── */}
        {aba === 'clt' && (
          <>
            {/* Filtros CLT */}
            <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 16px' }}>
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
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#666' }}>
                💡 Pgto <strong>Dia 20</strong> = adto + variável do mês corrente · Pgto <strong>Dia 5</strong> = fechamento do mês anterior
              </div>
            </div>

            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando dados...</div>
            ) : folhasFiltradas.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Nenhum colaborador CLT para este período.</div>
            ) : (() => {
              // Filtro = competência. Grid 1 = adto desta competência (pago dia 20).
              // Grid 2 = fechamento desta competência (pago dia 5 do MÊS SEGUINTE).
              const [aMA, mMA] = mesAno.split('-').map(Number);
              const competenciaLabel = `${String(mMA).padStart(2, '0')}/${aMA}`;
              // Próximo mês (quando o pgto Dia 5 é efetivamente feito)
              const dProx = new Date(aMA, mMA, 1);
              const proxLabel = `05/${String(dProx.getMonth() + 1).padStart(2, '0')}/${dProx.getFullYear()}`;
              const totalGrid1 = folhasFiltradas.reduce((s, f) => s + f.pgtosDia20, 0);
              // Grid 2 agora soma pgtosDia05 + variavel 20-31 da PRÓPRIA competência
              const totalGrid2 = folhasFiltradas.reduce((s, f) => s + (f.pgtosDia05 + (f.variavelDe20a31 || 0)), 0);

              return (
                <>
                  {/* GRID 1 — Pagamento Dia 20 (mês corrente) */}
                  <div style={{ ...s.card, marginBottom: '20px', overflowX: 'auto', borderTop: '4px solid #fb8c00' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ margin: 0, color: '#fb8c00', fontSize: '15px' }}>💸 Grid 1 — Pagamento Dia 20 ({mesAno})</h3>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Adiantamento (40% sal. base) + Variável até dia 19 do mês corrente
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fb8c00' }}>
                        Total: {fmtMoeda(totalGrid1)}
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Nome</th>
                          <th style={s.th}>Cargo</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Sal. Base</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#7b1fa2' }}>Adto Sal. (40%)</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável ≤19</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#fb8c00' }}>💸 Pgto Dia 20</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#4a148c', fontSize: '10px' }}>Cód.16</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#311b92', fontSize: '10px' }}>Líq.ADTO</th>
                          <th style={{ ...s.thC, backgroundColor: '#1b5e20' }}>Status</th>
                          <th style={s.thC}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folhasFiltradas.map((f, idx) => (
                          <tr key={`g1-${f.colaboradorId}`} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                            <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                            <td style={s.tdR}>{fmtMoeda(f.salarioBase)}</td>
                            <td style={{ ...s.tdR, color: '#7b1fa2' }}>{fmtMoeda(f.adiantamentoValor)}</td>
                            <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{f.variavelAte19 > 0 ? fmtMoeda(f.variavelAte19) : '-'}</td>
                            <td style={{ ...s.tdR, color: '#fb8c00', fontWeight: 'bold', fontSize: '13px' }}>{fmtMoeda(f.pgtosDia20)}</td>
                            <td style={{ ...s.tdR, color: '#7b1fa2', fontSize: '11px' }}>{fmtMoeda(f.adtoContabil)}</td>
                            <td style={{ ...s.tdR, color: '#311b92', fontWeight: 'bold' }}>{fmtMoeda(f.adtoLiquido)}</td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <span style={f.pagoAdiantamento ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                                {f.pagoAdiantamento ? '✅ Pago' : '⏳ Pendente'}
                              </span>
                              {f.pagoAdiantamento && f.dataPgtoAdiantamento && (
                                <div style={{ fontSize: '10px', color: '#666' }}>{f.dataPgtoAdiantamento}</div>
                              )}
                            </td>
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button
                                  onClick={() => {
                                    if (f.pagoAdiantamento) { handleTogglePago(f); return; }
                                    setModalPagamento(f);
                                    setModalPgtoTipo('Adiantamento');
                                  }}
                                  disabled={salvando}
                                  style={{ ...s.btn(f.pagoAdiantamento ? '#e53935' : '#fb8c00'), padding: '4px 12px', fontSize: '11px' }}>
                                  {f.pagoAdiantamento ? '↩ Desfazer' : '✅ Pagar Dia 20'}
                                </button>
                                <button
                                  onClick={() => setModalLogPgto(f)}
                                  style={{ ...s.btn('#546e7a'), padding: '4px 8px', fontSize: '11px' }}
                                  title="Ver histórico de pagamentos">
                                  🔍
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* GRID 2 — Pagamento Dia 5 (fechamento mês anterior) */}
                  <div style={{ ...s.card, marginBottom: '20px', overflowX: 'auto', borderTop: '4px solid #0288d1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ margin: 0, color: '#0288d1', fontSize: '15px' }}>💰 Grid 2 — Fechamento {competenciaLabel} · Pgto em {proxLabel}</h3>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Diferença salário (60% + periculosidade) + Variável 20-31 do mês anterior – INSS – Contr. Assist.
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0288d1' }}>
                        Total: {fmtMoeda(totalGrid2)}
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Nome</th>
                          <th style={s.th}>Cargo</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Dif. Salário</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>+ Periculosidade</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável 20-31 ({competenciaLabel})</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>INSS</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>Contr. Assist.</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0288d1', fontSize: '12px' }}>💰 Pgto Dia 5</th>
                          <th style={{ ...s.thC, backgroundColor: '#0d47a1' }}>Status</th>
                          <th style={s.thC}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folhasFiltradas.map((f, idx) => {
                          // Competência selecionada → variável 20-31 desta mesma competência
                          const varCompet = f.variavelDe20a31 || 0;
                          const totalDia5 = f.pgtosDia05;
                          return (
                            <tr key={`g2-${f.colaboradorId}`} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                              <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                              <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                              <td style={s.tdR}>{fmtMoeda(f.diferencaSalario - f.periculosidade)}</td>
                              <td style={{ ...s.tdR, color: '#e65100' }}>{f.periculosidade > 0 ? fmtMoeda(f.periculosidade) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>
                                {varCompet > 0 ? fmtMoeda(varCompet) : '-'}
                              </td>
                              <td style={{ ...s.tdR, color: '#c62828' }}>{fmtMoeda(f.inss)}</td>
                              <td style={{ ...s.tdR, color: '#c62828' }}>{f.contrAssistencial > 0 ? fmtMoeda(f.contrAssistencial) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#0288d1', fontWeight: 'bold', fontSize: '13px' }}>
                                {fmtMoeda(totalDia5)}
                              </td>
                              <td style={{ ...s.td, textAlign: 'center' }}>
                                <span style={f.pagoVariavel ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                                  {f.pagoVariavel ? '✅ Pago' : '⏳ Pendente'}
                                </span>
                                {f.pagoVariavel && f.dataPgtoVariavel && (
                                  <div style={{ fontSize: '10px', color: '#666' }}>{f.dataPgtoVariavel}</div>
                                )}
                              </td>
                              <td style={{ ...s.td, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                  <button
                                    onClick={() => {
                                      if (f.pagoVariavel) { handleTogglePagoVariavel(f); return; }
                                      setModalPagamento(f);
                                      setModalPgtoTipo('Variável');
                                    }}
                                    disabled={salvando}
                                    style={{ ...s.btn(f.pagoVariavel ? '#e53935' : '#0288d1'), padding: '4px 12px', fontSize: '11px' }}>
                                    {f.pagoVariavel ? '↩ Desfazer' : '✅ Pagar Dia 5'}
                                  </button>
                                  <button
                                    onClick={() => setModalLogPgto(f)}
                                    style={{ ...s.btn('#546e7a'), padding: '4px 8px', fontSize: '11px' }}
                                    title="Ver histórico de pagamentos">
                                    🔍
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* GRID 4 — Variáveis (descontos e créditos do mês, separados da folha) */}
                  <div style={{ ...s.card, marginBottom: '20px', overflowX: 'auto', borderTop: '4px solid #6a1b9a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ margin: 0, color: '#6a1b9a', fontSize: '15px' }}>⚡ Grid 4 — Variáveis ({mesAno})</h3>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Dobras CLT + Adto Transporte + Saídas (Consumo Interno, A receber, Adto Especial)
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Nome</th>
                          <th style={s.th}>Cargo</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047', fontSize: '11px' }}>Dobras CLT (pago)</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0288d1', fontSize: '11px' }}>Adto Transporte</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828', fontSize: '11px' }}>(-) Consumo Interno</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828', fontSize: '11px' }}>(-) A receber</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#7b1fa2', fontSize: '11px' }}>(-) Adto Especial (parc.)</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#6a1b9a' }}>Líq. Variáveis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folhasFiltradas.map((f, idx) => {
                          // Saídas do colaborador no período
                          const saidasCol = saidasPeriodo.filter((s: any) => s.colaboradorId === f.colaboradorId);
                          // Adto Transporte (crédito — valor antecipado pra ele)
                          const adtoTransp = saidasCol
                            .filter((s: any) => (s.tipo || s.origem) === 'Adiantamento Transporte')
                            .reduce((sum: number, s: any) => sum + R(s.valor), 0);
                          // Consumo Interno (desconto)
                          const consumo = saidasCol
                            .filter((s: any) => (s.tipo || s.origem) === 'Consumo Interno')
                            .reduce((sum: number, s: any) => sum + R(s.valor), 0);
                          // A receber (desconto)
                          const aReceber = saidasCol
                            .filter((s: any) => (s.tipo || s.origem) === 'A receber')
                            .reduce((sum: number, s: any) => sum + R(s.valor), 0);
                          // Desconto Adto Especial (parcela do mês)
                          const descAdtoEsp = saidasCol
                            .filter((s: any) => (s.tipo || s.origem) === 'Desconto Adiantamento Especial')
                            .reduce((sum: number, s: any) => sum + R(s.valor), 0);
                          // Dobras CLT pagas no mês (folhasDB com tipo 'dobra' OU semana sem freelancer-dia)
                          const dobrasCLTPagas = folhasDB
                            .filter((p: any) =>
                              p.colaboradorId === f.colaboradorId
                              && p.mes === mesAno
                              && p.semana                       // tem semana = pgto semanal de dobra
                              && p.pago === true
                              && p.tipo !== 'freelancer-dia'
                              && p.tipo !== 'freelancer-noite'
                            )
                            .reduce((sum: number, p: any) => sum + (R(p.totalFinal) || R(p.valorBruto) || R(p.totalLiquido) || 0), 0);
                          // Líquido das variáveis = (créditos) - (descontos)
                          const liqVar = dobrasCLTPagas + adtoTransp - consumo - aReceber - descAdtoEsp;
                          return (
                            <tr key={`g4-${f.colaboradorId}`} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                              <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                              <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                              <td style={{ ...s.tdR, color: '#2e7d32' }}>{dobrasCLTPagas > 0 ? fmtMoeda(dobrasCLTPagas) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#0288d1' }}>{adtoTransp > 0 ? fmtMoeda(adtoTransp) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#c62828' }}>{consumo > 0 ? fmtMoeda(consumo) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#c62828' }}>{aReceber > 0 ? fmtMoeda(aReceber) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#7b1fa2' }}>{descAdtoEsp > 0 ? fmtMoeda(descAdtoEsp) : '-'}</td>
                              <td style={{ ...s.tdR, color: liqVar >= 0 ? '#2e7d32' : '#c62828', fontWeight: 'bold', fontSize: '13px' }}>
                                {liqVar !== 0 ? fmtMoeda(liqVar) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* GRID 3 — Resumo Mensal (todos pagamentos do mês) */}
                  <div style={{ ...s.card, marginBottom: '20px', overflowX: 'auto', borderTop: '4px solid #2e7d32' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ margin: 0, color: '#2e7d32', fontSize: '15px' }}>📊 Grid 3 — Resumo Mensal ({mesAno})</h3>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Pgto Dia 20 + Pgto Dia 5 + Variável total + Caixinha (Controle Motoboy)
                      </div>
                      <button onClick={() => navigate('/modulos/extrato')} style={{ ...s.btn('#00838f'), padding: '4px 12px', fontSize: '11px' }}>
                        📋 Ver Extrato
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Nome</th>
                          <th style={s.th}>Cargo</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Sal. + Per.</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável Total ({mesAno})</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#fb8c00' }}>Pgto Dia 20</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0288d1' }}>Pgto Dia 5</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>(-) Descontos</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0d47a1' }}>Total Bruto Mês</th>
                          <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#1b5e20' }}>Total Líquido Mês</th>
                          <th style={s.thC}>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folhasFiltradas.map((f, idx) => {
                          const pgto20 = f.pgtosDia20;
                          const pgto5 = f.pgtosDia05;
                          const descontos = f.inss + f.contrAssistencial;
                          // Total Bruto = Sal+Per do mês + Variável total do mês corrente (caixinha já entra na variável do controle)
                          const totalBruto = f.salarioBase + f.periculosidade + f.totalVariavel;
                          // Total Líquido = o que efetivamente sai pra ele = pgto20 + pgto5
                          const totalLiquido = pgto20 + pgto5;
                          return (
                            <tr key={`g3-${f.colaboradorId}`} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                              <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                              <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                              <td style={s.tdR}>{fmtMoeda(f.salarioBase + f.periculosidade)}</td>
                              <td style={{ ...s.tdR, color: '#2e7d32' }}>{f.totalVariavel > 0 ? fmtMoeda(f.totalVariavel) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#fb8c00' }}>{fmtMoeda(pgto20)}</td>
                              <td style={{ ...s.tdR, color: '#0288d1' }}>{fmtMoeda(pgto5)}</td>
                              <td style={{ ...s.tdR, color: '#c62828' }}>{descontos > 0 ? fmtMoeda(descontos) : '-'}</td>
                              <td style={{ ...s.tdR, color: '#0d47a1', fontWeight: 'bold' }}>{fmtMoeda(totalBruto)}</td>
                              <td style={{ ...s.tdR, color: '#1b5e20', fontWeight: 'bold', fontSize: '13px' }}>{fmtMoeda(totalLiquido)}</td>
                              <td style={{ ...s.td, textAlign: 'center' }}>
                                <button onClick={() => setDetalheSelecionado(f)} style={{ ...s.btn('#1976d2'), padding: '4px 10px', fontSize: '11px' }} title="Ver detalhes">
                                  📋
                                </button>
                                <button onClick={() => abrirHistorico(f.colaboradorId)} style={{ ...s.btn('#6a1b9a'), padding: '4px 10px', fontSize: '11px', marginLeft: 4 }} title="Histórico analítico">
                                  📊
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#1b5e20', color: 'white', fontWeight: 'bold' }}>
                          <td style={{ padding: '8px', fontSize: '13px' }} colSpan={2}>TOTAIS</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.salarioBase + f.periculosidade, 0))}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.totalVariavel, 0))}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totalGrid1)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#b3e5fc' }}>{fmtMoeda(totalGrid2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ef9a9a' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.inss + f.contrAssistencial, 0))}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.salarioBase + f.periculosidade + f.totalVariavel, 0))}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(totalGrid1 + totalGrid2)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              );
            })()}
          </>
        )}


        {/* ── ABA DOBRAS SEMANAIS ─────────────────────────────── */}
        {aba === 'dobras' && (() => {
          // Range base: período custom (se ativo) ou mês selecionado
          let primDia: Date, ultDia: Date;
          if (periodoCustomAtivo) {
            primDia = new Date(periodoIni + 'T00:00:00');
            ultDia  = new Date(periodoFim + 'T00:00:00');
          } else {
            const [anoM, mesM] = mesAno.split('-').map(Number);
            primDia = new Date(anoM, mesM - 1, 1);
            ultDia  = new Date(anoM, mesM, 0);
          }

          interface SemanaInfo { label: string; inicio: string; fim: string; proxSeg: string; }
          const semanas: SemanaInfo[] = [];
          let cur = new Date(primDia);
          // Start from Monday of first week
          const dow0 = cur.getDay();
          if (dow0 !== 1) cur.setDate(cur.getDate() + (dow0 === 0 ? -6 : 1 - dow0));
          // Limites do range para clipping (período custom global)
          const rangeIniIso = periodoCustomAtivo ? periodoIni : '';
          const rangeFimIso = periodoCustomAtivo ? periodoFim : '';
          while (cur <= ultDia) {
            const seg = new Date(cur);
            const dom = new Date(cur); dom.setDate(dom.getDate() + 6);
            const fimReal = dom > ultDia ? new Date(ultDia) : new Date(dom);
            let inicioStr = seg.toISOString().split('T')[0];
            let fimStr = fimReal.toISOString().split('T')[0];
            // Clipping ao range custom: a semana exibida não ultrapassa o período selecionado
            if (rangeIniIso && inicioStr < rangeIniIso) inicioStr = rangeIniIso;
            if (rangeFimIso && fimStr    > rangeFimIso) fimStr    = rangeFimIso;
            // Atualizar label para refletir período clipado
            const [iY, iM, iD] = inicioStr.split('-').map(Number);
            const [fY, fM, fD] = fimStr.split('-').map(Number);
            void iY; void fY;
            const labelClipado = `${String(iD).padStart(2,'0')}/${String(iM).padStart(2,'0')} - ${String(fD).padStart(2,'0')}/${String(fM).padStart(2,'0')}`;
            // proxSeg after fim
            const ps = new Date(fimReal);
            const pdow = ps.getDay();
            ps.setDate(ps.getDate() + (pdow === 1 ? 0 : pdow === 0 ? 1 : 8 - pdow));
            semanas.push({
              label: labelClipado,
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
          // Aba Dobras CLT: apenas colaboradores CLT - excluir Freelancers E Motoboys
          const motoboyIds = new Set(motoboys.map(m => m.id));
          const motoboyCpfs = new Set(motoboys.filter(m => m.cpf).map(m => m.cpf));
          const pessoas: PessoaDobra[] = [
            ...colaboradores
              .filter(c =>
                c.tipoContrato !== 'Freelancer' &&
                !motoboyIds.has(c.id) &&
                !(c.cpf && motoboyCpfs.has(c.cpf)) &&
                c.cargo?.toLowerCase() !== 'motoboy'
              )
              .map(c => ({
                id: c.id, nome: c.nome, chavePix: c.chavePix, cargo: c.cargo,
                tipoContrato: c.tipoContrato || 'CLT',
                area: c.area, funcao: c.funcao,
                valorDia: c.valorDia || 0, valorNoite: c.valorNoite || 0,
                valorDobra: 0, valorTransporte: c.valorTransporte || 0,
              })),
          ].sort((a,b) => {
            const aa = a.area || 'zzz', ba = b.area || 'zzz';
            return aa !== ba ? aa.localeCompare(ba) : a.nome.localeCompare(b.nome);
          });

          const areasP = [...new Set(pessoas.map(p => p.area || 'Sem Área'))].sort();

          // Aplicar filtro de período nas semanas
          // - Quando período global está ativo, ele tem prioridade sobre os filtros locais da aba
          const filtroIniEf = periodoCustomAtivo ? periodoIni : dobrasFiltroIni;
          const filtroFimEf = periodoCustomAtivo ? periodoFim : dobrasFiltroFim;
          const semanasFiltradas = semanas.filter(sem => {
            if (filtroIniEf && sem.fim < filtroIniEf) return false;
            if (filtroFimEf && sem.inicio > filtroFimEf) return false;
            return true;
          });

          return (
            <div style={{ borderRadius: '0 8px 8px 8px' }}>
              <div style={{ padding: '10px 14px', backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', borderRadius: '0 0 4px 4px', marginBottom: '8px', fontSize: '12px', color: '#1b5e20' }}>
                📅 <strong>Dobras Semanais CLT</strong> — controle semanal de turnos extras (exceto Motoboys, que possuem módulo próprio). Valores editáveis. Marque como Pago para registrar data e log.
              </div>

              {/* Filtro de período (oculto quando período global está ativo) */}
              {!periodoCustomAtivo && (
                <div style={{ ...s.card, marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', padding: '12px 16px' }}>
                  <div>
                    <label style={{ ...s.label, fontSize: '11px' }}>Período — de</label>
                    <input type="date" value={dobrasFiltroIni}
                      onChange={e => setDobrasFiltroIni(e.target.value)}
                      style={{ ...s.input, width: '140px', fontSize: '12px', padding: '5px 8px' }} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: '11px' }}>até</label>
                    <input type="date" value={dobrasFiltroFim}
                      onChange={e => setDobrasFiltroFim(e.target.value)}
                      style={{ ...s.input, width: '140px', fontSize: '12px', padding: '5px 8px' }} />
                  </div>
                  <button onClick={() => { setDobrasFiltroIni(''); setDobrasFiltroFim(''); }}
                    style={{ ...s.btn('#78909c'), padding: '5px 12px', fontSize: '12px' }}>
                    ✕ Limpar
                  </button>
                  <span style={{ fontSize: '11px', color: '#888', alignSelf: 'center' }}>
                    {semanasFiltradas.length} de {semanas.length} semanas
                  </span>
                </div>
              )}
              {periodoCustomAtivo && (
                <div style={{ marginBottom: '12px', padding: '8px 14px', backgroundColor: '#f3e5f5', borderLeft: '3px solid #ab47bc', borderRadius: '4px', fontSize: '12px', color: '#6a1b9a' }}>
                  Período global ativo: <strong>{periodoIni} a {periodoFim}</strong> — {semanasFiltradas.length} de {semanas.length} semanas dentro do range.
                </div>
              )}

              {loading ? (
                <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
              ) : semanasFiltradas.map(sem => {
                // Pessoas que trabalharam nesta semana
                interface LinhaCalc {
                  pessoa: PessoaDobra;
                  dC: number; nC: number; dnC: number;
                  codigos: string[];
                  totalBruto: number;
                  totalTransporte: number;
                  // CLT: saldo a pagar após deduzir adiantamento de transporte
                  transporteSaldoCLT: number;
                  adtoTranspMes: number;
                  adtoDisponivel: number;
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
                    // Somente 'presente' explícito conta como dia trabalhado
                    if (!esc || esc.turno === 'Folga') { codigos.push('-'); continue; }
                    const presStatus = statusPresencaEscala(esc);
                    if (presStatus === 'falta') { codigos.push('F'); continue; }
                    if (presStatus === 'falta_justificada') { codigos.push('FJ'); continue; }
                    if (presStatus !== 'presente' && presStatus !== 'presente_parcial') {
                      // undefined/null = sem confirmação (aguardando)
                      codigos.push(ds > ISO_HOJE_FP ? '...' : '?'); continue;
                    }
                    // DiaNoite parcial: pagar apenas o turno presente
                    const efTurno = (esc.turno === 'DiaNoite' && presStatus === 'presente_parcial')
                      ? (esc.presenca === 'presente' ? 'Dia' : 'Noite') : esc.turno;
                    if (efTurno === 'Dia') { dC++; codigos.push('D'); }
                    else if (efTurno === 'Noite') { nC++; codigos.push('N'); }
                    else if (efTurno === 'DiaNoite') { dnC++; dC++; nC++; codigos.push('DN'); }
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
                  const diasTrab = codigos.filter(c => c !== '-').length;
                  const totalTransporte = p.valorTransporte * diasTrab;

                  // Deduzir adiantamento de transporte já pago para CLT (mesma lógica dos freelancers)
                  // saidasPeriodo é estado do componente pai, acessível aqui
                  const saidasTranspCLT = saidasPeriodo.filter((s: any) =>
                    s.colaboradorId === p.id &&
                    (s.tipo || s.origem || s.referencia || '') === 'Adiantamento Transporte'
                  );
                  const adtoTranspMes = saidasTranspCLT.reduce((sum: number, s: any) => sum + R(s.valor), 0);

                  // Semanas anteriores já consumidas: conta dias pagos em semanas antes desta
                  const diasPagosAnteriores = folhasDB
                    .filter(f =>
                      f.colaboradorId === p.id &&
                      f.mes === mesAno &&
                      f.semana < sem.inicio &&
                      f.pago
                    )
                    .reduce((sum: number, f: any) => {
                      // valorTransporte salvo ou recalcula por dias salvos
                      return sum + R(f.valorTransporte);
                    }, 0);

                  const adtoDisponivel = Math.max(0, adtoTranspMes - diasPagosAnteriores);
                  // Saldo a pagar = máx(0, transporte da semana − adto disponível)
                  const transporteSaldoCLT = parseFloat(Math.max(0, totalTransporte - adtoDisponivel).toFixed(2));

                  return { pessoa: p, dC, nC, dnC, codigos, totalBruto, totalTransporte, transporteSaldoCLT, adtoTranspMes, adtoDisponivel };
                }).filter(l => l.dC + l.nC + l.dnC > 0);

                if (linhas.length === 0) return null;

                const semTotalBruto = linhas.reduce((s, l) => s + l.totalBruto, 0);
                // Para CLT: usa saldo (após deduzir adiantamento); para não-CLT manteve totalTransporte
                const semTotalTransp = linhas.reduce((s, l) =>
                  s + (l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte), 0);

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
                      const areaTotal = gp.reduce((s,l)=>s+l.totalBruto+(l.pessoa.tipoContrato==='CLT' ? l.transporteSaldoCLT : l.totalTransporte),0);
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
                                  <th style={{ ...s.thC, backgroundColor: '#f57f17', minWidth: '28px', fontSize: '10px' }}>D☀️</th>
                                  <th style={{ ...s.thC, backgroundColor: '#3949ab', minWidth: '28px', fontSize: '10px' }}>N🌙</th>
                                  <th style={{ ...s.thC, backgroundColor: '#2e7d32', minWidth: '28px', fontSize: '10px' }}>DN</th>
                                  <th style={{ ...s.th, backgroundColor: '#f57f17', textAlign: 'right', minWidth: '72px', fontSize: '10px' }}>Val. Dia</th>
                                  <th style={{ ...s.th, backgroundColor: '#3949ab', textAlign: 'right', minWidth: '72px', fontSize: '10px' }}>Val. Noite</th>
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
                                  // CLT: usa saldo (total − adto já pago); freelancer: usa totalTransporte bruto
                                  const transpBase = l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte;
                                  const transpEditado = ed.valorTransporte !== undefined ? (parseFloat(ed.valorTransporte) || 0) : transpBase;
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
                                      <td style={{ ...s.td, fontSize: '11px', color: '#555' }}>{p.funcao || p.cargo || '-'}</td>
                                      {days2.map((ds, di) => {
                                        const c = cod[di] || '-';
                                        let bg = 'transparent', tc = '#bbb';
                                        if (c==='D') { bg='#fff9c4'; tc='#f57f17'; }
                                        else if (c==='N') { bg='#e8eaf6'; tc='#3949ab'; }
                                        else if (c==='DN') { bg='#e8f5e9'; tc='#2e7d32'; }
                                        else if (c==='F') { bg='#ffebee'; tc='#c62828'; }
                                        else if (c==='FJ') { bg='#fce4ec'; tc='#880e4f'; }
                                        else if (c==='...') { bg='#f5f5f5'; tc='#9e9e9e'; } // futuro sem presença
                                        return <td key={ds} style={{ ...s.td, textAlign: 'center', padding: '4px 2px', opacity: c==='...' ? 0.6 : 1 }}>
                                          <span title={c==='...' ? 'Turno agendado - aguardando confirmação de presença' : undefined}
                                            style={{ backgroundColor: bg, color: tc, padding: '1px 4px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', minWidth: '22px', display: 'inline-block' }}>{c}</span>
                                        </td>;
                                      })}
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#f57f17' }}>{l.dC}</td>
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#3949ab' }}>{l.nC}</td>
                                      <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32' }}>{l.dnC}</td>
                                      {/* Valor por turno (informação, não editável) */}
                                      <td style={{ ...s.td, textAlign: 'right', fontSize: '11px', color: '#f57f17' }}>
                                        {p.valorDia > 0 ? (
                                          <span title={`${l.dC - l.dnC} dia(s) × R$${fmt(p.valorDia)}`}>
                                            {l.dC - l.dnC > 0 ? fmtMoeda((l.dC - l.dnC) * p.valorDia) : '—'}
                                          </span>
                                        ) : <span style={{ color: '#ccc' }}>—</span>}
                                      </td>
                                      <td style={{ ...s.td, textAlign: 'right', fontSize: '11px', color: '#3949ab' }}>
                                        {p.valorNoite > 0 ? (
                                          <span title={`${l.nC - l.dnC} noite(s) × R$${fmt(p.valorNoite)}`}>
                                            {l.nC - l.dnC > 0 ? fmtMoeda((l.nC - l.dnC) * p.valorNoite) : '—'}
                                          </span>
                                        ) : <span style={{ color: '#ccc' }}>—</span>}
                                      </td>
                                      {/* Bruto editável */}
                                      <td style={{ ...s.td, textAlign: 'right', padding: '4px 4px' }}>
                                        <input
                                          type="number" step="0.01" min="0"
                                          value={ed.valorBruto !== undefined ? ed.valorBruto : l.totalBruto.toFixed(2)}
                                          onChange={e => setEditDobras(prev => ({ ...prev, [editKey]: { ...prev[editKey], valorBruto: e.target.value } }))}
                                          style={{ width: '75px', padding: '3px 5px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', textAlign: 'right', backgroundColor: ed.valorBruto !== undefined ? '#fff9e0' : 'white' }}
                                        />
                                      </td>
                                      {/* Transporte editável — CLT mostra saldo (total − adto); tooltip explica */}
                                      <td style={{ ...s.td, textAlign: 'right', padding: '4px 4px' }}>
                                        <input
                                          type="number" step="0.50" min="0"
                                          value={ed.valorTransporte !== undefined ? ed.valorTransporte : transpBase.toFixed(2)}
                                          onChange={e => setEditDobras(prev => ({ ...prev, [editKey]: { ...prev[editKey], valorTransporte: e.target.value } }))}
                                          title={l.pessoa.tipoContrato === 'CLT' && l.adtoTranspMes > 0
                                            ? `Total: R$${fmt(l.totalTransporte)} | Adto mês: R$${fmt(l.adtoTranspMes)} | Saldo a pagar: R$${fmt(l.transporteSaldoCLT)}`
                                            : undefined}
                                          style={{ width: '65px', padding: '3px 5px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', textAlign: 'right',
                                            backgroundColor: ed.valorTransporte !== undefined ? '#e3f2fd' : (l.pessoa.tipoContrato === 'CLT' && l.adtoTranspMes > 0 && l.transporteSaldoCLT === 0 ? '#e8f5e9' : 'white') }}
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
                                              // Abrir modal com descontos/consumos/abatimentos
                                              const md: ModalDobrasCLT = {
                                                pessoa: p, semana: sem,
                                                bruto: brutoEditado, transporte: transpEditado,
                                                totalFinal: totalEdit, obs: ed.obs || '',
                                              };
                                              setModalDobras(md);
                                              setAbaterEspDobras(false);
                                              setVlAbateDobras('');
                                              // Buscar saídas frescas e montar checklist
                                              try {
                                                const resSaidas = await fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${mesAno}-01&dataFim=${mesAno}-31`, {
                                                  headers: { Authorization: `Bearer ${token()}` }
                                                });
                                                const saidasFrescas = await resSaidas.json();
                                                const saidasCol = saidasFrescas.filter((ss: any) => ss.colaboradorId === p.id);
                                                const TIPOS_DESC = ['A pagar', 'A receber', 'Consumo Interno'];
                                                const saidasDesc = saidasCol.filter((ss: any) => {
                                                  const t = ss.tipo || ss.origem || '';
                                                  if (!TIPOS_DESC.includes(t)) return false;
                                                  if (ss.pagamentoIdLigado) return false; // já processado
                                                  return true;
                                                });
                                                // Saldo adiantamento especial
                                                const adtosEsp = saidasCol.filter((ss: any) => (ss.tipo || '') === 'Adiantamento Especial');
                                                const descEsp = saidasCol.filter((ss: any) => (ss.tipo || '') === 'Desconto Adiantamento Especial');
                                                let saldoEsp = 0;
                                                for (const ae of adtosEsp) {
                                                  const aid = ae.adiantamentoId || ae.id;
                                                  const totalD = descEsp.filter((dd: any) => dd.adiantamentoId === aid).reduce((s2: number, dd: any) => s2 + (parseFloat(dd.valor) || 0), 0);
                                                  saldoEsp += Math.max(0, (parseFloat(ae.valor) || 0) - totalD);
                                                }
                                                const items: CheckItemCLT[] = [
                                                  { key: 'dobras', label: `💪 Dobras semana ${sem.label}`, valor: brutoEditado, tipo: 'credito', checked: true },
                                                  ...(transpEditado > 0 ? [{ key: 'transp', label: `🚗 Transporte`, valor: transpEditado, tipo: 'credito' as const, checked: true }] : []),
                                                  ...saidasDesc.map((ss: any, i: number) => ({
                                                    key: `desc_${i}`, label: `🔴 ${ss.tipo || 'Desconto'}: ${ss.descricao || ''} (${(ss.data || '').slice(5)})`,
                                                    valor: R(ss.valor), tipo: 'debito' as const, checked: true, saidaId: ss.id,
                                                  })),
                                                ];
                                                setCheckItemsDobras(items);
                                                if (saldoEsp > 0) setAbaterEspDobras(false);
                                                (md as any).saldoEspecial = saldoEsp;
                                                (md as any).saidasFrescas = saidasFrescas;
                                                setModalDobras({ ...md, ...(md as any) });
                                              } catch (e) { console.error('Erro ao buscar saídas:', e); }
                                            } else {
                                              // Desfazer pagamento
                                              setSalvando(true);
                                              try {
                                                const payload = {
                                                  colaboradorId: p.id, mes: mesAno, semana: sem.inicio, unitId,
                                                  pago: false, dataPagamento: null,
                                                  valorBruto: brutoEditado, valorTransporte: transpEditado,
                                                  totalFinal: totalEdit, obs: ed.obs || '',
                                                };
                                                await fetchAuth(`${apiUrl}/folha-pagamento`, {
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
                                        ) : <span style={{ color: '#bbb' }}>-</span>}
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
                                    return <td colSpan={days3.length + 5} />; {/* +2 colunas Val.Dia / Val.Noite */}
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
                                      const transpBase2 = l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte;
                                      return s + (ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : transpBase2);
                                    }, 0))}
                                  </td>
                                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '13px' }}>
                                    {fmtMoeda(gp.reduce((s,l) => {
                                      const ek = `${sem.inicio}_${l.pessoa.id}`;
                                      const ed = editDobras[ek] || {};
                                      const br = ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto;
                                      const transpBase2 = l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte;
                                      const tr = ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : transpBase2;
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
                          const transpBase3 = l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte;
                          return s + (ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : transpBase3);
                        }, 0))}</strong></span>}
                        <span style={{ fontSize: '15px', fontWeight: 'bold' }}>Total: {fmtMoeda(linhas.reduce((s,l) => {
                          const ek = `${sem.inicio}_${l.pessoa.id}`;
                          const ed = editDobras[ek] || {};
                          const br = ed.valorBruto !== undefined ? parseFloat(ed.valorBruto)||0 : l.totalBruto;
                          const transpBase3 = l.pessoa.tipoContrato === 'CLT' ? l.transporteSaldoCLT : l.totalTransporte;
                          const tr = ed.valorTransporte !== undefined ? parseFloat(ed.valorTransporte)||0 : transpBase3;
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

        {/* ── ABA AUDITORIA CLT ─────────────────────────────────── */}
        {aba === 'auditoria-clt' && (
          <div style={{ borderRadius: '0 8px 8px 8px' }}>
            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : folhasLocais.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Nenhum colaborador CLT em {mesAno}.</div>
            ) : (
              <div style={{ ...s.card, overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1565c0' }}>🔍 Auditoria linha a linha — Colaboradores CLT</span>
                  <button onClick={() => setAuditoriaCLTExpandidos(new Set(folhasLocais.map(f => f.colaboradorId)))}
                    style={{ padding: '4px 12px', fontSize: '11px', border: 'none', borderRadius: '4px', backgroundColor: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                    ▼ Expandir Todos
                  </button>
                  {auditoriaCLTExpandidos.size > 0 && (
                    <button onClick={() => setAuditoriaCLTExpandidos(new Set())}
                      style={{ padding: '4px 12px', fontSize: '11px', border: 'none', borderRadius: '4px', backgroundColor: '#757575', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                      ▲ Recolher
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: '#888' }}>{folhasLocais.length} colaborador(es)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: '28px' }}>▶</th>
                      <th style={s.th}>Colaborador</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Cargo</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Sal. Base</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Periculosidade</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>INSS</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>VT Desc.</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Adto (40%)</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Variável</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>💳 Líquido Dia 5</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folhasLocais.flatMap(f => {
                      const exp = auditoriaCLTExpandidos.has(f.colaboradorId);
                      const bgMae = f.pago ? '#f0fdf4' : '#fffde7';
                      const liquidoDia5 = f.pgtosDia05 + (f.variavelDe20a31 || 0);
                      const rows: React.ReactElement[] = [];

                      /* Linha-mãe */
                      rows.push(
                        <tr key={f.colaboradorId} style={{ backgroundColor: bgMae, borderLeft: '3px solid #1976d2', borderBottom: exp ? 'none' : '1px solid #bbdefb' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <button onClick={() => toggleAuditoriaCLT(f.colaboradorId)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1565c0', fontWeight: 'bold', padding: '0 2px' }}>
                              {exp ? '▼' : '▶'}
                            </button>
                          </td>
                          <td style={{ padding: '8px', fontWeight: 'bold', fontSize: '13px' }}>
                            <div>{f.nome}</div>
                            {f.chavePix && <div style={{ fontSize: '10px', color: '#1976d2' }}>📱 {f.chavePix}</div>}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#555' }}>{f.cargo || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(f.salarioBase)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#e65100' }}>
                            {f.periculosidade > 0 ? `+${fmtMoeda(f.periculosidade)}` : '—'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#c62828' }}>−{fmtMoeda(f.inss)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#c62828' }}>
                            {f.valeTransporte > 0 ? `−${fmtMoeda(f.valeTransporte)}` : '—'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#1976d2', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia20)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#43a047' }}>
                            {f.totalVariavel > 0 ? `+${fmtMoeda(f.totalVariavel)}` : '—'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#1b5e20' }}>
                            {fmtMoeda(liquidoDia5)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                              backgroundColor: f.pago ? '#e8f5e9' : '#fff9c4',
                              color: f.pago ? '#2e7d32' : '#f57f17' }}>
                              {f.pago ? '✅ Pago' : '⏳ Pendente'}
                            </span>
                          </td>
                        </tr>
                      );

                      if (!exp) return rows;

                      /* Sub-linhas de auditoria */
                      const itensAudit = [
                        { label: '💰 Salário Base', valor: f.salarioBase, cor: '#1565c0', sinal: '+' },
                        ...(f.periculosidade > 0 ? [{ label: '⚠️ Periculosidade', valor: f.periculosidade, cor: '#e65100', sinal: '+' }] : []),
                        ...((f.feriadosValor || 0) > 0 ? [{ label: `🎉 Feriados trabalhados (${f.feriadosTrab}×)`, valor: f.feriadosValor || 0, cor: '#7b1fa2', sinal: '+' }] : []),
                        { label: '📋 Sal. Contr. INSS (base)', valor: f.salContrInss, cor: '#555', sinal: '=' },
                        { label: '🔴 INSS', valor: f.inss, cor: '#c62828', sinal: '−' },
                        ...(f.valeTransporte > 0 ? [{ label: '🚌 VT Desc. (6% ou VT mensal)', valor: f.valeTransporte, cor: '#c62828', sinal: '−' }] : []),
                        ...(f.contrAssistencial > 0 ? [{ label: '🤝 Contr. Assistencial', valor: f.contrAssistencial, cor: '#c62828', sinal: '−' }] : []),
                        { label: '💸 Adiantamento Dia 20 (40% base)', valor: f.pgtosDia20, cor: '#1976d2', sinal: '⟹' },
                        ...(f.variavelAte19 > 0 ? [{ label: '📈 Variável até dia 19', valor: f.variavelAte19, cor: '#43a047', sinal: '+' }] : []),
                        ...(f.variavelDe20a31 > 0 ? [{ label: '📈 Variável 20-31', valor: f.variavelDe20a31, cor: '#43a047', sinal: '+' }] : []),
                        ...(f.adiantamentoValor > 0 ? [{ label: '💳 Adto salário já pago', valor: f.adiantamentoValor, cor: '#c62828', sinal: '−' }] : []),
                        { label: '✅ Líquido Dia 5 (fechamento)', valor: liquidoDia5, cor: '#1b5e20', sinal: '⟹' },
                      ];
                      for (const item of itensAudit) {
                        rows.push(
                          <tr key={`${f.colaboradorId}_${item.label}`}
                            style={{ backgroundColor: item.sinal === '⟹' ? (item.cor === '#1b5e20' ? '#e8f5e9' : '#e3f2fd') : '#fafafa',
                              borderBottom: '1px dashed #e0e0e0', borderLeft: '6px solid #90caf9' }}>
                            <td colSpan={2} style={{ padding: '5px 8px 5px 28px', fontSize: '11px', color: '#555' }}>
                              ↳ {item.label}
                            </td>
                            <td colSpan={2} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: item.sinal === '⟹' ? 'bold' : 'normal', color: item.cor, fontSize: '12px' }}>
                              {item.sinal !== '=' ? item.sinal : ''} {fmtMoeda(item.valor)}
                            </td>
                            <td colSpan={7} />
                          </tr>
                        );
                      }
                      /* Log de pagamentos */
                      const logs: any[] = Array.isArray(f.logPagamentos) ? f.logPagamentos : [];
                      logs.forEach((log, idx) => {
                        rows.push(
                          <tr key={`${f.colaboradorId}_log_${idx}`}
                            style={{ backgroundColor: '#e3f2fd', borderBottom: '1px dashed #90caf9', borderLeft: '6px solid #1565c0' }}>
                            <td colSpan={2} style={{ padding: '5px 8px 5px 28px', fontSize: '11px', color: '#1565c0' }}>
                              ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>📱 pgto.</span>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>{log.data || '—'}</td>
                            <td style={{ padding: '5px 8px', fontSize: '11px', color: '#1565c0' }}>
                              {log.forma === 'PIX' ? '📱 PIX' : log.forma === 'Dinheiro' ? '💵 Dinheiro' : log.forma || 'PIX'} — {log.tipo || 'Pagamento'}
                              {log.obs && <span style={{ color: '#777', marginLeft: '6px' }}>({log.obs})</span>}
                            </td>
                            <td colSpan={6} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{fmtMoeda(R(log.valor))}</td>
                            <td />
                          </tr>
                        );
                      });
                      /* Linha separadora */
                      rows.push(
                        <tr key={`${f.colaboradorId}_sep`} style={{ backgroundColor: '#1565c0', height: '2px' }}>
                          <td colSpan={11} />
                        </tr>
                      );
                      return rows;
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                      <td colSpan={3} style={{ padding: '10px 8px' }}>TOTAIS CLT ({folhasLocais.length})</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtMoeda(folhasLocais.reduce((s, f) => s + f.salarioBase, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(folhasLocais.reduce((s, f) => s + f.periculosidade, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef9a9a' }}>−{fmtMoeda(folhasLocais.reduce((s, f) => s + f.inss, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef9a9a' }}>−{fmtMoeda(folhasLocais.reduce((s, f) => s + f.valeTransporte, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#90caf9' }}>{fmtMoeda(folhasLocais.reduce((s, f) => s + f.pgtosDia20, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(folhasLocais.reduce((s, f) => s + f.totalVariavel, 0))}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '14px', color: '#a5d6a7' }}>
                        {fmtMoeda(folhasLocais.reduce((s, f) => s + f.pgtosDia05 + (f.variavelDe20a31 || 0), 0))}
                      </td>
                      <td style={{ padding: '10px 8px' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

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
                  <strong>i️ Como funciona o pagamento semanal de freelancers:</strong>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0, lineHeight: '1.8' }}>
                    <li><strong>Transporte calculado</strong>: dias com escala lançada × valor/dia configurado no cadastro. Se o colaborador faltar e a escala for removida, não é contabilizado.</li>
                    <li>
                      <strong>🚗 Adiantamento de Transporte</strong>: se voc\u00ea pagou o transporte antecipado,
                      v\u00e1 em <strong>Sa\u00eddas → Novo Registro</strong>, selecione o colaborador, escolha o tipo
                      <em> "🚗 Adiantamento Transporte"</em> e informe o valor pago. O sistema abate automaticamente
                      esse valor do transporte calculado na semana correspondente e mostra o saldo restante.
                    </li>
                    <li><strong>🔴 Descontos automáticos</strong>: lançamentos tipo <em>"A receber"</em>, <em>"Consumo Interno"</em> e <em>"Desconto Adiantamento Especial"</em> em Saídas são descontados automaticamente do líquido da semana.</li>
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
                          ⏳ Checklist de Pendências - Saídas a Descontar no Próximo Pagamento
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
                                <span style={{ color: '#555' }}>{p.descricao || '-'}</span>
                                <span style={{ color: '#c62828', fontWeight: 'bold' }}>-{fmtMoeda(R(p.valor))}</span>
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
                  const key = fech.dataFechamentoBase;
                  const efRaw = editFechamento[key] || { combustivel: '0', extra: '0', desconto: '0', obs: '' };
                  // Período CUSTOM GLOBAL: oculta os ajustes manuais por semana (irrelevantes)
                  const ef: any = periodoCustomAtivo
                    ? { ...efRaw, dataIniCustom: '', dataFimCustom: '' }
                    : efRaw;
                  const updateEf = (campo: string, val: string) => setEditFechamento(prev => ({
                    ...prev, [key]: { ...(prev[key] || efRaw), [campo]: val }
                  }));
                  const periodoCustomizado = !!(ef.dataIniCustom || ef.dataFimCustom);
                  return (
                    <div key={key} style={{ ...s.card, marginBottom: '16px', borderTop: `3px solid ${periodoCustomizado ? '#7b1fa2' : '#c2185b'}` }}>
                      {/* Cabeçalho da semana */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 6px', color: periodoCustomizado ? '#7b1fa2' : '#c2185b', fontSize: '15px' }}>
                            📅 Semana {fech.semanaLabel}
                            {periodoCustomizado && <span style={{ fontSize: '11px', marginLeft: '8px', backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '1px 6px', borderRadius: '8px' }}>período ajustado</span>}
                          </h4>
                          {/* Ajuste de período (oculto quando período global está ativo) */}
                          {!periodoCustomAtivo && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', color: '#888' }}>Período:</span>
                              <input type="date" value={ef.dataIniCustom || fech.dataInicioBase}
                                onChange={e => updateEf('dataIniCustom', e.target.value)}
                                style={{ padding: '3px 6px', border: `1px solid ${periodoCustomizado ? '#ab47bc' : '#ccc'}`, borderRadius: '4px', fontSize: '12px' }} />
                              <span style={{ fontSize: '12px', color: '#888' }}>até</span>
                              <input type="date" value={ef.dataFimCustom || (fech as any).dataFimEfetivo || fech.dataFechamentoBase}
                                onChange={e => updateEf('dataFimCustom', e.target.value)}
                                style={{ padding: '3px 6px', border: `1px solid ${periodoCustomizado ? '#ab47bc' : '#ccc'}`, borderRadius: '4px', fontSize: '12px' }} />
                              {periodoCustomizado && (
                                <button onClick={() => setEditFechamento(prev => ({
                                  ...prev, [key]: { ...ef, dataIniCustom: '', dataFimCustom: '' }
                                }))}
                                  style={{ padding: '2px 8px', fontSize: '11px', border: 'none', borderRadius: '4px', backgroundColor: '#f3e5f5', color: '#7b1fa2', cursor: 'pointer' }}
                                  title="Restaurar período original">
                                  ↩ restaurar
                                </button>
                              )}
                            </div>
                          )}
                          {periodoCustomAtivo && (
                            <div style={{ fontSize: '12px', color: '#7b1fa2', fontStyle: 'italic' }}>
                              Período: <strong>{periodoIni}</strong> até <strong>{periodoFim}</strong> (definido no filtro global)
                            </div>
                          )}
                        </div>
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
                              {['Freelancer', 'PIX / Tel', 'Dias (código)', 'Dobras', 'Valor/Dobra', 'Total Dobras', 'Transp.', '🪙 Caixinha', 'Desconto', 'Líquido', 'Status', 'Ações'].map(h => (
                                <th key={h} style={s.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fech.freelancers.map((fr, fi) => {
                              // NOVO MODELO: status derivado dos registros granulares por dia/turno
                              // fr.diasJaPagosDetalhe = dias já pagos nesta semana
                              // fr.diasPagos = dias PENDENTES (a pagar)
                              const diasJaPagesSemana = (fr.diasJaPagosDetalhe || []).length;
                              const diasPendentesSemana = (fr.diasPagos || []).length;

                              // Registro legado (semana agrupada) - para forma de pagamento e data
                              // Ignorar registros marcados como migrados (são o modelo antigo substituído)
                              const frFolhaSalva = folhasDB.find((f: any) =>
                                f.colaboradorId === fr.id && f.mes === mesAno && f.semana === fech.dataFechamento
                                && !isMigradoReg(f)
                                && !isEstornadoReg(f)
                              );
                              // Data e forma do pagamento mais recente desta semana
                              const diasNovoModelo = folhasDB.filter((f: any) =>
                                f.colaboradorId === fr.id && f.mes === mesAno &&
                                f.data >= (fr.periodoInicio || fech.dataInicioBase) &&
                                f.data <= (fr.periodoFim || fech.dataFechamento) &&
                                f.pago === true && f.tipo === 'freelancer-dia'
                              ).sort((a: any, b: any) => (b.dataPagamento||'').localeCompare(a.dataPagamento||''));
                              const frDataPgto = diasNovoModelo.length > 0
                                ? diasNovoModelo[0]?.dataPagamento
                                : frFolhaSalva?.dataPagamento;
                              const frForma = diasNovoModelo.length > 0
                                ? diasNovoModelo[0]?.formaPagamento
                                : frFolhaSalva?.formaPagamento;
                              // Composição estruturada do pagamento (campos salvos no backend)
                              const compRegFP = diasNovoModelo.length > 0 ? diasNovoModelo[0] : frFolhaSalva;
                              const compBrutoFP  = parseFloat(compRegFP?.valorBruto)     || 0;
                              const compDescFP   = parseFloat(compRegFP?.valorDescSaidas) || 0;
                              const compAbatFP   = parseFloat(compRegFP?.valorAbatEsp)    || 0;
                              const compLiqFP    = parseFloat(compRegFP?.valorLiquido)    || 0;
                              const temCompFP    = compLiqFP > 0 || compBrutoFP > 0;

                              // Status inteligente
                              const frIsPago = diasJaPagesSemana > 0 || frFolhaSalva?.pago || fr.pago || false;
                              const semDetalheDias = frFolhaSalva?.pago && diasJaPagesSemana === 0 && (frFolhaSalva?.diasPagos?.length || 0) === 0;
                              const pagoParcial = frIsPago && diasPendentesSemana > 0 && diasJaPagesSemana > 0;
                              const pagoCompleto = diasJaPagesSemana > 0 && diasPendentesSemana === 0;
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
                                  {(fr.saldoEspecialAberto || 0) > 0 && (
                                    <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}
                                      title={`Adiantamento especial em aberto: ${fmtMoeda(fr.saldoEspecialAberto)}`}>
                                      🟣 Adto. esp.: {fmtMoeda(fr.saldoEspecialAberto)}
                                    </div>
                                  )}
                                  {(fr.diasJaPagosDetalhe?.length || 0) > 0 && (
                                    <div style={{ fontSize: '10px', color: '#1565c0', marginTop: '2px', fontStyle: 'italic' }}
                                      title={`Já pago: ${fr.diasJaPagosDetalhe.map(d => `${d.data.substring(8)} ${d.turno}`).join(', ')}`}>
                                      ✅ {fr.diasJaPagosDetalhe.length} dia(s) já pago(s): {fmtMoeda(fr.totalJaPago)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px' }}>
                                  {fr.chavePix && <div>💳 {fr.chavePix}</div>}
                                  {fr.telefone && <div>📱 {fr.telefone}</div>}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px', color: '#555', maxWidth: '200px' }}>
                                  {fr.diasCodigo || '-'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>
                                  {(fr as any).totalDobrasExib ?? fr.dobras}
                                  {(fr as any).totalJaPago > 0 && fr.dobras === 0 && (
                                    <div style={{ fontSize: '9px', color: '#1565c0', fontWeight: 'normal' }}>tudo pago</div>
                                  )}
                                  {(fr as any).totalJaPago > 0 && fr.dobras > 0 && (
                                    <div style={{ fontSize: '9px', color: '#888', fontWeight: 'normal' }}>
                                      {fr.dobras} pend.
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right' }}>
                                  {(fr.valorDia > 0 || fr.valorNoite > 0)
                                    ? <><span style={{ color: '#e65100' }}>☀️{fmt(fr.valorDia)}</span><br/><span style={{ color: '#3949ab' }}>🌙{fmt(fr.valorNoite)}</span></>
                                    : <>R$ {fmt(fr.valorDobra)}</>}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#1976d2', fontSize: '13px' }}>
                                  {fmtMoeda((fr as any).totalBrutoPeriodo ?? fr.total)}
                                  {(fr as any).totalJaPago > 0 && (
                                    <div style={{ fontSize: '9px', color: '#2e7d32' }}>✓ {fmtMoeda((fr as any).totalJaPago)} pago</div>
                                  )}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: '11px' }}>
                                  {(() => {
                                    const isMot = (fr as any).isMotoboy;
                                    const totEnt = (fr as any).totalEntregasMotoboy || 0;
                                    const totalExibido = fr.totalTransporte + (isMot ? totEnt : 0);
                                    if (totalExibido <= 0) return '-';
                                    return (
                                      <div>
                                        <div style={{ color: '#1565c0', fontWeight: 'bold' }}
                                             title={isMot && totEnt > 0
                                               ? `Transporte (${fr.diasTrabalhados} dias × R$${fmt(R(fr.valorTransporte))}) + Entregas: R$${fmt(totEnt)}`
                                               : 'Transporte calculado (dias trabalhados × valor/dia)'}>
                                          📦 {fmtMoeda(totalExibido)}
                                        </div>
                                        {isMot && totEnt > 0 && (
                                          <div style={{ color: '#0288d1', fontSize: '10px' }} title="Valor das entregas (já conta no Total Bruto)">
                                            ⚡ entregas: {fmtMoeda(totEnt)}
                                          </div>
                                        )}
                                        {fr.totalTransporte > 0 && (
                                          <div style={{ color: '#666', fontSize: '10px' }} title="Transporte por dia">
                                            🚗 transp.: {fmtMoeda(fr.totalTransporte)}
                                          </div>
                                        )}
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
                                    );
                                  })()}
                                </td>
                                {/* 🪙 Caixinha - crédito a pagar ao colaborador */}
                                <td style={{ ...s.td, textAlign: 'right', color: (fr as any).caixinhaTotal > 0 ? '#f57f17' : '#aaa', fontSize: '12px' }}>
                                  {(fr as any).caixinhaTotal > 0 ? (
                                    <span style={{ color: '#e65100', fontWeight: 'bold' }}
                                      title={((fr as any).caixinhaDetalhe || []).map((d: any) => `${d.descricao}: R$${fmt(d.valor)}`).join(' | ')}>
                                      +{fmtMoeda((fr as any).caixinhaTotal)}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', color: fr.saidasDesconto > 0 ? '#c62828' : '#aaa', fontSize: '12px' }}>
                                  {fr.saidasDesconto > 0 ? (
                                    <span title={fr.saidasDetalhe.map(d => `${d.descricao}: R$${fmt(d.valor)}`).join(' | ')}>
                                      -{fmtMoeda(fr.saidasDesconto)}
                                    </span>
                                  ) : '-'}
                                </td>
                                {/* ── Líquido: valor em destaque + equação (padrão Extrato) ── */}
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', fontSize: '13px' }}>
                                  {frIsPago && temCompFP ? (
                                    <>
                                      {/* valor pago em destaque na cor da forma */}
                                      <div style={{
                                        color: frForma === 'PIX' ? '#1565c0' : frForma === 'Dinheiro' ? '#2e7d32' : '#e65100',
                                        fontSize: '14px', fontWeight: 'bold'
                                      }}>
                                        {frForma === 'PIX' ? '📱 ' : frForma === 'Dinheiro' ? '💵 ' : '🔄 '}{fmtMoeda(compLiqFP)}
                                      </div>
                                      {/* equação resumida em subscript cinza */}
                                      {(compDescFP > 0 || compAbatFP > 0) && (
                                        <div style={{ fontSize: '9px', color: '#888', fontWeight: 'normal', lineHeight: '1.5', marginTop: '2px' }}>
                                          bruto {fmtMoeda(compBrutoFP)}
                                          {compDescFP > 0 && <span style={{ color: '#c62828' }}> −{fmtMoeda(compDescFP)}</span>}
                                          {compAbatFP > 0 && <span style={{ color: '#7b1fa2' }}> −{fmtMoeda(compAbatFP)} adto.</span>}
                                          {' = '}<span style={{ color: '#1b5e20', fontWeight: 'bold' }}>{fmtMoeda(compLiqFP)}</span>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ color: fr.totalLiquido > 0 ? '#1b5e20' : '#888' }}>
                                        {fmtMoeda(fr.totalLiquido)}
                                      </div>
                                      {fr.totalLiquido === 0 && (fr as any).totalJaPago > 0 && (
                                        <div style={{ fontSize: '9px', color: '#2e7d32', fontWeight: 'normal' }}>quitado</div>
                                      )}
                                    </>
                                  )}
                                </td>
                                {/* ── Status: badge simples + data + forma (padrão Extrato) ── */}
                                <td style={{ ...s.td, textAlign: 'center' }}>
                                  {semDetalheDias ? (
                                    <span style={{ ...s.badge('#fff3e0','#e65100'), fontSize:'9px' }} title="Pago mas sem registro analítico de dias. Reabra e repague para corrigir.">⚠️ Pago*</span>
                                  ) : pagoParcial ? (
                                    <span style={{ ...s.badge('#fff9c4','#f57f17'), fontSize:'9px' }} title="Pagamento parcial — ainda há dias pendentes nesta semana">🟡 Parcial</span>
                                  ) : pagoCompleto ? (
                                    <span style={s.badge('#e8f5e9', '#2e7d32')}>✅ Pago</span>
                                  ) : (
                                    <span style={s.badge('#fff9c4', '#f57f17')}>⏳ Pend.</span>
                                  )}
                                  {frIsPago && frDataPgto && (
                                    <div style={{ fontSize: '9px', color: '#555', marginTop: '3px' }}>📅 {frDataPgto}</div>
                                  )}
                                  {frIsPago && frForma && (
                                    <div style={{ marginTop: '3px' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                                        backgroundColor: frForma === 'PIX' ? '#e3f2fd' : frForma === 'Dinheiro' ? '#e8f5e9' : '#fff3e0',
                                        color: frForma === 'PIX' ? '#1565c0' : frForma === 'Dinheiro' ? '#2e7d32' : '#e65100' }}>
                                        {frForma === 'PIX' ? '📱 PIX' : frForma === 'Dinheiro' ? '💵 Din.' : '🔄 Misto'}
                                      </span>
                                    </div>
                                  )}
                                  {semDetalheDias && (
                                    <div style={{ fontSize: '9px', color: '#e65100', marginTop: '2px' }}>* sem detalhe</div>
                                  )}
                                </td>
                                <td style={s.td}>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => {
                                        // Usar o período real (customizado ou original) do fr calculado
                                        const isoIni = fr.periodoInicio || fech.dataInicioBase;
                                        const isoFimDet = fr.periodoFim || fech.dataFechamento;
                                        // Buscar TODAS as escalas do período (pendentes + já pagas)
                                        const escalasSemana = escalas.filter(e =>
                                          e.colaboradorId === fr.id && e.data >= isoIni && e.data <= isoFimDet
                                        );
                                        const saidasSemana = saidasPeriodo.filter((s2: any) => {
                                          const sColabId = s2.colaboradorId || s2.colabId;
                                          if (sColabId !== fr.id) return false;
                                          const sData = s2.dataPagamento || s2.data || '';
                                          return sData >= isoIni && sData <= isoFimDet;
                                        });
                                        setDetalheFreelancer({ fr, semana: fech.semanaLabel, escalas: escalasSemana, saidaItems: saidasSemana });
                                      }}
                                      style={{ ...s.btn('#c2185b'), padding: '3px 8px', fontSize: '11px' }}
                                      title="Ver detalhamento">
                                      📋 Ver
                                    </button>
                                    {/* Botão especial: Reabrir + Pagar (para pagamentos sem detalhe de dias) */}
                                    {semDetalheDias && (
                                      <button
                                        disabled={salvando}
                                        title="Desfaz o pagamento e reabre o modal para pagar com os dias corretos"
                                        onClick={async () => {
                                          if (!window.confirm(`Reabrir pagamento de ${fr.nome} para corrigir os dias? O pagamento atual será desfeito e você poderá repagar com os dias corretos.`)) return;
                                          setSalvando(true);
                                          try {
                                            const payload = { colaboradorId: fr.id, mes: mesAno, semana: fech.dataFechamento, unitId, pago: false, dataPagamento: null, diasPagos: [] };
                                            const resp = await fetchAuth(`${apiUrl}/folha-pagamento`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                              body: JSON.stringify(payload),
                                            });
                                            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                            await carregarDados();
                                            // Abre o modal de pagamento automaticamente
                                            setTimeout(() => setModalFreelancerPgto({ fr, fech }), 300);
                                          } catch (err) { alert('Erro: ' + err); }
                                          finally { setSalvando(false); }
                                        }}
                                        style={{ ...s.btn('#e65100'), padding: '3px 8px', fontSize: '11px' }}
                                      >
                                        🔧 Corrigir
                                      </button>
                                    )}
                                    <button
                                      disabled={salvando}
                                      onClick={async () => {
                                        // Se ainda tem dias pendentes (mesmo que outros já estejam pagos): abre modal de pagamento
                                        if (!frIsPago || pagoParcial) {
                                          setModalFreelancerPgto({ fr, fech });
                                          return;
                                        }
                                        // Desfazer pagamento: marca todos os registros granulares da semana como não pagos
                                        setSalvando(true);
                                        try {
                                          // Dias já pagos nesta semana (novo modelo)
                                          const isoIniDes = fr.periodoInicio || fech.dataInicioBase;
                                          const isoFimDes = fr.periodoFim    || fech.dataFechamento;
                                          const diasJaPagosNovos = folhasDB.filter((f: any) =>
                                            f.colaboradorId === fr.id && f.tipo === 'freelancer-dia' &&
                                            f.data >= isoIniDes && f.data <= isoFimDes && f.pago
                                          );
                                          if (diasJaPagosNovos.length > 0) {
                                            // Desfaz cada registro granular
                                            const payloadDias = {
                                              colaboradorId: fr.id, mes: mesAno, semana: fech.dataFechamento, unitId,
                                              pago: false,
                                              dias: diasJaPagosNovos.map((d: any) => ({ data: d.data, turno: d.turno, valor: d.valor })),
                                            };
                                            const r1 = await fetchAuth(`${apiUrl}/folha-pagamento`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                              body: JSON.stringify(payloadDias),
                                            });
                                            if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
                                          } else {
                                            // Legado: desfaz o registro semanal agrupado
                                            const payloadLeg = {
                                              colaboradorId: fr.id, mes: mesAno,
                                              semana: fech.dataFechamento, unitId,
                                              pago: false, dataPagamento: null, diasPagos: [],
                                            };
                                            const r2 = await fetchAuth(`${apiUrl}/folha-pagamento`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                              body: JSON.stringify(payloadLeg),
                                            });
                                            if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
                                          }
                                          await carregarDados();
                                        } catch (err) { alert('Erro ao desfazer pagamento: ' + err); }
                                        finally { setSalvando(false); }
                                      }}
                                      style={{ ...s.btn(pagoParcial ? '#43a047' : frIsPago ? '#e53935' : '#43a047'), padding: '3px 8px', fontSize: '11px' }}
                                      title={pagoParcial ? 'Pagar dias pendentes desta semana' : frIsPago ? 'Desfazer o pagamento da semana' : 'Pagar esta semana'}
                                    >
                                      {pagoParcial ? '✅ Pagar pend.' : frIsPago ? '↩ Desfazer' : '✅ Pagar'}
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
                                  -{fmtMoeda(fech.totalTransporteAdiantado || 0)}
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
                                {(fech.totalTransporteCalculado||0) > 0
                                  ? <span title={`Total período: ${fmtMoeda(fech.totalTransporteCalculado||0)} | Adiantado: ${fmtMoeda(fech.totalTransporteAdiantado||0)} | Saldo a pagar: ${fmtMoeda(fech.totalTransporte)}`}>
                                      {fmtMoeda(fech.totalTransporteCalculado||0)}{(fech.totalTransporteAdiantado||0) > 0 ? ' *' : ''}
                                    </span>
                                  : '-'}
                              </td>
                              {/* 🪙 Caixinha total da semana (crédito) */}
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ffcc80', fontSize: '11px' }}>
                                {(fech.totalCaixinha || 0) > 0 ? `+${fmtMoeda(fech.totalCaixinha || 0)}` : '-'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ef9a9a' }}>
                                {fech.totalSaidasDesconto > 0 ? `-${fmtMoeda(fech.totalSaidasDesconto)}` : '-'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7', fontWeight: 'bold' }}
                                title={`A pagar: ${fmtMoeda(fech.totalLiquido)} | Total período: ${fmtMoeda(fech.totalSemana + fech.totalTransporte + (fech.totalCaixinha || 0) - fech.totalSaidasDesconto)}`}>
                                {fmtMoeda(fech.totalLiquido)}
                              </td>
                              <td colSpan={2} style={{ padding: '8px' }} />
                            </tr>
                            {fech.totalSaidasDesconto > 0 && (
                              <tr style={{ backgroundColor: '#ffebee' }}>
                                <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#c62828' }} colSpan={12}>
                                  ⚠️ Descontos automáticos de Saídas ("A receber" / "Consumo Interno") incluídos no Líquido. Veja tooltip na coluna Desconto.
                                </td>
                              </tr>
                            )}
                            {(fech.totalCaixinha || 0) > 0 && (
                              <tr style={{ backgroundColor: '#fff8e1' }}>
                                <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#e65100' }} colSpan={12}>
                                  🪙 Caixinha (gorjeta) será paga junto com as dobras da semana. Inclusa no Líquido.
                                </td>
                              </tr>
                            )}
                            {(parseFloat(ef.combustivel || '0') > 0 || parseFloat(ef.extra || '0') > 0 || parseFloat(ef.desconto || '0') > 0) && (
                              <>
                                {parseFloat(ef.combustivel || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#fff3e0' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#e65100' }} colSpan={8}>⛽ Combustível (ajuste manual)</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>-{fmtMoeda(parseFloat(ef.combustivel || '0'))}</td>
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
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>-{fmtMoeda(parseFloat(ef.desconto || '0'))}</td>
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
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                        <th style={{ ...s.th, backgroundColor: '#1565c0', color: 'white' }}>Freelancer</th>
                        <th style={{ ...s.th, backgroundColor: '#1565c0', color: 'white' }}>PIX</th>
                        <th style={{ ...s.th, backgroundColor: '#1565c0', color: 'white', textAlign: 'center' }}>Dobras</th>
                        <th style={{ ...s.th, backgroundColor: '#c62828', color: 'white', textAlign: 'right' }}>Total Dobras</th>
                        <th style={{ ...s.th, backgroundColor: '#1565c0', color: 'white', textAlign: 'right' }}>🚗 Transp.</th>
                        <th style={{ ...s.th, backgroundColor: '#1565c0', color: 'white', textAlign: 'right' }}>🪙 Caixinha</th>
                        <th style={{ ...s.th, backgroundColor: '#c62828', color: 'white', textAlign: 'right' }}>Desconto</th>
                        <th style={{ ...s.th, backgroundColor: '#1b5e20', color: 'white', textAlign: 'right' }}>Líquido Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freelancers.map((fr, fi) => {
                        let totalDobras = 0;
                        let totalBruto = 0;
                        let totalTransp = 0;
                        let totalCaixinha = 0;
                        let totalDesconto = 0;
                        let totalLiquidoMes = 0;
                        for (const fech of fechamentosFreelancer) {
                          const frSem = fech.freelancers.find(x => x.id === fr.id);
                          if (frSem) {
                            // Dobras: total do período (pagas + pendentes)
                            totalDobras    += frSem.totalDobrasExib ?? frSem.dobras;
                            // Bruto: total bruto do período
                            totalBruto     += frSem.totalBrutoPeriodo ?? (frSem.total + (frSem.totalJaPago || 0));
                            // Transporte: bruto calculado do período
                            totalTransp    += frSem.totalTransporte || 0;
                            // Caixinha
                            totalCaixinha  += frSem.caixinhaTotal || 0;
                            // Desconto
                            totalDesconto  += frSem.saidasDesconto || 0;
                            // Líquido: pendente + transporte saldo + caixinha - desconto
                            totalLiquidoMes += frSem.totalLiquido || 0;
                          }
                        }
                        if (totalDobras === 0 && totalBruto === 0) return null;
                        const corLiq = totalLiquidoMes < 0 ? '#c62828' : '#1b5e20';
                        return (
                          <tr key={fr.id} style={{ backgroundColor: fi % 2 === 0 ? '#fafafa' : 'white' }}>
                            <td style={{ ...s.td, fontWeight: 'bold' }}>{fr.nome}</td>
                            <td style={{ ...s.td, fontSize: '11px', color: '#555' }}>{fr.chavePix || '-'}</td>
                            <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>{totalDobras}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>{fmtMoeda(totalBruto)}</td>
                            <td style={{ ...s.td, textAlign: 'right', color: '#1565c0' }}>{totalTransp > 0 ? fmtMoeda(totalTransp) : '-'}</td>
                            <td style={{ ...s.td, textAlign: 'right', color: '#e65100' }}>{totalCaixinha > 0 ? fmtMoeda(totalCaixinha) : '-'}</td>
                            <td style={{ ...s.td, textAlign: 'right', color: '#c62828' }}>{totalDesconto > 0 ? `-${fmtMoeda(totalDesconto)}` : '-'}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: corLiq, fontSize: '13px' }}>{fmtMoeda(totalLiquidoMes)}</td>
                          </tr>
                        );
                      }).filter(Boolean)}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px' }} colSpan={3}>TOTAL FREELANCERS DO MÊS</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ffcdd2' }}>
                          {fmtMoeda(fechamentosFreelancer.reduce((s, f) => s + f.freelancers.reduce((ss, fr) => ss + (fr.totalBrutoPeriodo ?? (fr.total + (fr.totalJaPago||0))), 0), 0))}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#90caf9' }}>
                          {fmtMoeda(fechamentosFreelancer.reduce((s, f) => s + f.freelancers.reduce((ss, fr) => ss + (fr.totalTransporte||0), 0), 0))}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ffcc80' }}>
                          {fmtMoeda(fechamentosFreelancer.reduce((s, f) => s + f.freelancers.reduce((ss, fr) => ss + (fr.caixinhaTotal||0), 0), 0))}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ef9a9a' }}>
                          -{fmtMoeda(fechamentosFreelancer.reduce((s, f) => s + f.freelancers.reduce((ss, fr) => ss + (fr.saidasDesconto||0), 0), 0))}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px', color: '#a5d6a7' }}>{fmtMoeda(totalFreelancerMes)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Footer showLinks={true} />

      {/* ══════ MODAL PAGAMENTO DOBRAS CLT ══════ */}
      {modalDobras && (() => {
        const md = modalDobras as any;
        const vlAbatNum = abaterEspDobras ? (parseFloat(vlAbateDobras) || 0) : 0;
        const saldoEsp = md.saldoEspecial || 0;

        // Engine calcula tudo
        const psDobraResult = montarPayslipDobrasCLT({
          checkItems: checkItemsDobras.map(it => ({ key: it.key, label: it.label, valor: it.valor, tipo: it.tipo as 'credito'|'debito'|'info', checked: it.checked })),
          abatimentoEspecial: vlAbatNum,
          semanaLabel: md.semana.label,
          nome: md.pessoa.nome,
        });
        const totalCred = psDobraResult.bruto;
        const totalDeb = psDobraResult.descontos;
        const liquidoFinal = psDobraResult.liquido;

        const confirmarPagtoDobras = async () => {
          const hoje2 = new Date().toISOString().split('T')[0];
          const dataConfirmada = window.prompt('Data do pagamento (AAAA-MM-DD):', hoje2);
          if (!dataConfirmada) return;
          setSalvando(true);
          try {
            // 1) Salvar folha-pagamento (status pago)
            const payload = {
              colaboradorId: md.pessoa.id, mes: mesAno, semana: md.semana.inicio, unitId,
              pago: true, dataPagamento: dataConfirmada,
              valorBruto: md.bruto, valorTransporte: md.transporte,
              totalFinal: liquidoFinal, obs: md.obs || '',
            };
            await fetchAuth(`${apiUrl}/folha-pagamento`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(payload),
            });

            // 2) Abatimento especial (se habilitado) — busca histórico completo
            if (vlAbatNum > 0) {
              let adtoIdAlvoDobras: string | undefined;
              try {
                const rHistD = await fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&colaboradorId=${md.pessoa.id}`, {headers:{Authorization:`Bearer ${token()}`}});
                if (rHistD.ok) {
                  const todasD = await rHistD.json();
                  adtoIdAlvoDobras = encontrarAdiantamentoIdAlvo(
                    (Array.isArray(todasD)?todasD:[]).map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
                    md.pessoa.id,
                  );
                }
              } catch { /* fallback */ }
              if (!adtoIdAlvoDobras) {
                const saidasFr = md.saidasFrescas || saidasPeriodo;
                adtoIdAlvoDobras = encontrarAdiantamentoIdAlvo(
                  saidasFr.map((ss:any) => ({ id: ss.id, colaboradorId: ss.colaboradorId, tipo: ss.tipo||ss.origem||'', valor: parseFloat(ss.valor)||0, data: ss.data||'', pago: ss.pago, adiantamentoId: ss.adiantamentoId, pagamentoIdLigado: ss.pagamentoIdLigado })),
                  md.pessoa.id,
                );
              }
              await fetchAuth(`${apiUrl}/saidas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                  unitId, colaboradorId: md.pessoa.id,
                  tipo: 'Desconto Adiantamento Especial',
                  descricao: `Abatimento adto. especial - dobras ${md.semana.label}`,
                  valor: vlAbatNum, data: dataConfirmada, dataPagamento: dataConfirmada,
                  pago: true, responsavel: localStorage.getItem('user_email') || '',
                  obs: `Abatido no pagamento de dobras semana ${md.semana.label}`,
                  adiantamentoId: adtoIdAlvoDobras || undefined,
                }),
              });
            }

            // 3) Gerar payslip (via pagamento-batch)
            try {
              await fetchAuth(`${apiUrl}/pagamento-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                  colaboradorId: md.pessoa.id, unitId, mes: mesAno,
                  dataPagamento: dataConfirmada, formaPagamento: 'PIX',
                  operacoes: [{
                    tipo: 'payslip',
                    periodo: `${mesAno}-dobras-${md.semana.inicio}`,
                    periodoInicio: md.semana.inicio,
                    periodoFim: md.semana.fim,
                    bruto: psDobraResult.bruto,
                    transporte: md.transporte,
                    descontos: psDobraResult.descontos,
                    liquido: psDobraResult.liquido,
                    nomeColaborador: md.pessoa.nome,
                    tipoContrato: 'CLT',
                    tipoPagamento: 'dobras',
                    composicao: psDobraResult.composicao,
                  }],
                }),
              });
            } catch (e) { console.error('Erro ao gerar payslip dobras:', e); }

            setModalDobras(null);
            await carregarDados();
          } catch (err) { console.error('Erro salvarPagtoDobras:', err); alert('Erro ao salvar pagamento'); }
          finally { setSalvando(false); }
        };

        return (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'white', borderRadius:'12px', padding:'24px', maxWidth:'520px', width:'95%', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
              <h3 style={{ margin:'0 0 16px', color:'#1565c0' }}>💪 Pagamento Dobras — {md.pessoa.nome}</h3>
              <p style={{ fontSize:'12px', color:'#666', margin:'0 0 12px' }}>Semana {md.semana.label}</p>

              {/* Checklist */}
              {checkItemsDobras.map((it, i) => (
                <div key={it.key} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid #f0f0f0' }}>
                  <input type="checkbox" checked={it.checked}
                    onChange={() => setCheckItemsDobras(prev => prev.map((p2,j) => j===i ? {...p2, checked: !p2.checked} : p2))}
                    style={{ width:'16px', height:'16px', accentColor: it.tipo === 'credito' ? '#43a047' : '#e53935' }} />
                  <span style={{ flex:1, fontSize:'12px', color: it.tipo==='debito' ? '#c62828' : '#1b5e20' }}>{it.label}</span>
                  <span style={{ fontWeight:700, fontSize:'13px', color: it.tipo==='debito' ? '#c62828' : '#2e7d32' }}>
                    {it.tipo==='debito' ? '-' : '+'}{fmtMoeda(it.valor)}
                  </span>
                </div>
              ))}

              {/* Abatimento Especial */}
              {saldoEsp > 0 && (
                <div style={{ marginTop:'12px', padding:'10px', backgroundColor:'#f3e5f5', borderRadius:'6px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <input type="checkbox" checked={abaterEspDobras}
                      onChange={e => { setAbaterEspDobras(e.target.checked); if (!e.target.checked) setVlAbateDobras(''); }}
                      style={{ width:'16px', height:'16px', accentColor:'#7c3aed' }} />
                    <label style={{ fontWeight:700, color:'#5b21b6', fontSize:'13px' }}>➖ Abater Adiantamento Especial</label>
                    <span style={{ marginLeft:'auto', fontSize:'12px', color:'#7c3aed', fontWeight:700 }}>Saldo: {fmtMoeda(saldoEsp)}</span>
                  </div>
                  {abaterEspDobras && (
                    <div style={{ marginTop:'6px' }}>
                      <input type="number" step="0.01" min="0.01" max={saldoEsp}
                        value={vlAbateDobras} placeholder={`máx. ${fmtMoeda(saldoEsp)}`}
                        onChange={e => setVlAbateDobras(e.target.value)}
                        style={{ width:'140px', padding:'4px 8px', border:'1px solid #a78bfa', borderRadius:'4px', fontSize:'12px' }} />
                      <div style={{ fontSize:'11px', color:'#6d28d9', marginTop:'4px' }}>Saldo restante: <strong>{fmtMoeda(Math.max(0, saldoEsp - vlAbatNum))}</strong></div>
                    </div>
                  )}
                </div>
              )}

              {/* Totais */}
              <div style={{ marginTop:'16px', padding:'12px', backgroundColor:'#e8f5e9', borderRadius:'8px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px' }}>
                  <span>🟢 Créditos</span><strong style={{ color:'#2e7d32' }}>{fmtMoeda(totalCred)}</strong>
                </div>
                {totalDeb > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', marginTop:'4px' }}>
                  <span>🔴 Descontos</span><strong style={{ color:'#c62828' }}>-{fmtMoeda(totalDeb)}</strong>
                </div>}
                {vlAbatNum > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', marginTop:'4px' }}>
                  <span>🟪 Abatimento Especial</span><strong style={{ color:'#7c3aed' }}>-{fmtMoeda(vlAbatNum)}</strong>
                </div>}
                <hr style={{ margin:'8px 0', border:'none', borderTop:'1px solid #a5d6a7' }} />
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'16px' }}>
                  <span style={{ fontWeight:700 }}>💰 Líquido a pagar</span>
                  <strong style={{ color:'#1b5e20', fontSize:'18px' }}>{fmtMoeda(liquidoFinal)}</strong>
                </div>
              </div>

              {/* Ações */}
              <div style={{ display:'flex', gap:'10px', marginTop:'16px', justifyContent:'flex-end' }}>
                <button onClick={() => setModalDobras(null)} style={{ ...s.btn('#757575'), padding:'8px 16px' }}>Cancelar</button>
                <button onClick={confirmarPagtoDobras} disabled={salvando || liquidoFinal <= 0}
                  style={{ ...s.btn('#43a047'), padding:'8px 20px', fontWeight:700 }}>
                  {salvando ? 'Salvando...' : `✅ Confirmar PIX ${fmtMoeda(liquidoFinal)}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
