import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import '../styles/ModuleDetail.css';

export const Escalas: React.FC = () => {
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="📅 Gestão de Escalas" showBack={true} />
      <main style={{ flex: 1, padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <section style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
            <h2>Criar Escala</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label>Unidade</label>
                <input
                  type="text"
                  value={formData.unidadeId}
                  onChange={(e) => setFormData({...formData, unidadeId: e.target.value})}
                  placeholder="ID da unidade"
                  required
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Data</label>
                <input
                  type="date"
                  value={formData.data}
                  onChange={(e) => setFormData({...formData, data: e.target.value})}
                  required
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Colaborador</label>
                <input
                  type="text"
                  value={formData.colaboradorId}
                  onChange={(e) => setFormData({...formData, colaboradorId: e.target.value})}
                  placeholder="ID do colaborador"
                  required
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Turno</label>
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
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Criar Escala</button>
            </form>
          </section>

          <section style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
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
      <Footer showLinks={true} />
    </div>
  );
};
