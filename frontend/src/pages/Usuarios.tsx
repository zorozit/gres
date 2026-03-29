import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import '../styles/ModuleDetail.css';

export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  const { activeUnit } = useUnit();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    perfil: 'operador',
    ativo: true
  });

  useEffect(() => {
    if (activeUnit) {
      fetchUsuarios();
    }
  }, [activeUnit, token]);

  const fetchUsuarios = async () => {
    if (!token || !activeUnit) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/usuarios?unitId=${activeUnit.id}`, {
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
    if (!token || !activeUnit) {
      alert('Selecione uma unidade primeiro');
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
          ativo: true
        });
        fetchUsuarios();
      } else {
        alert('Erro ao criar usuário');
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      alert('Erro ao salvar usuário');
    }
  };

  if (!activeUnit) {
    return (
      <div className="module-detail-container">
        <header className="module-header">
          <div className="header-left">
            <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
            <h1>🔐 Gestão de Usuários</h1>
          </div>
        </header>
        <main className="module-main">
          <div className="empty-state">
            <p>⚠️ Selecione uma unidade para continuar</p>
            <button onClick={() => navigate('/modulos')}>Voltar para Módulos</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>🔐 Gestão de Usuários</h1>
          <p className="active-unit">Unidade: {activeUnit.nome}</p>
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
                <label>Status</label>
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
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.nome}</td>
                      <td>{user.perfil}</td>
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
