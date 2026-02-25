/**
 * src/lib/auth-client.js
 * Helper de autenticación para el lado CLIENTE (browser).
 * Importar con: import { getToken, apiFetch } from '/src/lib/auth-client.js'
 *
 * 
 * Soluciona:
 * - Evita código duplicado de getToken() en cada página
 * - Previene redirect loops: solo redirige a /login si NO estamos ya en /login
 * - Actualiza la cookie del servidor en cada refresh (para que el middleware SSR no expire)
 */

const API = 'https://ladespensa-services.eliseo050595.workers.dev';

let _accessToken = null;

/** Actualiza la cookie del refreshToken (la lee el middleware SSR de Astro) */
function persistRefreshCookie(token) {
  const maxAge = 30 * 24 * 60 * 60; // 30 días en segundos
  document.cookie = `refreshToken=${token}; Max-Age=${maxAge}; path=/; SameSite=Strict`;
}

/** Borra todos los tokens y redirige a login (solo si no estamos ya ahí) */
function forceLogout() {
  _accessToken = null;
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  // Borrar cookie
  document.cookie = 'refreshToken=; Max-Age=0; path=/';

  // Evitar redirect loop si ya estamos en /login
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

/**
 * Obtiene un accessToken válido.
 * - Si ya hay uno en memoria, lo devuelve directamente.
 * - Si no, usa el refreshToken de localStorage para obtener uno nuevo.
 * - Si el refresh falla → forceLogout()
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  if (_accessToken) return _accessToken;

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

    // Persistir el nuevo refreshToken (rotación)
    localStorage.setItem('refreshToken', data.refreshToken);
    persistRefreshCookie(data.refreshToken);

    return _accessToken;

  } catch (err) {
    console.error('[auth] Error en refresh:', err);
    forceLogout();
    return null;
  }
}

/**
 * Wrapper de fetch autenticado.
 * Agrega Authorization header y reintenta 1 vez si recibe 401.
 * @param {string} path - ruta relativa, ej: '/stock'
 * @param {RequestInit} options
 * @returns {Promise<object|null>}
 */
export async function apiFetch(path, options = {}) {
  const doRequest = async (token) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${API}${path}`, { ...options, headers });
  };

  let token = await getToken();
  if (!token) return null;

  let res = await doRequest(token);

  // Si 401 → el accessToken expiró en memoria pero el refresh puede renovarlo
  if (res.status === 401) {
    _accessToken = null; // forzar re-refresh
    token = await getToken();
    if (!token) return null;
    res = await doRequest(token);
  }

  // Si sigue siendo 401 después del retry → logout
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
