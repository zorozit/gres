import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import '../styles/ModuleDetail.css';

interface Usuario {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  unitId: string;
  ativo: boolean;
}

interface Unidade {
  id: string;
  nome: string;
}

export const UsuariosEdicao: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  useUnit(); // Usar o contexto para manter a unidade ativa
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Usuario>>({});

  useEffect(() => {
    if (token) {
      fetchUnidades();
      fetchUsuarios();
    }
  }, [token]);

  const fetchUnidades = async () => {
    if (!token) return;
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/unidades`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUnidades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar unidades:', error);
    }
  };

  const fetchUsuarios = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (usuario: Usuario) => {
    setEditingId(usuario.id);
    setEditData({ ...usuario });
  };

  const handleSave = async () => {
    if (!token || !editingId) return;

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/usuarios/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editData)
      });

      if (response.ok) {
        setEditingId(null);
        fetchUsuarios();
        alert('Usuário atualizado com sucesso!');
      } else {
        alert('Erro ao atualizar usuário');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar usuário');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const getNomeUnidade = (unitId: string) => {
    const unidade = unidades.find(u => u.id === unitId);
    return unidade ? unidade.nome : 'N/A';
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>👥 Edição de Usuários</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="list-section">
            <h2>Todos os Usuários</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : usuarios.length === 0 ? (
              <p>Nenhum usuário registrado</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nome</th>
                    <th>Perfil</th>
                    <th>Unidade</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((user) => (
                    <tr key={user.id}>
                      {editingId === user.id ? (
                        <>
                          <td>{user.email}</td>
                          <td>
                            <input
                              type="text"
                              value={editData.nome || ''}
                              onChange={(e) => setEditData({...editData, nome: e.target.value})}
                              style={{ width: '100%' }}
                            />
                          </td>
                          <td>
                            <select
                              value={editData.perfil || ''}
                              onChange={(e) => setEditData({...editData, perfil: e.target.value})}
                              style={{ width: '100%' }}
                            >
                              <option value="admin">Administrador</option>
                              <option value="gerente">Gerente</option>
                              <option value="operador">Operador</option>
                              <option value="caixa">Caixa</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={editData.unitId || ''}
                              onChange={(e) => setEditData({...editData, unitId: e.target.value})}
                              style={{ width: '100%' }}
                            >
                              <option value="">Selecione uma unidade</option>
                              {unidades.map((unidade) => (
                                <option key={unidade.id} value={unidade.id}>
                                  {unidade.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <label>
                              <input
                                type="checkbox"
                                checked={editData.ativo !== false}
                                onChange={(e) => setEditData({...editData, ativo: e.target.checked})}
                              />
                              {editData.ativo !== false ? '✅ Ativo' : '❌ Inativo'}
                            </label>
                          </td>
                          <td>
                            <button onClick={handleSave} className="save-button">Salvar</button>
                            <button onClick={handleCancel} className="cancel-button">Cancelar</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{user.email}</td>
                          <td>{user.nome}</td>
                          <td>{user.perfil}</td>
                          <td>{getNomeUnidade(user.unitId)}</td>
                          <td>{user.ativo ? '✅ Ativo' : '❌ Inativo'}</td>
                          <td>
                            <button onClick={() => handleEdit(user)} className="edit-button">Editar</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
