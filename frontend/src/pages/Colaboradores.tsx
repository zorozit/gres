import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import '../styles/ModuleDetail.css';

export const Colaboradores: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  const { activeUnit } = useUnit();
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    dataAdmissao: new Date().toISOString().split('T')[0],
    salario: '',
    chavePixe: '',
    cargo: ''
  });

  useEffect(() => {
    if (activeUnit) {
      fetchColaboradores();
    }
  }, [activeUnit, token]);

  const fetchColaboradores = async () => {
    if (!token || !activeUnit) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/colaboradores?unitId=${activeUnit.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setColaboradores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar colaboradores:', error);
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
      const response = await fetch(`${apiEndpoint}/colaboradores`, {
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
          nome: '',
          email: '',
          telefone: '',
          cpf: '',
          dataAdmissao: new Date().toISOString().split('T')[0],
          salario: '',
          chavePixe: '',
          cargo: ''
        });
        fetchColaboradores();
      } else {
        alert('Erro ao criar colaborador');
      }
    } catch (error) {
      console.error('Erro ao salvar colaborador:', error);
      alert('Erro ao salvar colaborador');
    }
  };

  if (!activeUnit) {
    return (
      <div className="module-detail-container">
        <header className="module-header">
          <div className="header-left">
            <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
            <h1>👥 Gestão de Colaboradores</h1>
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
          <h1>👥 Gestão de Colaboradores</h1>
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
            <h2>Cadastrar Colaborador</h2>
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
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="email@example.com"
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
                <label>Cargo</label>
                <input
                  type="text"
                  value={formData.cargo}
                  onChange={(e) => setFormData({...formData, cargo: e.target.value})}
                  placeholder="Ex: Garçom, Chef, Gerente"
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
                <label>Salário</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.salario}
                  onChange={(e) => setFormData({...formData, salario: e.target.value})}
                  placeholder="0.00"
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
              <button type="submit" className="submit-button">Cadastrar Colaborador</button>
            </form>
          </section>

          <section className="list-section">
            <h2>Colaboradores da Unidade</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : colaboradores.length === 0 ? (
              <p>Nenhum colaborador registrado nesta unidade</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Cargo</th>
                    <th>Email</th>
                    <th>Salário</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map((colab) => (
                    <tr key={colab.id}>
                      <td>{colab.nome}</td>
                      <td>{colab.cpf}</td>
                      <td>{colab.cargo}</td>
                      <td>{colab.email}</td>
                      <td>R$ {parseFloat(colab.salario || 0).toFixed(2)}</td>
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
