/**
 * engine/folhaCLT.ts — Cálculo da folha CLT (não-motoboy e motoboy CLT)
 *
 * FONTE ÚNICA: toda lógica de cálculo CLT está aqui.
 * FolhaPagamento.tsx, Extrato.tsx e qualquer outro módulo importam daqui.
 *
 * Regras implementadas:
 * - Salário base + periculosidade + feriados trabalhados
 * - INSS progressivo (via engine/inss.ts)
 * - Contribuição Assistencial (do cadastro ou fallback 32.62 para motoboys)
 * - Vale Transporte: min(6% salBase, vtDiário × 22)
 * - Adiantamento dia 20 = 40% do salário BASE (sem periculosidade)
 * - Override contábil: quando conferido=true, usa valorLiquidoContabil e rubricas do holerite
 * - Arredondamentos contábeis (Cód.16 e Cód.19)
 *
 * Atualizado: 2026-07-06
 */

import { calcINSS } from './inss';
import { calcularVTDescCLT } from './transporte';
import type {
  ComposicaoItem, RubricaHolerite, FolhaSalvaDB,
  HoleriteResult,
} from './types';

/* ── Helper seguro para parse numérico ── */
const R = (v: any): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

/* ══════════════════════════════════════════════════════════════
 *  INPUT / OUTPUT
 * ══════════════════════════════════════════════════════════════ */

export interface ColaboradorCLTInput {
  id: string;
  nome: string;
  cpf?: string;
  chavePix?: string;
  cargo?: string;
  salario: number;
  /** Periculosidade em % (ex: 30 = 30%) */
  periculosidade: number;
  /** Contribuição Assistencial mensal (R$). Default 0, motoboy fallback 32.62 */
  contribuicaoAssistencial: number;
  /** Valor transporte diário (R$) */
  valorTransporte: number;
  isMotoboy: boolean;
}

export interface FolhaCLTInput {
  colaborador: ColaboradorCLTInput;
  mesAno: string;                        // "YYYY-MM"
  /** Feriados trabalhados no mês (contados de escalas com presença confirmada) */
  feriadosTrab: number;
  /** Dados salvos no DynamoDB (se existir) */
  folhaSalva?: FolhaSalvaDB | null;
}

export interface FolhaCLTCalcResult {
  /** Valores do holerite */
  holerite: HoleriteResult;

  /** Campos individuais (compatibilidade com FolhaMensal existente) */
  salarioBase: number;
  periculosidadeValor: number;
  feriadosValor: number;
  salContrInss: number;
  inss: number;
  contrAssistencial: number;
  valeTransporte: number;

  /** Adiantamento dia 20 */
  adiantamentoValor: number;
  adtoContabil: number;
  adtoLiquido: number;
  arredondamentoPos: number;
  arredondamentoNeg: number;

  /** Diferença salarial (60% + peri + feriados) */
  diferencaSalario: number;

  /** Pgto dia 5 (líquido contábil ou cálculo interno) */
  pgtosDia05: number;
  /** Saldo final */
  saldoFinal: number;

  /** Fonte */
  conferido: boolean;
  fonteContabil: boolean;
  valorLiquidoContabil: number;
}

/* ══════════════════════════════════════════════════════════════
 *  CÁLCULO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

/**
 * Calcula a folha CLT de um colaborador (não-motoboy ou motoboy).
 * Retorna todos os valores necessários para grid, modal e demonstrativo.
 *
 * Quando `folhaSalva.conferido === true`:
 *   - Usa `valorLiquidoContabil` como líquido do holerite
 *   - Usa rubricas importadas do PDF para composição
 *   - INSS/VT/ContrAssist vêm do registro salvo (importação contábil)
 *
 * Quando não conferido:
 *   - Calcula tudo internamente (salário, faixas INSS, VT 6%, etc.)
 */
export function calcularFolhaCLT(input: FolhaCLTInput): FolhaCLTCalcResult {
  const { colaborador: c, feriadosTrab, folhaSalva: salva } = input;

  const salBase = R(c.salario);
  const peri = R(c.periculosidade) / 100;

  // Feriado trabalhado = salário/30 por dia
  const salDiaCLT = salBase / 30;
  const feriadosValor = parseFloat((feriadosTrab * salDiaCLT).toFixed(2));

  // Sal.Contr.INSS = truncado no inteiro (padrão contabilidade)
  const salContrInssCalc = Math.floor(salBase * (1 + peri) + feriadosValor);
  const inssCalc = calcINSS(salContrInssCalc);

  // Contribuição Assistencial
  const contrAssistCalc = R(c.contribuicaoAssistencial) || (c.isMotoboy ? 32.62 : 0);

  // Vale Transporte
  const vtResult = calcularVTDescCLT({
    salarioBase: salBase,
    valorTransporteDiario: R(c.valorTransporte),
  });
  const valeTransporteCalc = vtResult.desconto;

  // Adiantamento = 40% do SALÁRIO BASE (sem periculosidade) — padrão contabilidade
  const adiantValor = parseFloat((salBase * 0.40).toFixed(2));

  // Arredondamentos contábeis (Cód.16 = 40% base, arredondado para inteiro)
  const adtoContabil = parseFloat((salBase * 0.40).toFixed(2));
  const adtoLiquido = Math.floor(adtoContabil);
  const arredPos = parseFloat(
    (adtoLiquido + 1 - adtoContabil > 0 && adtoContabil % 1 !== 0
      ? adtoLiquido + 1 - adtoContabil : 0
    ).toFixed(2)
  );
  const arredNeg = parseFloat(
    (adtoContabil - adtoLiquido > 0
      ? adtoContabil - adtoLiquido : 0
    ).toFixed(2)
  );

  // Diferença = 60% salBase + periculosidade + feriados
  const periBruto = salBase * peri;
  const difSal = parseFloat((salBase * (1 - 0.40) + periBruto + feriadosValor).toFixed(2));

  // ── Override contábil ──
  const temContab = salva?.conferido === true && salva?.valorLiquidoContabil != null;
  const liquidoContab = temContab ? R(salva!.valorLiquidoContabil) : 0;

  // Valores efetivos (contábil quando conferido, calculado quando não)
  const inss = temContab ? (R(salva!.inssValor) || inssCalc) : inssCalc;
  const salContrInss = temContab ? (R(salva!.salContrInss) || salContrInssCalc) : salContrInssCalc;
  const valeTransporte = temContab ? (R(salva!.valeTransporteContabil) || valeTransporteCalc) : valeTransporteCalc;
  const contrAssist = contrAssistCalc;

  // Saldo final (cálculo interno)
  const saldoFinalCalc = difSal - inss - contrAssist - valeTransporte;

  // Pgto dia 5: contábil = líquido do holerite, calculado = difSal - descontos legais
  const pgtosDia05 = temContab ? liquidoContab : parseFloat(Math.max(0, saldoFinalCalc).toFixed(2));
  const saldoFinal = temContab ? liquidoContab : parseFloat(saldoFinalCalc.toFixed(2));

  // ── Montar holerite result ──
  const holerite = montarHolerite({
    temContab,
    salBase,
    periBruto,
    feriadosValor,
    inss,
    contrAssist,
    valeTransporte,
    liquidoContab,
    saldoFinalCalc,
    rubricas: salva?.rubricas,
  });

  return {
    holerite,
    salarioBase: salBase,
    periculosidadeValor: periBruto,
    feriadosValor,
    salContrInss,
    inss,
    contrAssistencial: contrAssist,
    valeTransporte,
    adiantamentoValor: adiantValor,
    adtoContabil,
    adtoLiquido,
    arredondamentoPos: arredPos,
    arredondamentoNeg: arredNeg,
    diferencaSalario: temContab
      ? (liquidoContab + inss + contrAssist + valeTransporte)
      : difSal,
    pgtosDia05,
    saldoFinal,
    conferido: !!temContab,
    fonteContabil: !!temContab,
    valorLiquidoContabil: liquidoContab,
  };
}

/* ══════════════════════════════════════════════════════════════
 *  CHECKLIST CLT (modal de pagamento)
 * ══════════════════════════════════════════════════════════════ */

export interface CheckItemCLT {
  key: string;
  label: string;
  valor: number;
  tipo: 'credito' | 'debito' | 'info';
  checked: boolean;
}

export interface SaidaParaChecklist {
  tipo: string;
  descricao?: string;
  valor: number;
  data?: string;
  pagamentoIdLigado?: string;
}

/** Campos mínimos do calc que montarChecklistCLT precisa */
export interface CalcParaChecklist {
  adtoLiquido: number;
  salarioBase: number;
  /** periculosidadeValor (R$) — aceita nome do engine ou do grid */
  periculosidadeValor?: number;
  periculosidade?: number;
  feriadosValor?: number;
  diferencaSalario: number;
  inss: number;
  contrAssistencial: number;
  valeTransporte: number;
  fonteContabil?: boolean;
  valorLiquidoContabil?: number;
  conferido?: boolean;
  adiantamentoValor?: number;
}

export interface MontarChecklistCLTInput {
  /** Campos calculados (do engine ou do grid FolhaMensal) */
  calc: CalcParaChecklist;
  /** Tipo: Adiantamento (dia 20) ou Variável (dia 5) */
  tipoPagamento: 'Adiantamento' | 'Variável';
  /** Variável motoboy até dia 19 */
  variavelAte19: number;
  /** Variável motoboy 20-31 */
  variavelDe20a31: number;
  /** Saídas do colaborador no mês */
  saidasColaborador: SaidaParaChecklist[];
}

/**
 * Monta checklist para o modal de pagamento CLT.
 * TODAS as regras de quais itens exibir e com qual valor estão aqui.
 * O componente só renderiza — não decide valores nem lógica.
 */
export function montarChecklistCLT(input: MontarChecklistCLTInput): CheckItemCLT[] {
  const { calc, tipoPagamento, variavelAte19, variavelDe20a31, saidasColaborador } = input;
  // Compatibilidade: grid usa 'periculosidade' (R$), engine usa 'periculosidadeValor' (R$)
  const periValor = calc.periculosidadeValor ?? calc.periculosidade ?? 0;

  // --- Saídas processadas ---
  const TIPOS_DESC = ['A pagar', 'A receber', 'Consumo Interno', 'Desconto Adiantamento Especial'];
  const saidasDesc = saidasColaborador.filter(s =>
    TIPOS_DESC.includes(s.tipo) && !s.pagamentoIdLigado
  );

  // Adiantamento Transporte (bruto - descontos já pagos)
  const adtoTranspBruto = saidasColaborador
    .filter(s => s.tipo === 'Adiantamento Transporte')
    .reduce((sum, s) => sum + s.valor, 0);
  const descTranspJaPago = saidasColaborador
    .filter(s => s.tipo === 'Desconto Transporte')
    .reduce((sum, s) => sum + s.valor, 0);
  const adtoTransp = Math.max(0, parseFloat((adtoTranspBruto - descTranspJaPago).toFixed(2)));

  // Adiantamento Especial (saídas para abater)
  const adtoEspecialSaidas = saidasColaborador
    .filter(s => s.tipo === 'Adiantamento Especial');

  const items: CheckItemCLT[] = [];

  if (tipoPagamento === 'Adiantamento') {
    // --- DIA 20 ---
    items.push(
      { key: 'adto', label: `💵 Adiantamento Salário (Cód.16 — 40%)`, valor: calc.adtoLiquido, tipo: 'credito', checked: true },
      { key: 'variavel19', label: `📦 Variável ≤19 (entregas + caixinha)`, valor: variavelAte19, tipo: 'credito', checked: variavelAte19 > 0 },
    );
    if (adtoTransp > 0) {
      items.push({ key: 'transp', label: `🚗 Adto Transporte (a abater)`, valor: adtoTransp, tipo: 'debito', checked: true });
    }
    for (let i = 0; i < saidasDesc.length; i++) {
      const s = saidasDesc[i];
      items.push({ key: `desc_${i}`, label: `🔴 ${s.tipo}: ${s.descricao || ''} (${(s.data || '').slice(5)})`, valor: s.valor, tipo: 'debito', checked: true });
    }
  } else if (calc.fonteContabil && calc.valorLiquidoContabil) {
    // --- DIA 5 MODO CONTABILIDADE ---
    items.push(
      { key: 'liq_contab', label: `💰 Líquido Contabilidade (holerite conferido)`, valor: calc.valorLiquidoContabil, tipo: 'credito', checked: true },
      { key: 'variavel2031', label: `📦 Variável 20-31`, valor: variavelDe20a31, tipo: 'credito', checked: variavelDe20a31 > 0 },
    );
    if (adtoTransp > 0) {
      items.push({ key: 'transp5', label: `🚗 Adto Transporte (a abater)`, valor: adtoTransp, tipo: 'debito', checked: true });
    }
    for (let i = 0; i < adtoEspecialSaidas.length; i++) {
      const s = adtoEspecialSaidas[i];
      items.push({ key: `adto_esp_${i}`, label: `🔴 Adiantamento Especial: ${s.descricao || ''} (${(s.data || '').slice(5)})`, valor: s.valor, tipo: 'debito', checked: true });
    }
    for (let i = 0; i < saidasDesc.length; i++) {
      const s = saidasDesc[i];
      items.push({ key: `desc_${i}`, label: `🔴 ${s.tipo}: ${s.descricao || ''} (${(s.data || '').slice(5)})`, valor: s.valor, tipo: 'debito', checked: true });
    }
  } else {
    // --- DIA 5 MODO CÁLCULO INTERNO ---
    const temPeri = periValor > 0;
    const temFeriado = (calc.feriadosValor || 0) > 0;
    const sal100 = parseFloat((calc.salarioBase + periValor + (calc.feriadosValor || 0)).toFixed(2));
    const difSalLabel = temPeri
      ? `💰 Diferença Salário (60% sal. + periculosidade${temFeriado ? ' + feriado' : ''})`
      : `💰 Diferença Salário (60% sal. base${temFeriado ? ' + feriado' : ''})`;

    // Info racional (não entra no total)
    items.push(
      { key: 'racional_100', label: `ℹ️ Salário 100% (base${temPeri ? ' + peri' : ''}${temFeriado ? ' + feriado' : ''})`, valor: sal100, tipo: 'info', checked: false },
      { key: 'racional_40', label: `ℹ️ (−) Adiantamento 40% já pago no Dia 20 (Cód.12)`, valor: calc.adtoLiquido, tipo: 'info', checked: false },
    );
    // Créditos
    items.push(
      { key: 'difsal', label: difSalLabel, valor: calc.diferencaSalario, tipo: 'credito', checked: true },
    );
    if (!temFeriado) {
      items.push({ key: 'feriado', label: `🟣 Feriado trabalhado (Cód.1311) — marque se houver`, valor: 0, tipo: 'credito', checked: false });
    }
    items.push(
      { key: 'variavel2031', label: `📦 Variável 20-31`, valor: variavelDe20a31, tipo: 'credito', checked: variavelDe20a31 > 0 },
    );
    // Descontos legais
    if (calc.inss > 0) items.push({ key: 'inss', label: `🟥 INSS`, valor: calc.inss, tipo: 'debito', checked: true });
    if (calc.contrAssistencial > 0) items.push({ key: 'contr', label: `🟥 Contr. Assistencial`, valor: calc.contrAssistencial, tipo: 'debito', checked: true });
    if (calc.valeTransporte > 0) items.push({ key: 'vt', label: `🟥 Desc. Vale Transporte (Cód.109 — 6% sal.)`, valor: calc.valeTransporte, tipo: 'debito', checked: true });
    if (adtoTransp > 0) items.push({ key: 'transp5', label: `🚗 Adto Transporte (a abater)`, valor: adtoTransp, tipo: 'debito', checked: true });
    for (let i = 0; i < adtoEspecialSaidas.length; i++) {
      const s = adtoEspecialSaidas[i];
      items.push({ key: `adto_esp_${i}`, label: `🔴 Adiantamento Especial: ${s.descricao || ''} (${(s.data || '').slice(5)})`, valor: s.valor, tipo: 'debito', checked: true });
    }
    for (let i = 0; i < saidasDesc.length; i++) {
      const s = saidasDesc[i];
      items.push({ key: `desc_${i}`, label: `🔴 ${s.tipo}: ${s.descricao || ''} (${(s.data || '').slice(5)})`, valor: s.valor, tipo: 'debito', checked: true });
    }
  }

  return items;
}

/* ══════════════════════════════════════════════════════════════
 *  MONTAR HOLERITE (composição detalhada)
 * ══════════════════════════════════════════════════════════════ */

interface HoleriteParams {
  temContab: boolean;
  salBase: number;
  periBruto: number;
  feriadosValor: number;
  inss: number;
  contrAssist: number;
  valeTransporte: number;
  liquidoContab: number;
  saldoFinalCalc: number;
  rubricas?: RubricaHolerite[];
}

function montarHolerite(p: HoleriteParams): HoleriteResult {
  if (p.temContab && p.rubricas && p.rubricas.length > 0) {
    // ── Fonte contábil: usar rubricas reais do PDF ──
    const composicao: ComposicaoItem[] = [];
    let totalVenc = 0, totalDesc = 0;

    for (const r of p.rubricas) {
      const venc = R(r.vencimento);
      const desc = R(r.desconto);
      if (venc > 0) {
        composicao.push({
          descricao: r.descricao,
          valor: venc,
          tipo: 'vencimento',
          referencia: r.referencia,
          codigo: r.codigo,
        });
        totalVenc += venc;
      }
      if (desc > 0) {
        composicao.push({
          descricao: r.descricao,
          valor: -desc,
          tipo: 'desconto-legal',
          referencia: r.referencia,
          codigo: r.codigo,
        });
        totalDesc += desc;
      }
    }

    return {
      fonte: 'contabil',
      bruto: parseFloat(totalVenc.toFixed(2)),
      descontos: parseFloat(totalDesc.toFixed(2)),
      liquido: p.liquidoContab,
      composicao,
      rubricas: p.rubricas,
    };
  }

  // ── Fonte calculada: montar composição a partir dos campos ──
  const composicao: ComposicaoItem[] = [];
  composicao.push({ descricao: 'Salário base', valor: p.salBase, tipo: 'vencimento' });
  if (p.periBruto > 0) {
    composicao.push({ descricao: 'Periculosidade', valor: p.periBruto, tipo: 'vencimento' });
  }
  if (p.feriadosValor > 0) {
    composicao.push({ descricao: 'Feriado trabalhado', valor: p.feriadosValor, tipo: 'vencimento' });
  }
  const bruto = p.salBase + p.periBruto + p.feriadosValor;

  if (p.inss > 0) {
    composicao.push({ descricao: 'INSS', valor: -p.inss, tipo: 'desconto-legal' });
  }
  if (p.contrAssist > 0) {
    composicao.push({ descricao: 'Contr. Assistencial', valor: -p.contrAssist, tipo: 'desconto-legal' });
  }
  if (p.valeTransporte > 0) {
    composicao.push({ descricao: 'Vale Transporte (6%)', valor: -p.valeTransporte, tipo: 'desconto-legal' });
  }
  const descontos = p.inss + p.contrAssist + p.valeTransporte;
  const liquido = parseFloat(Math.max(0, bruto - descontos).toFixed(2));

  return {
    fonte: 'calculado',
    bruto: parseFloat(bruto.toFixed(2)),
    descontos: parseFloat(descontos.toFixed(2)),
    liquido,
    composicao,
  };
}
