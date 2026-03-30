import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

export const Saidas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [abaSelecionada, setAbaSelecionada] = useState<'novo' | 'movimentos'>('novo');
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [registrosDia, setRegistrosDia] = useState<any[]>([]);
  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [novoRegistro, setNovoRegistro] = useState({
    responsavel: '',
    colaborador: '',
    descricao: '',
    valor: 0,
    data: dataSelecionada,
    unidade_id: ''
  });

  useEffect(() => {
    carregarUsuarios();
    carregarRegistros();
  }, [dataSelecionada]);

  const carregarUsuarios = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const carregarRegistros = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/saidas?data=${dataSelecionada}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRegistrosDia(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
    }
  };

  const handleMudarCampoNovo = (campo: string, valor: any) => {
    setNovoRegistro({ ...novoRegistro, [campo]: valor, data: dataSelecionada });
  };

  const handleSalvarRegistro = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(novoRegistro)
      });
      if (response.ok) {
        setNovoRegistro({
          responsavel: '',
          colaborador: '',
          descricao: '',
          valor: 0,
          data: dataSelecionada,
          unidade_id: ''
        });
        carregarRegistros();
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  const handleEditarRegistro = (registro: any) => {
    setRegistroEditando({ ...registro });
  };

  const handleSalvarEdicao = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/saidas/${registroEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(registroEditando)
      });
      if (response.ok) {
        setRegistroEditando(null);
        carregarRegistros();
      }
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
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
        carregarRegistros();
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const styles = {
    container: { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    abas: { display: 'flex', gap: '10px', marginBottom: '20px' },
    abaBtn: (ativo: boolean) => ({
      padding: '10px 20px',
      backgroundColor: ativo ? '#4CAF50' : '#ddd',
      color: ativo ? 'white' : 'black',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold'
    }),
    filtroSection: { marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' },
    mainLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    coluna1: { backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '4px' },
    coluna2: { backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '4px' },
    formulario: { padding: '15px' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: 'bold' },
    input: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
    h2: { marginTop: 0 },
    h3: { marginTop: '20px', marginBottom: '10px' },
    botaoSalvar: { padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '20px' },
    botaoEditar: { padding: '8px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' },
    botaoDeletar: { padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    registroActions: { display: 'flex', gap: '10px', marginTop: '10px' },
    registroItem: { padding: '10px', backgroundColor: 'white', borderRadius: '4px', marginBottom: '10px', border: '1px solid #ddd' },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', marginRight: '10px' }}>← Voltar</button>
          <h1>💸 Registro de Saídas</h1>
        </div>
        <div>
          <span style={{ marginRight: '20px' }}>Usuário: {email}</span>
          <span style={{ marginRight: '20px' }}>Unidade: -</span>
          <button onClick={logout} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🚪 Sair</button>
        </div>
      </div>

      <div style={styles.abas}>
        <button style={styles.abaBtn(abaSelecionada === 'novo')} onClick={() => setAbaSelecionada('novo')}>📝 Novo Registro</button>
        <button style={styles.abaBtn(abaSelecionada === 'movimentos')} onClick={() => setAbaSelecionada('movimentos')}>📊 Movimentos</button>
      </div>

      {abaSelecionada === 'novo' && (
        <>
          <div style={{...styles.filtroSection, display: 'flex', alignItems: 'center', gap: '10px'}}>
            <label style={styles.label}>📅 Data:</label>
            <button 
              onClick={() => {
                const data = new Date(dataSelecionada);
                data.setDate(data.getDate() - 1);
                setDataSelecionada(data.toISOString().split('T')[0]);
              }}
              style={{padding: '8px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}
            >
              ◀ Anterior
            </button>
            <input 
              type="date" 
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              style={styles.input}
            />
            <button 
              onClick={() => {
                const data = new Date(dataSelecionada);
                data.setDate(data.getDate() + 1);
                setDataSelecionada(data.toISOString().split('T')[0]);
              }}
              style={{padding: '8px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}
            >
              Próximo ▶
            </button>
            <button 
              onClick={() => setDataSelecionada(new Date().toISOString().split('T')[0])}
              style={{padding: '8px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}
            >
              Hoje
            </button>
          </div>

          <div style={styles.mainLayout}>
            <div style={styles.coluna1}>
              <div style={styles.formulario}>
                <h2 style={styles.h2}>📝 Nova Saída</h2>
                
                <div style={styles.formGroup}>
                  <label style={styles.label}>Responsável:</label>
                  <select 
                    value={novoRegistro.responsavel}
                    onChange={(e) => handleMudarCampoNovo('responsavel', e.target.value)}
                    style={styles.input}
                  >
                    <option value="">Selecione um responsável</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Colaborador:</label>
                  <select 
                    value={novoRegistro.colaborador}
                    onChange={(e) => handleMudarCampoNovo('colaborador', e.target.value)}
                    style={styles.input}
                  >
                    <option value="">Selecione um colaborador</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Descrição:</label>
                  <textarea 
                    value={novoRegistro.descricao}
                    onChange={(e) => handleMudarCampoNovo('descricao', e.target.value)}
                    style={{...styles.input, minHeight: '80px'}}
                    placeholder="Descrição da saída"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Valor (R$):</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={novoRegistro.valor}
                    onChange={(e) => handleMudarCampoNovo('valor', parseFloat(e.target.value) || 0)}
                    style={styles.input}
                  />
                </div>

                <button onClick={handleSalvarRegistro} style={styles.botaoSalvar}>💾 Salvar Saída</button>
              </div>
            </div>

            <div style={styles.coluna2}>
              <h2>📋 Saídas do Dia</h2>
              {registrosDia.length === 0 ? (
                <p>Nenhuma saída para esta data</p>
              ) : (
                registrosDia.map((registro) => (
                  <div key={registro.id} style={styles.registroItem}>
                    <div><strong>Responsável:</strong> {registro.responsavel}</div>
                    <div><strong>Colaborador:</strong> {registro.colaborador}</div>
                    <div><strong>Descrição:</strong> {registro.descricao}</div>
                    <div><strong>Valor:</strong> {formatarMoeda(registro.valor)}</div>
                    <div style={styles.registroActions}>
                      <button onClick={() => handleEditarRegistro(registro)} style={styles.botaoEditar}>✏️ Editar</button>
                      <button onClick={() => handleDeletarRegistro(registro.id)} style={styles.botaoDeletar}>🗑️ Deletar</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {registroEditando && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Editar Saída</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>Responsável:</label>
              <select 
                value={registroEditando.responsavel}
                onChange={(e) => setRegistroEditando({...registroEditando, responsavel: e.target.value})}
                style={styles.input}
              >
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Colaborador:</label>
              <select 
                value={registroEditando.colaborador}
                onChange={(e) => setRegistroEditando({...registroEditando, colaborador: e.target.value})}
                style={styles.input}
              >
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Descrição:</label>
              <textarea 
                value={registroEditando.descricao}
                onChange={(e) => setRegistroEditando({...registroEditando, descricao: e.target.value})}
                style={{...styles.input, minHeight: '80px'}}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Valor (R$):</label>
              <input 
                type="number"
                step="0.01"
                value={registroEditando.valor}
                onChange={(e) => setRegistroEditando({...registroEditando, valor: parseFloat(e.target.value) || 0})}
                style={styles.input}
              />
            </div>
            <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setRegistroEditando(null)} style={{flex: 1, padding: '10px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancelar</button>
              <button onClick={handleSalvarEdicao} style={{flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Salvar</button>
              <button onClick={() => {
                if (registroEditando.id && window.confirm('Tem certeza que deseja deletar este registro?')) {
                  handleDeletarRegistro(registroEditando.id);
                  setRegistroEditando(null);
                }
              }} style={{flex: 1, padding: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Deletar</button>
            </div>
          </div>
        </div>
      )}

      <Footer showLinks={true} />
    </div>
  );
};
