import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';

export const Login: React.FC = () => {
  const [email,     setEmail]    = useState('');
  const [password,  setPassword] = useState('');
  const [isLoading, setLoading]  = useState(false);
  const { login, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/modulos');
    } catch (err) {
      console.error('Erro ao fazer login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* ── Left: brand panel (shown ≥ 900 px) ───────────── */}
      <div className="login-left">
        <div className="login-brand">
          <span className="login-brand-logo">⚙️</span>
          <h1 className="login-brand-name">GIRES</h1>
          <p className="login-brand-tagline">
            Gestão Integrada de<br />Recursos, Equipes e Serviços
          </p>
        </div>

        <div className="login-features">
          {[
            { icon: '📊', title: 'Operação',    desc: 'Dashboard, escalas e controles em tempo real' },
            { icon: '💰', title: 'Financeiro',   desc: 'Caixa, saídas, despesas e conciliação' },
            { icon: '👥', title: 'Folha e RH',   desc: 'CLT, Freelancer, Motoboys e recrutamento' },
            { icon: '🔧', title: 'Administrativo', desc: 'Unidades, fornecedores e auditoria' },
          ].map(f => (
            <div key={f.title} className="login-feature-item">
              <div className="login-feature-icon">{f.icon}</div>
              <div className="login-feature-text">
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: login form ─────────────────────────────── */}
      <div className="login-right">
        <div className="login-card">

          {/* header */}
          <div className="login-header">
            <div className="login-logo-row">
              <span className="login-logo-icon">⚙️</span>
              <h1 className="login-logo-name">GIRES</h1>
            </div>
            <p className="login-subtitle">Gestão Integrada de Recursos, Equipes e Serviços</p>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} className="login-form">

            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <div className="input-wrap">
                <span className="input-icon">✉️</span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Senha</label>
              <div className="input-wrap">
                <span className="input-icon">🔑</span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="login-error">
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? (
                <><span className="login-spinner" /> Entrando...</>
              ) : (
                <>🔓 Acessar Sistema</>
              )}
            </button>
          </form>

          {/* footer */}
          <div className="login-footer-note">
            Sistema seguro de acesso restrito
            <div className="login-footer-badges">
              <span className="login-badge">🔐 Seguro</span>
              <span className="login-badge">⚡ Tempo real</span>
              <span className="login-badge">☁️ Cloud</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
