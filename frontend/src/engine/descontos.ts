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
/**
 * Encontra o adiantamentoId do contrato em aberto mais antigo de um colaborador.
 *
 * Regra: percorre saídas tipo "Adiantamento Especial" ordenadas por data.
 * Para cada uma, calcula saldo = valor - sum(Desconto Adiantamento Especial com mesmo adiantamentoId já pago).
 * Retorna o primeiro com saldo > 0.
 *
 * DEVE SER USADA por todos os fluxos de pagamento que abatam adiantamento especial.
 */
export function encontrarAdiantamentoIdAlvo(
  saidas: SaidaCalc[],
  colaboradorId: string,
  valorAbatimento?: number,
): string | undefined {
  // Adiantamentos Especiais do colaborador, mais antigo primeiro
  const adtosEsp = saidas
    .filter(s => s.colaboradorId === colaboradorId && (s.tipo || '') === 'Adiantamento Especial')
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // Descontos já abatidos (pago=true)
  const descEsp = saidas
    .filter(s => s.colaboradorId === colaboradorId && (s.tipo || '') === 'Desconto Adiantamento Especial' && s.pago);

  // Se valorAbatimento foi passado, preferir contrato com saldo >= valor
  // (evita estourar contrato pequeno quando há outro com saldo suficiente)
  const contratosComSaldo: { cId: string; saldo: number }[] = [];
  for (const ae of adtosEsp) {
    const cId = ae.adiantamentoId || ae.id;
    const totalDesc = descEsp
      .filter(d => d.adiantamentoId === cId)
      .reduce((sum, d) => sum + (d.valor || 0), 0);
    const saldo = parseFloat(((ae.valor || 0) - totalDesc).toFixed(2));
    if (saldo > 0) contratosComSaldo.push({ cId, saldo });
  }

  if (contratosComSaldo.length === 0) return undefined;

  // Se temos valor de abatimento, preferir o mais antigo com saldo suficiente
  if (valorAbatimento && valorAbatimento > 0) {
    const suficiente = contratosComSaldo.find(c => c.saldo >= valorAbatimento);
    if (suficiente) return suficiente.cId;
  }

  // Fallback: mais antigo com qualquer saldo > 0
  return contratosComSaldo[0].cId;
}

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
