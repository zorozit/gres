/**
 * engine/folhaFreelancer.ts — Cálculos puros para freelancers
 *
 * FONTE ÚNICA: lógica de cálculo de pagamento freelancer.
 * FreelancerPagamento.tsx e Extrato.tsx importam daqui.
 *
 * Regras implementadas:
 * - Transporte: calculado (dias × valor) - adiantado = saldo
 * - Descontos: filtro por tipos (A pagar, Consumo Interno, Desconto Adto Especial)
 * - Líquido: bruto (turnos) + transporte saldo + caixinhas - descontos
 *
 * Atualizado: 2026-07-07
 */

import type { SaidaCalc, ComposicaoItem } from './types';

/* ── Helper seguro para parse numérico ── */
const R = (v: any): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

/* ══════════════════════════════════════════════════════════════
 *  TRANSPORTE FREELANCER
 * ══════════════════════════════════════════════════════════════ */

export interface TransporteFreelancerInput {
  /** Dias efetivamente trabalhados no período */
  diasTrabalhados: number;
  /** Valor transporte diário (do cadastro do freelancer) */
  valorTransporteDiario: number;
  /** Total de adiantamentos de transporte no mês (saídas tipo "Adiantamento Transporte") */
  adiantamentoTransporteMes: number;
  /** Total de descontos de transporte já consumidos no mês (saídas "Desconto Transporte" pagas) */
  descontoTransporteJaConsumido: number;
}

export interface TransporteFreelancerResult {
  /** Transporte bruto calculado (dias × valor) */
  calculado: number;
  /** Adiantamento disponível (bruto - já consumido) */
  adiantamentoDisponivel: number;
  /** Quanto do adiantamento é abatido neste período */
  adiantamentoAbatido: number;
  /** Saldo de transporte a pagar (calculado - abatido) */
  saldo: number;
}

/**
 * Calcula o transporte de um freelancer para um período.
 *
 * Regra: transporte = dias × valorDiário.
 * Do adiantamento mensal, abate o mínimo entre (adto disponível, transporte calculado).
 * Saldo = transporte - abatimento ≥ 0.
 */
export function calcularTransporteFreelancerPeriodo(
  input: TransporteFreelancerInput
): TransporteFreelancerResult {
  const calculado = input.valorTransporteDiario > 0
    ? parseFloat((input.diasTrabalhados * input.valorTransporteDiario).toFixed(2))
    : 0;

  const adiantamentoDisponivel = Math.max(0, input.adiantamentoTransporteMes - input.descontoTransporteJaConsumido);
  const adiantamentoAbatido = Math.min(adiantamentoDisponivel, calculado);
  const saldo = Math.max(0, parseFloat((calculado - adiantamentoAbatido).toFixed(2)));

  return { calculado, adiantamentoDisponivel, adiantamentoAbatido, saldo };
}

/* ══════════════════════════════════════════════════════════════
 *  DESCONTOS OPERACIONAIS FREELANCER
 * ══════════════════════════════════════════════════════════════ */

/** Tipos de saída que são descontos operacionais do freelancer */
export const TIPOS_DESCONTO_FREELANCER = new Set([
  'A pagar',
  'A receber',
  'Consumo Interno',
  'Desconto Adiantamento Especial',
]);

/** Tipos de saída excluídos do cálculo de desconto (são créditos ou internos) */
export const TIPOS_EXCLUIDOS_DESCONTO_FREELANCER = new Set([
  'Desconto Transporte',
  'Caixinha',
  'Adiantamento Transporte',
  'Adiantamento Especial',
  'Adiantamento Salário',
]);

export interface DescontosFreelancerInput {
  /** Saídas do período (já filtradas por colaborador e range de data) */
  saidas: SaidaCalc[];
}

export interface DescontosFreelancerResult {
  total: number;
  itens: Array<{ descricao: string; valor: number; data: string; pago: boolean }>;
}

/**
 * Calcula descontos operacionais de um freelancer.
 * Filtra saídas pelos tipos válidos de desconto.
 */
export function calcularDescontosFreelancer(
  input: DescontosFreelancerInput
): DescontosFreelancerResult {
  const itens: DescontosFreelancerResult['itens'] = [];
  let total = 0;

  for (const s of input.saidas) {
    const tipo = s.tipo || '';
    if (!TIPOS_DESCONTO_FREELANCER.has(tipo)) continue;

    const valor = R(s.valor);
    total += valor;
    itens.push({
      descricao: tipo,
      valor,
      data: s.data || '',
      pago: s.pago === true,
    });
  }

  return { total: parseFloat(total.toFixed(2)), itens };
}

/* ══════════════════════════════════════════════════════════════
 *  LÍQUIDO FREELANCER
 * ══════════════════════════════════════════════════════════════ */

export interface LiquidoFreelancerInput {
  /** Total bruto dos turnos (dia + noite) */
  totalTurnos: number;
  /** Saldo de transporte a pagar */
  transporteSaldo: number;
  /** Total de caixinhas */
  caixinhaTotal: number;
  /** Total de descontos operacionais */
  descontos: number;
}

/**
 * Calcula o líquido de um freelancer para um período.
 *
 * Líquido = turnos + transporte saldo + caixinhas - descontos
 */
export function calcularLiquidoFreelancer(
  input: LiquidoFreelancerInput
): { liquido: number; bruto: number; composicao: ComposicaoItem[] } {
  const bruto = parseFloat((input.totalTurnos + input.transporteSaldo + input.caixinhaTotal).toFixed(2));
  const liquido = parseFloat(Math.max(0, bruto - input.descontos).toFixed(2));

  const composicao: ComposicaoItem[] = [];
  if (input.totalTurnos > 0) {
    composicao.push({ descricao: 'Turnos trabalhados', valor: input.totalTurnos, tipo: 'vencimento' });
  }
  if (input.transporteSaldo > 0) {
    composicao.push({ descricao: 'Transporte (saldo)', valor: input.transporteSaldo, tipo: 'vencimento' });
  }
  if (input.caixinhaTotal > 0) {
    composicao.push({ descricao: 'Caixinhas', valor: input.caixinhaTotal, tipo: 'variavel' });
  }
  if (input.descontos > 0) {
    composicao.push({ descricao: 'Descontos operacionais', valor: -input.descontos, tipo: 'desconto-operacional' });
  }

  return { liquido, bruto, composicao };
}
