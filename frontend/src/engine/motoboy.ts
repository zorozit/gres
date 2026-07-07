/**
 * engine/motoboy.ts — Cálculo do variável motoboy
 *
 * FONTE ÚNICA: cálculo de comissão por entrega + caixinhas.
 *
 * Regras:
 * - Variável = (entregas × valorEntrega) + caixinhas
 * - Motoboy CLT: divide em "até dia 19" (pgto dia 20) e "20-31" (pgto dia 5)
 * - Motoboy Freelancer: variável acumula semanal
 *
 * Atualizado: 2026-07-06
 */

import type { ControleDiaMotoboy, ComposicaoItem } from './types';

export interface MotoboyVariavelInput {
  /** Controle de entregas por dia */
  controles: ControleDiaMotoboy[];
  /** Valor por entrega (do acordo/cadastro) */
  valorEntrega: number;
  /** Mês de referência (YYYY-MM) — para dividir até 19 / 20-31 */
  mesAno: string;
  /** Se deve dividir por período (dia 19). CLT=true, Freelancer=false */
  dividirPorPeriodo: boolean;
}

export interface MotoboyVariavelResult {
  /** Variável até dia 19 (pagamento dia 20) */
  varAte19: number;
  /** Variável de 20-31 (pagamento dia 5 do mês seguinte) */
  varDe20a31: number;
  /** Variável 20-31 do mês ANTERIOR (entra no pgto dia 5 do mês atual) */
  varDe20a31MesAnt: number;
  /** Total do mês atual (ate19 + de20a31) */
  totalMesAtual: number;
  /** Total de entregas no mês */
  totalEntregas: number;
  /** Total de caixinhas no mês */
  totalCaixinhas: number;
  /** Composição para demonstrativo */
  composicao: ComposicaoItem[];
}

/**
 * Calcula o variável de um motoboy a partir dos controles diários.
 *
 * Para cada dia: (entDia + entNoite) × valorEntrega + caixinhaDia + caixinhaNoite
 *
 * Se dividirPorPeriodo=true (CLT), separa em ate19 e de20a31.
 */
export function calcularVariavelMotoboy(input: MotoboyVariavelInput): MotoboyVariavelResult {
  const { controles, valorEntrega, mesAno, dividirPorPeriodo } = input;
  const dia19 = `${mesAno}-19`;

  // Mês anterior (para variável 20-31 do mês anterior)
  const [ano, mes] = mesAno.split('-').map(Number);
  const dMesAnt = new Date(ano, mes - 2, 1);
  const mesAnt = `${dMesAnt.getFullYear()}-${String(dMesAnt.getMonth() + 1).padStart(2, '0')}`;
  const dia19MesAnt = `${mesAnt}-19`;
  const ultimoDiaMesAnt = `${mesAnt}-31`;

  let varAte19 = 0;
  let varDe20a31 = 0;
  let varDe20a31MesAnt = 0;
  let totalEntregas = 0;
  let totalCaixinhas = 0;

  for (const linha of controles) {
    const entregas = (linha.entDia + linha.entNoite);
    const valorEntregas = entregas * valorEntrega;
    const caixinha = linha.caixinhaDia + linha.caixinhaNoite;
    const vlEfetivo = parseFloat((valorEntregas + caixinha).toFixed(2));

    totalEntregas += entregas;
    totalCaixinhas += caixinha;

    // Classificar por período
    if (linha.data >= `${mesAno}-01` && linha.data <= `${mesAno}-31`) {
      if (dividirPorPeriodo && linha.data <= dia19) {
        varAte19 += vlEfetivo;
      } else if (dividirPorPeriodo && linha.data > dia19) {
        varDe20a31 += vlEfetivo;
      } else {
        // Freelancer: tudo junto
        varAte19 += vlEfetivo;
      }
    } else if (dividirPorPeriodo && linha.data > dia19MesAnt && linha.data <= ultimoDiaMesAnt) {
      varDe20a31MesAnt += vlEfetivo;
    }
  }

  varAte19 = parseFloat(varAte19.toFixed(2));
  varDe20a31 = parseFloat(varDe20a31.toFixed(2));
  varDe20a31MesAnt = parseFloat(varDe20a31MesAnt.toFixed(2));
  const totalMesAtual = parseFloat((varAte19 + varDe20a31).toFixed(2));

  const composicao: ComposicaoItem[] = [];
  if (totalEntregas > 0) {
    composicao.push({
      descricao: `Entregas (${totalEntregas} × R$${valorEntrega.toFixed(2)})`,
      valor: totalEntregas * valorEntrega,
      tipo: 'variavel',
    });
  }
  if (totalCaixinhas > 0) {
    composicao.push({
      descricao: `Caixinhas motoboy`,
      valor: totalCaixinhas,
      tipo: 'variavel',
    });
  }

  return {
    varAte19,
    varDe20a31,
    varDe20a31MesAnt,
    totalMesAtual,
    totalEntregas,
    totalCaixinhas,
    composicao,
  };
}
