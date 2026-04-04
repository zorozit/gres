import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: { email: string } | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
  email?: string;
  token?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      setUser(JSON.parse(stored));
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
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

      const userData = { email, perfil: data.user.perfil, unitId: data.user.unitId };
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(userData));
      // Salvar com TODAS as chaves usadas no app
      localStorage.setItem('token', data.token);
      localStorage.setItem('auth_token', data.token);   // usado em todos os fetch
      localStorage.setItem('user_role', data.user.perfil);
      localStorage.setItem('user_unit', data.user.unitId);
      localStorage.setItem('unit_id', data.user.unitId); // usado em Saidas e outros
      console.log('Login bem-sucedido! unitId:', data.user.unitId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Credenciais inválidas';
      setError(errorMsg);
      console.error('Login error:', err);
      throw err;
    } finally {
      setLoading(false);
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
  };

  const token = localStorage.getItem('token') || undefined;

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      login, 
      logout,
      loading,
      error,
      email: user?.email,
      token
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
