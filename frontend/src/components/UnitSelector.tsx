import React, { useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/UnitSelector.css';

export const UnitSelector: React.FC = () => {
  const { activeUnit, setActiveUnit, userUnits, setUserUnits, isLoadingUnits, setIsLoadingUnits } = useUnit();
  const { token } = useAuth();

  // Carregar unidades do usuário
  useEffect(() => {
    if (!token) return;

    const loadUnits = async () => {
      setIsLoadingUnits(true);
      try {
        const response = await fetch('https://xmv7n047i6.execute-api.us-east-1.amazonaws.com/unidades', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const units = await response.json();
          setUserUnits(units);

          // Se não há unidade ativa e há unidades disponíveis, selecionar a primeira
          if (!activeUnit && units.length > 0) {
            setActiveUnit(units[0]);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      } finally {
        setIsLoadingUnits(false);
      }
    };

    loadUnits();
  }, [token, setUserUnits, setActiveUnit, setIsLoadingUnits, activeUnit]);

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const unitId = e.target.value;
    const selectedUnit = userUnits.find(u => u.id === unitId);
    if (selectedUnit) {
      setActiveUnit(selectedUnit);
    }
  };

  if (isLoadingUnits) {
    return <div className="unit-selector loading">Carregando unidades...</div>;
  }

  if (userUnits.length === 0) {
    return <div className="unit-selector empty">Nenhuma unidade disponível</div>;
  }

  if (userUnits.length === 1) {
    return (
      <div className="unit-selector single">
        <label>Unidade:</label>
        <span className="unit-name">{activeUnit?.nome || userUnits[0].nome}</span>
      </div>
    );
  }

  return (
    <div className="unit-selector">
      <label htmlFor="unit-select">Unidade:</label>
      <select
        id="unit-select"
        value={activeUnit?.id || ''}
        onChange={handleUnitChange}
        className="unit-select"
      >
        <option value="">Selecione uma unidade</option>
        {userUnits.map(unit => (
          <option key={unit.id} value={unit.id}>
            {unit.nome}
          </option>
        ))}
      </select>
    </div>
  );
};
