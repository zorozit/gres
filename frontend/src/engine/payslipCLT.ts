/**
 * engine/payslipCLT.ts — Monta payslip CLT a partir dos checkItems do modal
 *
 * REGRA FUNDAMENTAL: o payslip grava EXATAMENTE os valores que o modal mostra.
 * Nenhum recálculo. Os checkItems já contêm os valores corretos do engine.
 *
 * Esta é a ÚNICA função que gera bruto/descontos/liquido/composicao para CLT.
 * FolhaPagamento.tsx (modal CLT e modal dobras) deve importar daqui.
 */

import type { ComposicaoItem } from './types';

/* ══════════════════════════════════════════════════════════════
 *  TIPOS
 * ══════════════════════════════════════════════════════════════ */

export interface CheckItemCLTInput {
  key: string;
  label: string;
  valor: number;
  tipo: 'credito' | 'debito' | 'info';
  checked: boolean;
}

export interface RubricaInput {
  descricao: string;
  referencia?: string;
  codigo?: string;
  vencimento?: number;
  desconto?: number;
}

export interface LogPagamentoInput {
  data: string;
  valor: number;
  forma: string;
  tipo: string;
  obs?: string;
}

export interface SaidaDescInput {
  tipo: string;
  descricao?: string;
  valor: number;
  data?: string;
  id?: string;
  pagamentoIdLigado?: string;
}

export interface MontarPayslipCLTInput {
  /** CheckItems do modal (dia 20 ou dia 5) — usados para liquidoModal */
  checkItems: CheckItemCLTInput[];
  /** Abatimento especial (0 se desabilitado) */
  abatimentoEspecial: number;
  /** Tipo: Adiantamento (dia 20) ou Variável (dia 5) */
  tipoPagamento: 'adiantamento' | 'variavel' | 'dobras';
  /** Rubricas do holerite (quando conferido) */
  rubricas?: RubricaInput[];
  /** Conferido via contabilidade? */
  conferido?: boolean;
  /** Campos do colaborador */
  salarioBase: number;
  periculosidade: number;
  feriadosValor: number;
  inss: number;
  contrAssistencial: number;
  valeTransporte: number;
  /** Variável motoboy */
  variavelAte19: number;
  variavelDe20a31: number;
  /** Saídas operacionais (Consumo Interno, A pagar, A receber) do mês */
  saidasOperacionais: SaidaDescInput[];
  /** Log de pagamentos (PIXs já feitos) */
  logPagamentos: LogPagamentoInput[];
  /** Mes (YYYY-MM) */
  mes: string;
  /** Info do colaborador */
  nome: string;
  cargo?: string;
  cpf?: string;
  chavePix?: string;
}

export interface PayslipCLTResult {
  bruto: number;
  descontos: number;
  liquido: number;
  transporte: number;
  composicao: ComposicaoItem[];
  /** Campos extras para gravar no payslip */
  extra: {
    salarioBase: number;
    periculosidadeValor: number;
    feriadosValor: number;
    inssValor: number;
    contrAssistencial: number;
    valeTransporteValor: number;
  };
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

const R2 = (n: number) => parseFloat(n.toFixed(2));

export function montarPayslipCLT(input: MontarPayslipCLTInput): PayslipCLTResult {
  const composicao: ComposicaoItem[] = [];

  // ── FONTE DE VERDADE: checkItems do modal (o que o usuário viu e confirmou) ──
  // Cada checkItem checked é uma linha do payslip.
  // Isso garante: payslip = exatamente o que foi mostrado no modal.
  const checked = input.checkItems.filter(it => it.checked && it.tipo !== 'info');

  for (const it of checked) {
    if (it.tipo === 'credito') {
      composicao.push({
        descricao: it.label,
        valor: it.valor,
        tipo: 'vencimento',
      });
    } else if (it.tipo === 'debito') {
      composicao.push({
        descricao: it.label,
        valor: -(it.valor),
        tipo: 'desconto-operacional',
      });
    }
  }

  // ── ABATIMENTO ESPECIAL (se habilitado, não vem nos checkItems) ──
  if (input.abatimentoEspecial > 0) {
    composicao.push({
      descricao: 'Desconto Adiantamento Especial',
      valor: -input.abatimentoEspecial,
      tipo: 'desconto-operacional',
    });
  }

  // ── PAGAMENTOS REGISTRADOS (log PIX) ──
  for (const reg of input.logPagamentos) {
    composicao.push({
      descricao: `${reg.forma} — ${reg.tipo}${reg.obs ? ' (' + reg.obs + ')' : ''}`,
      valor: reg.valor,
      tipo: 'adiantamento',
    });
  }

  // ── TOTAIS: derivados da composição ──
  const creditosTotal = R2(
    composicao
      .filter(c => c.valor > 0 && c.tipo !== 'adiantamento')
      .reduce((s, c) => s + c.valor, 0)
  );
  const descontosTotal = R2(
    composicao
      .filter(c => c.valor < 0)
      .reduce((s, c) => s + Math.abs(c.valor), 0)
  );
  const liquido = R2(creditosTotal - descontosTotal);

  return {
    bruto: creditosTotal,
    descontos: descontosTotal,
    liquido,
    transporte: input.valeTransporte,
    composicao,
    extra: {
      salarioBase: input.salarioBase,
      periculosidadeValor: input.periculosidade,
      feriadosValor: input.feriadosValor,
      inssValor: input.inss,
      contrAssistencial: input.contrAssistencial,
      valeTransporteValor: input.valeTransporte,
    },
  };
}

/* ══════════════════════════════════════════════════════════════
 *  DOBRAS CLT — Payslip simplificado
 * ══════════════════════════════════════════════════════════════ */

export interface MontarPayslipDobrasCLTInput {
  checkItems: CheckItemCLTInput[];
  abatimentoEspecial: number;
  semanaLabel: string;
  nome: string;
}

export interface PayslipDobrasCLTResult {
  bruto: number;
  descontos: number;
  liquido: number;
  composicao: ComposicaoItem[];
}

export function montarPayslipDobrasCLT(input: MontarPayslipDobrasCLTInput): PayslipDobrasCLTResult {
  const checked = input.checkItems.filter(it => it.checked);
  const creditos = checked.filter(it => it.tipo === 'credito');
  const debitos = checked.filter(it => it.tipo === 'debito');

  const totalCredito = R2(creditos.reduce((s, it) => s + it.valor, 0));
  const totalDebito = R2(debitos.reduce((s, it) => s + it.valor, 0));
  const abat = R2(input.abatimentoEspecial);

  const bruto = totalCredito;
  const descontos = R2(totalDebito + abat);
  const liquido = R2(Math.max(0, bruto - descontos));

  const composicao: ComposicaoItem[] = [];

  // Créditos
  for (const c of creditos) {
    composicao.push({ descricao: c.label, valor: c.valor, tipo: 'vencimento' });
  }

  // Débitos
  for (const d of debitos) {
    composicao.push({ descricao: d.label, valor: -d.valor, tipo: 'desconto-operacional' });
  }

  // Abatimento
  if (abat > 0) {
    composicao.push({ descricao: 'Desconto Adiantamento Especial', valor: -abat, tipo: 'desconto-operacional' });
  }

  return { bruto, descontos, liquido, composicao };
}
