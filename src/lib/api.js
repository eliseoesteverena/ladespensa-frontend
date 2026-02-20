// src/lib/api.js
// Cliente centralizado para La Despensa API
// Maneja: base URL, headers, refresco automático de token, errores

export const API_BASE = 'https://ladespensa-services.eliseo050595.workers.dev';

// ─── Almacenamiento de tokens ─────────────────────────────────────────────────
// accessToken: solo en memoria (variable de módulo)
// refreshToken: en localStorage para persistencia entre recargas

let _accessToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

export function setRefreshToken(token) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('refreshToken', token);
  }
}

export function getRefreshToken() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('refreshToken');
  }
  return null;
}

export function clearTokens() {
  _accessToken = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }
}

// ─── Guardar y leer datos de usuario ────────────────────────────────────────

export function setUser(user) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function getUser() {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }
  return null;
}

export function isLoggedIn() {
  return !!_accessToken || !!getRefreshToken();
}

// ─── Fetch con reintento automático tras refresh ──────────────────────────────

async function tryRefresh() {
  const rt = getRefreshToken();
  if (!rt) return false;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });

  if (!res.ok) {
    clearTokens();
    return false;
  }

  const data = await res.json();
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return true;
}

/**
 * apiFetch — wrapper principal. Agrega Authorization header y maneja 401.
 * @param {string} path  - ruta relativa, ej: '/account/me'
 * @param {RequestInit} options - opciones fetch estándar
 * @returns {Promise<{success, data} | {success, error}>}
 */
export async function apiFetch(path, options = {}) {
  const makeRequest = async () => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // No sobreescribir Content-Type si es multipart (scan-etiqueta)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };

  let res = await makeRequest();

  // Token expirado → intentar refresh y reintentar
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await makeRequest();
    } else {
      // Refresh falló → redirigir al login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sesión expirada' } };
    }
  }

  const json = await res.json();
  return json;
}

// ─── Endpoints de Auth ────────────────────────────────────────────────────────

export const auth = {
  async register(payload) {
    return apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(email, password, tenant_id) {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenant_id }),
    });

    if (result.accessToken) {
      // Login devuelve estructura diferente (sin envelope)
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      return { success: true, data: result };
    }

    return result;
  },

  async logout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    clearTokens();
  },

  async verify() {
    return apiFetch('/auth/verify');
  },
};

// ─── Endpoints de Cuenta ──────────────────────────────────────────────────────

export const account = {
  async me() {
    return apiFetch('/account/me');
  },

  async updateMe(payload) {
    return apiFetch('/account/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async changePassword(current_password, new_password) {
    return apiFetch('/account/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    });
  },

  async workspace() {
    return apiFetch('/account/workspace');
  },

  async updateWorkspace(workspace_name) {
    return apiFetch('/account/workspace', {
      method: 'PATCH',
      body: JSON.stringify({ workspace_name }),
    });
  },

  async members() {
    return apiFetch('/account/workspace/members');
  },

  async sessions() {
    return apiFetch('/account/sessions');
  },

  async revokeSession(jti) {
    return apiFetch(`/account/sessions/${jti}`, { method: 'DELETE' });
  },
};

// ─── Endpoints de Stock ───────────────────────────────────────────────────────

export const stock = {
  async list(alertas = false) {
    return apiFetch(`/stock${alertas ? '?alertas=true' : ''}`);
  },

  async get(tipoId) {
    return apiFetch(`/stock/${tipoId}`);
  },

  async update(tipoId, payload) {
    return apiFetch(`/stock/${tipoId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

// ─── Endpoints de Compras ─────────────────────────────────────────────────────

export const compras = {
  async list() {
    return apiFetch('/compras');
  },

  async get(id) {
    return apiFetch(`/compras/${id}`);
  },

  async create(payload) {
    return apiFetch('/compras', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async gastos(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/compras/gastos${qs ? '?' + qs : ''}`);
  },
};

// ─── Escaneo ──────────────────────────────────────────────────────────────────

export const scan = {
  async etiqueta(file) {
    const form = new FormData();
    form.append('imagen', file);
    return apiFetch('/scan-etiqueta', { method: 'POST', body: form });
  },
};
