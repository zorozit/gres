import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Tipo das permissões: perfil → moduloId → boolean
export type PermissoesMap = Record<string, Record<string, boolean>>;

interface PermissoesContextType {
  permissoes: PermissoesMap | null;       // permissões resolvidas (override da unidade ou default global)
  permissoesGlobal: PermissoesMap | null; // default global sempre disponível
  loaded: boolean;                        // true após tentativa (sucesso ou erro)
  temAcesso: (perfilKey: string, moduloId: string) => boolean;
  recarregar: () => Promise<void>;
  isOverride: boolean;                    // true se a unidade ativa tem override
}

const PermissoesContext = createContext<PermissoesContextType | undefined>(undefined);

const API_URL = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

export const PermissoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissoesGlobal, setPermissoesGlobal] = useState<PermissoesMap | null>(null);
  const [permissoesOverride, setPermissoesOverride] = useState<PermissoesMap | null>(null);
  const [isOverride, setIsOverride] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /** Retorna o CNPJ da unidade ativa (do localStorage) */
  const getActiveUnitId = useCallback((): string | null => {
    try {
      const unitId = localStorage.getItem('unit_id') || localStorage.getItem('user_unit');
      return unitId && unitId !== 'null' && unitId !== '' ? unitId.replace(/\D/g, '').substring(0, 14) : null;
    } catch { return null; }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Buscar default global
      const rGlobal = await fetch(`${API_URL}/perfis-permissoes`, { headers });
      let globalPerms: PermissoesMap | null = null;
      if (rGlobal.ok) {
        const dataGlobal = await rGlobal.json();
        globalPerms = dataGlobal.permissoes ?? null;
      }
      setPermissoesGlobal(globalPerms);

      // 2. Buscar override da unidade ativa (se houver)
      const unitId = getActiveUnitId();
      let overridePerms: PermissoesMap | null = null;
      let hasOverride = false;
      if (unitId) {
        try {
          const rUnit = await fetch(`${API_URL}/perfis-permissoes?unitId=${unitId}`, { headers });
          if (rUnit.ok) {
            const dataUnit = await rUnit.json();
            if (dataUnit.permissoes && dataUnit.isOverride) {
              overridePerms = dataUnit.permissoes;
              hasOverride = true;
            }
          }
        } catch {
          // Sem override — usa global
        }
      }
      setPermissoesOverride(overridePerms);
      setIsOverride(hasOverride);
    } catch {
      setPermissoesGlobal(null);
      setPermissoesOverride(null);
      setIsOverride(false);
    } finally {
      setLoaded(true);
    }
  }, [getActiveUnitId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Recarrega quando a unidade ativa muda
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'unit_id' || e.key === 'user_unit') {
        carregar();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [carregar]);

  // Permissões resolvidas: override da unidade ativa > default global
  const permissoes = isOverride ? permissoesOverride : permissoesGlobal;

  /**
   * Verifica se um perfil tem acesso a um módulo.
   * Hierarquia: 1) master → true, 2) override da unidade, 3) default global
   */
  const temAcesso = (perfilRaw: string, moduloId: string): boolean => {
    // Master check via localStorage (AuthContext seta is_master)
    if (localStorage.getItem('is_master') === 'true') return true;

    const perfil = (perfilRaw || '').toLowerCase();

    // Fallback: se permissões não carregaram (API 401, erro de rede, etc.)
    // admin tem acesso total como fallback de segurança
    const resolved = permissoes;
    if (!resolved) {
      return perfil === 'admin' || perfil === 'administrador';
    }

    const map = resolved[perfil];
    if (!map) {
      // Perfil não encontrado na config — admin libera por padrão
      return perfil === 'admin' || perfil === 'administrador';
    }
    return map[moduloId] === true;
  };

  return (
    <PermissoesContext.Provider value={{
      permissoes,
      permissoesGlobal,
      loaded,
      temAcesso,
      recarregar: carregar,
      isOverride
    }}>
      {children}
    </PermissoesContext.Provider>
  );
};

export const usePermissoes = () => {
  const ctx = useContext(PermissoesContext);
  if (!ctx) throw new Error('usePermissoes deve ser usado dentro de PermissoesProvider');
  return ctx;
};
