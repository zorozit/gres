import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

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
  reloadUnits: () => Promise<void>;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

const API_URL = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

export const UnitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicializa direto do localStorage (síncrono, sem useEffect)
  const [activeUnit, setActiveUnitRaw] = useState<Unit | null>(() => {
    try {
      const saved = localStorage.getItem('activeUnit');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [userUnits, setUserUnits] = useState<Unit[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const { isAuthenticated } = useAuth();

  // Wrapper do setActiveUnit que persiste no localStorage
  const setActiveUnit = React.useCallback((unit: Unit | React.SetStateAction<Unit | null>) => {
    setActiveUnitRaw(prev => {
      const next = typeof unit === 'function' ? unit(prev) : unit;
      if (next) {
        localStorage.setItem('activeUnit', JSON.stringify(next));
      }
      // Não remove activeUnit do localStorage aqui—
      // isso é feito pelo AuthContext.logout().
      // No refresh, activeUnit fica null brevemente mas o localStorage sobrevive.
      return next;
    });
  }, []);

  // ── Carrega unidades da API quando autenticado ────────────────────────────
  const loadUnits = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

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

      // Filtrar por unidades do usuário (não-admin e não-master)
      const userRole  = localStorage.getItem('user_role') || '';
      const isMaster  = localStorage.getItem('is_master') === 'true';
      const isAdmin   = isMaster || ['admin', 'Admin', 'Administrador', 'ADMIN'].includes(userRole);
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
      // Lê direto do localStorage pra evitar race condition no refresh
      // (o state React pode ainda não ter sido atualizado pelo useEffect de restauração)
      setActiveUnit(prev => {
        // Tenta o state atual primeiro
        if (prev) {
          const still = units.find(u => u.id === prev.id);
          if (still) return still;
        }
        // Se state está null, tenta restaurar do localStorage
        const saved = localStorage.getItem('activeUnit');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const match = units.find(u => u.id === parsed.id);
            if (match) return match;
          } catch { /* ignore */ }
        }
        return units.length > 0 ? units[0] : null;
      });
    } catch (err) {
      console.error('UnitContext: erro ao carregar unidades:', err);
    } finally {
      setIsLoadingUnits(false);
    }
  }, []);

  // Recarrega quando isAuthenticated muda para true
  useEffect(() => {
    if (isAuthenticated) {
      loadUnits();
    } else {
      // Limpa state (localStorage é limpo pelo AuthContext.logout)
      setUserUnits([]);
      setActiveUnitRaw(null);
    }
  }, [isAuthenticated, loadUnits]);

  const value: UnitContextType = {
    activeUnit,
    setActiveUnit,
    userUnits,
    setUserUnits,
    isLoadingUnits,
    setIsLoadingUnits,
    reloadUnits: loadUnits,
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
