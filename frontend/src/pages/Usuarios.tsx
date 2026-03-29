import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    perfil: 'operador',
    unidadeId: '',
    ativo: true
  });

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const fetchUsuarios = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/usuarios`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
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
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setFormData({
          email: '',
          nome: '',
          perfil: 'operador',
          unidadeId: '',
          ativo: true
        });
        fetchUsuarios();
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>🔐 Gestão de Usuários</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Criar Usuário</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="usuario@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Nome</label>
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
                  required
                >
                  <option value="admin">Administrador</option>
                  <option value="gerente">Gerente</option>
                  <option value="operador">Operador</option>
                  <option value="caixa">Caixa</option>
                </select>
              </div>
              <div className="form-group">
                <label>Unidade</label>
                <input
                  type="text"
                  value={formData.unidadeId}
                  onChange={(e) => setFormData({...formData, unidadeId: e.target.value})}
                  placeholder="ID da unidade (deixe em branco para todas)"
                />
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

          <section className="list-section">
            <h2>Usuários Registrados</h2>
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
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.nome}</td>
                      <td>{user.perfil}</td>
                      <td>{user.unidadeId || 'Todas'}</td>
                      <td>{user.ativo ? '✅ Ativo' : '❌ Inativo'}</td>
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
