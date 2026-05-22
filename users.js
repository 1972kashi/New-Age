let editIndex = -1;
let deleteIndex = -1;

function getUsers(){return JSON.parse(localStorage.getItem('naa_users')||'[]')}
function saveUsers(u){localStorage.setItem('naa_users',JSON.stringify(u))}

function initSession(){
  const s=JSON.parse(localStorage.getItem('naa_session')||'null');
  if(!s){window.location.href='login.html';return;}
  document.getElementById('nav-name').textContent=s.name;
  if(s.role==='admin'){
    const goAdmin = confirm('You are an admin. Redirect to the admin dashboard? Click Cancel to go to the home page instead.');
    if(goAdmin){
      window.location.href='admin-upload.html';
      return;
    }
    window.location.href='index.html';
    return;
  }
}

function updateStats(){
  const u=getUsers();
  const now=new Date();
  document.getElementById('stat-total').textContent=u.length;
  document.getElementById('stat-admin').textContent=u.filter(x=>x.role==='admin').length;
  document.getElementById('stat-users').textContent=u.filter(x=>x.role==='user').length;
  document.getElementById('stat-month').textContent=u.filter(x=>{
    const d=new Date(x.joined);
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).length;
}

function renderTable(){
  const users=getUsers();
  const q=document.getElementById('search').value.toLowerCase();
  const role=document.getElementById('role-filter').value;
  const tbody=document.getElementById('users-tbody');

  const filtered=users.filter(u=>{
    const matchQ=!q||(u.fname+' '+u.lname+u.email+u.phone).toLowerCase().includes(q);
    const matchR=!role||u.role===role;
    return matchQ&&matchR;
  });

  if(!filtered.length){
    tbody.innerHTML='<tr><td colspan="5"><div class="empty">No users found</div></td></tr>';
    return;
  }

  tbody.innerHTML=filtered.map((u,i)=>{
    const realIdx=users.indexOf(u);
    const init=(u.fname[0]||'')+(u.lname[0]||'');
    const joined=new Date(u.joined).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    return `<tr>
      <td><div class="user-cell">
        <div class="avatar">${init.toUpperCase()}</div>
        <div><div class="user-name">${u.fname} ${u.lname}</div><div class="user-email">${u.email}</div></div>
      </div></td>
      <td>${u.phone||'—'}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>${joined}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="openEditModal(${realIdx})">Edit</button>
        <button class="btn-delete" onclick="openDelModal(${realIdx})">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openAddModal(){
  editIndex=-1;
  document.getElementById('modal-title').textContent='Add New User';
  ['m-fname','m-lname','m-email','m-phone','m-pass'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('m-role').value='user';
  document.getElementById('m-pass-field').style.display='block';
  document.getElementById('user-overlay').classList.add('open');
}

function openEditModal(i){
  editIndex=i;
  const u=getUsers()[i];
  document.getElementById('modal-title').textContent='Edit User';
  document.getElementById('m-fname').value=u.fname;
  document.getElementById('m-lname').value=u.lname;
  document.getElementById('m-email').value=u.email;
  document.getElementById('m-phone').value=u.phone||'';
  document.getElementById('m-role').value=u.role;
  document.getElementById('m-pass-field').style.display='none';
  document.getElementById('user-overlay').classList.add('open');
}

function closeModal(){document.getElementById('user-overlay').classList.remove('open')}

function saveUser(){
  const fname=document.getElementById('m-fname').value.trim();
  const lname=document.getElementById('m-lname').value.trim();
  const email=document.getElementById('m-email').value.trim();
  const phone=document.getElementById('m-phone').value.trim();
  const role=document.getElementById('m-role').value;
  const pass=document.getElementById('m-pass').value;

  if(!fname||!lname||!email){showToast('Name and email are required.','err');return;}

  const users=getUsers();
  if(editIndex===-1){
    if(!pass||pass.length<8){showToast('Password must be 8+ characters.','err');return;}
    users.push({fname,lname,email,phone,role,password:btoa(pass),joined:new Date().toISOString()});
    showToast('User added successfully.');
  } else {
    users[editIndex]={...users[editIndex],fname,lname,email,phone,role};
    showToast('User updated.');
  }
  saveUsers(users);
  closeModal();
  renderTable();
  updateStats();
}

function openDelModal(i){
  deleteIndex=i;
  const u=getUsers()[i];
  document.getElementById('del-msg').textContent=`Delete ${u.fname} ${u.lname}? This cannot be undone.`;
  document.getElementById('del-overlay').classList.add('open');
}
function closeDelModal(){document.getElementById('del-overlay').classList.remove('open')}
function confirmDelete(){
  const users=getUsers();
  users.splice(deleteIndex,1);
  saveUsers(users);
  closeDelModal();
  renderTable();
  updateStats();
  showToast('User deleted.');
}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast'+(type?' '+type:'');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

function logout(){
  localStorage.removeItem('naa_session');
  window.location.href='login.html';
}

// close overlays on outside click
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')});
});

initSession();
updateStats();
renderTable();