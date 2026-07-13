const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);

function initSession(){
  const session = JSON.parse(localStorage.getItem('naa_session')||'null');
  if(!session||session.role!=='admin'){
    window.location.href='login.html';
    return;
  }
  document.getElementById('nav-name').textContent = session.name;
}

async function loadAnalytics(){
  try {
    const res = await fetch(`${API_BASE}/api/analytics/summary`);
    if (!res.ok) throw new Error('Failed to load analytics summary');
    const summary = await res.json();

    document.getElementById('analytics-total').textContent = summary.total || 0;
    document.getElementById('analytics-personal').textContent = summary.personalEvents || 0;
    document.getElementById('analytics-technical').textContent = summary.technicalEvents || 0;
    document.getElementById('analytics-policy-views').textContent = Object.values(summary.policyViews || {}).reduce((sum, val) => sum + val, 0);

    const rowsRes = await fetch(`${API_BASE}/api/analytics?limit=100`);
    if (!rowsRes.ok) throw new Error('Failed to load analytics rows');
    const rowsData = await rowsRes.json();
    renderAnalyticsTable(rowsData.items || []);
  } catch (err) {
    console.warn('Could not load analytics:', err);
    renderAnalyticsTable([]);
  }
}

function escapeHtml(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAnalyticsTable(items){
  const tbody = document.getElementById('analytics-tbody');
  if (!tbody) return;

  if (!Array.isArray(items) || !items.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty">No analytics events recorded yet.</div></td></tr>';
    return;
  }

  tbody.innerHTML = items.map(event => `
    <tr>
      <td>${escapeHtml(event.type || '')}</td>
      <td>${escapeHtml(event.page || event.url || '—')}</td>
      <td>${escapeHtml(event.policy || '—')}</td>
      <td>${event.personalData ? 'Yes' : 'No'}</td>
      <td>${event.technicalData ? 'Yes' : 'No'}</td>
    </tr>
  `).join('');
}

window.addEventListener('DOMContentLoaded', () => {
  initSession();
  loadAnalytics();
});
