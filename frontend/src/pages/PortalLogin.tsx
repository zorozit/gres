import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function stripCPF(value: string): string {
  return value.replace(/\D/g, '');
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function PortalLogin() {
  const navigate = useNavigate();

  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal troca de senha
  const [showModal, setShowModal] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [loginData, setLoginData] = useState<any>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const cpfNumeros = stripCPF(cpf);
    if (cpfNumeros.length !== 11) {
      setError('CPF deve ter 11 dígitos');
      return;
    }
    if (!senha.trim()) {
      setError('Informe a senha');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfNumeros, senha }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'CPF ou senha incorretos');
        return;
      }

      if (data.primeiroAcesso) {
        setLoginData(data);
        setShowModal(true);
      } else {
        localStorage.setItem('portal_token', data.token);
        localStorage.setItem('portal_user', JSON.stringify(data.colaborador || data.user || data));
        navigate('/portal', { replace: true });
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrocarSenha = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (novaSenha.length < 6) {
      setModalError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setModalError('As senhas não coincidem');
      return;
    }

    setModalLoading(true);
    try {
      const res = await fetch(`${apiUrl}/portal/trocar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaboradorId: loginData.colaboradorId || loginData.colaborador?.id,
          senhaAtual: senha,
          novaSenha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalError(data.error || data.message || 'Erro ao trocar senha');
        return;
      }

      // Salvar token (pode vir na resposta da troca ou do login original)
      const token = data.token || loginData.token;
      const user = data.colaborador || loginData.colaborador || loginData.user || loginData;
      localStorage.setItem('portal_token', token);
      localStorage.setItem('portal_user', JSON.stringify(user));
      navigate('/portal', { replace: true });
    } catch {
      setModalError('Erro de conexão. Tente novamente.');
    } finally {
      setModalLoading(false);
    }
  };

  /* ─── Media query via JS ─────────────────────────────────────────────── */
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 480;

  return (
    <div style={s.page}>
      <div style={{ ...s.card, ...(isMobile ? s.cardMobile : {}) }}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <span style={s.logoIcon}>👤</span>
          <h1 style={s.logoTitle}>Portal do Colaborador</h1>
          <span style={s.logoSub}>GIRES</span>
        </div>

        {/* Erro */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* Form */}
        <form onSubmit={handleLogin} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>CPF</label>
            <input
              style={s.input}
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={e => setCpf(formatCPF(e.target.value))}
              maxLength={14}
              autoComplete="username"
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Senha</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
            />
            <span style={s.hint}>Primeiro acesso? Use os 4 últimos dígitos do seu celular</span>
          </div>

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <a
          href="/"
          onClick={e => { e.preventDefault(); navigate('/'); }}
          style={s.backLink}
        >
          ← Voltar ao site
        </a>
      </div>

      {/* ── Modal Troca de Senha ── */}
      {showModal && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, ...(isMobile ? s.modalMobile : {}) }}>
            <h2 style={s.modalTitle}>🔒 Troca de Senha Obrigatória</h2>
            <p style={s.modalDesc}>
              Este é seu primeiro acesso. Por segurança, defina uma nova senha.
            </p>

            {modalError && <div style={s.errorBox}>{modalError}</div>}

            <form onSubmit={handleTrocarSenha} style={s.form}>
              <div style={s.field}>
                <label style={s.label}>Nova senha</label>
                <input
                  style={s.input}
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div style={s.field}>
                <label style={s.label}>Confirmar nova senha</label>
                <input
                  style={s.input}
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmarSenha}
                  onChange={e => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" style={s.btn} disabled={modalLoading}>
                {modalLoading ? 'Salvando...' : 'Salvar e Entrar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Estilos Inline ─────────────────────────────────────────────────────── */
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0d1b2a 0%, #1b3a5c 50%, #1a237e 100%)',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    padding: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px 36px 32px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  },
  cardMobile: {
    padding: '28px 20px 24px',
  },
  logoWrap: {
    textAlign: 'center' as const,
    marginBottom: '28px',
  },
  logoIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '8px',
  },
  logoTitle: {
    margin: '0 0 4px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#1a237e',
  },
  logoSub: {
    fontSize: '12px',
    letterSpacing: '3px',
    color: '#9e9e9e',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#37474f',
  },
  input: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1.5px solid #cfd8dc',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  hint: {
    fontSize: '11px',
    color: '#90a4ae',
    marginTop: '2px',
  },
  btn: {
    padding: '13px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #1a237e, #1565c0)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.5px',
    transition: 'opacity 0.2s',
    marginTop: '4px',
  },
  errorBox: {
    background: '#ffebee',
    color: '#c62828',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '4px',
    border: '1px solid #ef9a9a',
  },
  backLink: {
    display: 'block',
    textAlign: 'center' as const,
    marginTop: '20px',
    fontSize: '13px',
    color: '#78909c',
    textDecoration: 'none',
  },

  /* Modal */
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px 28px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  modalMobile: {
    padding: '24px 18px',
  },
  modalTitle: {
    margin: '0 0 8px',
    fontSize: '19px',
    fontWeight: 700,
    color: '#1a237e',
  },
  modalDesc: {
    margin: '0 0 20px',
    fontSize: '13px',
    color: '#78909c',
    lineHeight: 1.5,
  },
};
