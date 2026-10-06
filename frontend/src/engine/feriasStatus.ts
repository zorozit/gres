/**
 * engine/feriasStatus.ts — Controle de direito/vencimento de férias por colaborador
 *
 * Dado dataAdmissao + histórico de férias já pagas, calcula:
 * - Aquisitivo ATUAL em curso (ou vencido)
 * - Aquisitivos PENDENTES (já venceram mas ninguém tirou)
 * - Direito proporcional em curso (dias ganhos no aquisitivo atual)
 * - Status: EM_DIA | VENCENDO | VENCIDO | DUPLICADO (2+ aquisitivos sem gozar)
 *
 * Regras CLT:
 * - Aquisitivo = 12 meses a partir da admissão (ou do fim do aquisitivo anterior + 1 dia)
 * - Concessivo = 12 meses após o fim do aquisitivo (prazo para empresa conceder)
 * - Depois do concessivo: paga em dobro (art. 137)
 * - Direito proporcional = (meses trabalhados * 2.5) do aquisitivo em curso
 *
 * Atualizado: 2026-10-06
 */

/* ══════════════════════════════════════════════════════════════
 *  TIPOS
 * ══════════════════════════════════════════════════════════════ */

export interface HistoricoFeriasItem {
  /** Período aquisitivo coberto (início) — YYYY-MM-DD */
  aquisitivoInicio: string;
  /** Período aquisitivo coberto (fim) — YYYY-MM-DD */
  aquisitivoFim: string;
  /** Período de gozo (início) — YYYY-MM-DD */
  gozoInicio?: string;
  /** Período de gozo (fim) — YYYY-MM-DD */
  gozoFim?: string;
  /** Data em que foi pago */
  dataPagamento?: string;
  /** Houve abono pecuniário? Quantos dias (0 se não) */
  diasAbono?: number;
  /** Observação livre */
  obs?: string;
}

export interface AquisitivoCalculado {
  /** Índice no histórico (1 = mais antigo em curso) */
  ordem: number;
  /** Data início do aquisitivo */
  inicio: string;
  /** Data fim do aquisitivo */
  fim: string;
  /** Data limite legal para gozar (fim + 12m - 1d) — após isso, dobro */
  limiteGozo: string;
  /** Data prática para INICIAR o gozo (limiteGozo - 30 dias de aviso prévio obrigatório) */
  limiteGozoPratico: string;
  /** Dias de direito (30 base, reduzido por faltas) */
  diasDireito: number;
  /** Já foi pago? (há histórico ligado a esse aquisitivo) */
  pago: boolean;
  /** Dias que faltam até limiteGozoPratico (negativo = atrasado) */
  diasAteVencimento: number;
  /** Status do aquisitivo */
  status: 'em_dia' | 'vencendo' | 'vencido' | 'pago';
}

export interface FeriasStatusResult {
  /** Nome do colaborador (echo pra facilitar UI) */
  nome: string;
  /** Data admissão */
  admissao: string;
  /** Lista de aquisitivos (do mais antigo ao atual + um proporcional em curso) */
  aquisitivos: AquisitivoCalculado[];
  /** Direito proporcional atual (meses trabalhados do aquisitivo em curso × 2.5) */
  proporcional: {
    aquisitivoInicio: string;
    aquisitivoFim: string;
    mesesTrabalhados: number;
    diasAcumulados: number;
  } | null;
  /** Nível de alerta geral (pior status dos aquisitivos pendentes) */
  alerta: 'em_dia' | 'vencendo' | 'vencido' | 'duplicado';
  /** Qtd de aquisitivos pendentes (não pagos) */
  pendentes: number;
  /** Flag: 2+ aquisitivos pendentes (urgência máxima) */
  temDuplicado: boolean;
}

export interface CalcularFeriasStatusInput {
  nome: string;
  dataAdmissao: string;
  historico?: HistoricoFeriasItem[];
  /** Hoje (default: new Date()) — permite testar com datas fixas */
  hoje?: string;
}

/* ══════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════ */

/** Soma N anos a uma data ISO, mantendo mesmo dia (ou último dia do mês se não existir) */
function somarAnos(iso: string, anos: number): string {
  const dt = new Date(iso + 'T12:00:00');
  dt.setFullYear(dt.getFullYear() + anos);
  return dt.toISOString().split('T')[0];
}

/** Subtrai 1 dia */
function diaAnterior(iso: string): string {
  const dt = new Date(iso + 'T12:00:00');
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split('T')[0];
}

/** Soma 1 dia */
function diaSeguinte(iso: string): string {
  const dt = new Date(iso + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().split('T')[0];
}

/** Diferença em dias entre duas datas (b - a, inclusivo da data b) */
function diffDias(a: string, b: string): number {
  const dtA = new Date(a + 'T12:00:00');
  const dtB = new Date(b + 'T12:00:00');
  return Math.round((dtB.getTime() - dtA.getTime()) / 86400000);
}

/** Meses completos entre duas datas (a → b) */
function mesesCompletos(a: string, b: string): number {
  const dtA = new Date(a + 'T12:00:00');
  const dtB = new Date(b + 'T12:00:00');
  let meses = (dtB.getFullYear() - dtA.getFullYear()) * 12 + (dtB.getMonth() - dtA.getMonth());
  if (dtB.getDate() < dtA.getDate()) meses--;
  return Math.max(0, meses);
}

/* ══════════════════════════════════════════════════════════════
 *  FUNÇÃO PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

export function calcularFeriasStatus(input: CalcularFeriasStatusInput): FeriasStatusResult {
  const admissao = input.dataAdmissao;
  const hoje = input.hoje || new Date().toISOString().split('T')[0];
  const historico = (input.historico || []).slice().sort((a, b) => a.aquisitivoInicio.localeCompare(b.aquisitivoInicio));

  const aquisitivos: AquisitivoCalculado[] = [];

  // ── Gerar todos aquisitivos VENCIDOS ou EM CURSO ─────────────────
  // Começa na admissão. Cada aquisitivo = 1 ano.
  let cursor = admissao;
  let ordem = 1;

  while (cursor <= hoje) {
    const inicio = cursor;
    const fim = diaAnterior(somarAnos(cursor, 1));

    // Só considera como "completo" se fim <= hoje
    if (fim > hoje) break;

    const limiteGozo = diaAnterior(somarAnos(fim, 1));
    // Limite prático = limite legal - 30 dias (aviso prévio obrigatório)
    const limiteGozoPratico = (() => {
      const dt = new Date(limiteGozo + 'T12:00:00');
      dt.setDate(dt.getDate() - 30);
      return dt.toISOString().split('T')[0];
    })();
    const diasAteVencimento = diffDias(hoje, limiteGozoPratico);

    // Verifica se há histórico pago cobrindo esse aquisitivo
    const pago = historico.some(h =>
      h.aquisitivoInicio === inicio ||
      (h.aquisitivoInicio <= inicio && (h.aquisitivoFim || '') >= fim)
    );

    let status: AquisitivoCalculado['status'];
    if (pago) status = 'pago';
    else if (diasAteVencimento < 0) status = 'vencido';
    else if (diasAteVencimento <= 180) status = 'vencendo';
    else status = 'em_dia';

    aquisitivos.push({
      ordem,
      inicio,
      fim,
      limiteGozo,
      limiteGozoPratico,
      diasDireito: 30, // simplificado — faltas aplicadas no momento do lançamento
      pago,
      diasAteVencimento,
      status,
    });

    cursor = diaSeguinte(fim);
    ordem++;
  }

  // ── Aquisitivo PROPORCIONAL em curso (ainda não completou 12m) ───
  let proporcional: FeriasStatusResult['proporcional'] = null;
  if (cursor <= hoje) {
    const meses = mesesCompletos(cursor, hoje);
    proporcional = {
      aquisitivoInicio: cursor,
      aquisitivoFim: diaAnterior(somarAnos(cursor, 1)),
      mesesTrabalhados: meses,
      diasAcumulados: Math.round(meses * 2.5 * 10) / 10, // 2,5 dias por mês
    };
  }

  // ── Alertas ─────────────────────────────────────────────────────
  const pendentesList = aquisitivos.filter(a => !a.pago);
  const pendentes = pendentesList.length;
  const temDuplicado = pendentes >= 2;

  let alerta: FeriasStatusResult['alerta'] = 'em_dia';
  if (temDuplicado) alerta = 'duplicado';
  else if (pendentesList.some(a => a.status === 'vencido')) alerta = 'vencido';
  else if (pendentesList.some(a => a.status === 'vencendo')) alerta = 'vencendo';

  return {
    nome: input.nome,
    admissao,
    aquisitivos,
    proporcional,
    alerta,
    pendentes,
    temDuplicado,
  };
}
