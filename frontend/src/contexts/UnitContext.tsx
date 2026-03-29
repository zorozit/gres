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

export const UnitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  const [userUnits, setUserUnits] = useState<Unit[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  // Carregar unidade ativa do localStorage ao montar
  useEffect(() => {
    const savedUnit = localStorage.getItem('activeUnit');
    if (savedUnit) {
      try {
        setActiveUnit(JSON.parse(savedUnit));
      } catch (error) {
        console.error('Erro ao restaurar unidade ativa:', error);
      }
    }
  }, []);

  // Salvar unidade ativa no localStorage quando mudar
  useEffect(() => {
    if (activeUnit) {
      localStorage.setItem('activeUnit', JSON.stringify(activeUnit));
    } else {
      localStorage.removeItem('activeUnit');
    }
  }, [activeUnit]);

  const value: UnitContextType = {
    activeUnit,
    setActiveUnit,
    userUnits,
    setUserUnits,
    isLoadingUnits,
    setIsLoadingUnits
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
