/**
 * src/lib/auth-client.js
 *
 * PROBLEMA: Las 3 llamadas paralelas (stock, compras, stock?alertas) llegan
 * a doRefresh() en el mismo tick. Aunque asignamos _refreshPromise, JS es
 * single-thread pero las asignaciones y los checks ocurren antes de que el
 * event loop procese el primer await — por eso el singleton "no funcionaba".
 *
 * SOLUCIÓN: Guardar el estado en window.__despensa para que sea un singleton
 * verdadero del contexto global del browser (no del módulo ES), que sí es
 * compartido de forma síncrona entre todas las importaciones del módulo.
 */

const API = 'https://ladespensa-services.eliseo050595.workers.dev';

// Namespace global — persiste mientras la pestaña esté abierta
if (!window.__despensa) {
  window.__despensa = {
    accessToken: null,
    refreshPromise: null,
  };
}

const state = window.__despensa;

function persistRefreshCookie(token) {
  const maxAge = 30 * 24 * 60 * 60;
  document.cookie = `refreshToken=${token}; Max-Age=${maxAge}; path=/; SameSite=Strict`;
}

function forceLogout() {
  state.accessToken = null;
  state.refreshPromise = null;
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  document.cookie = 'refreshToken=; Max-Age=0; path=/';
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
}

function doRefresh() {
  // Si ya hay un refresh en vuelo, todas las llamadas comparten este mismo promise
  if (state.refreshPromise) return state.refreshPromise;
  
  state.refreshPromise = (async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) { forceLogout(); return null; }
    
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      
      if (!res.ok) { forceLogout(); return null; }
      
      const data = await res.json();
      state.accessToken = data.accessToken;
      localStorage.setItem('refreshToken', data.refreshToken);
      persistRefreshCookie(data.refreshToken);
      return state.accessToken;
      
    } catch (err) {
      console.error('[auth] refresh error:', err);
      forceLogout();
      return null;
    } finally {
      state.refreshPromise = null; // liberar para próximos refreshes
    }
  })();
  
  return state.refreshPromise;
}

export async function getToken() {
  if (state.accessToken) return state.accessToken;
  return doRefresh();
}

export async function apiFetch(path, options = {}) {
  const doRequest = async (token) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (options.body instanceof FormData) delete headers['Content-Type'];
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API}${path}`, { ...options, headers });
  };
  
  let token = await getToken();
  if (!token) return null;
  
  let res = await doRequest(token);
  
  // 401 mid-session (accessToken expiró en memoria) → un solo reintento
  if (res.status === 401) {
    state.accessToken = null;
    token = await doRefresh();
    if (!token) return null;
    res = await doRequest(token);
  }
  
  if (res.status === 401) { forceLogout(); return null; }
  
  try { return await res.json(); } catch { return null; }
}

export { API };