import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

interface Usuario {
  id: string;
  nome: string;
  cpf: string;
  celular: string;
  email?: string;
  perfil: string;
  unitId: string;
  ativo: boolean;
}

export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [novoUsuario, setNovoUsuario] = useState({
    nome: '',
    cpf: '',
    celular: '',
    email: '',
    perfil: 'operador',
    unitId: '',
    ativo: true,
    senha: ''
  });
  const [loading, setLoading] = useState(true);
  const [unidades, setUnidades] = useState<any[]>([]);

  useEffect(() => {
    carregarUsuarios();
    carregarUnidades();
  }, []);

  const carregarUsuarios = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Usuários carregados:', data);
        setUsuarios(Array.isArray(data) ? data : []);
      } else {
        console.error('Erro ao carregar usuários:', response.status);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarUnidades = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/unidades`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUnidades(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
    }
  };

  const handleSalvarNovoUsuario = async () => {
    if (!novoUsuario.nome || !novoUsuario.cpf || !novoUsuario.celular) {
      alert('Preencha os campos obrigatórios: Nome, CPF e Celular');
      return;
    }

    if (!novoUsuario.unitId) {
      alert('Selecione uma unidade');
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(novoUsuario)
      });
      if (response.ok) {
        setNovoUsuario({
          nome: '',
          cpf: '',
          celular: '',
          email: '',
          perfil: 'operador',
          unitId: '',
          ativo: true,
          senha: ''
        });
        carregarUsuarios();
        alert('Usuário criado com sucesso!');
      } else {
        alert('Erro ao criar usuário');
      }
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      alert('Erro ao criar usuário');
    }
  };

  const handleSalvarEdicao = async () => {
    if (!usuarioEditando || !usuarioEditando.nome || !usuarioEditando.cpf || !usuarioEditando.celular) {
      alert('Preencha os campos obrigatórios: Nome, CPF e Celular');
      return;
    }

    if (!usuarioEditando.unitId) {
      alert('Selecione uma unidade');
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios/${usuarioEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(usuarioEditando)
      });
      if (response.ok) {
        setUsuarioEditando(null);
        carregarUsuarios();
        alert('Usuário atualizado com sucesso!');
      } else {
        alert('Erro ao atualizar usuário');
      }
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      alert('Erro ao atualizar usuário');
    }
  };

  const handleDeletarUsuario = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este usuário?')) return;
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        carregarUsuarios();
        alert('Usuário deletado com sucesso!');
      } else {
        alert('Erro ao deletar usuário');
      }
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      alert('Erro ao deletar usuário');
    }
  };

  const handleToggleUnidade = (unitId: string, isNew: boolean = false) => {
    if (isNew) {
      setNovoUsuario({...novoUsuario, unitId: unitId});
    } else {
      if (usuarioEditando) {
        setUsuarioEditando({...usuarioEditando, unitId: unitId});
      }
    }
  };

  const styles = {
    container: { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    mainLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    coluna: { backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '4px' },
    formulario: { padding: '15px' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: 'bold' },
    input: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' as const },
    h2: { marginTop: 0 },
    botaoSalvar: { padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '20px', width: '100%' },
    botaoEditar: { padding: '8px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' },
    botaoDeletar: { padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const },
    tabela: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '20px' },
    th: { padding: '10px', textAlign: 'left' as const, borderBottom: '2px solid #ddd', backgroundColor: '#f0f0f0' },
    td: { padding: '10px', borderBottom: '1px solid #ddd' },
    checkboxGroup: { display: 'flex', flexDirection: 'column' as const, gap: '8px', marginTop: '8px' },
    checkbox: { display: 'flex', alignItems: 'center', gap: '8px' }
  };

  if (loading) {
    return <div style={styles.container}><p>Carregando...</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', marginRight: '10px' }}>← Voltar</button>
          <h1>👨‍💼 Gestão de Usuários</h1>
        </div>
        <div>
          <span style={{ marginRight: '20px' }}>Usuário: {email}</span>
          <button onClick={logout} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🚪 Sair</button>
        </div>
      </div>

      <div style={styles.mainLayout}>
        <div style={styles.coluna}>
          <div style={styles.formulario}>
            <h2 style={styles.h2}>➕ Novo Usuário</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome: * (obrigatório)</label>
              <input 
                type="text"
                value={novoUsuario.nome}
                onChange={(e) => setNovoUsuario({...novoUsuario, nome: e.target.value})}
                style={styles.input}
                placeholder="Nome completo"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>CPF: * (obrigatório)</label>
              <input 
                type="text"
                value={novoUsuario.cpf}
                onChange={(e) => setNovoUsuario({...novoUsuario, cpf: e.target.value})}
                style={styles.input}
                placeholder="000.000.000-00"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Celular: * (obrigatório)</label>
              <input 
                type="tel"
                value={novoUsuario.celular}
                onChange={(e) => setNovoUsuario({...novoUsuario, celular: e.target.value})}
                style={styles.input}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Email: (opcional)</label>
              <input 
                type="email"
                value={novoUsuario.email}
                onChange={(e) => setNovoUsuario({...novoUsuario, email: e.target.value})}
                style={styles.input}
                placeholder="usuario@email.com"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Perfil:</label>
              <select 
                value={novoUsuario.perfil}
                onChange={(e) => setNovoUsuario({...novoUsuario, perfil: e.target.value})}
                style={styles.input}
              >
                <option value="operador">Operador</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Unidade: * (obrigatório)</label>
              <select 
                value={novoUsuario.unitId}
                onChange={(e) => setNovoUsuario({...novoUsuario, unitId: e.target.value})}
                style={styles.input}
              >
                <option value="">Selecione uma unidade</option>
                {unidades.map((unit: any) => (
                  <option key={unit.id} value={unit.id}>{unit.nome}</option>
                ))}
              </select>
            </div>

            <button onClick={handleSalvarNovoUsuario} style={styles.botaoSalvar}>💾 Criar Usuário</button>
          </div>
        </div>

        <div style={styles.coluna}>
          <h2>📋 Usuários Cadastrados ({usuarios.length})</h2>
          {usuarios.length === 0 ? (
            <p>Nenhum usuário cadastrado</p>
          ) : (
            <div style={{overflowX: 'auto'}}>
              <table style={styles.tabela}>
                <thead>
                  <tr>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>CPF</th>
                    <th style={styles.th}>Celular</th>
                    <th style={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td style={styles.td}>{usuario.nome}</td>
                      <td style={styles.td}>{usuario.cpf}</td>
                      <td style={styles.td}>{usuario.celular}</td>
                      <td style={styles.td}>
                        <button onClick={() => setUsuarioEditando(usuario)} style={styles.botaoEditar}>✏️ Editar</button>
                        <button onClick={() => handleDeletarUsuario(usuario.id)} style={{...styles.botaoDeletar, marginLeft: '5px'}}>🗑️ Deletar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {usuarioEditando && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Editar Usuário</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome: * (obrigatório)</label>
              <input 
                type="text"
                value={usuarioEditando.nome}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, nome: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>CPF: * (obrigatório)</label>
              <input 
                type="text"
                value={usuarioEditando.cpf}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, cpf: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Celular: * (obrigatório)</label>
              <input 
                type="tel"
                value={usuarioEditando.celular}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, celular: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email: (opcional)</label>
              <input 
                type="email"
                value={usuarioEditando.email || ''}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, email: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Perfil:</label>
              <select 
                value={usuarioEditando.perfil}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, perfil: e.target.value})}
                style={styles.input}
              >
                <option value="operador">Operador</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Unidade: * (obrigatório)</label>
              <select 
                value={usuarioEditando.unitId}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, unitId: e.target.value})}
                style={styles.input}
              >
                <option value="">Selecione uma unidade</option>
                {unidades.map((unit: any) => (
                  <option key={unit.id} value={unit.id}>{unit.nome}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Ativo:</label>
              <select 
                value={usuarioEditando.ativo ? 'true' : 'false'}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, ativo: e.target.value === 'true'})}
                style={styles.input}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
            <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setUsuarioEditando(null)} style={{flex: 1, padding: '10px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancelar</button>
              <button onClick={handleSalvarEdicao} style={{flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Salvar</button>
              <button onClick={() => {
                if (usuarioEditando.id && window.confirm('Tem certeza que deseja deletar este usuário?')) {
                  handleDeletarUsuario(usuarioEditando.id);
                  setUsuarioEditando(null);
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
