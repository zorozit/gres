import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UnitProvider } from './contexts/UnitContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Modules } from './pages/Modules';
import Caixa from './pages/Caixa';
import { Escalas } from './pages/Escalas';
import { Saidas } from './pages/Saidas';
import { Unidades } from './pages/Unidades';
import { Usuarios } from './pages/Usuarios';
import Colaboradores from './pages/Colaboradores';
import { Motoboys } from './pages/Motoboys';
import { UsuariosEdicao } from './pages/UsuariosEdicao';
import FolhaPagamento from './pages/FolhaPagamento';
import { Extrato } from './pages/Extrato';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <UnitProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute adminOnly={true}>
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
            <Route
              path="/modulos/usuarios-edicao"
              element={
                <ProtectedRoute>
                  <UsuariosEdicao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/modulos/folha-pagamento"
              element={
                <ProtectedRoute>
                  <FolhaPagamento />
                </ProtectedRoute>
              }
            />
            <Route
              path="/modulos/extrato"
              element={
                <ProtectedRoute>
                  <Extrato />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/modulos" replace />} />
          </Routes>
        </UnitProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
