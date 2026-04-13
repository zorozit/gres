import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await login(email, password);
      navigate('/modulos');
    } catch (err) {
      console.error('Erro ao fazer login:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Floating module icons animation */}
      <div className="floating-icons">
        <div className="icon-float" style={{ animationDelay: '0s', top: '10%', left: '10%' }}>💰</div>
        <div className="icon-float" style={{ animationDelay: '0.5s', top: '20%', right: '15%' }}>📅</div>
        <div className="icon-float" style={{ animationDelay: '1s', bottom: '15%', left: '15%' }}>📊</div>
        <div className="icon-float" style={{ animationDelay: '1.5s', bottom: '25%', right: '10%' }}>🏍️</div>
        <div className="icon-float" style={{ animationDelay: '2s', top: '40%', left: '5%' }}>👥</div>
        <div className="icon-float" style={{ animationDelay: '2.5s', top: '60%', right: '8%' }}>🏢</div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="logo-container">
            <div className="logo-icon">🍽️</div>
            <h1>GIRES</h1>
          </div>
          <p className="subtitle">Gestão Inteligente de Restaurantes</p>
          <div className="feature-badges">
            <span className="badge">📈 Analytics</span>
            <span className="badge">⚡ Real-time</span>
            <span className="badge">🔐 Seguro</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Entrando...
              </>
            ) : (
              <>
                <span>🔓</span>
                Acessar Sistema
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="modules-preview">
            <p className="modules-title">Módulos Disponíveis</p>
            <div className="modules-grid">
              <div className="module-item" title="Dashboard Operacional">
                <span className="module-icon">📊</span>
                <span className="module-name">Dashboard</span>
              </div>
              <div className="module-item" title="Controle de Caixa">
                <span className="module-icon">💰</span>
                <span className="module-name">Caixa</span>
              </div>
              <div className="module-item" title="Gestão de Escalas">
                <span className="module-icon">📅</span>
                <span className="module-name">Escalas</span>
              </div>
              <div className="module-item" title="Folha de Pagamento">
                <span className="module-icon">💵</span>
                <span className="module-name">Pagamento</span>
              </div>
              <div className="module-item" title="Gestão de Motoboys">
                <span className="module-icon">🏍️</span>
                <span className="module-name">Motoboys</span>
              </div>
              <div className="module-item" title="Colaboradores">
                <span className="module-icon">👥</span>
                <span className="module-name">Equipe</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
