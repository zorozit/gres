import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UnitProvider } from './contexts/UnitContext';
import { PermissoesProvider } from './contexts/PermissoesContext';
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

function App() {
  return (
    <Router>
      <AuthProvider>
        <PermissoesProvider>
        <UnitProvider>
          <UpdateBanner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Navigate to="/modulos/dashboard" replace />} />

            {/* Tela de módulos — qualquer autenticado */}
            <Route path="/modulos" element={<ProtectedRoute><Modules /></ProtectedRoute>} />

            {/* Cada rota verifica permissão pelo moduloId salvo */}
            <Route path="/modulos/dashboard"
              element={<ProtectedRoute moduloId="dashboard"><Dashboard /></ProtectedRoute>} />

            <Route path="/modulos/caixa"
              element={<ProtectedRoute moduloId="caixa"><Caixa /></ProtectedRoute>} />

            <Route path="/modulos/escalas"
              element={<ProtectedRoute moduloId="escalas"><Escalas /></ProtectedRoute>} />

            <Route path="/modulos/saidas"
              element={<ProtectedRoute moduloId="saidas"><Saidas /></ProtectedRoute>} />

            <Route path="/modulos/motoboys"
              element={<ProtectedRoute moduloId="motoboys"><Motoboys /></ProtectedRoute>} />

            <Route path="/modulos/colaboradores"
              element={<ProtectedRoute moduloId="colaboradores"><Colaboradores /></ProtectedRoute>} />

            <Route path="/modulos/folha-pagamento"
              element={<ProtectedRoute moduloId="folha-pagamento"><FolhaPagamento /></ProtectedRoute>} />

            <Route path="/modulos/extrato"
              element={<ProtectedRoute moduloId="extrato"><Extrato /></ProtectedRoute>} />

            <Route path="/modulos/adiantamentos-saldos"
              element={<ProtectedRoute moduloId="adiantamentos-saldos"><AdiantamentosSaldos /></ProtectedRoute>} />

            <Route path="/modulos/fechamento-dinheiro"
              element={<ProtectedRoute moduloId="fechamento-dinheiro"><FechamentoCaixaDinheiro /></ProtectedRoute>} />

            <Route path="/modulos/importacoes-contabeis"
              element={<ProtectedRoute moduloId="importacoes-contabeis"><ImportacoesContabeis /></ProtectedRoute>} />

            <Route path="/modulos/unidades"
              element={<ProtectedRoute moduloId="unidades"><Unidades /></ProtectedRoute>} />

            <Route path="/modulos/usuarios"
              element={<ProtectedRoute moduloId="usuarios"><Usuarios /></ProtectedRoute>} />

            <Route path="/modulos/permissoes"
              element={<ProtectedRoute moduloId="permissoes"><PermissoesConfig /></ProtectedRoute>} />

            <Route path="/" element={<Navigate to="/modulos" replace />} />
          </Routes>
        </UnitProvider>
        </PermissoesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
