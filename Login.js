function switchTab(t){
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',(t==='login'&&i===0)||(t==='signup'&&i===1)));
  document.querySelectorAll('.form-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
}

const API_PORT = 3000;
const API_BASE = (location.protocol === 'file:')
  ? `http://localhost:${API_PORT}`
  : `http://localhost:${API_PORT}`;  // Always use port 3000 for API

function togglePwd(id,btn){
  const el=document.getElementById(id);
  el.type=el.type==='password'?'text':'password';
  btn.textContent=el.type==='password'?'👁':'🙈';
}

function checkStrength(inp,barId){
  const v=inp.value;
  const bar=document.getElementById(barId);
  let score=0;
  if(v.length>=8)score++;
  if(/[A-Z]/.test(v))score++;
  if(/[0-9]/.test(v))score++;
  if(/[^A-Za-z0-9]/.test(v))score++;
  const w=['0%','30%','55%','78%','100%'][score];
  const c=['','#dc2626','#f59e0b','#3b82f6','#16a34a'][score];
  bar.style.width=w;bar.style.background=c;
}

function showMsg(id,msg,type){
  const el=document.getElementById(id);
  el.textContent=msg;el.style.display='block';
  setTimeout(()=>el.style.display='none',4000);
}
function ensureDefaultAdmin(){
  const users = JSON.parse(localStorage.getItem('naa_users')||'[]');
  if(!users.some(u=>u.email==='admin@gmail.com')){
    users.push({
      fname:'Admin',
      lname:'User',
      email:'admin@gmail.com',
      phone:'',
      password:btoa('Admin@admin'),
      role:'admin',
      joined:new Date().toISOString()
    });
    localStorage.setItem('naa_users',JSON.stringify(users));
  }
}

function doLogin(){
  const id=document.getElementById('login-id').value.trim();
  const pw=document.getElementById('login-pass').value;
  if(!id||!pw){showMsg('login-err','Please fill in all fields.');return;}

  // First try to authenticate from server database
  fetch(`${API_BASE}/api/users?limit=200`, {timeout: 5000})
    .then(res => {
      if (!res.ok) throw new Error('Server error');
      return res.json();
    })
    .then(data => {
      const users = data.items || [];
      let user = users.find(u => (u.email === id || u.phone === id) && u.password === btoa(pw));
      
      if (user) {
        // Successfully found user in database
        const sessionData = {name: user.fname+' '+user.lname, email: user.email, role: user.role};
        localStorage.setItem('naa_session', JSON.stringify(sessionData));
        showMsg('login-ok', 'Welcome back, '+user.fname+'! Redirecting…');
        setTimeout(() => {
          const redirect = localStorage.getItem('post_login_redirect');
          if (redirect) { 
            localStorage.removeItem('post_login_redirect'); 
            window.location.href = redirect; 
          }
          else window.location.href = user.role==='admin'?'car-detail-upload.html':'index.html';
        }, 800);
        return;
      }
      
      // Not found in server database, try localStorage
      throw new Error('User not found in server database');
    })
    .catch(err => {
      console.log('Server auth failed, trying localStorage:', err.message);
      // Fallback to localStorage for backward compatibility
      const localUsers = JSON.parse(localStorage.getItem('naa_users')||'[]');
      const user = localUsers.find(u => (u.email === id || u.phone === id) && u.password === btoa(pw));
      
      if (!user) {
        showMsg('login-err', 'Invalid credentials.');
        return;
      }
      
      // Successfully authenticated from localStorage
      const sessionData = {name: user.fname+' '+user.lname, email: user.email, role: user.role};
      localStorage.setItem('naa_session', JSON.stringify(sessionData));
      showMsg('login-ok', 'Welcome back, '+user.fname+'! Redirecting…');
      setTimeout(() => {
        const redirect = localStorage.getItem('post_login_redirect');
        if (redirect) { 
          localStorage.removeItem('post_login_redirect'); 
          window.location.href = redirect; 
        }
        else window.location.href = user.role==='admin'?'car-detail-upload.html':'index.html';
      }, 800);
    });
}

function doSignUp(){
  const fname=document.getElementById('su-fname').value.trim();
  const lname=document.getElementById('su-lname').value.trim();
  const email=document.getElementById('su-email').value.trim().toLowerCase();
  const phone=document.getElementById('su-phone').value.trim();
  const pass=document.getElementById('su-pass').value;
  const pass2=document.getElementById('su-pass2').value;

  if(!fname||!lname||!email||!phone||!pass){showMsg('su-err','All fields are required.');return;}
  if(pass!==pass2){showMsg('su-err','Passwords do not match.');return;}
  if(pass.length<8){showMsg('su-err','Password must be at least 8 characters.');return;}

  // Try to save to server database first
  const userData = {
    fname: fname,
    lname: lname,
    email: email,
    phone: phone,
    password: btoa(pass),
    role: 'user'
  };
  
  fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  })
    .then(res => {
      if (!res.ok) return res.json().then(e => Promise.reject(e));
      return res.json();
    })
    .then(savedUser => {
      const sessionData = {name: fname+' '+lname, email: email, role: 'user'};
      localStorage.setItem('naa_session', JSON.stringify(sessionData));
      showMsg('su-ok', 'Account created! Redirecting to home…');
      setTimeout(() => {
        const redirect = localStorage.getItem('post_login_redirect');
        if (redirect) { 
          localStorage.removeItem('post_login_redirect'); 
          window.location.href = redirect; 
        }
        else window.location.href = 'index.html';
      }, 800);
    })
    .catch(err => {
      // If server fails, save to localStorage as fallback
      const users = JSON.parse(localStorage.getItem('naa_users')||'[]');
      if (users.find(u => u.email === email)) {
        showMsg('su-err', 'Email already registered.');
        return;
      }
      
      users.push({fname, lname, email, phone, password: btoa(pass), role: 'user', joined: new Date().toISOString()});
      localStorage.setItem('naa_users', JSON.stringify(users));
      
      const sessionData = {name: fname+' '+lname, email: email, role: 'user'};
      localStorage.setItem('naa_session', JSON.stringify(sessionData));
      showMsg('su-ok', 'Account created! Redirecting to home…');
      setTimeout(() => {
        const redirect = localStorage.getItem('post_login_redirect');
        if (redirect) { 
          localStorage.removeItem('post_login_redirect'); 
          window.location.href = redirect; 
        }
        else window.location.href = 'index.html';
      }, 800);
    });
}

// ensure an admin account exists so the admin portal stays accessible
function ensureDefaultAdmin(){
  const users = JSON.parse(localStorage.getItem('naa_users')||'[]');
  if(!users.some(u=>u.email==='admin@gmail.com')){
    users.push({
      fname:'Admin',
      lname:'User',
      email:'admin@gmail.com',
      phone:'',
      password:btoa('Admin@admin'),
      role:'admin',
      joined:new Date().toISOString()
    });
    localStorage.setItem('naa_users',JSON.stringify(users));
  }
}

ensureDefaultAdmin();
