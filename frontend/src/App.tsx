import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UnitProvider } from './contexts/UnitContext';
import { PermissoesProvider } from './contexts/PermissoesContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
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
import RegrasSistema from './pages/RegrasSistema';
import Auditoria from './pages/Auditoria';
import Feriados from './pages/Feriados';
import FolhaPagamento from './pages/FolhaPagamento';
import FreelancerPagamento from './pages/FreelancerPagamento';
import MotoboyAuditoria from './pages/MotoboyAuditoria';
import { Extrato } from './pages/Extrato';
import AdiantamentosSaldos from './pages/AdiantamentosSaldos';
import ImportacoesContabeis from './pages/ImportacoesContabeis';
import FechamentoCaixaDinheiro from './pages/FechamentoCaixaDinheiro';
import Vagas from './pages/Vagas';
import FormularioVaga from './pages/FormularioVaga';
import ConciliacaoBancaria from './pages/ConciliacaoBancaria';
import Despesas from './pages/Despesas';
import Fornecedores from './pages/Fornecedores';
import Payslips from './pages/Payslips';
import HistoricoRemuneracoes from './pages/HistoricoRemuneracoes';
import { UpdateBanner } from './components/UpdateBanner';
import LandingPage from './pages/LandingPage';
import React from 'react';
import './App.css';

// Portal do colaborador
import PortalLogin from './pages/PortalLogin';
import Portal from './pages/Portal';
import Comunicados from './pages/Comunicados';

// Helper: envolve children em ProtectedRoute + AppLayout
function Protected({
  moduloId,
  children,
}: {
  moduloId?: string;
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute moduloId={moduloId}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <PermissoesProvider>
          <UnitProvider>
            <UpdateBanner />
            <Routes>
              {/* ── Rotas públicas ── */}
              <Route path="/login" element={<Login />} />

              {/* Formulário público de vagas — sem autenticação */}
              <Route path="/vaga/:vagaId" element={<FormularioVaga />} />

              {/* Redirect legado */}
              <Route path="/dashboard" element={<Navigate to="/modulos/dashboard" replace />} />

              {/* ── Tela de módulos (galeria de boas-vindas) — dentro do AppLayout ── */}
              <Route
                path="/modulos"
                element={
                  <ProtectedRoute>
                    <AppLayout><Modules /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* ── Rotas protegidas com sidebar ── */}

              {/* Operacional */}
              <Route path="/modulos/dashboard"
                element={<Protected moduloId="dashboard"><Dashboard /></Protected>} />

              <Route path="/modulos/caixa"
                element={<Protected moduloId="caixa"><Caixa /></Protected>} />

              <Route path="/modulos/escalas"
                element={<Protected moduloId="escalas"><Escalas /></Protected>} />

              <Route path="/modulos/saidas"
                element={<Protected moduloId="saidas"><Saidas /></Protected>} />

              <Route path="/modulos/motoboys"
                element={<Protected moduloId="motoboys"><Motoboys /></Protected>} />

              <Route path="/modulos/colaboradores"
                element={<Protected moduloId="colaboradores"><Colaboradores /></Protected>} />

              {/* Folha & Pagamento */}
              <Route path="/modulos/folha-pagamento"
                element={<Protected moduloId="folha-pagamento"><FolhaPagamento /></Protected>} />

              <Route path="/modulos/freelancer-pagamento"
                element={<Protected moduloId="freelancer-pagamento"><FreelancerPagamento /></Protected>} />

              <Route path="/modulos/adiantamentos-saldos"
                element={<Protected moduloId="adiantamentos-saldos"><AdiantamentosSaldos /></Protected>} />

              <Route path="/modulos/fechamento-dinheiro"
                element={<Protected moduloId="fechamento-dinheiro"><FechamentoCaixaDinheiro /></Protected>} />

              {/* Auditoria & Extrato */}
              <Route path="/modulos/extrato"
                element={<Protected moduloId="extrato"><Extrato /></Protected>} />

              <Route path="/modulos/motoboy-auditoria"
                element={<Protected moduloId="motoboy-auditoria"><MotoboyAuditoria /></Protected>} />

              <Route path="/modulos/auditoria"
                element={<Protected moduloId="auditoria"><Auditoria /></Protected>} />

              <Route path="/modulos/conciliacao-bancaria"
                element={<Protected moduloId="conciliacao-bancaria"><ConciliacaoBancaria /></Protected>} />

              {/* Financeiro */}
              <Route path="/modulos/despesas"
                element={<Protected moduloId="despesas"><Despesas /></Protected>} />

              <Route path="/modulos/fornecedores"
                element={<Protected moduloId="fornecedores"><Fornecedores /></Protected>} />

              <Route path="/modulos/importacoes-contabeis"
                element={<Protected moduloId="importacoes-contabeis"><ImportacoesContabeis /></Protected>} />

              {/* RH & Pessoas */}
              <Route path="/modulos/vagas"
                element={<Protected moduloId="vagas"><Vagas /></Protected>} />

              <Route path="/modulos/feriados"
                element={<Protected moduloId="feriados"><Feriados /></Protected>} />

              {/* Administração */}
              <Route path="/modulos/unidades"
                element={<Protected moduloId="unidades"><Unidades /></Protected>} />

              <Route path="/modulos/usuarios"
                element={<Protected moduloId="usuarios"><Usuarios /></Protected>} />

              <Route path="/modulos/permissoes"
                element={<Protected moduloId="permissoes"><PermissoesConfig /></Protected>} />
              <Route path="/modulos/payslips"
                element={<Protected moduloId="payslips"><Payslips /></Protected>} />

              <Route path="/modulos/historico-remuneracoes"
                element={<Protected moduloId="historico-remuneracoes"><HistoricoRemuneracoes /></Protected>} />

              <Route path="/modulos/regras-sistema"
                element={<Protected moduloId="regras-sistema"><RegrasSistema /></Protected>} />

              {/* Portal do Colaborador (auth própria, sem ProtectedRoute) */}
              <Route path="/portal/login" element={<PortalLogin />} />
              <Route path="/portal" element={<Portal />} />

              {/* Comunicados admin */}
              <Route path="/modulos/comunicados" element={<Protected moduloId="comunicados"><Comunicados /></Protected>} />

              {/* Landing page pública na raiz */}
              <Route path="/" element={<LandingPage />} />
            </Routes>
          </UnitProvider>
        </PermissoesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
