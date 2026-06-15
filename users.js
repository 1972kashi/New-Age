let editIndex = -1;
let deleteIndex = -1;
let users = [];
let editingUserId = null;

const API_PORT = 8000;
const API_BASE = `http://localhost:${API_PORT}`;  // API now served by FastAPI (port 8000)

function initSession(){
  const session = JSON.parse(localStorage.getItem('naa_session')||'null');
  if(!session||session.role!=='admin'){
    window.location.href='login.html';
    return;
  }
  document.getElementById('nav-name').textContent = session.name;
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
