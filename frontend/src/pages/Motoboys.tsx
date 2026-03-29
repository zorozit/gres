import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ModuleDetail.css';

export const Motoboys: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [motoboys, setMotoboys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    cpf: '',
    placa: '',
    dataAdmissao: new Date().toISOString().split('T')[0],
    comissao: '10',
    chavePixe: '',
    unidadeId: ''
  });

  useEffect(() => {
    fetchMotoboys();
  }, []);

  const fetchMotoboys = async () => {
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/motoboys`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setMotoboys(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar motoboys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiEndpoint}/motoboys`, {
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
          telefone: '',
          cpf: '',
          placa: '',
          dataAdmissao: new Date().toISOString().split('T')[0],
          comissao: '10',
          chavePixe: '',
          unidadeId: ''
        });
        fetchMotoboys();
      }
    } catch (error) {
      console.error('Erro ao salvar motoboy:', error);
    }
  };

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>🏍️ Gestão de Motoboys</h1>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          <section className="form-section">
            <h2>Cadastrar Motoboy</h2>
            <form onSubmit={handleSubmit}>
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
                <label>CPF</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                  placeholder="XXX.XXX.XXX-XX"
                  required
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
                <label>Placa da Moto</label>
                <input
                  type="text"
                  value={formData.placa}
                  onChange={(e) => setFormData({...formData, placa: e.target.value})}
                  placeholder="ABC-1234"
                />
              </div>
              <div className="form-group">
                <label>Data de Admissão</label>
                <input
                  type="date"
                  value={formData.dataAdmissao}
                  onChange={(e) => setFormData({...formData, dataAdmissao: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Comissão (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.comissao}
                  onChange={(e) => setFormData({...formData, comissao: e.target.value})}
                  placeholder="10"
                />
              </div>
              <div className="form-group">
                <label>Chave PIX</label>
                <input
                  type="text"
                  value={formData.chavePixe}
                  onChange={(e) => setFormData({...formData, chavePixe: e.target.value})}
                  placeholder="Chave PIX para pagamentos"
                />
              </div>
              <div className="form-group">
                <label>Unidade</label>
                <input
                  type="text"
                  value={formData.unidadeId}
                  onChange={(e) => setFormData({...formData, unidadeId: e.target.value})}
                  placeholder="ID da unidade"
                />
              </div>
              <button type="submit" className="submit-button">Cadastrar Motoboy</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Motoboys Registrados</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : motoboys.length === 0 ? (
              <p>Nenhum motoboy registrado</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Placa</th>
                    <th>Comissão</th>
                    <th>Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {motoboys.map((moto) => (
                    <tr key={moto.id}>
                      <td>{moto.nome}</td>
                      <td>{moto.cpf}</td>
                      <td>{moto.placa}</td>
                      <td>{moto.comissao}%</td>
                      <td>{moto.telefone}</td>
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
