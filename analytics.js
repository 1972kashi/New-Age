const ANALYTICS_API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);

function getTechnicalData() {
  return {
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: {
      width: window.screen?.width || null,
      height: window.screen?.height || null,
      colorDepth: window.screen?.colorDepth || null,
    },
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    cookieEnabled: navigator.cookieEnabled || false,
  };
}

function getPageContext() {
  return {
    page: document.title || window.location.pathname || 'unknown',
    url: window.location.href,
    referrer: document.referrer || '',
    timestamp: new Date().toISOString(),
  };
}

function getSessionInfo() {
  try {
    const session = JSON.parse(localStorage.getItem('naa_session') || 'null');
    return {
      loggedIn: !!session && typeof session === 'object' && !!session.email,
      role: session?.role || null,
    };
  } catch (err) {
    return { loggedIn: false, role: null };
  }
}

function getVisitorId() {
  let visitorId = localStorage.getItem('naa_visitor_id');
  if (!visitorId) {
    visitorId = 'vid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('naa_visitor_id', visitorId);
  }
  return visitorId;
}

function getCookieConsent() {
  const consent = localStorage.getItem('naa_cookie_consent');
  return consent === 'accepted' ? true : consent === 'declined' ? false : 'unset';
}

function setCookieConsent(consent) {
  const value = consent ? 'accepted' : 'declined';
  localStorage.setItem('naa_cookie_consent', value);
  document.cookie = `naa_cookie_consent=${value};path=/;max-age=${31536000}`;
  trackAnalyticsEvent('cookie_consent', {
    personalData: false,
    technicalData: true,
    details: {
      cookieConsent: consent,
    },
  });
  const banner = document.getElementById('cookie-consent-banner');
  if (banner) banner.remove();
}

function showCookieBanner() {
  if (getCookieConsent() !== 'unset') return;
  if (document.getElementById('cookie-consent-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:16px 20px;background:rgba(15,23,42,0.98);color:#f8fafc;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;font-family:Barlow,sans-serif;font-size:14px;box-shadow:0 -8px 30px rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.08);';
  banner.innerHTML = `
    <div style="flex:1;min-width:220px;">We use cookies to improve your experience and collect anonymous analytics. Manage your consent here.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
      <button id="accept-cookies-btn" style="padding:10px 18px;border:none;border-radius:10px;background:#D4A017;color:#000;font-weight:700;cursor:pointer;">Accept</button>
      <button id="decline-cookies-btn" style="padding:10px 18px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:transparent;color:#f8fafc;cursor:pointer;">Decline</button>
    </div>
  `;
  document.body.appendChild(banner);
  document.getElementById('accept-cookies-btn').onclick = () => setCookieConsent(true);
  document.getElementById('decline-cookies-btn').onclick = () => setCookieConsent(false);
}

function sendAnalyticsEvent(payload) {
  if (!payload || typeof payload !== 'object') return;
  fetch(`${ANALYTICS_API_BASE}/api/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently ignore tracking failures.
  });
}

function trackAnalyticsEvent(type, opts = {}) {
  const pageContext = getPageContext();
  const session = getSessionInfo();
  const payload = {
    type: type || 'event',
    page: pageContext.page,
    url: pageContext.url,
    referrer: pageContext.referrer,
    policy: opts.policy || '',
    personalData: !!opts.personalData,
    technicalData: !!opts.technicalData,
    details: {
      visitorId: getVisitorId(),
      cookieConsent: getCookieConsent(),
      ...(opts.details || {}),
    },
  };

  if (opts.technicalData) {
    payload.details = {
      ...payload.details,
      technicalData: getTechnicalData(),
      loggedIn: session.loggedIn,
      userRole: session.role,
    };
  }

  sendAnalyticsEvent(payload);
}

function trackPrivacyPolicyView(policyName) {
  trackAnalyticsEvent('policy_view', {
    policy: policyName,
    personalData: false,
    technicalData: true,
  });
}

function trackPersonalDataEvent(eventName, details = {}) {
  trackAnalyticsEvent('personal_data', {
    details: { eventName, ...details },
    personalData: true,
    technicalData: true,
  });
}

function trackTechnicalDataEvent(eventName, details = {}) {
  trackAnalyticsEvent('technical_data', {
    details: { eventName, ...details },
    personalData: false,
    technicalData: true,
  });
}

window.trackAnalyticsEvent = trackAnalyticsEvent;
window.trackPrivacyPolicyView = trackPrivacyPolicyView;
window.trackPersonalDataEvent = trackPersonalDataEvent;
window.trackTechnicalDataEvent = trackTechnicalDataEvent;

window.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.split('/').pop();
  const policyMap = {
    'privacy-policy.html': 'privacy-policy',
    'terms-of-service.html': 'terms-of-service',
    'cookies-policy.html': 'cookies-policy',
  };

  trackAnalyticsEvent('page_view', {
    personalData: getSessionInfo().loggedIn,
    technicalData: true,
    details: {
      pageTitle: document.title,
    },
  });

  if (policyMap[path]) {
    trackPrivacyPolicyView(policyMap[path]);
  }

  showCookieBanner();
});
