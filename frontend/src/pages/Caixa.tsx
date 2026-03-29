import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

interface RegistroCaixa {
  id: string;
  unitId: string;
  data: string;
  hora: string;
  periodo: 'Dia' | 'Noite';
  responsavel: string;
  responsavelNome?: string;
  abertura: number;
  maq1: number;
  maq2: number;
  maq3: number;
  maq4: number;
  maq5: number;
  maq6: number;
  ifood: number;
  dinheiro: number;
  pix: number;
  fiado: number;
  sangria: number;
  total: number;
  sistemaPdv: number;
  diferenca: number;
  referencia: number;
  editando?: boolean;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export default function Caixa() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || '';
  
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [registros, setRegistros] = useState<RegistroCaixa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [registroEditando, setRegistroEditando] = useState<Partial<RegistroCaixa> | null>(null);
  const [novoRegistro, setNovoRegistro] = useState<Partial<RegistroCaixa>>({
    periodo: 'Dia',
    abertura: 0,
    maq1: 0,
    maq2: 0,
    maq3: 0,
    maq4: 0,
    maq5: 0,
    maq6: 0,
    ifood: 0,
    dinheiro: 0,
    pix: 0,
    fiado: 0,
    sangria: 0,
    sistemaPdv: 0,
    referencia: 0,
    responsavel: user?.email || '',
  });

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://xmv7n047i6.execute-api.us-east-1.amazonaws.com';

  // Carregar usuários da unidade
  useEffect(() => {
    if (unitId) {
      carregarUsuarios();
    }
  }, [unitId]);

  // Carregar registros ao mudar data ou unidade
  useEffect(() => {
    if (unitId) {
      carregarRegistros();
    }
  }, [dataSelecionada, unitId]);

  const carregarUsuarios = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios?unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsuarios(Array.isArray(data) ? data : data.usuarios || []);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const carregarRegistros = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const url = `${apiUrl}/caixa?unitId=${unitId}&data=${dataSelecionada}`;
      console.log('Carregando registros de:', url);
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('Status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Dados recebidos:', data);
        const registrosArray = (Array.isArray(data) ? data : data.registros || []) as RegistroCaixa[];
        console.log('Registros:', registrosArray);
        setRegistros(registrosArray);
      } else {
        const erro = await response.json();
        console.error('Erro:', erro);
        setRegistros([]);
      }
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
      setRegistros([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEditarRegistro = (registro: RegistroCaixa) => {
    setRegistroEditando(registro);
    console.log('Editando registro:', registro);
    // TODO: Implementar modal de edição
  };





  const handleDeletarRegistro = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        carregarRegistros();
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  };

  const calcularTotais = (registro: Partial<RegistroCaixa>) => {
    const total = (registro.abertura || 0) + 
                  (registro.maq1 || 0) + (registro.maq2 || 0) + (registro.maq3 || 0) + 
                  (registro.maq4 || 0) + (registro.maq5 || 0) + (registro.maq6 || 0) +
                  (registro.ifood || 0) + (registro.dinheiro || 0) + (registro.pix || 0) + 
                  (registro.fiado || 0);
    
    const diferenca = (registro.sistemaPdv || 0) - total;

    return { total, diferenca };
  };

  const handleCriarRegistro = async () => {
    if (!unitId) {
      alert('Selecione uma unidade primeiro!');
      return;
    }

    if (!novoRegistro.responsavel) {
      alert('Selecione um responsável!');
      return;
    }

    const { total, diferenca } = calcularTotais(novoRegistro);
    const agora = new Date();
    const hora = agora.toTimeString().split(' ')[0];
    
    const responsavelNome = usuarios.find(u => u.id === novoRegistro.responsavel)?.nome || '';
    
    const registroCompleto: RegistroCaixa = {
      id: `${unitId}-${dataSelecionada}-${novoRegistro.periodo}-${Date.now()}`,
      unitId,
      data: dataSelecionada,
      hora,
      periodo: novoRegistro.periodo as 'Dia' | 'Noite',
      responsavel: novoRegistro.responsavel || '',
      responsavelNome,
      abertura: novoRegistro.abertura || 0,
      maq1: novoRegistro.maq1 || 0,
      maq2: novoRegistro.maq2 || 0,
      maq3: novoRegistro.maq3 || 0,
      maq4: novoRegistro.maq4 || 0,
      maq5: novoRegistro.maq5 || 0,
      maq6: novoRegistro.maq6 || 0,
      ifood: novoRegistro.ifood || 0,
      dinheiro: novoRegistro.dinheiro || 0,
      pix: novoRegistro.pix || 0,
      fiado: novoRegistro.fiado || 0,
      sangria: novoRegistro.sangria || 0,
      total,
      sistemaPdv: novoRegistro.sistemaPdv || 0,
      diferenca,
      referencia: novoRegistro.referencia || 0,
    };

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registroCompleto)
      });

      if (response.ok) {
        alert('Registro salvo com sucesso!');
        setNovoRegistro({
          periodo: 'Dia',
          abertura: 0,
          maq1: 0,
          maq2: 0,
          maq3: 0,
          maq4: 0,
          maq5: 0,
          maq6: 0,
          ifood: 0,
          dinheiro: 0,
          pix: 0,
          fiado: 0,
          sangria: 0,
          sistemaPdv: 0,
          referencia: 0,
          responsavel: user?.email || '',
        });
        carregarRegistros();
      } else {
        const erro = await response.json();
        alert(`Erro ao salvar: ${erro.error}`);
      }
    } catch (error) {
      console.error('Erro ao criar registro:', error);
      alert('Erro ao salvar registro');
    }
  };

  const handleMudarCampoNovo = (campo: string, valor: any) => {
    const novoValor = {
      ...novoRegistro,
      [campo]: valor
    };
    
    if (['abertura', 'maq1', 'maq2', 'maq3', 'maq4', 'maq5', 'maq6', 'ifood', 'dinheiro', 'pix', 'fiado', 'sistemaPdv'].includes(campo)) {
      const { total, diferenca } = calcularTotais(novoValor);
      novoValor.total = total;
      novoValor.diferenca = diferenca;
    }
    
    setNovoRegistro(novoValor);
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };



  return (
    <div style={styles.pageWrapper}>
      <Header title="💰 Controle de Caixa" showBack={true} />
      <div style={styles.container}>
        
        {/* FILTRO DE DATA */}
        <div style={styles.filtroSection}>
          <label style={styles.label}>📅 Data:</label>
          <input 
            type="date" 
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            style={styles.inputData}
          />
        </div>

        {/* LAYOUT 2 COLUNAS: FORMULÁRIO | REGISTROS */}
        <div style={styles.mainLayout}>
          
          {/* COLUNA 1: FORMULÁRIO */}
          <div style={styles.coluna1}>
            <div style={styles.formulario}>
              <h2 style={styles.h2}>📝 Novo Registro</h2>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Responsável:</label>
                <select 
                  value={novoRegistro.responsavel || ''}
                  onChange={(e) => handleMudarCampoNovo('responsavel', e.target.value)}
                  style={styles.input}
                >
                  <option value="">Selecione um responsável</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Período:</label>
                <select 
                  value={novoRegistro.periodo}
                  onChange={(e) => handleMudarCampoNovo('periodo', e.target.value)}
                  style={styles.input}
                >
                  <option>Dia</option>
                  <option>Noite</option>
                </select>
              </div>

              <h3 style={styles.h3}>💵 Valores</h3>

              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Abertura (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.abertura || 0} onChange={(e) => handleMudarCampoNovo('abertura', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 1 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq1 || 0} onChange={(e) => handleMudarCampoNovo('maq1', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 2 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq2 || 0} onChange={(e) => handleMudarCampoNovo('maq2', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 3 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq3 || 0} onChange={(e) => handleMudarCampoNovo('maq3', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 4 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq4 || 0} onChange={(e) => handleMudarCampoNovo('maq4', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 5 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq5 || 0} onChange={(e) => handleMudarCampoNovo('maq5', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Maq 6 (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.maq6 || 0} onChange={(e) => handleMudarCampoNovo('maq6', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>iFood (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.ifood || 0} onChange={(e) => handleMudarCampoNovo('ifood', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Dinheiro (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.dinheiro || 0} onChange={(e) => handleMudarCampoNovo('dinheiro', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>PIX (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.pix || 0} onChange={(e) => handleMudarCampoNovo('pix', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Fiado (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.fiado || 0} onChange={(e) => handleMudarCampoNovo('fiado', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Sangria (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.sangria || 0} onChange={(e) => handleMudarCampoNovo('sangria', parseFloat(e.target.value))} style={styles.input} />
                </div>
              </div>

              <h3 style={styles.h3}>📊 Sistema</h3>

              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Sistema PDV (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.sistemaPdv || 0} onChange={(e) => handleMudarCampoNovo('sistemaPdv', parseFloat(e.target.value))} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Referência (R$):</label>
                  <input type="number" step="0.01" value={novoRegistro.referencia || 0} onChange={(e) => handleMudarCampoNovo('referencia', parseFloat(e.target.value))} style={styles.input} />
                </div>
              </div>

              {/* RESUMO */}
              <div style={styles.resumo}>
                <div style={styles.resumoItem}>
                  <span style={styles.resumoLabel}>Total:</span>
                  <span style={styles.resumoValor}>{formatarMoeda(novoRegistro.total || 0)}</span>
                </div>
                <div style={styles.resumoItem}>
                  <span style={styles.resumoLabel}>Diferença:</span>
                  <span style={{...styles.resumoValor, color: (novoRegistro.diferenca || 0) !== 0 ? '#d32f2f' : '#388e3c'}}>{formatarMoeda(novoRegistro.diferenca || 0)}</span>
                </div>
              </div>

              <button onClick={handleCriarRegistro} style={styles.botaoSalvar}>
                💾 Salvar Registro
              </button>
            </div>
          </div>

          {/* COLUNA 2: REGISTROS HISTÓRICOS */}
          <div style={styles.coluna2}>
            <div style={styles.registrosBox}>
              <h2 style={styles.h2}>📋 Registros do Dia</h2>
              
              {loading ? (
                <p style={styles.mensagem}>Carregando...</p>
              ) : registros.length === 0 ? (
                <p style={styles.mensagem}>Nenhum registro para esta data</p>
              ) : (
                <div style={styles.registrosList}>
                  {registros.map((registro, idx) => (
                    <div key={registro.id} style={styles.registroCard}>
                      <div style={styles.registroHeader}>
                        <span style={styles.registroIndex}>#{idx + 1}</span>
                        <span style={styles.registroPeriodo}>{registro.periodo}</span>
                        <span style={styles.registroHora}>{registro.hora}</span>
                      </div>
                      <div style={styles.registroContent}>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Responsável:</span>
                          <span style={styles.registroValue}>{registro.responsavelNome || registro.responsavel}</span>
                        </div>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Total:</span>
                          <span style={{...styles.registroValue, fontWeight: 'bold', color: '#1976d2'}}>{formatarMoeda(registro.total)}</span>
                        </div>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Sistema PDV:</span>
                          <span style={styles.registroValue}>{formatarMoeda(registro.sistemaPdv)}</span>
                        </div>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Diferença:</span>
                          <span style={{...styles.registroValue, color: registro.diferenca !== 0 ? '#d32f2f' : '#388e3c', fontWeight: 'bold'}}>{formatarMoeda(registro.diferenca)}</span>
                        </div>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Referência:</span>
                          <span style={styles.registroValue}>{formatarMoeda(registro.referencia)}</span>
                        </div>
                        <div style={styles.registroRow}>
                          <span style={styles.registroLabel}>Sangria:</span>
                          <span style={styles.registroValue}>{formatarMoeda(registro.sangria || 0)}</span>
                        </div>
                      </div>
                      <div style={styles.registroActions}>
                        <button onClick={() => handleEditarRegistro(registro)} style={styles.botaoEditar}>✏️ Editar</button>
                        {localStorage.getItem('user_role') === 'Admin' && (
                          <button onClick={() => handleDeletarRegistro(registro.id)} style={styles.botaoDeletar}>🗑️ Deletar</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {registroEditando && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Editar Registro</h2>
            <p>Modal de edição em desenvolvimento...</p>
            <button onClick={() => setRegistroEditando(null)}>Fechar</button>
          </div>
        </div>
      )}
      <Footer showLinks={true} />
    </div>
  );
}

const styles = {
  pageWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
  },
  container: {
    padding: '20px',
    maxWidth: '1600px',
    margin: '0 auto',
    width: '100%',
    flex: 1,
  },
  filtroSection: {
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  label: {
    fontWeight: 'bold' as const,
    fontSize: '14px',
    color: '#333',
  },
  inputData: {
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '150px',
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
    '@media (max-width: 1024px)': {
      gridTemplateColumns: '1fr',
    },
  } as React.CSSProperties,
  coluna1: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  coluna2: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  formulario: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  h2: {
    margin: '0 0 15px 0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  h3: {
    margin: '15px 0 10px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#666',
    borderBottom: '1px solid #ddd',
    paddingBottom: '5px',
  },
  formGroup: {
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  input: {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
  },
  grid2Col: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  } as React.CSSProperties,
  resumo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    padding: '15px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
    marginTop: '15px',
    marginBottom: '15px',
  } as React.CSSProperties,
  resumoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  resumoLabel: {
    fontSize: '12px',
    color: '#666',
    fontWeight: 'bold',
  },
  resumoValor: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#388e3c',
  },
  botaoSalvar: {
    padding: '12px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.3s',
  },
  registrosBox: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    height: 'fit-content',
  },
  registrosList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    maxHeight: '800px',
    overflowY: 'auto' as const,
  },
  registroCard: {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  registroHeader: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  registroIndex: {
    fontWeight: 'bold',
    color: '#1976d2',
    fontSize: '12px',
  },
  registroPeriodo: {
    backgroundColor: '#fff3cd',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  registroHora: {
    color: '#666',
    fontSize: '12px',
    marginLeft: 'auto',
  },
  registroContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginBottom: '10px',
  },
  registroActions: {
    display: 'flex',
    gap: '8px',
    paddingTop: '10px',
    borderTop: '1px solid #eee',
  } as React.CSSProperties,
  botaoEditar: {
    flex: 1,
    padding: '6px 10px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  botaoDeletar: {
    flex: 1,
    padding: '6px 10px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  registroRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  } as React.CSSProperties,
  registroLabel: {
    color: '#666',
    fontWeight: '600',
  },
  registroValue: {
    color: '#333',
    fontWeight: '500',
  },
  mensagem: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '20px',
    fontSize: '14px',
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    maxWidth: '600px',
    width: '90%',
    boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
  } as React.CSSProperties,
};
