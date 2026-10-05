/**
 * engine/payslipFerias.ts — Monta payslip de Férias CLT por competência
 *
 * REGRA FUNDAMENTAL: grava EXATAMENTE os valores confirmados no modal.
 * Compatível com RubricaInput de payslipCLT.ts.
 *
 * Códigos de rubrica usados pela contabilidade:
 *   43 = Férias
 *   50 = 1/3 Férias
 *   45 = INSS Férias (desconto)
 *   (IRRF = sem código padrão definido, usar 46)
 *
 * Atualizado: 2026-10-05
 */

import type { ComposicaoItem } from './types';
import type { FeriasCompetencia } from './ferias';

/* ══════════════════════════════════════════════════════════════
 *  TIPOS
 * ══════════════════════════════════════════════════════════════ */

export interface RubricaFeriasItem {
  codigo: string;
  descricao: string;
  referencia?: string;
  vencimento?: number;
  desconto?: number;
}

export interface MontarPayslipFeriasInput {
  /** Competências calculadas (1 ou 2) */
  competencias: FeriasCompetencia[];
  /** Nome do colaborador */
  nome: string;
  /** CPF (opcional) */
  cpf?: string;
  /** Chave PIX (opcional) */
  chavePix?: string;
  /** Período de gozo (label exibido no payslip) */
  periodoGozo: string;
  /** Período aquisitivo (label exibido) */
  periodoAquisitivo: string;
  /** Data do pagamento (YYYY-MM-DD) */
  dataPagamento: string;
  /** Forma de pagamento */
  formaPagamento: string;
  /** Dias de abono pecuniário */
  diasAbono: number;
  /** Incluir abono como vencimento? */
  comAbono?: boolean;
}

export interface PayslipFeriasCompetencia {
  /** Mês (YYYY-MM) */
  mes: string;
  /** Dias de férias nessa competência */
  diasFerias: number;
  /** Rubricas compatíveis com holerite */
  rubricas: RubricaFeriasItem[];
  /** Composição detalhada */
  composicao: ComposicaoItem[];
  /** Totais da competência */
  bruto: number;
  descontos: number;
  liquido: number;
}

export interface PayslipFeriasResult {
  /** Competências individuais */
  competencias: PayslipFeriasCompetencia[];
  /** Totais consolidados */
  bruto: number;
  descontos: number;
  liquido: number;
  /** Composição completa (todas as competências juntas) */
  composicaoCompleta: ComposicaoItem[];
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

const R2 = (n: number) => parseFloat(n.toFixed(2));

export function montarPayslipFerias(input: MontarPayslipFeriasInput): PayslipFeriasResult {
  const competencias: PayslipFeriasCompetencia[] = [];
  let totalBruto = 0;
  let totalDescontos = 0;

  for (const comp of input.competencias) {
    const rubricas: RubricaFeriasItem[] = [];
    const composicao: ComposicaoItem[] = [];

    // Férias (cód 43) — referência = dias
    if (comp.valorFerias > 0) {
      rubricas.push({
        codigo: '43',
        descricao: 'Férias',
        referencia: String(comp.diasFerias),
        vencimento: comp.valorFerias,
      });
      composicao.push({
        descricao: `Férias (${comp.diasFerias} dias)`,
        valor: comp.valorFerias,
        tipo: 'vencimento',
        codigo: '43',
        referencia: String(comp.diasFerias),
      });
    }

    // 1/3 Férias (cód 50)
    if (comp.valorTerco > 0) {
      rubricas.push({
        codigo: '50',
        descricao: '1/3 Férias',
        vencimento: comp.valorTerco,
      });
      composicao.push({
        descricao: '1/3 Férias',
        valor: comp.valorTerco,
        tipo: 'vencimento',
        codigo: '50',
      });
    }

    // Abono pecuniário (sem desconto de INSS/IRRF)
    if (comp.valorAbono > 0) {
      rubricas.push({
        codigo: '44',
        descricao: 'Abono Pecuniário',
        referencia: String(input.diasAbono),
        vencimento: comp.valorAbono,
      });
      composicao.push({
        descricao: `Abono Pecuniário (${input.diasAbono} dias)`,
        valor: comp.valorAbono,
        tipo: 'vencimento',
        codigo: '44',
        referencia: String(input.diasAbono),
      });
    }

    // INSS Férias (cód 45) — desconto
    if (comp.valorInss > 0) {
      rubricas.push({
        codigo: '45',
        descricao: 'INSS Férias',
        desconto: comp.valorInss,
      });
      composicao.push({
        descricao: 'INSS Férias',
        valor: -comp.valorInss,
        tipo: 'desconto-legal',
        codigo: '45',
      });
    }

    // IRRF Férias (cód 46) — desconto (quando houver)
    if (comp.valorIrrf > 0) {
      rubricas.push({
        codigo: '46',
        descricao: 'IRRF Férias',
        desconto: comp.valorIrrf,
      });
      composicao.push({
        descricao: 'IRRF Férias',
        valor: -comp.valorIrrf,
        tipo: 'desconto-legal',
        codigo: '46',
      });
    }

    const compBruto     = R2(comp.totalVencimentos);
    const compDescontos = R2(comp.totalDescontos);
    const compLiquido   = R2(compBruto - compDescontos);

    competencias.push({
      mes: comp.mes,
      diasFerias: comp.diasFerias,
      rubricas,
      composicao,
      bruto: compBruto,
      descontos: compDescontos,
      liquido: compLiquido,
    });

    totalBruto     += compBruto;
    totalDescontos += compDescontos;
  }

  totalBruto     = R2(totalBruto);
  totalDescontos = R2(totalDescontos);

  // Composição completa (todas as competências)
  const composicaoCompleta: ComposicaoItem[] = competencias.flatMap(c => c.composicao);

  return {
    competencias,
    bruto: totalBruto,
    descontos: totalDescontos,
    liquido: R2(totalBruto - totalDescontos),
    composicaoCompleta,
  };
}
