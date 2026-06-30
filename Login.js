function switchTab(t){
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',(t==='login'&&i===0)||(t==='signup'&&i===1)));
  document.querySelectorAll('.form-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
}

const API_PORT = 8000;
const API_BASE = `http://localhost:${API_PORT}`;  // API now served by FastAPI (port 8000)

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
  // Try server authentication first (supports MFA)
  const form = new URLSearchParams();
  form.append('username', id);
  form.append('password', pw);

  fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: form.toString()
  })
  .then(res => res.json().then(j=>({ok:res.ok, status:res.status, body:j})))
  .then(({ok,status,body})=>{
    if(!ok){
      // fallback to legacy local auth
      throw new Error(body && body.detail ? body.detail : 'Server auth failed');
    }

    // Handle MFA responses
    if(body.mfa_setup_required){
      // Show MFA setup UI
      window._mfa_token = body.mfa_token;
      showMfaPanel('setup');
      startMfaSetup(body.mfa_token);
      return;
    }

    if(body.mfa_required){
      window._mfa_token = body.mfa_token;
      showMfaPanel('challenge');
      return;
    }

    // Successful login without MFA
    if(body.access_token){
      const role = body.role || 'user';
      localStorage.setItem('naa_token', body.access_token);
      const sessionData = {name: body.name || id, email: id, role};
      localStorage.setItem('naa_session', JSON.stringify(sessionData));
      showMsg('login-ok', 'Welcome back! Redirecting…');
      setTimeout(()=>{ window.location.href = role==='admin'?'car-detail-upload.html':'index.html'; },800);
      return;
    }
  })
  .catch(err=>{
    console.log('Server auth failed, trying localStorage:', err && err.message);
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

function showMfaPanel(mode){
  // hide normal panels and show mfa panel
  document.querySelectorAll('.form-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-mfa').style.display='block';
  if(mode==='setup'){
    document.getElementById('mfa-setup-area').style.display='block';
    document.getElementById('mfa-challenge-area').style.display='none';
  } else {
    document.getElementById('mfa-setup-area').style.display='none';
    document.getElementById('mfa-challenge-area').style.display='block';
  }
}

function startMfaSetup(mfa_token){
  fetch(`${API_BASE}/auth/mfa/setup/start`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({mfa_token})
  })
  .then(res=>res.json())
  .then(data=>{
    const secret = data.secret;
    const otpauth = data.otpauth_url;
    document.getElementById('mfa-secret').value = secret || '';
    const qr = document.getElementById('mfa-qr');
    if(otpauth){
      qr.src = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(otpauth)}`;
    }
  })
  .catch(err=>{
    showMsg('mfa-err','Failed to start MFA setup.');
  });
}

function confirmMfaSetup(){
  const secret = document.getElementById('mfa-secret').value.trim();
  const code = document.getElementById('mfa-code-setup').value.trim();
  const token = window._mfa_token;
  if(!secret||!code||!token){showMsg('mfa-err','Missing MFA data');return;}
  fetch(`${API_BASE}/auth/mfa/setup/confirm`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({mfa_token: token, secret, code})
  })
  .then(res=>res.json().then(j=>({ok:res.ok, body:j})))
  .then(({ok,body})=>{
    if(!ok){ showMsg('mfa-err', body && body.detail ? body.detail : 'MFA confirm failed'); return; }
    if(body.access_token){ localStorage.setItem('naa_token', body.access_token); localStorage.setItem('naa_session', JSON.stringify({email:document.getElementById('login-id').value.trim(), role: body.role||'admin'})); showMsg('mfa-ok','MFA setup complete. Redirecting…'); setTimeout(()=> window.location.href = body.role==='admin'?'car-detail-upload.html':'index.html',800); }
  })
  .catch(err=> showMsg('mfa-err','MFA confirmation failed'));
}

function verifyMfaChallenge(){
  const code = document.getElementById('mfa-code').value.trim();
  const token = window._mfa_token;
  if(!code||!token){ showMsg('mfa-err','Enter MFA code'); return; }
  fetch(`${API_BASE}/auth/mfa/verify`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({mfa_token: token, code})
  })
  .then(res=>res.json().then(j=>({ok:res.ok, body:j})))
  .then(({ok,body})=>{
    if(!ok){ showMsg('mfa-err', body && body.detail ? body.detail : 'MFA verify failed'); return; }
    if(body.access_token){ localStorage.setItem('naa_token', body.access_token); localStorage.setItem('naa_session', JSON.stringify({email:document.getElementById('login-id').value.trim(), role: body.role||'admin'})); showMsg('mfa-ok','Login successful. Redirecting…'); setTimeout(()=> window.location.href = body.role==='admin'?'car-detail-upload.html':'index.html',800); }
  })
  .catch(err=> showMsg('mfa-err','MFA verify error'));
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
  
  fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fname: fname,
      lname: lname,
      email: email,
      phone: phone,
      password: pass
    })
  })
    .then(res => {
      if (!res.ok) return res.json().then(e => Promise.reject(e));
      return res.json();
    })
    .then(savedUser => {
      const sessionData = {name: fname+' '+lname, email: email, role: 'user'};
      localStorage.setItem('naa_session', JSON.stringify(sessionData));
      showMsg('su-ok', 'Account created! A welcome email will be sent if email delivery is configured.');
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
