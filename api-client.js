/**
 * api-client.js  —  Drop this into your HTML/JS project
 * ======================================================
 * A thin wrapper around the Python FastAPI backend.
 * Replaces your existing json-server fetch calls.
 *
 * Usage:
 *   <script src="api-client.js"></script>
 *   const cars = await API.cars.list({ fuel: "Diesel" });
 */

const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);

// ── Token helpers ──────────────────────────────────────────────────────────
const Auth = {
  getToken: ()        => localStorage.getItem("naa_token") || localStorage.getItem("token"),
  setToken: (t)       => (localStorage.setItem("token", t), localStorage.setItem("naa_token", t)),
  clearToken: ()      => (localStorage.removeItem("token"), localStorage.removeItem("naa_token")),
  getRole: ()         => localStorage.getItem("role") || (JSON.parse(localStorage.getItem('naa_session')||'{}').role),
  setRole: (r)        => (localStorage.setItem("role", r), (()=>{try{const s=JSON.parse(localStorage.getItem('naa_session')||'{}'); s.role=r; localStorage.setItem('naa_session', JSON.stringify(s));}catch(e){}})()),
  isLoggedIn: ()      => !!(localStorage.getItem("naa_token") || localStorage.getItem("token")),
  isAdmin: ()         => (localStorage.getItem("role") === "admin") || (JSON.parse(localStorage.getItem('naa_session')||'{}').role === 'admin'),
};

// ── Core fetch wrapper ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return null;                   // no content
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "API error");
  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────
const AuthAPI = {
  /**
   * Login — stores the JWT token automatically.
   * @param {string} email
   * @param {string} password
   */
  async login(email, password) {
    const body = new URLSearchParams({ username: email, password });
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    Auth.setToken(data.access_token);
    Auth.setRole(data.role);
    return data;
  },

  /**
   * Register a new user account.
   */
  async register({ fname, lname, email, phone, password }) {
    return apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ fname, lname, email, phone, password }),
    });
  },

  /** Get the currently logged-in user's profile. */
  async me() {
    return apiFetch("/auth/me");
  },

  logout() {
    Auth.clearToken();
    Auth.setRole("");
    window.location.href = "index.html";   // redirect to home
  },
};

// ── Cars ───────────────────────────────────────────────────────────────────
const CarsAPI = {
  /**
   * List cars with optional filters.
   * @param {Object} filters  e.g. { fuel:"Diesel", trans:"Manual", min_price:2000000 }
   */
  async list(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return apiFetch(`/cars${params ? "?" + params : ""}`);
  },

  /** Get one car by ID. */
  async get(id) {
    return apiFetch(`/cars/${id}`);
  },

  /** Create a car (admin only). */
  async create(carData) {
    return apiFetch("/cars", { method: "POST", body: JSON.stringify(carData) });
  },

  /** Update a car (admin only). */
  async update(id, carData) {
    return apiFetch(`/cars/${id}`, { method: "PUT", body: JSON.stringify(carData) });
  },

  /** Delete a car (admin only). */
  async delete(id) {
    return apiFetch(`/cars/${id}`, { method: "DELETE" });
  },
};

// ── Car Details ────────────────────────────────────────────────────────────
const CarDetailsAPI = {
  async list()         { return apiFetch("/carDetails"); },
  async get(id)        { return apiFetch(`/carDetails/${id}`); },
  async create(data)   { return apiFetch("/carDetails", { method: "POST", body: JSON.stringify(data) }); },
  async update(id, d)  { return apiFetch(`/carDetails/${id}`, { method: "PUT", body: JSON.stringify(d) }); },
  async delete(id)     { return apiFetch(`/carDetails/${id}`, { method: "DELETE" }); },
};

// ── Admin ──────────────────────────────────────────────────────────────────
const AdminAPI = {
  /** Dashboard stats — total cars, users, fuel breakdown, etc. */
  async stats()          { return apiFetch("/admin/stats"); },

  /** List all user accounts (passwords excluded). */
  async listUsers()      { return apiFetch("/admin/users"); },

  /** Delete a user account. */
  async deleteUser(id)   { return apiFetch(`/admin/users/${id}`, { method: "DELETE" }); },
};

// ── Image Upload ───────────────────────────────────────────────────────────
const UploadAPI = {
  /**
   * Upload a car image file.
   * @param {File} file  — from an <input type="file"> element
   * @returns {{ img: string, url: string }}  e.g. { img: "Pic/abc.jpg" }
   *
   * Example:
   *   const fileInput = document.getElementById("imgInput");
   *   const result    = await UploadAPI.image(fileInput.files[0]);
   *   carData.img     = result.img;   // store this path in the car record
   */
  async image(file) {
    const token = Auth.getToken();
    const form  = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE}/upload/image`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    return data;
  },
};

// ── Export as a single API object ──────────────────────────────────────────
const API = {
  auth:       AuthAPI,
  cars:       CarsAPI,
  carDetails: CarDetailsAPI,
  admin:      AdminAPI,
  upload:     UploadAPI,
  Auth,        // expose token helpers too
};

// Make available globally when loaded via <script> tag
window.API = API;
