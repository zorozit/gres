import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';

interface RegistroCaixa {
  id: string;
  unitId: string;
  data: string;
  periodo: 'Dia' | 'Noite';
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
  sistema: number;
  diferenca: number;
  conferencia?: string;
  editando?: boolean;
}

export default function Caixa() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || '';
  const unitName = activeUnit?.nome || 'Unidade não selecionada';
  
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [registros, setRegistros] = useState<RegistroCaixa[]>([]);
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
  });

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://xmv7n047i6.execute-api.us-east-1.amazonaws.com';

  // Carregar registros ao mudar data ou unidade
  useEffect(() => {
    if (unitId) {
      carregarRegistros();
    }
  }, [dataSelecionada, unitId]);

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
    const total = (registro.maq1 || 0) + (registro.maq2 || 0) + (registro.maq3 || 0) + 
                  (registro.maq4 || 0) + (registro.maq5 || 0) + (registro.maq6 || 0) +
                  (registro.ifood || 0) + (registro.dinheiro || 0) + (registro.pix || 0) + 
                  (registro.fiado || 0);
    
    const sistema = (registro.abertura || 0) + total - (registro.sangria || 0);
    const diferenca = (registro.total || 0) - sistema;

    return { total, sistema, diferenca };
  };

  const handleCriarRegistro = async () => {
    if (!unitId) {
      alert('Selecione uma unidade primeiro!');
      return;
    }

    const { total, sistema, diferenca } = calcularTotais(novoRegistro);
    
    const registroCompleto: RegistroCaixa = {
      id: `${unitId}-${dataSelecionada}-${novoRegistro.periodo}`,
      unitId,
      data: dataSelecionada,
      periodo: novoRegistro.periodo as 'Dia' | 'Noite',
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
      sistema,
      diferenca,
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
        });
        carregarRegistros();
      }
    } catch (error) {
      console.error('Erro ao criar registro:', error);
    }
  };

  const handleEditarRegistro = (registro: RegistroCaixa) => {
    setRegistros(registros.map(r => 
      r.id === registro.id ? { ...r, editando: true } : r
    ));
  };

  const handleSalvarEdicao = async (registro: RegistroCaixa) => {
    const { total, sistema, diferenca } = calcularTotais(registro);
    
    const registroAtualizado = {
      ...registro,
      total,
      sistema,
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
        setRegistros(registros.map(r => 
          r.id === registro.id ? registroAtualizado : r
        ));
      }
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
    }
  };

  const handleCancelarEdicao = (id: string) => {
    setRegistros(registros.map(r => 
      r.id === id ? { ...r, editando: false } : r
    ));
  };

  const handleMudarCampo = (registro: RegistroCaixa, campo: string, valor: number) => {
    setRegistros(registros.map(r => 
      r.id === registro.id ? { ...r, [campo]: valor } : r
    ));
  };

  const handleMudarCampoNovo = (campo: string, valor: number | string) => {
    setNovoRegistro({
      ...novoRegistro,
      [campo]: typeof valor === 'string' ? valor : valor
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>💰 Controle de Caixa</h1>
        <p>Unidade: <strong>{unitName}</strong></p>
      </div>

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
              value={novoRegistro.abertura || 0}
              onChange={(e) => handleMudarCampoNovo('abertura', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 1 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq1 || 0}
              onChange={(e) => handleMudarCampoNovo('maq1', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 2 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq2 || 0}
              onChange={(e) => handleMudarCampoNovo('maq2', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 3 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq3 || 0}
              onChange={(e) => handleMudarCampoNovo('maq3', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 4 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq4 || 0}
              onChange={(e) => handleMudarCampoNovo('maq4', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 5 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq5 || 0}
              onChange={(e) => handleMudarCampoNovo('maq5', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Maq 6 (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.maq6 || 0}
              onChange={(e) => handleMudarCampoNovo('maq6', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>iFood (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.ifood || 0}
              onChange={(e) => handleMudarCampoNovo('ifood', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Dinheiro (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.dinheiro || 0}
              onChange={(e) => handleMudarCampoNovo('dinheiro', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>PIX (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.pix || 0}
              onChange={(e) => handleMudarCampoNovo('pix', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Fiado (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.fiado || 0}
              onChange={(e) => handleMudarCampoNovo('fiado', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Sangria (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.sangria || 0}
              onChange={(e) => handleMudarCampoNovo('sangria', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
          <div>
            <label>Total (R$):</label>
            <input 
              type="number" 
              value={novoRegistro.total || 0}
              onChange={(e) => handleMudarCampoNovo('total', parseFloat(e.target.value))}
              style={styles.input}
            />
          </div>
        </div>
        <button onClick={handleCriarRegistro} style={styles.botao}>
          ✓ Criar Registro
        </button>
      </div>

      <div style={styles.tabela}>
        <h3>📊 Registros do Dia</h3>
        {loading ? (
          <p>Carregando...</p>
        ) : registros.length === 0 ? (
          <p>Nenhum registro para esta data</p>
        ) : (
          <div style={styles.tabelaScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Abertura</th>
                  <th>Maq 1</th>
                  <th>Maq 2</th>
                  <th>Maq 3</th>
                  <th>Maq 4</th>
                  <th>Maq 5</th>
                  <th>Maq 6</th>
                  <th>iFood</th>
                  <th>Dinheiro</th>
                  <th>PIX</th>
                  <th>Fiado</th>
                  <th>Total</th>
                  <th>Sangria</th>
                  <th>Sistema</th>
                  <th>Dif</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(registro => (
                  <tr key={registro.id}>
                    <td>
                      {registro.editando ? (
                        <select 
                          value={registro.periodo}
                          onChange={(e) => handleMudarCampo(registro, 'periodo', e.target.value as any)}
                        >
                          <option>Dia</option>
                          <option>Noite</option>
                        </select>
                      ) : (
                        registro.periodo
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.abertura}
                          onChange={(e) => handleMudarCampo(registro, 'abertura', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.abertura.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq1}
                          onChange={(e) => handleMudarCampo(registro, 'maq1', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq1.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq2}
                          onChange={(e) => handleMudarCampo(registro, 'maq2', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq2.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq3}
                          onChange={(e) => handleMudarCampo(registro, 'maq3', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq3.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq4}
                          onChange={(e) => handleMudarCampo(registro, 'maq4', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq4.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq5}
                          onChange={(e) => handleMudarCampo(registro, 'maq5', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq5.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.maq6}
                          onChange={(e) => handleMudarCampo(registro, 'maq6', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.maq6.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.ifood}
                          onChange={(e) => handleMudarCampo(registro, 'ifood', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.ifood.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.dinheiro}
                          onChange={(e) => handleMudarCampo(registro, 'dinheiro', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.dinheiro.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.pix}
                          onChange={(e) => handleMudarCampo(registro, 'pix', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.pix.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.fiado}
                          onChange={(e) => handleMudarCampo(registro, 'fiado', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.fiado.toFixed(2)}`
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.total}
                          onChange={(e) => handleMudarCampo(registro, 'total', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.total.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      {registro.editando ? (
                        <input 
                          type="number" 
                          value={registro.sangria}
                          onChange={(e) => handleMudarCampo(registro, 'sangria', parseFloat(e.target.value))}
                          style={styles.inputTabela}
                        />
                      ) : (
                        `R$ ${registro.sangria.toFixed(2)}`
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      R$ {registro.sistema.toFixed(2)}
                    </td>
                    <td style={{ fontWeight: 'bold', color: registro.diferenca === 0 ? 'green' : 'red' }}>
                      R$ {registro.diferenca.toFixed(2)}
                    </td>
                    <td>
                      {registro.editando ? (
                        <>
                          <button onClick={() => handleSalvarEdicao(registro)} style={styles.botaoAcao}>✓</button>
                          <button onClick={() => handleCancelarEdicao(registro.id)} style={styles.botaoAcao}>✗</button>
                        </>
                      ) : (
                        <button onClick={() => handleEditarRegistro(registro)} style={styles.botaoAcao}>✏️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    backgroundColor: '#5B4B9F',
    color: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  filtro: {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
  },
  formulario: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #ddd',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginBottom: '15px',
  },
  input: {
    width: '100%',
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  inputTabela: {
    width: '100%',
    padding: '4px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '12px',
  },
  botao: {
    backgroundColor: '#5B4B9F',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  botaoAcao: {
    backgroundColor: '#5B4B9F',
    color: 'white',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '4px',
  },
  tabela: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #ddd',
  },
  tabelaScroll: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
};
