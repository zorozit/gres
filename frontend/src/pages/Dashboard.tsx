import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit, setActiveUnit } = useUnit();
  const [unidades, setUnidades] = React.useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = React.useState(activeUnit?.id || '');

  React.useEffect(() => {
    const carregarUnidades = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://xmv7n047i6.execute-api.us-east-1.amazonaws.com';
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${apiUrl}/unidades`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (Array.isArray(data)) {
          setUnidades(data);
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      }
    };
    carregarUnidades();
  }, []);

  // Sincronizar selectedUnit quando activeUnit muda
  React.useEffect(() => {
    if (activeUnit) {
      setSelectedUnit(activeUnit.id);
    } else {
      setSelectedUnit('');
    }
  }, [activeUnit]);

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const unitId = e.target.value;
    setSelectedUnit(unitId);
    
    // Atualizar UnitContext
    const selectedUnitData = unidades.find(u => u.id === unitId);
    if (selectedUnitData) {
      setActiveUnit(selectedUnitData);
      // Disparar evento para módulos que ainda usam o antigo sistema
      window.dispatchEvent(new CustomEvent('unitChanged', { detail: selectedUnitData }));
    } else if (unitId === '') {
      // Se selecionou "Todas as Unidades"
      setActiveUnit(null);
      window.dispatchEvent(new CustomEvent('unitChanged', { detail: null }));
    }
  };

  const modules = [
    { icon: '💰', title: 'Controle de Caixa', desc: 'Gerencie aberturas, recebimentos e fechamentos', path: '/modulos/caixa' },
    { icon: '📅', title: 'Gestão de Escalas', desc: 'Organize turnos e presenças de colaboradores', path: '/modulos/escalas' },
    { icon: '💸', title: 'Registro de Saídas', desc: 'Controle despesas e saídas operacionais', path: '/modulos/saidas' },
    { icon: '👥', title: 'Gestão de Colaboradores', desc: 'Gerencie dados e históricos de funcionários', path: '/modulos/colaboradores' },
    { icon: '🏍️', title: 'Gestão de Motoboys', desc: 'Administre entregas e comissões', path: '/modulos/motoboys' },
    { icon: '🏢', title: 'Gestão de Unidades', desc: 'Administre as unidades do restaurante', path: '/modulos/unidades' },
    { icon: '👨‍💼', title: 'Gestão de Usuários', desc: 'Gerencie usuários e permissões do sistema', path: '/modulos/usuarios' },
  ];

  return (
    <div style={styles.pageWrapper}>
      <Header title="🍽️ GRES - Gestão de Restaurantes" showBack={false} />
      
      <main style={styles.container}>
        {unidades.length > 0 && (
          <div style={styles.unitSelectorSection}>
            <label style={styles.unitSelectorLabel}>Selecione a Unidade:</label>
            <select value={selectedUnit || ''} onChange={handleUnitChange} style={styles.unitSelector}>
              <option value="">Todas as Unidades</option>
              {unidades.map((unit: any) => (
                <option key={unit.id} value={unit.id}>{unit.nome}</option>
              ))}
            </select>
          </div>
        )}
        
        <div style={styles.welcomeSection}>
          <h2 style={styles.welcomeTitle}>Bem-vindo ao GRES! 👋</h2>
          <p style={styles.welcomeText}>Sistema de Gestão Operacional para Redes de Restaurantes</p>
        </div>

        <div style={styles.modulesSection}>
          <h3 style={styles.sectionTitle}>📋 Módulos Disponíveis</h3>
          <div style={styles.modulesGrid}>
            {modules.map((module) => (
              <div 
                key={module.path}
                style={styles.moduleCard}
                onClick={() => navigate(module.path)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
              >
                <div style={styles.moduleIcon}>{module.icon}</div>
                <h4 style={styles.moduleTitle}>{module.title}</h4>
                <p style={styles.moduleDesc}>{module.desc}</p>
                <div style={styles.moduleArrow}>→</div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.statusSection}>
          <h3 style={styles.sectionTitle}>✅ Status do Sistema</h3>
          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}></span>
              <span>API: Conectada</span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}></span>
              <span>Banco de Dados: Ativo</span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}></span>
              <span>Autenticação: Ativa</span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}></span>
              <span>Armazenamento: Disponível</span>
            </div>
          </div>
        </div>
      </main>

      <Footer showLinks={true} />
    </div>
  );
};

const styles = {
  pageWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
  },
  container: {
    padding: '40px 20px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
    flex: 1,
  },
  unitSelectorSection: {
    marginBottom: '30px',
    padding: '15px',
    backgroundColor: '#f0f8ff',
    borderRadius: '8px',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  } as React.CSSProperties,
  unitSelectorLabel: {
    fontWeight: 'bold',
    color: '#333',
  },
  unitSelector: {
    padding: '8px 12px',
    border: '1px solid #3498db',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  welcomeSection: {
    textAlign: 'center' as const,
    marginBottom: '40px',
  },
  welcomeTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  welcomeText: {
    fontSize: '16px',
    color: '#666',
    margin: 0,
  },
  modulesSection: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px',
    borderBottom: '2px solid #3498db',
    paddingBottom: '10px',
  },
  modulesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  } as React.CSSProperties,
  moduleCard: {
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties,
  moduleIcon: {
    fontSize: '40px',
    marginBottom: '12px',
    display: 'block',
  },
  moduleTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 8px 0',
  },
  moduleDesc: {
    fontSize: '13px',
    color: '#666',
    margin: 0,
    lineHeight: '1.4',
  },
  moduleArrow: {
    position: 'absolute' as const,
    bottom: '12px',
    right: '12px',
    fontSize: '20px',
    color: '#3498db',
    fontWeight: 'bold',
  } as React.CSSProperties,
  statusSection: {
    marginTop: '40px',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
  } as React.CSSProperties,
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#333',
  } as React.CSSProperties,
  statusDot: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#4CAF50',
    boxShadow: '0 0 5px rgba(76, 175, 80, 0.5)',
  },
};
