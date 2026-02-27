/**
 * src/lib/auth-client.js
 *
 * Simple. El token ya está en window.__token, puesto por el script
 * del <head> en AppLayout ANTES de que cualquier página corra.
 * Este archivo solo es un helper de fetch que lo usa.
 */

const API = 'https://ladespensa-services.eliseo050595.workers.dev';

export async function apiFetch(path, options = {}) {
  // Esperar a que el token esté listo (la promesa del <head>)
  await window.__tokenReady;
  
  if (!window.__token) return null;
  
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (options.body instanceof FormData) delete headers['Content-Type'];
  headers['Authorization'] = 'Bearer ' + window.__token;
  
  const res = await fetch(API + path, { ...options, headers });
  
  if (res.status === 401) {
    // Token expiró en mitad de la sesión (raro, dura 8h) → logout limpio
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    document.cookie = 'refreshToken=; Max-Age=0; path=/';
    window.location.replace('/login');
    return null;
  }
  
  try { return await res.json(); } catch { return null; }
}

export { API };