/** Feriados nacionais 2026 (BR). Formato: { 'YYYY-MM-DD': 'Nome do feriado' } */
export const FERIADOS_2026: Record<string, string> = {
  '2026-01-01': 'Confraternização',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-02-18': 'Quarta-feira Cinzas',
  '2026-04-03': 'Sexta-feira Santa',
  '2026-04-05': 'Páscoa',
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

export const isFeriado = (data: string): string | null => FERIADOS_2026[data] || null;

/** Retorna lista de feriados de um mês YYYY-MM */
export const feriadosDoMes = (mesAno: string): Array<{ data: string; nome: string }> => {
  return Object.entries(FERIADOS_2026)
    .filter(([data]) => data.startsWith(mesAno))
    .map(([data, nome]) => ({ data, nome }));
};
