/**
 * engine/semanas.ts — Cálculo de semanas de fechamento
 *
 * FONTE ÚNICA: semanasFechamento() e helpers de data.
 * Usado por FolhaPagamento, FreelancerPagamento e qualquer módulo que precise
 * dividir um mês em semanas (domingo = fim da semana).
 *
 * Atualizado: 2026-07-06
 */

import type { SemanaFechamento } from './types';

/**
 * Divide um mês em semanas de fechamento.
 * Cada semana vai de segunda (ou dia 1 se começa no meio) até domingo (ou último dia do mês).
 *
 * @param ano - Ano (ex: 2026)
 * @param mes - Mês 1-indexed (ex: 7 = julho)
 * @returns Array de semanas { inicio, fim }
 */
export function semanasFechamento(ano: number, mes: number): SemanaFechamento[] {
  const semanas: SemanaFechamento[] = [];
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimo = new Date(ano, mes, 0);

  let cur = new Date(primeiro);
  while (cur <= ultimo) {
    const inicio = new Date(cur);
    const fim = new Date(cur);
    // Fim = próximo domingo (ou fim do mês)
    while (fim.getDay() !== 0 && fim < ultimo) {
      fim.setDate(fim.getDate() + 1);
    }
    semanas.push({
      inicio,
      fim: new Date(Math.min(fim.getTime(), ultimo.getTime())),
    });
    cur = new Date(fim);
    cur.setDate(cur.getDate() + 1);
  }
  return semanas;
}

/**
 * Formata data no padrão BR curto: DD/MM
 */
export function fmtDataBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Formata data como ISO: YYYY-MM-DD
 */
export function fmtDataISO(d: Date): string {
  return d.toISOString().split('T')[0];
}
