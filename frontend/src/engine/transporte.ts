/**
 * engine/transporte.ts — Lógica de transporte (adiantamento e compensação)
 *
 * FONTE ÚNICA: cálculo de transporte adiantado, saldo, e compensação.
 *
 * Regras:
 * - Freelancers: transporte = dias únicos trabalhados × valorTransporte
 * - CLT Motoboy: adiantamento transporte semanal (4×R$200 por exemplo)
 *   é adiantamento do variável motoboy, compensado no pagamento final
 * - CLT não-motoboy: VT = min(6% salBase, vtDiário × 22)
 *   descontado no holerite (desconto legal)
 *
 * IMPORTANTE (decisão Eric 2026-07-06):
 *   Adiantamento de transporte para motoboy CLT deve ser COMPENSADO
 *   no variável motoboy, não tratado como linha separada de "total pago".
 *
 * Atualizado: 2026-07-06
 */

import type { SaidaCalc, ComposicaoItem } from './types';

/* ── Freelancer: transporte por dia trabalhado ── */

export interface TransporteFreelancerInput {
  /** Datas únicas trabalhadas no período */
  diasTrabalhados: string[];
  /** Valor do transporte diário (do cadastro do colaborador) */
  valorTransporteDiario: number;
  /** Saídas de "Adiantamento Transporte" já adiantadas no período */
  adiantamentosTransporte: SaidaCalc[];
}

export interface TransporteFreelancerResult {
  /** Transporte bruto (dias × valor) */
  bruto: number;
  /** Total já adiantado */
  adiantado: number;
  /** Saldo a pagar (bruto - adiantado, mín 0) */
  saldo: number;
  composicao: ComposicaoItem[];
}

export function calcularTransporteFreelancer(
  input: TransporteFreelancerInput
): TransporteFreelancerResult {
  const bruto = parseFloat(
    (input.diasTrabalhados.length * input.valorTransporteDiario).toFixed(2)
  );
  const adiantado = input.adiantamentosTransporte.reduce(
    (s, a) => s + (a.valor || 0), 0
  );
  const saldo = parseFloat(Math.max(0, bruto - adiantado).toFixed(2));

  const composicao: ComposicaoItem[] = [];
  if (bruto > 0) {
    composicao.push({
      descricao: `Transporte (${input.diasTrabalhados.length} dias × R$${input.valorTransporteDiario.toFixed(2)})`,
      valor: bruto,
      tipo: 'vencimento',
    });
  }
  if (adiantado > 0) {
    composicao.push({
      descricao: `(-) Transporte já adiantado`,
      valor: -adiantado,
      tipo: 'compensacao',
    });
  }

  return { bruto, adiantado, saldo, composicao };
}

/* ── CLT não-motoboy: Vale Transporte (desconto legal no holerite) ── */

export interface VTDescCLTInput {
  salarioBase: number;
  valorTransporteDiario: number;
  diasUteisRef?: number;       // padrão 22
}

export interface VTDescCLTResult {
  /** Desconto VT efetivo = min(6% salBase, vtDiário × 22) */
  desconto: number;
  /** VT mensal (vtDiário × 22) */
  vtMensal: number;
  /** 6% do salário base */
  vt6pct: number;
}

/**
 * Calcula desconto de VT para CLT (não-motoboy).
 * Regra: desconto = min(6% salBase, valorTransporteDiário × 22)
 * Se valorTransporteDiário = 0, desconto = 0.
 */
export function calcularVTDescCLT(input: VTDescCLTInput): VTDescCLTResult {
  const dias = input.diasUteisRef ?? 22;
  const vtMensal = parseFloat((input.valorTransporteDiario * dias).toFixed(2));
  const vt6pct = parseFloat((input.salarioBase * 0.06).toFixed(2));
  const desconto = vtMensal > 0
    ? parseFloat(Math.min(vt6pct, vtMensal).toFixed(2))
    : 0;
  return { desconto, vtMensal, vt6pct };
}

/* ── CLT Motoboy: compensação transporte no variável ── */

export interface TransporteMotoboyCLTInput {
  /** Saídas de "Adiantamento Transporte" do motoboy no período */
  adiantamentos: SaidaCalc[];
}

export interface TransporteMotoboyCLTResult {
  /** Total adiantado (soma dos adiantamentos) */
  totalAdiantado: number;
  /** Composição para o demonstrativo */
  composicao: ComposicaoItem[];
}

/**
 * Calcula o total de adiantamentos de transporte de um motoboy CLT.
 * Esse valor deve ser COMPENSADO (subtraído) do variável bruto.
 */
export function calcularTransporteMotoboyCLT(
  input: TransporteMotoboyCLTInput
): TransporteMotoboyCLTResult {
  const totalAdiantado = input.adiantamentos.reduce(
    (s, a) => s + (a.valor || 0), 0
  );
  const composicao: ComposicaoItem[] = [];
  if (totalAdiantado > 0) {
    composicao.push({
      descricao: `(-) Adiantamento Transporte (${input.adiantamentos.length}×)`,
      valor: -totalAdiantado,
      tipo: 'compensacao',
    });
  }
  return { totalAdiantado, composicao };
}
