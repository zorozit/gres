/**
 * engine/ferias.ts — Cálculo de Férias CLT
 *
 * Regras:
 * - Direito por faltas (CLT art. 130): 0-5=30d, 6-14=24d, 15-23=18d, 24-32=12d, >32=0d
 * - Diário = base / 30
 * - Férias = diário × dias gozo (rateado por competência quando cruza mês)
 * - 1/3 constitucional = férias / 3
 * - Abono pecuniário: até 1/3 do direito; sem INSS/IRRF
 * - INSS progressivo sobre (férias + 1/3), apurado por competência
 * - IRRF tabela 2026 sobre (férias + 1/3 − INSS); férias são isentas de IRRF conforme lei
 * - FGTS: 8% sobre (férias + 1/3), informativo
 * - Modo 'contabil': aceita valores manuais, não recalcula
 *
 * Atualizado: 2026-10-05
 */

import { calcINSS } from './inss';

/* ══════════════════════════════════════════════════════════════
 *  TIPOS DE ENTRADA
 * ══════════════════════════════════════════════════════════════ */

export interface FeriasInput {
  /** Salário base contratual */
  salarioBase: number;
  /** Remuneração variável média (médias de gorjetas/comissões) */
  variavelMedio?: number;
  /** Período aquisitivo início (YYYY-MM-DD) */
  periodoAquisitivoInicio: string;
  /** Período aquisitivo fim (YYYY-MM-DD) */
  periodoAquisitivoFim: string;
  /** Início do gozo (YYYY-MM-DD) */
  periodoGozoInicio: string;
  /** Fim do gozo (YYYY-MM-DD) */
  periodoGozoFim: string;
  /** Dias de abono pecuniário (0–10, default 0) */
  diasAbono?: number;
  /** Faltas no período aquisitivo (default 0) */
  faltas?: number;
  /**
   * 'simulacao' → cálculo automático completo
   * 'contabil'  → aceita valores manuais (competencias com valores editados)
   */
  modo: 'simulacao' | 'contabil';
  /** Valores manuais por competência (apenas modo 'contabil') */
  competenciasContabil?: FeriasCompetenciaContabil[];
}

/** Valores manuais informados pela contabilidade (modo contabil) */
export interface FeriasCompetenciaContabil {
  /** Mês no formato YYYY-MM */
  mes: string;
  /** Dias de férias nessa competência */
  diasFerias: number;
  /** Valor bruto das férias (cód 43) */
  valorFerias: number;
  /** Valor do 1/3 (cód 50) */
  valorTercoProporcional: number;
  /** Desconto INSS (cód 45) */
  valorInss: number;
  /** Desconto IRRF (se houver) */
  valorIrrf?: number;
}

/* ══════════════════════════════════════════════════════════════
 *  TIPOS DE SAÍDA
 * ══════════════════════════════════════════════════════════════ */

/** Resultado por competência (pode haver 1 ou 2 quando cruza meses) */
export interface FeriasCompetencia {
  /** Mês (YYYY-MM) */
  mes: string;
  /** Dias de férias nessa competência */
  diasFerias: number;
  /** Valor das férias = diário × diasFerias */
  valorFerias: number;
  /** 1/3 constitucional = valorFerias / 3 */
  valorTerco: number;
  /** Valor do abono pecuniário (apenas na competência de início) */
  valorAbono: number;
  /** Base de cálculo INSS (férias + 1/3, sem abono) */
  baseInss: number;
  /** Desconto INSS */
  valorInss: number;
  /** Base IRRF (baseInss − INSS) */
  baseIrrf: number;
  /** Desconto IRRF */
  valorIrrf: number;
  /** FGTS informativo (8% sobre férias+1/3) */
  valorFgts: number;
  /** Total vencimentos (férias + 1/3 + abono) */
  totalVencimentos: number;
  /** Total descontos (INSS + IRRF) */
  totalDescontos: number;
  /** Líquido da competência */
  liquido: number;
  /** Fonte dos valores */
  fonte: 'calculado' | 'contabil';
}

export interface FeriasResult {
  /** Dias de direito conforme faltas */
  diasDireito: number;
  /** Dias efetivos de gozo */
  diasGozo: number;
  /** Dias de abono pecuniário */
  diasAbono: number;
  /** Remuneração base (salário + variável) */
  remuneracaoBase: number;
  /** Valor diário = base / 30 */
  valorDiario: number;
  /** Competências (1 ou 2) */
  competencias: FeriasCompetencia[];
  /** Totais consolidados */
  totais: {
    bruto: number;
    descontos: number;
    liquido: number;
    fgts: number;
  };
}

/* ══════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════ */

const R2 = (n: number) => parseFloat(n.toFixed(2));

/** Tabela IRRF 2026 */
const TABELA_IRRF_2026 = [
  { ate: 2428.80,  aliq: 0,     deducao: 0      },
  { ate: 2826.65,  aliq: 0.075, deducao: 182.16 },
  { ate: 3751.05,  aliq: 0.15,  deducao: 394.16 },
  { ate: 4664.68,  aliq: 0.225, deducao: 675.49 },
  { ate: Infinity, aliq: 0.275, deducao: 908.73 },
];

function calcIRRF(baseCalculo: number): number {
  if (baseCalculo <= 0) return 0;
  for (const faixa of TABELA_IRRF_2026) {
    if (baseCalculo <= faixa.ate) {
      const irrf = baseCalculo * faixa.aliq - faixa.deducao;
      return R2(Math.max(0, irrf));
    }
  }
  return 0;
}

/**
 * Retorna dias de direito a férias conforme art. 130 CLT:
 * 0-5 faltas = 30 dias, 6-14 = 24, 15-23 = 18, 24-32 = 12, >32 = 0
 */
export function calcDiasDireito(faltas: number): number {
  if (faltas <= 5)  return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/**
 * Dado início e fim do gozo, distribui os dias por competência (mês).
 * Retorna array de { mes: 'YYYY-MM', dias: number }.
 */
function distribuirDiasPorMes(inicio: string, fim: string): Array<{ mes: string; dias: number }> {
  const result: Array<{ mes: string; dias: number }> = [];
  const dtInicio = new Date(inicio + 'T12:00:00');
  const dtFim    = new Date(fim   + 'T12:00:00');

  // Percorre dia a dia
  const mapa: Record<string, number> = {};
  const cur = new Date(dtInicio);
  while (cur <= dtFim) {
    const mes = cur.toISOString().slice(0, 7);
    mapa[mes] = (mapa[mes] || 0) + 1;
    cur.setDate(cur.getDate() + 1);
  }

  for (const [mes, dias] of Object.entries(mapa).sort()) {
    result.push({ mes, dias });
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

export function calcularFerias(input: FeriasInput): FeriasResult {
  const faltas      = input.faltas ?? 0;
  const diasAbono   = Math.min(input.diasAbono ?? 0, 10);
  const diasDireito = calcDiasDireito(faltas);

  const remuneracaoBase = R2((input.salarioBase || 0) + (input.variavelMedio || 0));
  const valorDiario     = R2(remuneracaoBase / 30);

  // Dias de gozo: diferença inclusiva entre início e fim
  const dtInicio = new Date(input.periodoGozoInicio + 'T12:00:00');
  const dtFim    = new Date(input.periodoGozoFim    + 'T12:00:00');
  const diasGozo = Math.round((dtFim.getTime() - dtInicio.getTime()) / 86400000) + 1;

  // Distribuição por competência
  const distribuicao = distribuirDiasPorMes(input.periodoGozoInicio, input.periodoGozoFim);

  // ── MODO CONTÁBIL: usa valores manuais ──────────────────────────────────
  if (input.modo === 'contabil' && input.competenciasContabil && input.competenciasContabil.length > 0) {
    const competencias: FeriasCompetencia[] = input.competenciasContabil.map(c => {
      const totalVenc = R2(c.valorFerias + c.valorTercoProporcional);
      const totalDesc = R2((c.valorInss || 0) + (c.valorIrrf || 0));
      return {
        mes: c.mes,
        diasFerias: c.diasFerias,
        valorFerias: c.valorFerias,
        valorTerco: c.valorTercoProporcional,
        valorAbono: 0,
        baseInss: R2(c.valorFerias + c.valorTercoProporcional),
        valorInss: c.valorInss || 0,
        baseIrrf: R2(c.valorFerias + c.valorTercoProporcional - (c.valorInss || 0)),
        valorIrrf: c.valorIrrf || 0,
        valorFgts: R2((c.valorFerias + c.valorTercoProporcional) * 0.08),
        totalVencimentos: totalVenc,
        totalDescontos: totalDesc,
        liquido: R2(totalVenc - totalDesc),
        fonte: 'contabil' as const,
      };
    });

    // Abono: calculado sobre o modo contábil (não editável, informativo)
    const valorAbono = diasAbono > 0 ? R2(valorDiario * diasAbono) : 0;

    const bruto     = R2(competencias.reduce((s, c) => s + c.totalVencimentos, 0) + valorAbono);
    const descontos = R2(competencias.reduce((s, c) => s + c.totalDescontos, 0));
    const liquido   = R2(bruto - descontos);
    const fgts      = R2(competencias.reduce((s, c) => s + c.valorFgts, 0));

    return { diasDireito, diasGozo, diasAbono, remuneracaoBase, valorDiario, competencias, totais: { bruto, descontos, liquido, fgts } };
  }

  // ── MODO SIMULAÇÃO: cálculo automático ─────────────────────────────────
  let abonoAlocado = false;
  const competencias: FeriasCompetencia[] = distribuicao.map((dist, idx) => {
    const vFerias = R2(valorDiario * dist.dias);
    const vTerco  = R2(vFerias / 3);

    // Abono pecuniário: alocado integralmente na primeira competência
    const vAbono = (!abonoAlocado && diasAbono > 0)
      ? R2(valorDiario * diasAbono)
      : 0;
    if (diasAbono > 0 && idx === 0) abonoAlocado = true;

    // INSS incide sobre (férias + 1/3), sem abono
    const baseInss = R2(vFerias + vTerco);
    const vInss    = calcINSS(baseInss);

    // IRRF sobre (férias + 1/3 − INSS)
    // Nota: férias são isentas de IRRF (MP 905/2019 revogada; regra atual: isento até 2428,80)
    const baseIrrf = R2(baseInss - vInss);
    const vIrrf    = calcIRRF(baseIrrf);

    // FGTS informativo
    const vFgts = R2(baseInss * 0.08);

    const totalVenc = R2(vFerias + vTerco + vAbono);
    const totalDesc = R2(vInss + vIrrf);

    return {
      mes: dist.mes,
      diasFerias: dist.dias,
      valorFerias: vFerias,
      valorTerco: vTerco,
      valorAbono: vAbono,
      baseInss,
      valorInss: vInss,
      baseIrrf,
      valorIrrf: vIrrf,
      valorFgts: vFgts,
      totalVencimentos: totalVenc,
      totalDescontos: totalDesc,
      liquido: R2(totalVenc - totalDesc),
      fonte: 'calculado' as const,
    };
  });

  const bruto     = R2(competencias.reduce((s, c) => s + c.totalVencimentos, 0));
  const descontos = R2(competencias.reduce((s, c) => s + c.totalDescontos, 0));
  const liquido   = R2(bruto - descontos);
  const fgts      = R2(competencias.reduce((s, c) => s + c.valorFgts, 0));

  return { diasDireito, diasGozo, diasAbono, remuneracaoBase, valorDiario, competencias, totais: { bruto, descontos, liquido, fgts } };
}
