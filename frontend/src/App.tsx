import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Modules } from './pages/Modules';
import { Caixa } from './pages/Caixa';
import { Escalas } from './pages/Escalas';
import { Saidas } from './pages/Saidas';
import { Unidades } from './pages/Unidades';
import { Usuarios } from './pages/Usuarios';
import { Colaboradores } from './pages/Colaboradores';
import { Motoboys } from './pages/Motoboys';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos"
            element={
              <ProtectedRoute>
                <Modules />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/caixa"
            element={
              <ProtectedRoute>
                <Caixa />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/escalas"
            element={
              <ProtectedRoute>
                <Escalas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/saidas"
            element={
              <ProtectedRoute>
                <Saidas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/unidades"
            element={
              <ProtectedRoute>
                <Unidades />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/usuarios"
            element={
              <ProtectedRoute>
                <Usuarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/colaboradores"
            element={
              <ProtectedRoute>
                <Colaboradores />
              </ProtectedRoute>
            }
          />
          <Route
            path="/modulos/motoboys"
            element={
              <ProtectedRoute>
                <Motoboys />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
