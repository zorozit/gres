/**
 * engine/descontos.ts — Lógica de descontos operacionais (saídas)
 *
 * FONTE ÚNICA: regras de quais saídas geram desconto no pagamento.
 *
 * Tipos que geram desconto: "Consumo Interno", "A pagar", "A receber",
 *   "Desconto Adiantamento Especial"
 *
 * Tipos excluídos do cálculo de desconto:
 *   "Desconto Transporte" (tratado separadamente no engine/transporte.ts)
 *   "Caixinha" (é crédito, não desconto)
 *   "Adiantamento Transporte" (é adiantamento, não desconto direto)
 *   "Adiantamento Especial" (é empréstimo, abatido via checkbox)
 *   "Adiantamento Salário" (já descontado no holerite)
 *   "Reembolso Compras" (é crédito)
 *
 * CRITÉRIO IMPORTANTE:
 *   `pagamentoIdLigado` indica que a saída JÁ foi processada num batch.
 *   `pago=true` sozinho NÃO significa processada — Consumo Interno e A pagar
 *   nascem com pago=true e são descontos válidos.
 *
 * Atualizado: 2026-07-06
 */

import type { SaidaCalc, ComposicaoItem } from './types';

/** Tipos de saída que são EXCLUÍDOS da lista de descontos operacionais */
export const TIPOS_EXCLUIDOS_DESCONTO = new Set([
  'Desconto Transporte',
  'Desconto Adiantamento Especial',
  'Caixinha',
  'Adiantamento Transporte',
  'Adiantamento Especial',
  'Adiantamento Salário',
  'Reembolso Compras',
]);

/** Tipos de saída que são tratados como CRÉDITO (somam ao pagamento) */
export const TIPOS_CREDITO = new Set([
  'Caixinha',
  'Reembolso Compras',
]);

export interface DescontosInput {
  /** Saídas do período do colaborador */
  saidas: SaidaCalc[];
  /** Colaborador ID */
  colaboradorId: string;
  /** Data início do período (ISO) */
  dataInicio: string;
  /** Data fim do período (ISO) */
  dataFim: string;
}

export interface DescontosResult {
  /** Total de descontos operacionais (valor positivo = desconta) */
  total: number;
  /** Total de créditos (caixinhas, reembolsos) */
  totalCreditos: number;
  /** Itens de desconto individuais */
  descontos: ComposicaoItem[];
  /** Itens de crédito individuais */
  creditos: ComposicaoItem[];
  /** Saídas que participaram do cálculo (para marcar como processadas) */
  saidasProcessadas: string[];
}

/**
 * Calcula os descontos operacionais a partir das saídas de um colaborador.
 *
 * Filtra saídas por:
 * - colaboradorId
 * - período (dataInicio/dataFim)
 * - tipo (exclui TIPOS_EXCLUIDOS_DESCONTO)
 * - NÃO tenha pagamentoIdLigado (já processada em batch anterior)
 */
export function calcularDescontos(input: DescontosInput): DescontosResult {
  const { saidas, colaboradorId, dataInicio, dataFim } = input;

  const descontos: ComposicaoItem[] = [];
  const creditos: ComposicaoItem[] = [];
  const saidasProcessadas: string[] = [];

  for (const s of saidas) {
    // Filtrar por colaborador
    if (s.colaboradorId !== colaboradorId) continue;

    // Filtrar por data
    const dataSaida = s.dataPagamento || s.data || '';
    if (dataSaida < dataInicio || dataSaida > dataFim) continue;

    // Pular saídas já processadas num batch anterior
    if (s.pagamentoIdLigado) continue;

    const tipo = s.tipo || s.origem || '';

    // Pular tipos excluídos
    if (TIPOS_EXCLUIDOS_DESCONTO.has(tipo)) continue;

    // Classificar como crédito ou desconto
    if (TIPOS_CREDITO.has(tipo)) {
      creditos.push({
        descricao: `${tipo}${s.referencia ? ` (${s.referencia})` : ''}`,
        valor: s.valor,
        tipo: 'vencimento',
      });
    } else {
      descontos.push({
        descricao: `${tipo}${s.referencia ? ` (${s.referencia})` : ''}`,
        valor: -Math.abs(s.valor),
        tipo: 'desconto-operacional',
      });
    }
    saidasProcessadas.push(s.id);
  }

  return {
    total: descontos.reduce((s, d) => s + Math.abs(d.valor), 0),
    totalCreditos: creditos.reduce((s, c) => s + c.valor, 0),
    descontos,
    creditos,
    saidasProcessadas,
  };
}
