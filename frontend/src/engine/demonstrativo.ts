/**
 * engine/demonstrativo.ts — Monta o demonstrativo completo de pagamento
 *
 * FONTE ÚNICA: composição final para exibir no modal analítico e gravar no payslip.
 *
 * Junta:
 *   - Holerite (engine/folhaCLT.ts)
 *   - Variável Motoboy (engine/motoboy.ts) — se aplicável
 *   - Compensação Transporte (engine/transporte.ts) — se motoboy
 *   - Descontos Operacionais (engine/descontos.ts)
 *   - Pagamentos já realizados (logPagamentos)
 *
 * Resultado é um demonstrativo read-only que pode ser exibido por qualquer módulo.
 *
 * Atualizado: 2026-07-06
 */

import type {
  ComposicaoItem, LogPagamento,
  HoleriteResult, DescontosOperacionaisResult,
} from './types';
import type { MotoboyVariavelResult } from './motoboy';
import type { TransporteMotoboyCLTResult } from './transporte';

/* ── Helper ── */
// helpers disponíveis se necessário no futuro
// const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ══════════════════════════════════════════════════════════════
 *  INPUT / OUTPUT
 * ══════════════════════════════════════════════════════════════ */

export interface DemonstrativoInput {
  colaboradorId: string;
  nome: string;
  competencia: string;          // "YYYY-MM"

  holerite: HoleriteResult;

  /** Variável motoboy (undefined se não é motoboy) */
  variavel?: MotoboyVariavelResult;

  /** Compensação de transporte motoboy (undefined se não é motoboy) */
  compensacaoTransporte?: TransporteMotoboyCLTResult;

  /** Descontos operacionais */
  descontos: DescontosOperacionaisResult;

  /** Adiantamentos já pagos (dia 20, transporte semanal) */
  adiantamentos: {
    dia20: number;
    transporte: number;
  };

  /** Log de pagamentos já realizados */
  logPagamentos: LogPagamento[];

  /** Saldo de adiantamento especial em aberto */
  saldoEspecialAberto: number;
}

export interface DemonstrativoResult {
  /** Composição completa (todas as linhas, para gravar no payslip) */
  composicao: ComposicaoItem[];

  /** Totais */
  totalRemuneracao: number;     // holerite.liquido + variavel.liquido (se motoboy)
  totalDescontos: number;       // descontos operacionais
  liquidoMes: number;           // remuneração - descontos

  /** Pagamentos */
  totalJaPago: number;          // soma dos logPagamentos
  saldoAPagar: number;          // liquidoMes - totalJaPago
  quitado: boolean;             // saldo ≈ 0

  /** Seções para renderização (opcional, facilita UI) */
  secoes: DemonstrativoSecao[];
}

export interface DemonstrativoSecao {
  titulo: string;
  icone: string;
  itens: ComposicaoItem[];
  subtotal?: number;
  subtotalLabel?: string;
}

/* ══════════════════════════════════════════════════════════════
 *  MONTAR DEMONSTRATIVO
 * ══════════════════════════════════════════════════════════════ */

/**
 * Monta o demonstrativo completo de um colaborador CLT.
 *
 * Pode ser usado por:
 *   - Extrato.tsx (modal analítico)
 *   - FolhaPagamento.tsx (modal de pagamento)
 *   - Payslip (gravação)
 */
export function montarDemonstrativo(input: DemonstrativoInput): DemonstrativoResult {
  const composicao: ComposicaoItem[] = [];
  const secoes: DemonstrativoSecao[] = [];

  // ── Seção 1: Holerite ──
  const secaoHolerite: DemonstrativoSecao = {
    titulo: 'HOLERITE — SALÁRIO',
    icone: '💼',
    itens: [...input.holerite.composicao],
    subtotal: input.holerite.liquido,
    subtotalLabel: `Líquido Holerite${input.holerite.fonte === 'contabil' ? ' ✅ Conferido' : ''}`,
  };
  secoes.push(secaoHolerite);
  composicao.push(...input.holerite.composicao);

  let totalRemuneracao = input.holerite.liquido;

  // ── Seção 2: Variável Motoboy (se aplicável) ──
  if (input.variavel) {
    const itensVariavel = [...input.variavel.composicao];

    // Compensação de transporte no variável
    if (input.compensacaoTransporte && input.compensacaoTransporte.totalAdiantado > 0) {
      itensVariavel.push(...input.compensacaoTransporte.composicao);
    }

    const secaoVariavel: DemonstrativoSecao = {
      titulo: 'VARIÁVEL MOTOBOY — CORRIDAS',
      icone: '🏍️',
      itens: itensVariavel,
      subtotal: input.variavel.totalMesAtual - (input.compensacaoTransporte?.totalAdiantado || 0),
      subtotalLabel: 'Total Variável',
    };
    secoes.push(secaoVariavel);
    composicao.push(...itensVariavel);

    const compTransp = input.compensacaoTransporte?.totalAdiantado || 0;
    totalRemuneracao += input.variavel.totalMesAtual - compTransp;
  }

  // ── Seção 3: Descontos Operacionais ──
  if (input.descontos.total > 0) {
    const secaoDescontos: DemonstrativoSecao = {
      titulo: 'DESCONTOS OPERACIONAIS',
      icone: '🔴',
      itens: input.descontos.itens,
      subtotal: -input.descontos.total,
      subtotalLabel: 'Total Descontos',
    };
    secoes.push(secaoDescontos);
    composicao.push(...input.descontos.itens);
  }

  const totalDescontos = input.descontos.total;
  const liquidoMes = parseFloat((totalRemuneracao - totalDescontos).toFixed(2));

  // ── Seção 4: Pagamentos realizados ──
  const totalJaPago = input.logPagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const saldoAPagar = parseFloat((liquidoMes - totalJaPago).toFixed(2));
  const quitado = Math.abs(saldoAPagar) < 1; // tolerância de R$1

  if (input.logPagamentos.length > 0) {
    const itensPgtos: ComposicaoItem[] = input.logPagamentos.map(p => ({
      descricao: `${p.tipo} — ${p.forma} (${p.data})`,
      valor: p.valor,
      tipo: 'adiantamento' as const,
    }));
    const secaoPgtos: DemonstrativoSecao = {
      titulo: 'PAGAMENTOS REALIZADOS',
      icone: '✅',
      itens: itensPgtos,
      subtotal: totalJaPago,
      subtotalLabel: 'Total Pago',
    };
    secoes.push(secaoPgtos);
  }

  return {
    composicao,
    totalRemuneracao,
    totalDescontos,
    liquidoMes,
    totalJaPago,
    saldoAPagar,
    quitado,
    secoes,
  };
}
