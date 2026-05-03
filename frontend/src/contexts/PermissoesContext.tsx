import React, { createContext, useContext, useState, useEffect } from 'react';

// Tipo das permissões: perfil → moduloId → boolean
export type PermissoesMap = Record<string, Record<string, boolean>>;

interface PermissoesContextType {
  permissoes: PermissoesMap | null;   // null = ainda carregando
  loaded: boolean;                    // true após tentativa (sucesso ou erro)
  temAcesso: (perfilKey: string, moduloId: string) => boolean;
  recarregar: () => Promise<void>;
}

const PermissoesContext = createContext<PermissoesContextType | undefined>(undefined);

const API_URL = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

export const PermissoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissoes, setPermissoes] = useState<PermissoesMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  const carregar = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${API_URL}/perfis-permissoes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) {
        const data = await r.json();
        // Se não há permissões salvas, permanece null — sem fallback
        setPermissoes(data.permissoes ?? null);
      } else {
        setPermissoes(null);
      }
    } catch {
      setPermissoes(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { carregar(); }, []);

  /**
   * Verifica se um perfil tem acesso a um módulo.
   * Normaliza o perfil para lowercase antes de buscar.
   * Retorna false se as permissões não foram carregadas ou o módulo não está configurado.
   */
  const temAcesso = (perfilRaw: string, moduloId: string): boolean => {
    if (!permissoes) return false;
    const perfil = (perfilRaw || '').toLowerCase();
    const map = permissoes[perfil];
    if (!map) return false;
    return map[moduloId] === true;
  };

  return (
    <PermissoesContext.Provider value={{ permissoes, loaded, temAcesso, recarregar: carregar }}>
      {children}
    </PermissoesContext.Provider>
  );
};

export const usePermissoes = () => {
  const ctx = useContext(PermissoesContext);
  if (!ctx) throw new Error('usePermissoes deve ser usado dentro de PermissoesProvider');
  return ctx;
};
