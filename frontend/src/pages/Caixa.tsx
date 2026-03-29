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
  conferencia?: string;
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
      const response = await fetch(`${apiUrl}/caixa?unitId=${unitId}&data=${dataSelecionada}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const registrosArray = (Array.isArray(data) ? data : data.registros || []) as RegistroCaixa[];
        setRegistros(registrosArray);
      }
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularTotais = (registro: Partial<RegistroCaixa>) => {
    // Total = Abertura + Maq1-6 + iFood + Dinheiro + PIX + Fiado (SEM Sangria)
    const total = (registro.abertura || 0) + 
                  (registro.maq1 || 0) + (registro.maq2 || 0) + (registro.maq3 || 0) + 
                  (registro.maq4 || 0) + (registro.maq5 || 0) + (registro.maq6 || 0) +
                  (registro.ifood || 0) + (registro.dinheiro || 0) + (registro.pix || 0) + 
                  (registro.fiado || 0);
    
    // Diferença = Sistema PDV - Total
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
    const hora = agora.toTimeString().split(' ')[0]; // HH:MM:SS
    
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
        alert('Erro ao salvar registro');
      }
    } catch (error) {
      console.error('Erro ao criar registro:', error);
      alert('Erro ao salvar registro');
    }
  };

  const handleEditarRegistro = (registro: RegistroCaixa) => {
    setRegistros(registros.map(r => 
      r.id === registro.id ? { ...r, editando: true } : r
    ));
  };

  const handleSalvarEdicao = async (registro: RegistroCaixa) => {
    const { total, diferenca } = calcularTotais(registro);
    
    const registroAtualizado = {
      ...registro,
      total,
      diferenca,
      editando: false
    };

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa/${registro.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registroAtualizado)
      });

      if (response.ok) {
        alert('Registro atualizado com sucesso!');
        setRegistros(registros.map(r => 
          r.id === registro.id ? registroAtualizado : r
        ));
      }
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
      alert('Erro ao atualizar registro');
    }
  };

  const handleCancelarEdicao = (id: string) => {
    setRegistros(registros.map(r => 
      r.id === id ? { ...r, editando: false } : r
    ));
  };

  const handleMudarCampo = (registro: RegistroCaixa, campo: string, valor: any) => {
    setRegistros(registros.map(r => 
      r.id === registro.id ? { ...r, [campo]: valor } : r
    ));
  };

  const handleMudarCampoNovo = (campo: string, valor: any) => {
    const novoValor = {
      ...novoRegistro,
      [campo]: valor
    };
    
    // Recalcular total se mudou um campo de valor
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

  const formatarData = (data: string) => {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  return (
    <div style={styles.pageWrapper}>
      <Header title="💰 Controle de Caixa" showBack={true} />
      <div style={styles.container}>

      <div style={styles.filtro}>
        <label>
          Data:
          <input 
            type="date" 
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            style={styles.input}
          />
        </label>
      </div>

      <div style={styles.formulario}>
        <h3>📝 Novo Registro</h3>
        <div style={styles.grid}>
          <div>
            <label>Responsável:</label>
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
          <div>
            <label>Período:</label>
            <select 
              value={novoRegistro.periodo}
              onChange={(e) => handleMudarCampoNovo('periodo', e.target.value)}
              style={styles.input}
            >
              <option>Dia</option>
              <option>Noite</option>
            </select>
          </div>
          <div>
            <label>Abertura (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.abertura || 0}
              onChange={(e) => handleMudarCampoNovo('abertura', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 1 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq1 || 0}
              onChange={(e) => handleMudarCampoNovo('maq1', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 2 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq2 || 0}
              onChange={(e) => handleMudarCampoNovo('maq2', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 3 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq3 || 0}
              onChange={(e) => handleMudarCampoNovo('maq3', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 4 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq4 || 0}
              onChange={(e) => handleMudarCampoNovo('maq4', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 5 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq5 || 0}
              onChange={(e) => handleMudarCampoNovo('maq5', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 6 (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.maq6 || 0}
              onChange={(e) => handleMudarCampoNovo('maq6', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>iFood (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.ifood || 0}
              onChange={(e) => handleMudarCampoNovo('ifood', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Dinheiro (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.dinheiro || 0}
              onChange={(e) => handleMudarCampoNovo('dinheiro', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>PIX (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.pix || 0}
              onChange={(e) => handleMudarCampoNovo('pix', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Fiado (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.fiado || 0}
              onChange={(e) => handleMudarCampoNovo('fiado', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Sangria (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.sangria || 0}
              onChange={(e) => handleMudarCampoNovo('sangria', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Sistema PDV (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.sistemaPdv || 0}
              onChange={(e) => handleMudarCampoNovo('sistemaPdv', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Referência (R$):</label>
            <input 
              type="number" 
              step="0.01"
              value={novoRegistro.referencia || 0}
              onChange={(e) => handleMudarCampoNovo('referencia', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.resumo}>
          <div style={styles.resumoItem}>
            <strong>Total:</strong> {formatarMoeda(novoRegistro.total || 0)}
          </div>
          <div style={styles.resumoItem}>
            <strong>Diferença:</strong> {formatarMoeda(novoRegistro.diferenca || 0)}
          </div>
        </div>

        <button onClick={handleCriarRegistro} style={styles.botao}>
          💾 Salvar Registro
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : registros.length === 0 ? (
        <p>Nenhum registro para esta data</p>
      ) : (
        <div style={styles.tabelaContainer}>
          <table style={styles.tabela}>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Período</th>
                <th>Responsável</th>
                <th>Abertura</th>
                <th>Maq1-6</th>
                <th>iFood</th>
                <th>Dinheiro</th>
                <th>PIX</th>
                <th>Fiado</th>
                <th>Total</th>
                <th>Sangria</th>
                <th>PDV</th>
                <th>Diferença</th>
                <th>Referência</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {registros.map(registro => (
                <tr key={registro.id} style={registro.editando ? styles.linhaEditando : {}}>
                  <td>{formatarData(registro.data)} {registro.hora}</td>
                  <td>{registro.periodo}</td>
                  <td>{registro.responsavelNome || registro.responsavel}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.abertura}
                      onChange={(e) => handleMudarCampo(registro, 'abertura', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.abertura)}</td>
                  <td>{registro.editando ? (
                    <div style={styles.maqContainer}>
                      {[1,2,3,4,5,6].map(i => (
                        <input 
                          key={i}
                          type="number" 
                          step="0.01"
                          value={String(registro[`maq${i}` as keyof RegistroCaixa] || 0)}
                          onChange={(e) => handleMudarCampo(registro, `maq${i}`, parseFloat(e.target.value))}
                          style={styles.inputMaq}
                          placeholder={`M${i}`}
                        />
                      ))}
                    </div>
                  ) : `${formatarMoeda(registro.maq1)} + ${formatarMoeda(registro.maq2)} + ${formatarMoeda(registro.maq3)} + ${formatarMoeda(registro.maq4)} + ${formatarMoeda(registro.maq5)} + ${formatarMoeda(registro.maq6)}`}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.ifood}
                      onChange={(e) => handleMudarCampo(registro, 'ifood', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.ifood)}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.dinheiro}
                      onChange={(e) => handleMudarCampo(registro, 'dinheiro', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.dinheiro)}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.pix}
                      onChange={(e) => handleMudarCampo(registro, 'pix', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.pix)}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.fiado}
                      onChange={(e) => handleMudarCampo(registro, 'fiado', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.fiado)}</td>
                  <td style={styles.totalCell}><strong>{formatarMoeda(registro.total)}</strong></td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.sangria}
                      onChange={(e) => handleMudarCampo(registro, 'sangria', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.sangria)}</td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.sistemaPdv}
                      onChange={(e) => handleMudarCampo(registro, 'sistemaPdv', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.sistemaPdv)}</td>
                  <td style={registro.diferenca !== 0 ? styles.diferencaNegativa : styles.diferencaPositiva}>
                    {registro.editando ? (
                  <input 
                    type="number" 
                    step="0.01"
                    value={registro.diferenca}
                    onChange={(e) => handleMudarCampo(registro, 'diferenca', parseFloat(e.target.value))}
                    style={styles.inputTabela}
                    disabled={true}
                  />
                    ) : formatarMoeda(registro.diferenca)}
                  </td>
                  <td>{registro.editando ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={registro.referencia}
                      onChange={(e) => handleMudarCampo(registro, 'referencia', parseFloat(e.target.value))}
                      style={styles.inputTabela}
                    />
                  ) : formatarMoeda(registro.referencia)}</td>
                  <td>
                    {registro.editando ? (
                      <div style={styles.acoes}>
                        <button 
                          onClick={() => handleSalvarEdicao(registro)}
                          style={styles.botaoSalvar}
                        >
                          ✓
                        </button>
                        <button 
                          onClick={() => handleCancelarEdicao(registro.id)}
                          style={styles.botaoCancelar}
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleEditarRegistro(registro)}
                        style={styles.botaoEditar}
                      >
                        ✏️
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
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
    maxWidth: '1400px',
    margin: '0 auto',
    flex: 1,
  },
  filtro: {
    marginBottom: '20px',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  formulario: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginBottom: '15px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
  },
  inputTabela: {
    width: '100%',
    padding: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '12px',
  },
  inputMaq: {
    width: '100%',
    padding: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '11px',
  },
  maqContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
  } as React.CSSProperties,
  resumo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
  } as React.CSSProperties,
  resumoItem: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  botao: {
    padding: '10px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tabelaContainer: {
    overflowX: 'auto' as const,
    marginTop: '20px',
  } as React.CSSProperties,
  tabela: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  totalCell: {
    backgroundColor: '#fff3cd',
    fontWeight: 'bold',
  },
  diferencaPositiva: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  diferencaNegativa: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  linhaEditando: {
    backgroundColor: '#e3f2fd',
  },
  acoes: {
    display: 'flex',
    gap: '5px',
  } as React.CSSProperties,
  botaoEditar: {
    padding: '5px 10px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  botaoSalvar: {
    padding: '5px 10px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  botaoCancelar: {
    padding: '5px 10px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
};
