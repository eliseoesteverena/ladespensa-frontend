/**
 * src/lib/auth-client.js
 * Lee window.__token que el <head> de AppLayout ya obtuvo.
 */

var API = 'https://ladespensa-services.eliseo050595.workers.dev';

export async function apiFetch(path, options) {
  options = options || {};
  
  console.log('[apiFetch] esperando __tokenReady para:', path);
  console.log('[apiFetch] window.__tokenReady existe?', !!window.__tokenReady);
  console.log('[apiFetch] window.__token existe?', !!window.__token);
  
  await window.__tokenReady;
  
  console.log('[apiFetch] __tokenReady resuelto. window.__token:', window.__token ? window.__token.substring(0, 20) + '...' : 'NULL');
  
  if (!window.__token) {
    console.error('[apiFetch] ❌ token null después de __tokenReady → no se hace fetch de', path);
    return null;
  }
  
  var headers = { 'Content-Type': 'application/json' };
  if (options.headers) {
    Object.assign(headers, options.headers);
  }
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  headers['Authorization'] = 'Bearer ' + window.__token;
  
  console.log('[apiFetch] 🚀 fetch a', path);
  
  var res = await fetch(API + path, Object.assign({}, options, { headers: headers }));
  
  console.log('[apiFetch] respuesta de', path, '→ status:', res.status);
  
  if (res.status === 401) {
    console.error('[apiFetch] 401 en', path, '→ logout');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    document.cookie = 'refreshToken=; Max-Age=0; path=/';
    window.location.replace('/login');
    return null;
  }
  
  try { return await res.json(); } catch { return null; }
}

export { API };