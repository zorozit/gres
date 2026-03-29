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

export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  const { activeUnit } = useUnit();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Usuario>>({});
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    perfil: 'operador',
    unitId: '',
    ativo: true
  });

  useEffect(() => {
    if (token) {
      fetchUnidades();
      if (activeUnit) {
        fetchUsuarios();
      }
    }
  }, [activeUnit, token]);

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
    if (!token || !activeUnit) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/usuarios?unitId=${activeUnit.id}`, {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeUnit) {
      alert('Selecione uma unidade primeiro');
      return;
    }

    if (!formData.email || !formData.nome) {
      alert('Email e nome são obrigatórios');
      return;
    }

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          unitId: activeUnit.id
        })
      });
      
      if (response.ok) {
        setFormData({
          email: '',
          nome: '',
          perfil: 'operador',
          unitId: '',
          ativo: true
        });
        fetchUsuarios();
        alert('Usuário criado com sucesso!');
      } else {
        alert('Erro ao criar usuário');
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      alert('Erro ao salvar usuário');
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

  const handleChangePassword = async (usuarioEmail: string) => {
    const novaSenha = prompt(`Digite a nova senha para ${usuarioEmail}:`);
    if (!novaSenha) return;

    if (novaSenha.length < 8) {
      alert('A senha deve ter no mínimo 8 caracteres');
      return;
    }

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: usuarioEmail,
          newPassword: novaSenha
        })
      });

      if (response.ok) {
        alert('Senha alterada com sucesso!');
      } else {
        const erro = await response.json();
        alert(`Erro: ${erro.error || 'Erro ao alterar senha'}`);
      }
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      alert('Erro ao alterar senha');
    }
  };



  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>🔐 Gestão de Usuários</h1>
          {activeUnit && <span className="unit-badge">Unidade: {activeUnit.nome}</span>}
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          {/* Formulário de Criação */}
          <section className="form-section">
            <h2>Criar Novo Usuário</h2>
            <form onSubmit={handleSubmit} className="data-form">
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="usuario@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>Nome Completo *</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({...formData, nome: e.target.value})}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div className="form-group">
                <label>Perfil</label>
                <select
                  value={formData.perfil}
                  onChange={(e) => setFormData({...formData, perfil: e.target.value})}
                >
                  <option value="admin">Administrador</option>
                  <option value="gerente">Gerente</option>
                  <option value="operador">Operador</option>
                  <option value="caixa">Caixa</option>
                </select>
              </div>

              <div className="form-group">
                <label>Unidade *</label>
                <select
                  value={formData.unitId || (activeUnit?.id || '')}
                  onChange={(e) => setFormData({...formData, unitId: e.target.value})}
                  disabled={!!activeUnit}
                >
                  <option value="">Selecione uma unidade</option>
                  {unidades.map((unidade) => (
                    <option key={unidade.id} value={unidade.id}>
                      {unidade.nome}
                    </option>
                  ))}
                </select>
                {activeUnit && <small>Unidade selecionada: {activeUnit.nome}</small>}
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.ativo}
                    onChange={(e) => setFormData({...formData, ativo: e.target.checked})}
                  />
                  Usuário Ativo
                </label>
              </div>

              <button type="submit" className="submit-button">Criar Usuário</button>
            </form>
          </section>

          {/* Lista de Usuários */}
          <section className="list-section">
            <h2>Usuários da Unidade</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : usuarios.length === 0 ? (
              <p>Nenhum usuário registrado nesta unidade</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nome</th>
                    <th>Perfil</th>
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
                          <td>{user.ativo ? '✅ Ativo' : '❌ Inativo'}</td>
                          <td>
                            <button onClick={() => handleEdit(user)} className="edit-button">Editar</button>
                            <button onClick={() => handleChangePassword(user.email)} className="edit-button" style={{marginLeft: '5px', backgroundColor: '#FF9800'}}>🔑 Senha</button>
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
