import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/responsive.css'
import { APP_VERSION, GIT_HASH, BUILD_TIME } from './hooks/useVersionCheck'

// Versão visível no console do navegador
console.info(
  `%c GRES %c v${APP_VERSION} (${GIT_HASH}) %c ${new Date(BUILD_TIME).toLocaleString('pt-BR')} `,
  'background:#1e40af;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px',
  'background:#3b82f6;color:#fff;padding:2px 6px',
  'background:#dbeafe;color:#1e3a8a;padding:2px 6px;border-radius:0 4px 4px 0',
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
// Deploy trigger Mon Mar 30 08:02:54 EDT 2026
