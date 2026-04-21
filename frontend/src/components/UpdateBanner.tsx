import { useVersionCheck } from '../hooks/useVersionCheck'

export function UpdateBanner() {
  const { updateAvailable, version, gitHash } = useVersionCheck()

  if (!updateAvailable) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 9999,
        backgroundColor: '#1e40af',
        color: '#fff',
        borderRadius: '0.75rem',
        padding: '0.875rem 1.25rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        maxWidth: '360px',
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Ícone */}
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔄</span>

      {/* Texto */}
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
          Nova versão disponível
        </div>
        <div style={{ opacity: 0.8, fontSize: '0.78rem' }}>
          Versão atual: <code style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 4, padding: '1px 5px' }}>{version}</code>
          {' '}· <span style={{ opacity: 0.7 }}>#{gitHash}</span>
        </div>
      </div>

      {/* Botão atualizar */}
      <button
        onClick={() => window.location.reload()}
        style={{
          backgroundColor: '#fff',
          color: '#1e40af',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '0.45rem 0.9rem',
          fontWeight: 700,
          fontSize: '0.82rem',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#dbeafe')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
      >
        Atualizar
      </button>
    </div>
  )
}
