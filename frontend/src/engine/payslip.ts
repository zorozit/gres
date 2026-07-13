/**
 * engine/payslip.ts — Monta payslip a partir dos checkItems do modal
 *
 * REGRA FUNDAMENTAL: o payslip grava EXATAMENTE os valores que o modal mostra.
 * Nenhum recálculo. Os checkItems já contêm os valores corretos do engine.
 *
 * Esta é a ÚNICA função que gera bruto/descontos/liquido/composicao para gravação.
 * FreelancerPagamento.tsx e FolhaPagamento.tsx (aba freelancers) devem importar daqui.
 */

import type { ComposicaoItem } from './types';

/* ══════════════════════════════════════════════════════════════
 *  TIPOS
 * ══════════════════════════════════════════════════════════════ */

/** Item do checklist do modal de pagamento */
export interface CheckItemInput {
  key: string;
  label: string;
  valor: number;
  tipo: 'credito' | 'debito';
  checked: boolean;
  data?: string;
}

/** Linha de detalhe motoboy (controle-motoboy) */
export interface CtrlLinhaDetalhe {
  data: string;
  turno: string;
  chegada: number;
  qtdEntregas: number;
  vlEntrega: number;
  totalEntregas: number;
  vlLinha: number;
  pago: boolean;
}

/** Dia pago (freelancer padrão — escalas) */
export interface DiaPago {
  data: string;
  turno: string;
  valor: number;
}

/** Caixinha com detalhe */
export interface CaixinhaDetalhe {
  descricao: string;
  valor: number;
  data: string;
}

/** Saída com detalhe */
export interface SaidaDetalhe {
  descricao: string;
  valor: number;
  data?: string;
}

export interface MontarPayslipFreelancerInput {
  /** Todos os checkItems do modal (checked ou não — filtramos internamente) */
  checkItems: CheckItemInput[];
  /** Valor do abatimento adiantamento especial (0 se desabilitado) */
  abatimentoEspecial: number;
  /** É motoboy? */
  isMotoboy: boolean;
  /** Linhas de detalhe do controle-motoboy (com chegada + entregas) */
  ctrlLinhasDetalhe?: CtrlLinhaDetalhe[];
  /** Dias pagos (freelancer padrão — escalas) */
  diasPagos?: DiaPago[];
  /** Caixinhas com detalhe */
  caixinhaDetalhe?: CaixinhaDetalhe[];
  /** Saídas (descontos) com detalhe */
  saidasDetalhe?: SaidaDetalhe[];
  /** Saldo de transporte */
  transporteSaldo: number;
  /** Transporte incluído? (checkItem 'transporte' checked) */
  inclTransporte: boolean;
  /** Dias trabalhados (pra label transporte) */
  diasTrabalhados: number;
}

export interface PayslipFreelancerResult {
  bruto: number;
  transporte: number;
  descontos: number;
  liquido: number;
  composicao: ComposicaoItem[];
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

const R2 = (n: number) => parseFloat(n.toFixed(2));

/**
 * Monta os valores do payslip a partir dos checkItems do modal.
 *
 * REGRA: bruto/descontos/liquido são derivados dos checkItems selecionados.
 * Não faz nenhum cálculo independente. O que o modal mostra = o que grava.
 */
export function montarPayslipFreelancer(
  input: MontarPayslipFreelancerInput
): PayslipFreelancerResult {
  const checked = input.checkItems.filter(it => it.checked);
  const creditos = checked.filter(it => it.tipo === 'credito');
  const debitos = checked.filter(it => it.tipo === 'debito');

  // ── Valores finais (derivados dos checkItems, sem recálculo) ──
  const totalCredito = R2(creditos.reduce((s, it) => s + it.valor, 0));
  const totalDebito = R2(debitos.reduce((s, it) => s + it.valor, 0));
  const abat = R2(input.abatimentoEspecial);

  const bruto = totalCredito;
  const descontos = R2(totalDebito + abat);
  const liquido = R2(Math.max(0, bruto - descontos));
  const transporte = input.inclTransporte ? R2(input.transporteSaldo) : 0;

  // ── Composição detalhada ──
  const composicao: ComposicaoItem[] = [];

  // 1) CRÉDITOS
  const ctrlDet = (input.ctrlLinhasDetalhe || []).filter(l => !l.pago);

  if (input.isMotoboy && ctrlDet.length > 0) {
    // Motoboy: cada dia com chegada + entregas
    for (const l of ctrlDet) {
      const dd = l.data.slice(8) + '/' + l.data.slice(5, 7);
      const partes: string[] = [];
      if (l.chegada > 0) partes.push(`chegada R$${l.chegada.toFixed(0)}`);
      if (l.qtdEntregas > 0) partes.push(`${l.qtdEntregas}×R$${l.vlEntrega} entregas`);
      composicao.push({
        descricao: `🏍️ ${dd} (${partes.join(' + ')})`,
        valor: l.vlLinha,
        tipo: 'vencimento',
      });
    }
  } else if (input.diasPagos && input.diasPagos.length > 0) {
    // Freelancer padrão: agrupar por data
    const porData: Record<string, { valor: number; turnos: string[] }> = {};
    for (const dp of input.diasPagos) {
      if (!porData[dp.data]) porData[dp.data] = { valor: 0, turnos: [] };
      porData[dp.data].valor += dp.valor;
      if (dp.turno) porData[dp.data].turnos.push(dp.turno);
    }
    for (const d of Object.keys(porData).sort()) {
      const info = porData[d];
      const dd = d.slice(8) + '/' + d.slice(5, 7);
      const label = info.turnos.length > 1
        ? `Dobra ${dd} (${info.turnos.join(' + ')})`
        : info.turnos.length === 1
          ? `Turno ${dd} (${info.turnos[0]})`
          : `Turno ${dd}`;
      composicao.push({ descricao: label, valor: info.valor, tipo: 'vencimento' });
    }
  } else if (bruto > 0) {
    composicao.push({
      descricao: input.isMotoboy ? 'Entregas + Chegadas' : 'Turnos trabalhados',
      valor: bruto,
      tipo: 'vencimento',
    });
  }

  // 2) TRANSPORTE
  if (transporte > 0) {
    composicao.push({
      descricao: `Transporte (${input.diasTrabalhados} dias)`,
      valor: transporte,
      tipo: 'vencimento',
    });
  }

  // 3) CAIXINHAS (crédito)
  if (input.caixinhaDetalhe && input.caixinhaDetalhe.length > 0) {
    for (const cx of input.caixinhaDetalhe) {
      composicao.push({
        descricao: cx.descricao || 'Caixinha',
        valor: cx.valor,
        tipo: 'variavel',
      });
    }
  }

  // 4) DESCONTOS individuais (saídas)
  if (input.saidasDetalhe && input.saidasDetalhe.length > 0) {
    for (const sd of input.saidasDetalhe) {
      composicao.push({
        descricao: sd.descricao || 'Desconto',
        valor: -sd.valor,
        tipo: 'desconto-operacional',
      });
    }
  }

  // 5) ABATIMENTO ESPECIAL
  if (abat > 0) {
    composicao.push({
      descricao: 'Desconto Adiantamento Especial',
      valor: -abat,
      tipo: 'desconto-operacional',
    });
  }

  // ── VALIDAÇÃO: composição deve bater com valores ──
  const somaComp = R2(composicao.reduce((s, c) => s + c.valor, 0));
  if (Math.abs(somaComp - liquido) > 0.02) {
    console.warn(
      `[engine/payslip] Composição (${somaComp}) ≠ líquido (${liquido}). ` +
      `Bruto=${bruto}, Descontos=${descontos}. Verificar checkItems.`
    );
  }

  return { bruto, transporte, descontos, liquido, composicao };
}
