import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: { email: string } | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;       // true durante verificação de sessão E durante login
  error: string | null;
  email?: string;
  token?: string;
  userUnitIds?: string[];  // unidades que o usuário tem acesso
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ email: string } | null>(null);
  // Inicia como TRUE para bloquear o guard de rota até verificar localStorage
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restaura sessão salva ao carregar/recarregar a página (F5)
  useEffect(() => {
    const stored = localStorage.getItem('user');
    const storedToken = localStorage.getItem('auth_token');
    if (stored && storedToken) {
      try {
        setUser(JSON.parse(stored));
        setIsAuthenticated(true);
      } catch {
        // JSON corrompido — limpa
        localStorage.removeItem('user');
      }
    }
    // Libera o guard de rota após verificação (síncrona, sem await)
    setSessionChecked(true);
  }, []);

  const login = async (email: string, password: string) => {
    setLoginLoading(true);
    setError(null);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      console.log('Tentando login com API:', apiEndpoint);
      
      const response = await fetch(`${apiEndpoint}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('Resposta da API:', response.status, response.statusText);

      const data = await response.json();
      console.log('Dados recebidos:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha na autenticação');
      }

      const rawUnitId = data.user.unitId || '';
      const unitIdClean = rawUnitId.replace(/\D/g, '').substring(0, 14);
      // unitIds: array de CNPJs das unidades do usuário
      const rawUnitIds: string[] = data.user.unitIds || (rawUnitId ? [rawUnitId] : []);
      const unitIdsClean = rawUnitIds.map((u: string) => u.replace(/\D/g, '').substring(0, 14)).filter(Boolean);

      const userData = { email, perfil: data.user.perfil, unitId: unitIdClean, unitIds: unitIdsClean, id: data.user.id };
      setUser(userData);
      setIsAuthenticated(true);
      // Persiste todas as chaves usadas pelo app
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', data.token);
      localStorage.setItem('auth_token', data.token);   // usado em todos os fetch
      localStorage.setItem('user_role', data.user.perfil);
      localStorage.setItem('user_unit', unitIdClean);
      localStorage.setItem('unit_id', unitIdClean);       // usado em Saidas e outros
      localStorage.setItem('user_unit_ids', JSON.stringify(unitIdsClean)); // array de unidades
      localStorage.setItem('user_id', data.user.id || '');
      console.log('Login bem-sucedido! unitId (CNPJ):', unitIdClean, '| unitIds:', unitIdsClean, '| userId:', data.user.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Credenciais inválidas';
      setError(errorMsg);
      console.error('Login error:', err);
      throw err;
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_unit');
    localStorage.removeItem('unit_id');
    localStorage.removeItem('user_unit_ids');
    localStorage.removeItem('user_id');
  };

  const token = localStorage.getItem('token') || undefined;
  const userUnitIds: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('user_unit_ids') || '[]'); }
    catch { return []; }
  })();

  // loading = true enquanto sessão não verificada OU durante o submit do login
  const loading = !sessionChecked || loginLoading;

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      login, 
      logout,
      loading,
      error,
      email: user?.email,
      token,
      userUnitIds
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
