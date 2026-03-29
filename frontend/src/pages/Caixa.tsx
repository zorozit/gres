import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Caixa: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [caixas, setCaixas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    unidadeId: '',
    data: new Date().toISOString().split('T')[0],
    valor: '',
    descricao: ''
  });

  useEffect(() => {
    fetchCaixas();
  }, []);

  const fetchCaixas = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/caixa`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setCaixas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar caixas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/caixa`, {
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
          valor: '',
          descricao: ''
        });
        fetchCaixas();
      }
    } catch (error) {
      console.error('Erro ao salvar caixa:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>💰 Controle de Caixa</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Registrar Movimento</h2>
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
              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({...formData, descricao: e.target.value})}
                  placeholder="Descrição do movimento"
                />
              </div>
              <button type="submit" className="submit-button">Registrar</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Movimentos Registrados</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : caixas.length === 0 ? (
              <p>Nenhum movimento registrado</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {caixas.map((caixa) => (
                    <tr key={caixa.id}>
                      <td>{caixa.unidadeId}</td>
                      <td>{caixa.data}</td>
                      <td>R$ {parseFloat(caixa.valor).toFixed(2)}</td>
                      <td>{caixa.descricao}</td>
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
