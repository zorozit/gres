import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Escalas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [escalas, setEscalas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    unidadeId: '',
    data: new Date().toISOString().split('T')[0],
    colaboradorId: '',
    turno: 'manhã'
  });

  useEffect(() => {
    fetchEscalas();
  }, []);

  const fetchEscalas = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/escalas`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setEscalas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar escalas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/escalas`, {
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
          colaboradorId: '',
          turno: 'manhã'
        });
        fetchEscalas();
      }
    } catch (error) {
      console.error('Erro ao salvar escala:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>📅 Gestão de Escalas</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Criar Escala</h2>
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
                <label>Colaborador</label>
                <input
                  type="text"
                  value={formData.colaboradorId}
                  onChange={(e) => setFormData({...formData, colaboradorId: e.target.value})}
                  placeholder="ID do colaborador"
                  required
                />
              </div>
              <div className="form-group">
                <label>Turno</label>
                <select
                  value={formData.turno}
                  onChange={(e) => setFormData({...formData, turno: e.target.value})}
                  required
                >
                  <option value="manhã">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </div>
              <button type="submit" className="submit-button">Criar Escala</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Escalas Registradas</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : escalas.length === 0 ? (
              <p>Nenhuma escala registrada</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Data</th>
                    <th>Colaborador</th>
                    <th>Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {escalas.map((escala) => (
                    <tr key={escala.id}>
                      <td>{escala.unidadeId}</td>
                      <td>{escala.data}</td>
                      <td>{escala.colaboradorId}</td>
                      <td>{escala.turno}</td>
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
