import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

export const Saidas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [abaSelecionada, setAbaSelecionada] = useState<'novo' | 'movimentos'>('novo');
  
  // Função para obter data local corretamente
  const getLocalDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Função para formatar data para exibição
  const formatarData = (dataISO: string) => {
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  };
  
  const [dataSelecionada, setDataSelecionada] = useState(getLocalDate());
  const [registrosDia, setRegistrosDia] = useState<any[]>([]);
  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [novoRegistro, setNovoRegistro] = useState({
    responsavel: email,
    colaborador: '',
    descricao: '',
    valor: 0,
    origem: 'Sangria',
    dataPagamento: ''
  });

  // Carregar colaboradores ao montar o componente
  useEffect(() => {
    carregarColaboradores();
    // Definir responsável como email do usuário atual
    setNovoRegistro(prev => ({ ...prev, responsavel: email }));
  }, [email]);

  // Carregar registros quando a data mudar
  useEffect(() => {
    console.log('Data mudou para:', dataSelecionada);
    carregarRegistros(dataSelecionada);
  }, [dataSelecionada]);



  const carregarColaboradores = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/colaboradores`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Colaboradores carregados:', data);
        setColaboradores(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const carregarRegistros = async (data: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const unitId = localStorage.getItem('unit_id');
      
      // Filtrar por data E unidade
      const response = await fetch(`${apiUrl}/saidas?data=${data}&unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Registros carregados para', data, 'unidade:', unitId, ':', data);
        setRegistrosDia(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
    }
  };

  const handleSalvarNovoRegistro = async () => {
    if (!novoRegistro.responsavel || !novoRegistro.colaborador || !novoRegistro.descricao || novoRegistro.valor === 0) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...novoRegistro,
          data: dataSelecionada,
          responsavel: email
        })
      });

      if (response.ok) {
        alert('Saída registrada com sucesso!');
        setNovoRegistro({
          responsavel: '',
          colaborador: '',
          descricao: '',
          valor: 0,
          origem: 'Sangria',
          dataPagamento: ''
        });
        carregarRegistros(dataSelecionada);
      } else {
        alert('Erro ao salvar saída');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar saída');
    }
  };

  const handleEditarRegistro = (registro: any) => {
    setRegistroEditando({ ...registro });
  };

  const handleSalvarEdicao = async () => {
    if (!registroEditando) return;

    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${apiUrl}/saidas/${registroEditando.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registroEditando)
      });

      if (response.ok) {
        alert('Saída atualizada com sucesso!');
        setRegistroEditando(null);
        carregarRegistros(dataSelecionada);
      } else {
        const errorData = await response.text();
        console.error('Erro na resposta:', errorData);
        alert('Erro ao atualizar saída');
      }
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('Erro ao atualizar saída');
    }
  };

  const handleDeletarRegistro = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;

    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${apiUrl}/saidas/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('Saída deletada com sucesso!');
        carregarRegistros(dataSelecionada);
      } else {
        alert('Erro ao deletar saída');
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
      alert('Erro ao deletar saída');
    }
  };

  const handleMudarData = (dias: number) => {
    const novaData = new Date(dataSelecionada);
    novaData.setDate(novaData.getDate() + dias);
    setDataSelecionada(novaData.toISOString().split('T')[0]);
  };

  const handleHoje = () => {
    setDataSelecionada(getLocalDate());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '15px 20px', borderBottom: '3px solid #3498db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Voltar</button>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>📋 Registro de Saídas</h1>
        </div>
        <button onClick={logout} style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🚪 Sair</button>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>

          {/* Abas */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => setAbaSelecionada('novo')}
              style={{
                padding: '10px 20px',
                backgroundColor: abaSelecionada === 'novo' ? '#28a745' : '#e9ecef',
                color: abaSelecionada === 'novo' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ➕ Novo Registro
            </button>
            <button
              onClick={() => setAbaSelecionada('movimentos')}
              style={{
                padding: '10px 20px',
                backgroundColor: abaSelecionada === 'movimentos' ? '#28a745' : '#e9ecef',
                color: abaSelecionada === 'movimentos' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              📊 Movimentos
            </button>
          </div>

          {/* Seletor de Data */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
            <label style={{ fontWeight: 'bold' }}>📅 Data:</label>
            <button onClick={() => handleMudarData(-1)} style={{ padding: '8px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              ◀ Anterior
            </button>
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <button onClick={() => handleMudarData(1)} style={{ padding: '8px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Próximo ▶
            </button>
            <button onClick={handleHoje} style={{ padding: '8px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Hoje
            </button>
          </div>

          {/* Aba Novo Registro */}
          {abaSelecionada === 'novo' && (
            <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
              <h2>➕ Nova Saída</h2>
              <div style={{ display: 'grid', gap: '15px' }}>
                <div>
                  <label style={{ fontWeight: 'bold' }}>Responsável: *</label>
                  <input
                    type="text"
                    value={email}
                    disabled
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: '#e9ecef', cursor: 'not-allowed' }}
                  />
                  <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>Registrado automaticamente como o usuário atual</small>
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>Colaborador: *</label>
                  <select
                    value={novoRegistro.colaborador}
                    onChange={(e) => setNovoRegistro({ ...novoRegistro, colaborador: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="">Selecione um colaborador</option>
                    {colaboradores.map((colab) => (
                      <option key={colab.id} value={colab.nome || colab.email}>
                        {colab.nome || colab.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>Descrição: *</label>
                  <input
                    type="text"
                    placeholder="Descrição da saída"
                    value={novoRegistro.descricao}
                    onChange={(e) => setNovoRegistro({ ...novoRegistro, descricao: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>Valor (R$): *</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={novoRegistro.valor}
                    onChange={(e) => setNovoRegistro({ ...novoRegistro, valor: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>Origem:</label>
                  <select
                    value={novoRegistro.origem}
                    onChange={(e) => setNovoRegistro({ ...novoRegistro, origem: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="Sangria">Sangria</option>
                    <option value="Caixa">Caixa</option>
                    <option value="PIX">PIX</option>
                    <option value="A receber">A receber</option>
                    <option value="A pagar">A pagar</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>Data de Pagamento:</label>
                  <input
                    type="date"
                    value={novoRegistro.dataPagamento}
                    onChange={(e) => setNovoRegistro({ ...novoRegistro, dataPagamento: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>

                <button
                  onClick={handleSalvarNovoRegistro}
                  style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  💾 Salvar Saída
                </button>
              </div>
            </div>
          )}

          {/* Aba Movimentos */}
          {abaSelecionada === 'movimentos' && (
            <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
              <h2>📊 Saídas do Dia ({formatarData(dataSelecionada)})</h2>
              {registrosDia.length === 0 ? (
                <p>Nenhuma saída registrada para esta data</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#007bff', color: 'white' }}>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Responsável</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Colaborador</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Descrição</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Origem</th>
                        <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>Valor</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Data Pagamento</th>
                        <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrosDia.map((registro) => (
                        <tr key={registro.id} style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: '10px', border: '1px solid #ddd' }}>{registro.responsavel || '-'}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd' }}>{registro.colaborador || registro.favorecido || '-'}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd' }}>{registro.descricao || '-'}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd' }}>{registro.origem || '-'}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>R$ {parseFloat(registro.valor || 0).toFixed(2)}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd' }}>{formatarData(registro.dataPagamento) || '-'}</td>
                          <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                            <button
                              onClick={() => handleEditarRegistro(registro)}
                              style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' }}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => handleDeletarRegistro(registro.id)}
                              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              🗑️ Deletar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Modal de Edição */}
          {registroEditando && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2>✏️ Editar Saída</h2>
                <div style={{ display: 'grid', gap: '15px' }}>
                  <div>
                    <label style={{ fontWeight: 'bold' }}>Responsável:</label>
                    <input
                      type="text"
                      value={registroEditando.responsavel || ''}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, responsavel: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 'bold' }}>Colaborador:</label>
                    <input
                      type="text"
                      value={registroEditando.colaborador || registroEditando.favorecido || ''}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, colaborador: e.target.value, favorecido: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 'bold' }}>Descrição:</label>
                    <input
                      type="text"
                      value={registroEditando.descricao || ''}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, descricao: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 'bold' }}>Valor (R$):</label>
                    <input
                      type="number"
                      value={registroEditando.valor || 0}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, valor: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 'bold' }}>Origem:</label>
                    <select
                      value={registroEditando.origem || 'Sangria'}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, origem: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                      <option value="Sangria">Sangria</option>
                      <option value="Caixa">Caixa</option>
                      <option value="PIX">PIX</option>
                      <option value="A receber">A receber</option>
                      <option value="A pagar">A pagar</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontWeight: 'bold' }}>Data de Pagamento:</label>
                    <input
                      type="date"
                      value={registroEditando.dataPagamento || ''}
                      onChange={(e) => setRegistroEditando({ ...registroEditando, dataPagamento: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleSalvarEdicao}
                      style={{ flex: 1, padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      💾 Salvar
                    </button>
                    <button
                      onClick={() => setRegistroEditando(null)}
                      style={{ flex: 1, padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✕ Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};
