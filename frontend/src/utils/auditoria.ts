/**
 * Helper de auditoria — extrai responsavelId/Nome/Email do contexto e localStorage.
 * Deve ser anexado em todo POST/PUT que vai pra API que persiste dados.
 *
 * Uso típico:
 *   import { auditoriaPayload } from '../utils/auditoria';
 *   const payload = { ...meusCampos, ...auditoriaPayload({ user, email: authEmail }) };
 */
export interface AuditoriaInput {
  user?: any;       // objeto do AuthContext (pode ter id, email, nome)
  email?: string;   // email do AuthContext (preferido sobre user.email)
}

export interface AuditoriaPayload {
  responsavelId: string;
  responsavelNome: string;
  responsavelEmail: string;
}

export const auditoriaPayload = ({ user, email }: AuditoriaInput): AuditoriaPayload => {
  const u: any = user || {};
  return {
    responsavelId: u.id || localStorage.getItem('user_id') || '',
    responsavelNome: u.nome || u.name || u.displayName || email || u.email || 'desconhecido',
    responsavelEmail: email || u.email || localStorage.getItem('user_email') || '',
  };
};
