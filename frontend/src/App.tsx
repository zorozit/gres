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
import { PermissoesConfig } from './pages/PermissoesConfig';
import FolhaPagamento from './pages/FolhaPagamento';
import { Extrato } from './pages/Extrato';
import AdiantamentosSaldos from './pages/AdiantamentosSaldos';
import ImportacoesContabeis from './pages/ImportacoesContabeis';
import FechamentoCaixaDinheiro from './pages/FechamentoCaixaDinheiro';
import { UpdateBanner } from './components/UpdateBanner';
import './App.css';

// Perfis com acesso a módulos administrativos/financeiros
const ADMIN_GERENTE = ['admin', 'administrador', 'gerente', 'manager'];
const ADMIN_ONLY    = ['admin', 'administrador'];

function App() {
  return (
    <Router>
      <AuthProvider>
        <UnitProvider>
          <UpdateBanner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={<Navigate to="/modulos/dashboard" replace />}
            />

            {/* Dashboard — admin/gerente */}
            <Route
              path="/modulos/dashboard"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Tela de módulos — todos */}
            <Route
              path="/modulos"
              element={
                <ProtectedRoute>
                  <Modules />
                </ProtectedRoute>
              }
            />

            {/* Caixa — todos */}
            <Route
              path="/modulos/caixa"
              element={
                <ProtectedRoute>
                  <Caixa />
                </ProtectedRoute>
              }
            />

            {/* Escalas — todos */}
            <Route
              path="/modulos/escalas"
              element={
                <ProtectedRoute>
                  <Escalas />
                </ProtectedRoute>
              }
            />

            {/* Saídas — admin/gerente */}
            <Route
              path="/modulos/saidas"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <Saidas />
                </ProtectedRoute>
              }
            />

            {/* Unidades — admin */}
            <Route
              path="/modulos/unidades"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <Unidades />
                </ProtectedRoute>
              }
            />

            {/* Usuários — admin */}
            <Route
              path="/modulos/usuarios"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <Usuarios />
                </ProtectedRoute>
              }
            />

            {/* Colaboradores — admin/gerente */}
            <Route
              path="/modulos/colaboradores"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <Colaboradores />
                </ProtectedRoute>
              }
            />

            {/* Motoboys — admin/gerente */}
            <Route
              path="/modulos/motoboys"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <Motoboys />
                </ProtectedRoute>
              }
            />

            {/* Permissões — admin */}
            <Route
              path="/modulos/permissoes"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <PermissoesConfig />
                </ProtectedRoute>
              }
            />

            {/* Folha de pagamento — admin/gerente */}
            <Route
              path="/modulos/folha-pagamento"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <FolhaPagamento />
                </ProtectedRoute>
              }
            />

            {/* Extrato — admin/gerente */}
            <Route
              path="/modulos/extrato"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <Extrato />
                </ProtectedRoute>
              }
            />

            {/* Empréstimos e saldos — admin/gerente */}
            <Route
              path="/modulos/adiantamentos-saldos"
              element={
                <ProtectedRoute allowedRoles={ADMIN_GERENTE}>
                  <AdiantamentosSaldos />
                </ProtectedRoute>
              }
            />

            {/* Importações contábeis — admin */}
            <Route
              path="/modulos/importacoes-contabeis"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <ImportacoesContabeis />
                </ProtectedRoute>
              }
            />

            {/* Fechamento dinheiro — todos */}
            <Route
              path="/modulos/fechamento-dinheiro"
              element={
                <ProtectedRoute>
                  <FechamentoCaixaDinheiro />
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
