/**
 * src/lib/auth-client.js
 * Helper de autenticación para el lado CLIENTE (browser).
 *
 * PROBLEMA RESUELTO: "refresh race condition"
 * Cuando múltiples apiFetch() se disparan en paralelo (ej: dashboard carga
 * /stock, /stock?alertas=true y /compras al mismo tiempo), todas detectan
 * que no hay accessToken y llaman a getToken() simultáneamente.
 * Con rotación de refresh tokens, el primer refresh invalida el refreshToken
 * que usan los siguientes → 401 → forceLogout() → cierre de sesión falso.
 *
 * SOLUCIÓN: Singleton de refresh (_refreshPromise).
 * Si ya hay un refresh en vuelo, todas las llamadas esperan ESE MISMO
 * promise en lugar de lanzar uno propio.
 */

const API = 'https://ladespensa-services.eliseo050595.workers.dev';

let _accessToken = null;
let _refreshPromise = null; // singleton: solo un refresh a la vez

function persistRefreshCookie(token) {
  const maxAge = 30 * 24 * 60 * 60;
  document.cookie = `refreshToken=${token}; Max-Age=${maxAge}; path=/; SameSite=Strict`;
}

function forceLogout() {
  _accessToken = null;
  _refreshPromise = null;
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  document.cookie = 'refreshToken=; Max-Age=0; path=/';
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
}

/** Ejecuta UN SOLO refresh aunque se llame N veces en paralelo */
function doRefresh() {
  // Si ya hay uno en curso, devolver el mismo promise
  if (_refreshPromise) return _refreshPromise;
  
  _refreshPromise = (async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) {
      forceLogout();
      return null;
    }
    
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      
      if (!res.ok) {
        forceLogout();
        return null;
      }
      
      const data = await res.json();
      _accessToken = data.accessToken;
      localStorage.setItem('refreshToken', data.refreshToken);
      persistRefreshCookie(data.refreshToken);
      return _accessToken;
      
    } catch (err) {
      console.error('[auth] refresh error:', err);
      forceLogout();
      return null;
    } finally {
      // Limpiar el singleton al terminar (éxito o error)
      _refreshPromise = null;
    }
  })();
  
  return _refreshPromise;
}

export async function getToken() {
  if (_accessToken) return _accessToken;
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
  
  if (res.status === 401) {
    // accessToken expiró durante la sesión → refrescar una vez más
    _accessToken = null;
    token = await doRefresh();
    if (!token) return null;
    res = await doRequest(token);
  }
  
  if (res.status === 401) {
    forceLogout();
    return null;
  }
  
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export { API };