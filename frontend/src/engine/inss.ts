/**
 * engine/inss.ts — Cálculo de INSS (tabela progressiva 2026)
 *
 * FONTE ÚNICA: esta é a única implementação de calcINSS no sistema.
 * FolhaPagamento.tsx, Extrato.tsx e qualquer outro módulo devem importar daqui.
 *
 * Tabela atualizada conforme Portaria MPS vigente.
 * Referência: faixas usadas pelo EMS (contabilidade Eric).
 *
 * Atualizado: 2026-07-06
 */

/** Faixas da tabela progressiva INSS 2026 */
export const TABELA_INSS_2026 = [
  { ate: 1621.00, aliq: 0.075 },   // faixa 1 (≈ salário mínimo 2026)
  { ate: 2793.88, aliq: 0.09 },    // faixa 2
  { ate: 4190.83, aliq: 0.12 },    // faixa 3
  { ate: 8157.41, aliq: 0.14 },    // faixa 4 (teto)
];

/**
 * Calcula o INSS pela tabela progressiva.
 *
 * Lógica: cada faixa incide apenas sobre a parcela do salário que cai nela.
 * Exemplo: salário R$2.000 → faixa1: 1621×7.5% + faixa2: (2000-1621)×9%
 *
 * @param salarioBruto - Sal.Contr.INSS (base de cálculo, geralmente truncada no inteiro)
 * @returns Valor do INSS em reais, arredondado em 2 casas
 */
export function calcINSS(salarioBruto: number): number {
  let inss = 0;
  let base = salarioBruto;
  let anterior = 0;
  for (const faixa of TABELA_INSS_2026) {
    if (base <= 0) break;
    const faixaVal = Math.min(base, faixa.ate - anterior);
    inss += faixaVal * faixa.aliq;
    base -= faixaVal;
    anterior = faixa.ate;
    if (salarioBruto <= faixa.ate) break;
  }
  return parseFloat(inss.toFixed(2));
}
