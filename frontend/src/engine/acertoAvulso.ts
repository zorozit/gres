/**
 * engine/acertoAvulso.ts — Cálculo puro para Acertos Avulsos
 *
 * Usado pelo módulo Simulador Colaboradores (SimuladorColaboradores.tsx).
 * Agrega créditos + débitos + abatimento especial = líquido.
 *
 * Não decide o que entra na lista — isso é responsabilidade da UI.
 * Aqui só agregamos valores já selecionados.
 *
 * Atualizado: 2026-10-05
 */

import type { ComposicaoItem } from './types';

const R2 = (n: number) => parseFloat(n.toFixed(2));

/* ══════════════════════════════════════════════════════════════
 *  TIPOS
 * ══════════════════════════════════════════════════════════════ */

export type TipoItemAcerto =
  | 'dobra'               // dobras/diárias (do histórico ou manual)
  | 'caixinha'            // caixinha/gorjeta
  | 'transporte'          // transporte
  | 'verba-livre'         // 13º, férias prop, bonificação, etc.
  | 'pendencia-periodo'   // consumo interno, a receber (do período)
  | 'pendencia-anterior'  // mesmas, mas de antes do período
  | 'debito-livre'        // débito manual qualquer
  | 'abat-especial';      // abatimento adto especial

export interface ItemAcerto {
  /** key única (para React e marcar processadas) */
  key: string;
  /** Tipo do item (determina ordem e cor na UI) */
  tipo: TipoItemAcerto;
  /** Rótulo humano */
  label: string;
  /** Valor absoluto (sempre positivo) */
  valor: number;
  /** Data ISO opcional */
  data?: string;
  /** ID da saída de origem (quando aplicável) */
  saidaId?: string;
  /** Natureza: credito (soma) ou debito (subtrai) */
  natureza: 'credito' | 'debito';
  /** Marcado para incluir? */
  checked: boolean;
}

export interface CalcularAcertoInput {
  itens: ItemAcerto[];
}

export interface CalcularAcertoResult {
  totalCreditos: number;
  totalDebitos: number;
  liquido: number;
  composicao: ComposicaoItem[];
  /** IDs de saídas que precisam ser marcadas como processadas */
  saidasParaMarcar: string[];
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

export function calcularAcerto(input: CalcularAcertoInput): CalcularAcertoResult {
  const checked = input.itens.filter(it => it.checked);

  const composicao: ComposicaoItem[] = [];
  const saidasParaMarcar: string[] = [];

  let totalCreditos = 0;
  let totalDebitos = 0;

  for (const it of checked) {
    const tipoComp: ComposicaoItem['tipo'] =
      it.natureza === 'credito'
        ? (it.tipo === 'caixinha' ? 'variavel' : 'vencimento')
        : (it.tipo === 'abat-especial' ? 'desconto-operacional' : 'desconto-operacional');

    composicao.push({
      descricao: it.label,
      valor: it.natureza === 'credito' ? it.valor : -it.valor,
      tipo: tipoComp,
      ...(it.data ? { data: it.data } : {}),
    });

    if (it.natureza === 'credito') totalCreditos += it.valor;
    else totalDebitos += it.valor;

    if (it.saidaId && it.natureza === 'debito') {
      saidasParaMarcar.push(it.saidaId);
    }
  }

  totalCreditos = R2(totalCreditos);
  totalDebitos  = R2(totalDebitos);
  const liquido = R2(totalCreditos - totalDebitos);

  return {
    totalCreditos,
    totalDebitos,
    liquido,
    composicao,
    saidasParaMarcar,
  };
}

/* ══════════════════════════════════════════════════════════════
 *  HELPERS DE MONTAGEM — usados pela UI pra construir itens
 * ══════════════════════════════════════════════════════════════ */

/** Formata data YYYY-MM-DD → DD/MM */
function fmtData(iso: string): string {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Monta item de dobra a partir de uma escala/dia trabalhado */
export function itemDobra(key: string, data: string, descricao: string, valor: number): ItemAcerto {
  return {
    key,
    tipo: 'dobra',
    label: `💪 ${descricao} (${fmtData(data)})`,
    valor,
    data,
    natureza: 'credito',
    checked: true,
  };
}

/** Monta item de caixinha */
export function itemCaixinha(key: string, data: string, valor: number, obs?: string, saidaId?: string): ItemAcerto {
  return {
    key,
    tipo: 'caixinha',
    label: `🪙 Caixinha ${obs ? `(${obs}) ` : ''}(${fmtData(data)})`,
    valor,
    data,
    saidaId,
    natureza: 'credito',
    checked: true,
  };
}

/** Monta item de transporte agregado */
export function itemTransporte(key: string, dias: number, valorPorDia: number): ItemAcerto {
  return {
    key,
    tipo: 'transporte',
    label: `🚗 Transporte (${dias} dias × R$ ${valorPorDia.toFixed(2)})`,
    valor: R2(dias * valorPorDia),
    natureza: 'credito',
    checked: true,
  };
}

/** Monta item de verba livre (créditos extras: 13º prop, férias prop, etc.) */
export function itemVerbaLivre(key: string, descricao: string, valor: number): ItemAcerto {
  return {
    key,
    tipo: 'verba-livre',
    label: `➕ ${descricao}`,
    valor,
    natureza: 'credito',
    checked: true,
  };
}

/** Monta item de pendência (do período ou anterior) */
export function itemPendencia(
  key: string,
  saidaId: string,
  tipo: string,
  descricao: string,
  valor: number,
  data: string,
  periodo: 'periodo' | 'anterior',
): ItemAcerto {
  const prefix = periodo === 'anterior' ? '⏳ Pend. anterior:' : '🔴';
  const check  = periodo === 'periodo'; // período: default marcado; anterior: default desmarcado
  return {
    key,
    tipo: periodo === 'anterior' ? 'pendencia-anterior' : 'pendencia-periodo',
    label: `${prefix} ${tipo}: ${descricao} (${fmtData(data)})`,
    valor,
    data,
    saidaId,
    natureza: 'debito',
    checked: check,
  };
}

/** Monta item de débito livre */
export function itemDebitoLivre(key: string, descricao: string, valor: number): ItemAcerto {
  return {
    key,
    tipo: 'debito-livre',
    label: `➖ ${descricao}`,
    valor,
    natureza: 'debito',
    checked: true,
  };
}

/** Monta item de abatimento especial */
export function itemAbatimentoEspecial(valor: number): ItemAcerto {
  return {
    key: 'abat-esp',
    tipo: 'abat-especial',
    label: `🏦 Abatimento Adiantamento Especial`,
    valor,
    natureza: 'debito',
    checked: true,
  };
}
