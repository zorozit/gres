import './App.css'

function App() {
  return (
    <div className="container">
      <h1>🍽️ GRES - Gestão de Restaurantes</h1>
      <p>Sistema de Gestão Operacional para Redes de Restaurantes</p>
      
      <div className="features">
        <h2>Funcionalidades</h2>
        <ul>
          <li>📊 Dashboard Operacional</li>
          <li>💰 Controle de Caixa</li>
          <li>📅 Gestão de Escalas</li>
          <li>💸 Registro de Saídas</li>
          <li>🏍️ Gestão de Motoboys</li>
          <li>👥 Gestão de Colaboradores</li>
        </ul>
      </div>

      <div className="info">
        <h3>Informações da API</h3>
        <p>API Endpoint: <code>{import.meta.env.VITE_API_ENDPOINT}</code></p>
        <p>Cognito User Pool: <code>{import.meta.env.VITE_COGNITO_USER_POOL_ID}</code></p>
        <p>Ambiente: <code>{import.meta.env.VITE_ENVIRONMENT}</code></p>
      </div>
    </div>
  )
}

export default App
