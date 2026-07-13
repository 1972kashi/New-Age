let editIndex = -1;
let deleteIndex = -1;
let users = [];
let editingUserId = null;
let faqItems = [];

const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);
const FAQ_STORAGE_KEY = 'naa_faq_items';

function initSession(){
  const session = JSON.parse(localStorage.getItem('naa_session')||'null');
  if(!session||session.role!=='admin'){
    window.location.href='login.html';
    return;
  }
  document.getElementById('nav-name').textContent = session.name;
}

function escapeHtml(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let faqEditingId = null;

function getFaqItems(){
  try {
    const stored = localStorage.getItem(FAQ_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Could not load FAQ items', err);
    return [];
  }
}

function saveFaqItems(items){
  faqItems = Array.isArray(items) ? items : [];
  localStorage.setItem(FAQ_STORAGE_KEY, JSON.stringify(faqItems));
  window.dispatchEvent(new CustomEvent('faq-data-updated', { detail: faqItems }));
}

async function loadFaqItems(){
  try {
    const res = await fetch(`${API_BASE}/api/faq`);
    if (!res.ok) throw new Error('Failed to load FAQ items');
    faqItems = await res.json();
  } catch (err) {
    console.warn('Could not load FAQ items from server, using local fallback:', err);
    faqItems = getFaqItems();
  }
  renderFaqManager();
}

function renderFaqManager(){
  const list = document.getElementById('faq-list');
  const count = document.getElementById('faq-count');
  if (!list || !count) return;

  count.textContent = faqItems.length;

  if (!faqItems.length) {
    list.innerHTML = '<div class="empty">No FAQ entries yet. Add one above.</div>';
    return;
  }

  list.innerHTML = faqItems.map(item => `
    <div class="faq-manager-item">
      <div class="faq-manager-question">${escapeHtml(item.question)}</div>
      <div class="faq-manager-answer">${escapeHtml(item.answer)}</div>
      <div class="faq-manager-meta">${escapeHtml(item.category || 'general')}</div>
      <div class="faq-manager-actions">
        <button class="btn-edit" type="button" onclick="editFaqItem('${item.id}')">Edit</button>
        <button class="btn-delete" type="button" onclick="deleteFaqItem('${item.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function setFaqFormState(editing = false){
  const saveBtn = document.querySelector('.faq-actions .btn-save');
  const cancelBtn = document.getElementById('cancel-faq-edit-btn');
  if (saveBtn) saveBtn.textContent = editing ? 'Update FAQ' : 'Save FAQ';
  if (cancelBtn) cancelBtn.style.display = editing ? 'inline-flex' : 'none';
}

async function saveFaqForm(){
  const question = document.getElementById('faq-question').value.trim();
  const answer = document.getElementById('faq-answer').value.trim();
  const category = document.getElementById('faq-category').value.trim();

  if (!question || !answer) {
    showToast('Please add both a question and an answer.', 'err');
    return;
  }

  const payload = {
    question,
    answer,
    category: category || 'general'
  };

  try {
    const method = faqEditingId ? 'PUT' : 'POST';
    const url = faqEditingId ? `${API_BASE}/api/faq/${faqEditingId}` : `${API_BASE}/api/faq`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.detail || errorBody.message || 'Failed to save FAQ');
    }

    const savedItem = await res.json();
    if (faqEditingId) {
      faqItems = faqItems.map(item => item.id === savedItem.id ? savedItem : item);
      showToast('FAQ entry updated successfully.');
    } else {
      faqItems = [savedItem, ...faqItems];
      showToast('FAQ entry added successfully.');
    }

    faqEditingId = null;
    document.getElementById('faq-question').value = '';
    document.getElementById('faq-answer').value = '';
    document.getElementById('faq-category').value = 'general';
    setFaqFormState(false);
    renderFaqManager();
  } catch (err) {
    showToast(err.message || 'Error saving FAQ entry.', 'err');
  }
}

window.saveFaqForm = saveFaqForm;

function editFaqItem(id){
  const item = faqItems.find((entry) => entry.id === id);
  if (!item) return;
  faqEditingId = id;
  document.getElementById('faq-question').value = item.question;
  document.getElementById('faq-answer').value = item.answer;
  document.getElementById('faq-category').value = item.category || 'general';
  setFaqFormState(true);
}

async function deleteFaqItem(id){
  const item = faqItems.find((entry) => entry.id === id);
  if (!item) return;
  if (!confirm(`Delete FAQ question:\n"${item.question}"?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/faq/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.detail || errorBody.message || 'Failed to delete FAQ');
    }
    faqItems = faqItems.filter((entry) => entry.id !== id);
    renderFaqManager();
    showToast('FAQ entry deleted.');
  } catch (err) {
    showToast(err.message || 'Error deleting FAQ entry.', 'err');
  }
}

function cancelFaqEdit(){
  faqEditingId = null;
  document.getElementById('faq-question').value = '';
  document.getElementById('faq-answer').value = '';
  document.getElementById('faq-category').value = 'general';
  setFaqFormState(false);
}

async function loadUsers(){
  try {
    const res = await fetch(`${API_BASE}/api/users?limit=200`);
    if (res.ok) {
      const data = await res.json();
      users = data.items || [];
    } else {
      throw new Error('Failed to load users');
    }
  } catch (err) {
    console.warn('Could not load users from server, trying localStorage:', err);
    users = JSON.parse(localStorage.getItem('naa_users')||'[]');
  }
  updateStats();
  renderTable();
}

function updateStats(){
  const now = new Date();
  document.getElementById('stat-total').textContent = users.length;
  document.getElementById('stat-admin').textContent = users.filter(u => u.role === 'admin').length;
  document.getElementById('stat-users').textContent = users.filter(u => u.role === 'user').length;
  document.getElementById('stat-month').textContent = users.filter(u => {
    const d = new Date(u.joined);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}

function renderTable(){
  const q = document.getElementById('search').value.toLowerCase();
  const role = document.getElementById('role-filter').value;
  const tbody = document.getElementById('users-tbody');

  const rows = users
    .map((u, idx) => ({ u, idx }))
    .filter(({ u }) => {
      const target = (u.fname + ' ' + u.lname + u.email + u.phone).toLowerCase();
      const matchQ = !q || target.includes(q);
      const matchR = !role || u.role === role;
      return matchQ && matchR;
    });

  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty">No users found</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(({ u, idx }) => {
    const init = ((u.fname[0]||'') + (u.lname[0]||'')).toUpperCase();
    const joined = new Date(u.joined).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    return `
      <tr>
        <td><div class="user-cell">
          <div class="avatar">${init}</div>
          <div><div class="user-name">${u.fname} ${u.lname}</div><div class="user-email">${u.email}</div></div>
        </div></td>
        <td>${u.phone||'—'}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td>${joined}</td>
        <td><div class="action-btns">
          <button class="btn-edit" onclick="openEditModal(${idx})">Edit</button>
          <button class="btn-delete" onclick="openDelModal(${idx})">Delete</button>
        </div></td>
      </tr>`;
  }).join('');
}

function openAddModal(){
  editingUserId = null;
  document.getElementById('modal-title').textContent = 'Add New User';
  ['m-fname','m-lname','m-email','m-phone','m-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('m-role').value = 'user';
  document.getElementById('m-pass-field').style.display = 'block';
  document.getElementById('user-overlay').classList.add('open');
}

function openEditModal(i){
  editIndex = i;
  const user = users[i];
  if(!user) return;

  editingUserId = user.id;
  document.getElementById('modal-title').textContent = 'Edit User';
  document.getElementById('m-fname').value = user.fname;
  document.getElementById('m-lname').value = user.lname;
  document.getElementById('m-email').value = user.email;
  document.getElementById('m-phone').value = user.phone;
  document.getElementById('m-role').value = user.role;
  document.getElementById('m-pass').value = '';
  document.getElementById('m-pass-field').style.display = 'block';
  document.getElementById('user-overlay').classList.add('open');
}

function closeModal(){
  document.getElementById('user-overlay').classList.remove('open');
}

function saveUser(){
  const fname = document.getElementById('m-fname').value.trim();
  const lname = document.getElementById('m-lname').value.trim();
  const email = document.getElementById('m-email').value.trim().toLowerCase();
  const phone = document.getElementById('m-phone').value.trim();
  const role = document.getElementById('m-role').value;
  const pass = document.getElementById('m-pass').value;

  if(!fname || !lname || !email || !phone){
    showToast('Please complete all fields.','err');
    return;
  }

  // Check for duplicate email (excluding current user being edited)
  const isDuplicate = users.some((u, idx) => u.email === email && (editingUserId ? u.id !== editingUserId : true));
  if(isDuplicate){
    showToast('Email already registered.','err');
    return;
  }

  if(editingUserId === null){
    // Creating new user
    if(pass.length < 8){
      showToast('Password must be at least 8 characters.','err');
      return;
    }
    const userData = { fname, lname, email, phone, role, password: btoa(pass) };
    
    fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    })
      .then(res => {
        if (!res.ok) return res.json().then(e => Promise.reject(e));
        return res.json();
      })
      .then(() => {
        showToast('User added successfully.');
        loadUsers();
        closeModal();
      })
      .catch(err => {
        showToast(`Error adding user: ${err.error || err.message}`, 'err');
      });
  } else {
    // Updating existing user
    const userData = { fname, lname, email, phone, role };
    if(pass) {
      if(pass.length < 8){
        showToast('Password must be at least 8 characters.','err');
        return;
      }
      userData.password = btoa(pass);
    }
    
    fetch(`${API_BASE}/api/users/${editingUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    })
      .then(res => {
        if (!res.ok) return res.json().then(e => Promise.reject(e));
        return res.json();
      })
      .then(() => {
        showToast('User updated successfully.');
        loadUsers();
        closeModal();
      })
      .catch(err => {
        showToast(`Error updating user: ${err.error || err.message}`, 'err');
      });
  }
}

function openDelModal(i){
  deleteIndex = i;
  const user = users[i];
  if(!user) return;
  document.getElementById('del-msg').textContent = `Delete ${user.fname} ${user.lname}? This cannot be undone.`;
  document.getElementById('del-overlay').classList.add('open');
}

function closeDelModal(){
  document.getElementById('del-overlay').classList.remove('open');
}

function confirmDelete(){
  if(deleteIndex < 0 || deleteIndex >= users.length) return;
  const user = users[deleteIndex];
  if (!user) return;
  
  fetch(`${API_BASE}/api/users/${user.id}`, {
    method: 'DELETE'
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    })
    .then(() => {
      showToast('User deleted.');
      loadUsers();
      closeDelModal();
    })
    .catch(err => {
      showToast(`Error deleting user: ${err.message}`, 'err');
    });
}

function showToast(msg, type=''){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function logout(){
  localStorage.removeItem('naa_session');
  window.location.href = 'login.html';
}

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target === o) o.classList.remove('open'); });
});

initSession();
loadUsers();
loadFaqItems();
