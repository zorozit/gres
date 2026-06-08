import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Unit {
  id: string;
  nome: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  cnpj?: string;
  gerente?: string;
}

interface UnitContextType {
  activeUnit: Unit | null;
  setActiveUnit: (unit: Unit | null) => void;
  userUnits: Unit[];
  setUserUnits: (units: Unit[]) => void;
  isLoadingUnits: boolean;
  setIsLoadingUnits: (loading: boolean) => void;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

const API_URL = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

export const UnitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  const [userUnits, setUserUnits] = useState<Unit[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  // Restaura unidade ativa do localStorage ao montar
  useEffect(() => {
    const savedUnit = localStorage.getItem('activeUnit');
    if (savedUnit) {
      try { setActiveUnit(JSON.parse(savedUnit)); } catch { /* ignore */ }
    }
  }, []);

  // Persiste unidade ativa no localStorage quando mudar
  useEffect(() => {
    if (activeUnit) {
      localStorage.setItem('activeUnit', JSON.stringify(activeUnit));
    } else {
      localStorage.removeItem('activeUnit');
    }
  }, [activeUnit]);

  // ── Carrega unidades da API assim que o token estiver disponível ──────────
  // Fica em polling leve (a cada 500ms) até o token aparecer, depois carrega
  // uma única vez. Isso garante que as unidades sejam carregadas independente
  // de qual componente estiver montado.
  useEffect(() => {
    let tries = 0;
    const MAX_TRIES = 20; // até 10s de espera

    const tryLoad = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        tries++;
        if (tries < MAX_TRIES) {
          setTimeout(tryLoad, 500);
        }
        return;
      }

      setIsLoadingUnits(true);
      try {
        const response = await fetch(`${API_URL}/unidades`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) return;

        const allUnits: Unit[] = await response.json();

        // Filtrar por unidades do usuário (não-admin)
        const userRole  = localStorage.getItem('user_role') || '';
        const isAdmin   = ['admin', 'Admin', 'Administrador', 'ADMIN'].includes(userRole);
        const unitIdsRaw = localStorage.getItem('user_unit_ids') || '[]';
        const userUnitIds: string[] = (() => {
          try { return JSON.parse(unitIdsRaw); } catch { return []; }
        })();

        let units = allUnits;
        if (!isAdmin && userUnitIds.length > 0) {
          units = allUnits.filter((u) => {
            const cnpj = (u.id || u.cnpj || '').replace(/\D/g, '').substring(0, 14);
            return userUnitIds.includes(cnpj);
          });
        }

        setUserUnits(units);

        // Define unidade ativa: restaura do localStorage se válida, senão usa a primeira
        setActiveUnit(prev => {
          if (prev) {
            // Verifica se a unidade salva ainda é válida para este usuário
            const still = units.find(u => u.id === prev.id);
            if (still) return still; // mantém (e atualiza dados)
          }
          return units.length > 0 ? units[0] : null;
        });
      } catch (err) {
        console.error('UnitContext: erro ao carregar unidades:', err);
      } finally {
        setIsLoadingUnits(false);
      }
    };

    tryLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: UnitContextType = {
    activeUnit,
    setActiveUnit,
    userUnits,
    setUserUnits,
    isLoadingUnits,
    setIsLoadingUnits,
  };

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
};

export const useUnit = () => {
  const context = useContext(UnitContext);
  if (context === undefined) {
    throw new Error('useUnit deve ser usado dentro de um UnitProvider');
  }
  return context;
};
