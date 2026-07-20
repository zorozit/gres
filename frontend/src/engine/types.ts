/**
 * engine/types.ts — Tipos compartilhados do motor de cálculo GRES
 *
 * REGRA: Todas as interfaces de entrada/saída dos cálculos vivem aqui.
 * Módulos (FolhaPagamento, FreelancerPagamento, Extrato) importam daqui.
 *
 * Atualizado: 2026-07-06
 */

/* ══════════════════════════════════════════════════════════════
 *  PRIMITIVAS — usadas em múltiplos cálculos
 * ══════════════════════════════════════════════════════════════ */

/** Item de composição — linha num demonstrativo de pagamento */
export interface ComposicaoItem {
  descricao: string;
  valor: number;              // positivo = vencimento, negativo = desconto
  data?: string;              // data ISO opcional (para detalhe por dia)
  tipo:
    | 'vencimento'            // salário, periculosidade, feriado
    | 'desconto-legal'        // INSS, contr.assistencial, VT, adiantamento anterior, faltas
    | 'variavel'              // entregas motoboy, caixinhas
    | 'adiantamento'          // adiantamento dia 20, transporte semanal
    | 'compensacao'           // compensação de adiantamento (transporte, dia 20)
    | 'desconto-operacional'  // consumo interno, a pagar, desconto adiantamento especial
    | 'arredondamento';       // arredondamentos contábeis
  referencia?: string;        // ex: "30,00", "9,00" (vindo do holerite)
  codigo?: string;            // código da rubrica (ex: "1", "11", "1311")
}

/** Rubrica do holerite (importada do PDF da contabilidade) */
export interface RubricaHolerite {
  codigo: string;
  descricao: string;
  referencia: string;
  vencimento: number;
  desconto: number;
}

/** Registro de pagamento no log (append-only) */
export interface LogPagamento {
  id: string;
  data: string;               // ISO date
  valor: number;
  tipo: string;               // 'Adiantamento', 'Variável', 'Folha Dia 5', etc.
  forma: string;              // 'PIX', 'Dinheiro', etc.
  responsavel?: string;
}

/** Saída (gres-prod-saidas) — simplificada para cálculos */
export interface SaidaCalc {
  id: string;
  colaboradorId: string;
  tipo: string;               // 'Consumo Interno', 'A pagar', 'Caixinha', etc.
  origem?: string;
  valor: number;
  data: string;
  dataPagamento?: string;
  pago?: boolean;
  pagamentoIdLigado?: string;
  adiantamentoId?: string;
  referencia?: string;
  descricao?: string;
  obs?: string;
}

/** Dados salvos da folha no DynamoDB (gres-prod-folha-pagamento) */
export interface FolhaSalvaDB {
  id: string;
  colaboradorId: string;
  mes: string;
  semana?: string;
  tipo?: string;
  pago?: boolean;
  pagoAdiantamento?: boolean;
  pagoVariavel?: boolean;
  dataPagamento?: string;
  dataPgtoAdiantamento?: string;
  dataPgtoVariavel?: string;
  conferido?: boolean;
  valorLiquidoContabil?: number;
  salContrInss?: number;
  inssValor?: number;
  valeTransporteContabil?: number;
  feriado?: number;
  rubricas?: RubricaHolerite[];
  totalVencimentos?: number;
  totalDescontos?: number;
  logPagamentos?: LogPagamento[];
  formaPagamento?: string;
  saldoFinal?: number;
  valorBruto?: number;
  // turnos freelancer
  data?: string;
  turno?: string;
  valor?: number;
  pagamentoId?: string;
  pagamentoData?: string;
  tipoCodigo?: string;
  diasPagos?: Array<{ data: string; turno: string; valor: number }>;
}

/** Semana de fechamento */
export interface SemanaFechamento {
  inicio: Date;
  fim: Date;
}

/** Controle de entregas motoboy por dia */
export interface ControleDiaMotoboy {
  data: string;
  entDia: number;
  entNoite: number;
  caixinhaDia: number;
  caixinhaNoite: number;
  chegDia?: number;
  chegNoite?: number;
}

/* ══════════════════════════════════════════════════════════════
 *  RESULTADO — CLT
 * ══════════════════════════════════════════════════════════════ */

export interface HoleriteResult {
  fonte: 'contabil' | 'calculado';
  bruto: number;
  descontos: number;
  liquido: number;
  /** Composição detalhada do holerite (vencimentos + descontos) */
  composicao: ComposicaoItem[];
  /** Rubricas originais do PDF (quando conferido via contabilidade) */
  rubricas?: RubricaHolerite[];
}

export interface VariavelMotoboyResult {
  bruto: number;
  compensacaoTransporte: number;
  liquido: number;
  entregas: number;
  caixinhas: number;
  composicao: ComposicaoItem[];
}

export interface DescontosOperacionaisResult {
  total: number;
  itens: ComposicaoItem[];
}

export interface FolhaCLTResult {
  colaboradorId: string;
  nome: string;

  /** Holerite (salário CLT) */
  holerite: HoleriteResult;

  /** Variável motoboy (se aplicável) */
  variavel?: VariavelMotoboyResult;

  /** Descontos operacionais (consumo interno, a pagar, etc.) */
  descontosOperacionais: DescontosOperacionaisResult;

  /** Adiantamentos */
  adiantamento: {
    dia20: number;           // 40% salário base
    transporteTotal: number; // soma dos adiantamentos de transporte
  };

  /** Totais */
  liquidoMes: number;        // holerite.liquido + variavel.liquido - descontos
  jaPago: number;            // soma dos logPagamentos
  saldoAPagar: number;       // liquidoMes - jaPago

  /** Composição completa (para gravar no payslip) */
  composicaoCompleta: ComposicaoItem[];
}

/* ══════════════════════════════════════════════════════════════
 *  RESULTADO — FREELANCER
 * ══════════════════════════════════════════════════════════════ */

export interface FreelancerFechamentoResult {
  colaboradorId: string;
  nome: string;
  semanaLabel: string;

  bruto: number;              // soma dobras × valor
  transporte: number;         // transporte da semana
  transporteAdiantado: number;
  transporteSaldo: number;    // transporte - adiantado (mín 0)
  caixinhas: number;
  descontos: number;          // saídas debitadas
  liquido: number;            // bruto + transporteSaldo + caixinhas - descontos

  composicao: ComposicaoItem[];

  pago: boolean;
  pagoParcial: boolean;
}
