/**
 * fetchAuth — wrapper do fetch() nativo com tratamento automático de JWT 401.
 * Drop-in replacement: troque fetch(url, opts) por fetchAuth(url, opts).
 * Redireciona para /login se o token expirou (401).
 */

// API URL from env

export async function fetchAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Injeta Authorization se não estiver no header
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    console.warn('[fetchAuth] 401 — token expirado, redirecionando para /login');
    localStorage.removeItem('auth_token');
    // Salvar URL atual para redirect pós-login
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.startsWith('/login') && currentPath !== '/') {
      localStorage.setItem('redirect_after_login', currentPath);
    }
    window.location.href = '/login';
    // Retorna response mesmo assim pra não quebrar chains
    return response;
  }

  return response;
}

/**
 * Helper para construir o header de auth (backward compat com padrão existente).
 * Uso: const auth = authHeaders(); fetch(url, auth);
 * Com tratamento de 401: use fetchAuth() diretamente.
 */
export function authHeaders(): { headers: { Authorization: string; 'Content-Type': string } } {
  const token = localStorage.getItem('auth_token') || '';
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
}

export default fetchAuth;
