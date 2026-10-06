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
  /** Afastamentos relevantes (impactaram aquisitivos ou são informativos) */
  afastamentos: AfastamentoResumo[];
}

export interface AfastamentoResumo {
  tipo: string;
  dataInicio: string;
  dataFim: string;
  diasTotal: number;
  motivo?: string;
  /** Esse afastamento zera o aquisitivo? (art. 133 II/IV) */
  perdeAquisitivo: boolean;
  /** Observação explicativa */
  obs: string;
}

export interface AfastamentoInput {
  tipo: string;        // 'licenca_medica' | 'licenca_maternidade' | 'auxilio_doenca' | etc
  dataInicio: string;  // YYYY-MM-DD
  dataFim?: string;    // YYYY-MM-DD (null = ainda ativo)
  motivo?: string;
}

export interface CalcularFeriasStatusInput {
  nome: string;
  dataAdmissao: string;
  historico?: HistoricoFeriasItem[];
  afastamentos?: AfastamentoInput[];
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

/** Avalia um afastamento à luz do art. 133 CLT */
function avaliarAfastamento(af: AfastamentoInput, hoje: string): AfastamentoResumo {
  const fim = af.dataFim || hoje;
  const dias = diffDias(af.dataInicio, fim) + 1;
  let perde = false;
  let obs = '';

  // Licença com salário (empresa paga) > 30 dias → perde (art. 133 II)
  // Licença maternidade: não perde (equivalente a trabalho)
  // Auxílio-doença INSS > 180 dias (6 meses) → perde (art. 133 IV)
  const tipoLower = (af.tipo || '').toLowerCase();
  const isMaternidade = tipoLower.includes('maternidade');
  const isMedica      = tipoLower.includes('medica') || tipoLower.includes('médica') || tipoLower.includes('doenca') || tipoLower.includes('doença');

  if (isMaternidade) {
    obs = 'Licença maternidade não afeta o período aquisitivo (equivale a trabalho).';
  } else if (isMedica) {
    if (dias > 180) {
      perde = true;
      obs = `Auxílio-doença INSS > 6 meses (${dias} dias) — CLT art. 133 IV: perde o aquisitivo em curso, novo começa no retorno.`;
    } else if (dias > 15) {
      obs = `Auxílio-doença ${dias} dias (do 16º em diante pago pelo INSS). NÃO afeta aquisitivo (abaixo de 6 meses).`;
    } else {
      obs = `Licença médica ${dias} dias (empresa paga). NÃO afeta aquisitivo (abaixo de 30 dias).`;
    }
  } else {
    if (dias > 30) {
      perde = true;
      obs = `${af.tipo || 'Afastamento'} > 30 dias (${dias} dias) — CLT art. 133 II: perde o aquisitivo em curso.`;
    } else {
      obs = `${af.tipo || 'Afastamento'} ${dias} dias. NÃO afeta aquisitivo.`;
    }
  }

  return { tipo: af.tipo, dataInicio: af.dataInicio, dataFim: fim, diasTotal: dias, motivo: af.motivo, perdeAquisitivo: perde, obs };
}

export function calcularFeriasStatus(input: CalcularFeriasStatusInput): FeriasStatusResult {
  const admissao = input.dataAdmissao;
  const hoje = input.hoje || new Date().toISOString().split('T')[0];
  const historico = (input.historico || []).slice().sort((a, b) => a.aquisitivoInicio.localeCompare(b.aquisitivoInicio));
  const afastamentosRaw = input.afastamentos || [];
  const afastamentos = afastamentosRaw.map(a => avaliarAfastamento(a, hoje));

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

    // Verifica histórico cobrindo esse aquisitivo (match por aquisitivoInicio ou intervalo)
    const historicoDesse = historico.filter(h =>
      h.aquisitivoInicio === inicio ||
      (h.aquisitivoInicio <= inicio && (h.aquisitivoFim || '') >= fim)
    );
    const pago = historicoDesse.length > 0;
    // Soma dias de gozo registrados (fracionamento)
    let diasGozados = 0;
    for (const h of historicoDesse) {
      if (h.gozoInicio && h.gozoFim) {
        diasGozados += diffDias(h.gozoInicio, h.gozoFim) + 1;
      }
      if (h.diasAbono) diasGozados += h.diasAbono;
    }
    const diasDireito = 30;
    const diasRestantes = Math.max(0, diasDireito - diasGozados);

    let status: AquisitivoCalculado['status'];
    if (pago && diasRestantes === 0) status = 'pago';
    else if (pago && diasRestantes > 0) status = 'parcial';
    else if (diasAteVencimento < 0) status = 'vencido';
    else if (diasAteVencimento <= 180) status = 'vencendo';
    else status = 'em_dia';

    aquisitivos.push({
      ordem,
      inicio,
      fim,
      limiteGozo,
      limiteGozoPratico,
      diasDireito,
      pago,
      diasGozados,
      diasRestantes,
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
  // "Pendente" = não pago OU pago parcialmente (ainda tem dias a gozar)
  const pendentesList = aquisitivos.filter(a => a.status !== 'pago');
  const pendentes = pendentesList.length;
  const temDuplicado = pendentes >= 2;

  let alerta: FeriasStatusResult['alerta'] = 'em_dia';
  if (temDuplicado) alerta = 'duplicado';
  else if (pendentesList.some(a => a.status === 'vencido')) alerta = 'vencido';
  else if (pendentesList.some(a => a.status === 'vencendo' || a.status === 'parcial')) alerta = 'vencendo';

  return {
    nome: input.nome,
    admissao,
    aquisitivos,
    proporcional,
    alerta,
    pendentes,
    temDuplicado,
    afastamentos,
  };
}
