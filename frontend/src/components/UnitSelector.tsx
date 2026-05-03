import React, { useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/UnitSelector.css';

export const UnitSelector: React.FC = () => {
  const { activeUnit, setActiveUnit, userUnits, setUserUnits, isLoadingUnits, setIsLoadingUnits } = useUnit();
  const { token, userUnitIds, user } = useAuth();
  const userRole = (user as any)?.perfil || localStorage.getItem('user_role') || '';
  const isAdmin = ['admin', 'Admin', 'Administrador', 'ADMIN'].includes(userRole);

  // Carregar unidades do usuário
  useEffect(() => {
    if (!token) return;

    const loadUnits = async () => {
      setIsLoadingUnits(true);
      try {
        const response = await fetch('https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod/unidades', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const allUnits = await response.json();

          // Admin vê todas; outros apenas as unidades vinculadas ao seu cadastro
          let units = allUnits;
          if (!isAdmin && userUnitIds && userUnitIds.length > 0) {
            units = allUnits.filter((u: any) => {
              const cnpj = (u.id || u.cnpj || '').replace(/\D/g, '').substring(0, 14);
              return userUnitIds.includes(cnpj);
            });
          }

          setUserUnits(units);

          // Se não há unidade ativa e há unidades disponíveis, selecionar a primeira
          if (!activeUnit && units.length > 0) {
            setActiveUnit(units[0]);
          }
          // Se a unidade ativa não está nas unidades permitidas, resetar para a primeira
          if (activeUnit && units.length > 0) {
            const ativa = units.find((u: any) => u.id === activeUnit.id);
            if (!ativa) setActiveUnit(units[0]);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      } finally {
        setIsLoadingUnits(false);
      }
    };

    loadUnits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
