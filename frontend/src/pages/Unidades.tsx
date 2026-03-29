import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Unidades: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [unidades, setUnidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nome: '',
    endereco: '',
    telefone: '',
    email: '',
    cnpj: '',
    gerente: ''
  });

  useEffect(() => {
    fetchUnidades();
  }, []);

  const fetchUnidades = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/unidades`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setUnidades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar unidades:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/unidades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setFormData({
          nome: '',
          endereco: '',
          telefone: '',
          email: '',
          cnpj: '',
          gerente: ''
        });
        fetchUnidades();
      }
    } catch (error) {
      console.error('Erro ao salvar unidade:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>🏢 Cadastro de Unidades</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Registrar Unidade</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nome da Unidade</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({...formData, nome: e.target.value})}
                  placeholder="Ex: Restaurante Centro"
                  required
                />
              </div>
              <div className="form-group">
                <label>CNPJ</label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
                  placeholder="XX.XXX.XXX/0001-XX"
                />
              </div>
              <div className="form-group">
                <label>Endereço</label>
                <input
                  type="text"
                  value={formData.endereco}
                  onChange={(e) => setFormData({...formData, endereco: e.target.value})}
                  placeholder="Rua, número, complemento"
                />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({...formData, telefone: e.target.value})}
                  placeholder="(XX) XXXXX-XXXX"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="contato@unidade.com.br"
                />
              </div>
              <div className="form-group">
                <label>Gerente</label>
                <input
                  type="text"
                  value={formData.gerente}
                  onChange={(e) => setFormData({...formData, gerente: e.target.value})}
                  placeholder="Nome do gerente"
                />
              </div>
              <button type="submit" className="submit-button">Registrar Unidade</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Unidades Registradas</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : unidades.length === 0 ? (
              <p>Nenhuma unidade registrada</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CNPJ</th>
                    <th>Telefone</th>
                    <th>Email</th>
                    <th>Gerente</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map((unidade) => (
                    <tr key={unidade.id}>
                      <td>{unidade.nome}</td>
                      <td>{unidade.cnpj}</td>
                      <td>{unidade.telefone}</td>
                      <td>{unidade.email}</td>
                      <td>{unidade.gerente}</td>
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
