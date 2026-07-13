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

  const buildCandidateBases = () => {
    const candidates = [];
    const add = (value) => {
      if (!value) return;
      const normalized = value.replace(/\/+$/, '');
      if (!normalized || candidates.includes(normalized)) return;
      candidates.push(normalized);
    };

    add(getConfiguredApiBase());

    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol || 'http:';
    const ports = [window.location.port, '8000', '8001', '8002', '8003', '8004', '5000', '3000', '8080'];
    const baseHosts = [
      `${protocol}//${host}`,
      `http://${host}`,
      'http://127.0.0.1',
      'http://localhost',
    ];

    baseHosts.forEach((baseHost) => {
      ports.forEach((port) => {
        add(port ? `${baseHost}:${port}` : baseHost);
      });
    });

    if (window.location.origin) add(window.location.origin);
    return candidates;
  };

  const probeApiBase = (base) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${base}/api/cars?limit=1`, false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(null);
      return (xhr.status >= 200 && xhr.status < 500) ? base : null;
    } catch (e) {
      return null;
    }
  };

  let API_BASE = getConfiguredApiBase();
  window.API_BASE = API_BASE;
  window.__API_BASE__ = API_BASE;

  const getStoredToken = () => {
    return localStorage.getItem('naa_token') || localStorage.getItem('token') || sessionStorage.getItem('naa_token') || sessionStorage.getItem('token');
  };

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

  const getStoredRole = () => {
    return localStorage.getItem('role') || sessionStorage.getItem('role') || null;
  };

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

  const getCurrentApiBase = () => window.API_BASE || window.__API_BASE__ || API_BASE || fallbackApiBase;

  const jsonRequest = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    };

    const url = path.startsWith('http') ? path : `${getCurrentApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
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

  const resolveApiBase = () => {
    const configured = getConfiguredApiBase();
    if (configured && configured !== fallbackApiBase) {
      API_BASE = configured;
      window.API_BASE = configured;
      window.__API_BASE__ = configured;
      return configured;
    }

    const candidates = buildCandidateBases();
    for (const candidate of candidates) {
      const detected = probeApiBase(candidate);
      if (detected) {
        API_BASE = detected;
        window.API_BASE = detected;
        window.__API_BASE__ = detected;
        return detected;
      }
    }

    return API_BASE;
  };

  window.API_CONFIG = {
    API_BASE: getCurrentApiBase(),
    getStoredToken,
    setStoredToken,
    clearStoredToken,
    getStoredRole,
    setStoredRole,
    getAuthHeaders,
    jsonRequest,
  };

  window.getApiBase = () => getCurrentApiBase();
  window.getAuthHeaders = getAuthHeaders;
  window.apiJson = jsonRequest;

  const resolved = resolveApiBase();
  window.API_CONFIG.API_BASE = resolved;
  window.API_BASE = resolved;
  window.__API_BASE__ = resolved;
})();
