import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Saidas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [saidas, setSaidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    unidadeId: '',
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    valor: ''
  });

  useEffect(() => {
    fetchSaidas();
  }, []);

  const fetchSaidas = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/saidas`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setSaidas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar saídas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/saidas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setFormData({
          unidadeId: '',
          data: new Date().toISOString().split('T')[0],
          descricao: '',
          valor: ''
        });
        fetchSaidas();
      }
    } catch (error) {
      console.error('Erro ao salvar saída:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>💸 Registro de Saídas</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Registrar Saída</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Unidade</label>
                <input
                  type="text"
                  value={formData.unidadeId}
                  onChange={(e) => setFormData({...formData, unidadeId: e.target.value})}
                  placeholder="ID da unidade"
                  required
                />
              </div>
              <div className="form-group">
                <label>Data</label>
                <input
                  type="date"
                  value={formData.data}
                  onChange={(e) => setFormData({...formData, data: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({...formData, descricao: e.target.value})}
                  placeholder="Descrição da saída"
                  required
                />
              </div>
              <div className="form-group">
                <label>Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => setFormData({...formData, valor: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
              <button type="submit" className="submit-button">Registrar Saída</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Saídas Registradas</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : saidas.length === 0 ? (
              <p>Nenhuma saída registrada</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {saidas.map((saida) => (
                    <tr key={saida.id}>
                      <td>{saida.unidadeId}</td>
                      <td>{saida.data}</td>
                      <td>{saida.descricao}</td>
                      <td>R$ {parseFloat(saida.valor).toFixed(2)}</td>
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
