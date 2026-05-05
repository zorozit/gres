/** Feriados nacionais 2026 (BR). Formato: { 'YYYY-MM-DD': 'Nome do feriado' } */
/**
 * Feriados nacionais BR 2026 (oficiais).
 *
 * IMPORTANTE: Páscoa NAO é feriado nacional (é ponto facultativo apenas).
 * Só é feriado quando declarado por lei municipal.
 *
 * Carnaval (16-17/02) e Quarta-feira de Cinzas (18/02) também são pontos
 * facultativos federais, mas em São Paulo geralmente são feriados municipais.
 *
 * Lista carregada SEMPRE do localStorage caso o operador tenha customizado.
 * Para customizar: módulo "🎉 Feriados" no menu principal.
 */
const FERIADOS_2026_DEFAULT: Record<string, string> = {
  '2026-01-01': 'Confraternização',
  '2026-04-03': 'Sexta-feira Santa',
  '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi',
  '2026-09-07': 'Independência',
  '2026-10-12': 'N.S. Aparecida',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Consciência Negra',
  '2026-12-25': 'Natal',
};

const STORAGE_KEY = 'gres-feriados-2026';

/** Carrega feriados (custom do localStorage ou default) */
export const carregarFeriados = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { ...FERIADOS_2026_DEFAULT };
};

/** Salva customização de feriados */
export const salvarFeriados = (mapa: Record<string, string>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapa));
};

export const FERIADOS_2026: Record<string, string> = carregarFeriados();

export const isFeriado = (data: string): string | null => carregarFeriados()[data] || null;

/** Retorna lista de feriados de um mês YYYY-MM */
export const feriadosDoMes = (mesAno: string): Array<{ data: string; nome: string }> => {
  return Object.entries(carregarFeriados())
    .filter(([data]) => data.startsWith(mesAno))
    .map(([data, nome]) => ({ data, nome }));
};

export const FERIADOS_DEFAULT = FERIADOS_2026_DEFAULT;
