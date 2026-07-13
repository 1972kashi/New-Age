function ensureAuthPopup(){
  if(document.getElementById('auth-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'auth-popup';
  popup.className = 'auth-popup hidden';
  popup.innerHTML = `
    <div class="auth-popup-card">
      <div class="auth-popup-title">Signed in as <span id="auth-popup-name"></span></div>
      <div class="auth-popup-actions">
        <button id="auth-logout-btn" class="auth-popup-btn auth-popup-logout">Log out</button>
        <button id="auth-cancel-btn" class="auth-popup-btn auth-popup-cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) hideAuthPopup(); });
  document.getElementById('auth-logout-btn').addEventListener('click', logout);
  document.getElementById('auth-cancel-btn').addEventListener('click', hideAuthPopup);
  const style = document.createElement('style');
  style.textContent = `
    .auth-popup{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s ease;}
    .auth-popup.visible{opacity:1;visibility:visible;}
    .auth-popup-card{width:min(360px,calc(100% - 40px));background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px 22px;box-shadow:0 24px 80px rgba(0,0,0,.35);}
    .auth-popup-title{font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:18px;line-height:1.4;}
    .auth-popup-actions{display:flex;justify-content:flex-end;gap:10px;}
    .auth-popup-btn{min-width:90px;padding:10px 14px;font-size:13px;font-weight:700;border-radius:10px;border:none;cursor:pointer;}
    .auth-popup-logout{background:#fde047;color:#0f172a;}
    .auth-popup-cancel{background:rgba(255,255,255,.08);color:#f8fafc;}
    .auth-popup.hidden{opacity:0;visibility:hidden;}
    .auth-popup.visible{opacity:1;visibility:visible;}
  `;
  document.head.appendChild(style);
}

function hideAuthPopup(){
  const popup = document.getElementById('auth-popup');
  if(!popup) return;
  popup.classList.remove('visible');
  popup.classList.add('hidden');
}

function toggleAuthPopup(){
  const popup = document.getElementById('auth-popup');
  if(!popup) return;
  popup.classList.toggle('hidden');
  popup.classList.toggle('visible');
}

function logout(){
  localStorage.removeItem('naa_session');
  localStorage.removeItem('naa_token');
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  hideAuthPopup();
  loadAuthNav();
}

function onLoginSuccess(session){
  localStorage.setItem('naa_session', JSON.stringify(session));

  const redirect = localStorage.getItem('post_login_redirect') || 'index.html';
  localStorage.removeItem('post_login_redirect');
  window.location.href = redirect;
}

function checkAdminAccess(){
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const adminPages = ['users.html', 'admin-upload.html', 'car-detail-upload.html'];
  
  if(adminPages.includes(currentPage)){
    const session = JSON.parse(localStorage.getItem('naa_session')||'null');
    const token = localStorage.getItem('naa_token') || localStorage.getItem('token') || '';
    if (!session || session.role !== 'admin' || !token) {
      localStorage.setItem('post_login_redirect', currentPage);
      localStorage.removeItem('naa_session');
      localStorage.removeItem('naa_token');
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = 'login.html';
      return false;
    }
  }
  return true;
}

function loadAuthNav(){
  const loginBtn = document.getElementById('nav-login');
  const signupBtn = document.getElementById('nav-signup');
  const profileBtn = document.getElementById('nav-profile');
  console.debug('auth-nav: loadAuthNav elements', { loginBtn: !!loginBtn, signupBtn: !!signupBtn, profileBtn: !!profileBtn });
  if(!loginBtn||!signupBtn||!profileBtn) {
    console.warn('auth-nav: missing nav elements — aborting');
    return;
  }

  // Save current page before going to login, so we can return after
  loginBtn.onclick = () => {
    localStorage.setItem('post_login_redirect', window.location.href);
    window.location.href = 'login.html';
  };
  signupBtn.onclick = () => {
    localStorage.setItem('post_login_redirect', window.location.href);
    window.location.href = 'login.html';
  };

  ensureAuthPopup();
  const session = JSON.parse(localStorage.getItem('naa_session')||'null');
  console.debug('auth-nav: session', session);
  if(session){
    loginBtn.classList.add('hidden');
    signupBtn.classList.add('hidden');
    // JS fallback: hide login/signup explicitly in case CSS or other scripts override
    try { loginBtn.style.display = 'none'; signupBtn.style.display = 'none'; } catch(e) {}
    profileBtn.classList.remove('hidden');
    // JS fallback: ensure the profile button is visible even if CSS fails
    try { profileBtn.style.display = ''; } catch(e) {}
    profileBtn.title = 'Signed in as ' + session.name;
    profileBtn.onclick = e => { e.preventDefault(); toggleAuthPopup(); };
    const nameEl = document.getElementById('auth-popup-name');
    if(nameEl) nameEl.textContent = session.name;
  } else {
    loginBtn.classList.remove('hidden');
    signupBtn.classList.remove('hidden');
    try { loginBtn.style.display = ''; signupBtn.style.display = ''; } catch(e) {}
    profileBtn.classList.add('hidden');
    // JS fallback: force-hide profile button if CSS didn't take effect
    try { profileBtn.style.display = 'none'; } catch(e) {}
    profileBtn.onclick = null;
    hideAuthPopup();
  }

  
  // Check admin access for protected pages
  checkAdminAccess();
}



if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAuthNav);
} else {
  // If the document is already loaded, run immediately
  console.debug('auth-nav: DOM already loaded — initializing nav');
  loadAuthNav();
}
