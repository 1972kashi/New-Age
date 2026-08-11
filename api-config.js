(function () {
  const fallbackApiBase = window.location.protocol === 'file:'
    ? 'http://localhost:8000'
    : window.location.origin;

  const getConfiguredApiBase = () => {
    if (window.API_BASE) return window.API_BASE;
    if (window.__API_BASE__) return window.__API_BASE__;
    if (document.body && document.body.dataset && document.body.dataset.apiBase) return document.body.dataset.apiBase;
    return fallbackApiBase;
  };

  const apiBase = getConfiguredApiBase() || fallbackApiBase;
  window.API_BASE = apiBase;
  window.__API_BASE__ = apiBase;

  const getStoredToken = () => localStorage.getItem('naa_token') || localStorage.getItem('token') || sessionStorage.getItem('naa_token') || sessionStorage.getItem('token');

  const setStoredToken = (token) => {
    if (!token) return;
    localStorage.setItem('naa_token', token);
    localStorage.setItem('token', token);
    sessionStorage.setItem('naa_token', token);
    sessionStorage.setItem('token', token);
  };

  const clearStoredToken = () => {
    localStorage.removeItem('naa_token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('naa_token');
    sessionStorage.removeItem('token');
  };

  const getStoredRole = () => localStorage.getItem('role') || sessionStorage.getItem('role') || null;

  const setStoredRole = (role) => {
    if (!role) return;
    localStorage.setItem('role', role);
    sessionStorage.setItem('role', role);
  };

  const getAuthHeaders = (extra = {}) => {
    const token = getStoredToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  const getApiBase = () => window.API_BASE || window.__API_BASE__ || apiBase || fallbackApiBase;

  const jsonRequest = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    };

    const url = path.startsWith('http') ? path : `${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch (e) { body = text; }
    }
    if (!response.ok) {
      const detail = body && (body.detail || body.message || body.error) ? (body.detail || body.message || body.error) : 'Request failed';
      throw new Error(detail);
    }
    return body;
  };

  window.API_CONFIG = {
    API_BASE: getApiBase(),
    getStoredToken,
    setStoredToken,
    clearStoredToken,
    getStoredRole,
    setStoredRole,
    getAuthHeaders,
    jsonRequest,
  };

  window.getApiBase = getApiBase;
  window.getAuthHeaders = getAuthHeaders;
  window.apiJson = jsonRequest;
})();
