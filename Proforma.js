/* ─── Helpers ─── */
const fmt = (n) => Math.round(n).toLocaleString('en-KE');
const fmtD = (n) => n.toLocaleString('en-KE', {minimumFractionDigits:2, maximumFractionDigits:2});
const $ = (id) => document.getElementById(id);

function syncRate(v) {
  $('rate').value = v;
  $('rate_disp').textContent = v + '%';
  calc();
}
function syncSlider(v) {
  $('rate_slider').value = v;
  $('rate_disp').textContent = v + '%';
}
function calcFromPct() {
  const price = parseFloat($('price').value) || 0;
  const pct = parseFloat($('down_pct').value) || 0;
  $('down').value = Math.round(price * pct / 100) || '';
  calc();
}

function calc() {
  const price = parseFloat($('price').value) || 0;
  const down  = parseFloat($('down').value) || 0;
  const n     = parseInt($('tenure').value) || 36;
  const r     = parseFloat($('rate').value) / 100 / 12;

  // Sync pct
  if (price > 0 && down > 0) {
    $('down_pct').value = (down / price * 100).toFixed(1);
  }

  const loan = price - down;
  if (loan <= 0 || r <= 0) {
    $('res_monthly_val').textContent = '—';
    $('res_loan').textContent = '—';
    return;
  }

  // PMT formula
  const monthly = loan * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1);
  const total   = monthly * n;
  const interest = total - loan;

  $('res_monthly_val').textContent = fmt(monthly);
  $('res_currency').textContent    = `per month for ${n} months`;
  $('res_loan').textContent        = 'KES ' + fmt(loan);
  $('res_tenure').textContent      = n + ' months';
  $('res_rate').textContent        = $('rate').value + '% p.a.';
  $('res_interest').textContent    = 'KES ' + fmt(interest);
  $('res_total').textContent       = 'KES ' + fmt(total);

  buildAmort(loan, r, monthly, n);
}

function buildAmort(loan, r, monthly, months) {
  let bal = loan;
  const rows = [];
  for (let i = 1; i <= months; i++) {
    const intPart  = bal * r;
    const prinPart = monthly - intPart;
    const newBal   = bal - prinPart;
    rows.push({m:i, open:bal, pmt:monthly, prin:prinPart, int:intPart, close:Math.max(0,newBal)});
    bal = newBal;
  }

  // Preview: first 6
  const preview = rows.slice(0,6);
  $('amort-body').innerHTML = preview.map(r => `
    <tr>
      <td class="num-cell">${r.m}</td>
      <td class="num-cell">KES ${fmt(r.open)}</td>
      <td class="num-cell">KES ${fmt(r.pmt)}</td>
      <td class="num-cell">KES ${fmt(r.prin)}</td>
      <td class="num-cell">KES ${fmt(r.int)}</td>
      <td class="num-cell">KES ${fmt(Math.max(0,r.close))}</td>
    </tr>`).join('');
  $('amort-card').style.display = 'block';

  window._amortRows = rows;
  window._calcData  = {loan, r, monthly, months, total: monthly*months, interest: monthly*months - loan, rate: parseFloat($('rate').value)};
}

function generateInvoice() {
  // Require calculation done
  if (!window._calcData) { alert('Please enter a vehicle price and calculate first.'); return; }
  // Require authentication: redirect to login if not signed in
  const session = JSON.parse(localStorage.getItem('naa_session')||'null');
  if (!session) {
    // store where to return after login and that we want to auto-generate
    localStorage.setItem('post_login_redirect','proforma-loan-calculator.html');
    localStorage.setItem('proforma_generate','1');
    window.location.href = 'login.html';
    return;
  }
  const d = window._calcData;
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'});
  const expiry  = new Date(today.setDate(today.getDate()+30)).toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'});
  const refNo   = 'NAA-PI-' + Date.now().toString().slice(-7);

  const make   = $('v_make').value   || '—';
  const model  = $('v_model').value  || '—';
  const year   = $('v_year').value   || '—';
  const engine = $('v_engine').value || '—';
  const colour = $('v_colour').value || '—';
  const mile   = $('v_mileage').value|| '—';
  const dealer = $('v_dealer').value || 'New Age Automotive';
  const price  = parseFloat($('price').value) || 0;
  const down   = parseFloat($('down').value)  || 0;
  const name   = $('buyer_name').value  || '—';
  const bId    = $('buyer_id').value    || '—';
  const phone  = $('buyer_phone').value ? '+254' + $('buyer_phone').value : '—';
  const email  = $('buyer_email').value || '—';
  const bank   = $('buyer_bank').value  || 'Your Preferred Bank';

  // Full amort table (all months)
  const allRows = window._amortRows || [];
  const amortHTML = allRows.map(r => `
    <tr>
      <td class="nc">${r.m}</td>
      <td class="nc">KES ${fmt(r.open)}</td>
      <td class="nc">KES ${fmt(r.pmt)}</td>
      <td class="nc">KES ${fmt(r.prin)}</td>
      <td class="nc">KES ${fmt(r.int)}</td>
      <td class="nc">KES ${fmt(Math.max(0,r.close))}</td>
    </tr>`).join('');

  $('invoice-body').innerHTML = `
  <!-- INVOICE HEADER -->
  <div class="inv-header">
    <div class="inv-logo-area">
      <div class="inv-logo-name">NEW AGE AUTOMOTIVE</div>
      <div class="inv-logo-sub">Your One Stop Car Shopping</div>
      <div class="inv-logo-contact">
        📍 Nairobi, Kenya<br/>
        📞 +254 700 000 000<br/>
        ✉️ info@newageauto.co.ke<br/>
        🌐 www.newageauto.co.ke
      </div>
    </div>
    <div class="inv-title-area">
      <div class="inv-doc-title">PROFORMA INVOICE</div>
      <div class="inv-doc-sub">Asset Finance Document</div>
      <div class="inv-meta">
        <strong>Ref No:</strong> ${refNo}<br/>
        <strong>Date Issued:</strong> ${dateStr}<br/>
        <strong>Valid Until:</strong> ${expiry}<br/>
        <strong>For Bank:</strong> ${bank}
      </div>
    </div>
  </div>
  <div class="inv-accent"></div>

  <!-- BUYER & VEHICLE -->
  <div class="inv-section">
    <div class="inv-section-title">Buyer Information</div>
    <div class="inv-vehicle-grid">
      <div class="inv-veh-item"><div class="inv-veh-label">Full Name</div><div class="inv-veh-val">${name}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">ID / Passport</div><div class="inv-veh-val">${bId}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Phone</div><div class="inv-veh-val">${phone}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Email</div><div class="inv-veh-val">${email}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Preferred Bank</div><div class="inv-veh-val">${bank}</div></div>
    </div>
  </div>

  <div class="inv-section">
    <div class="inv-section-title">Vehicle Details</div>
      <div class="inv-vehicle-grid">
      <div class="inv-veh-item"><div class="inv-veh-label">Make</div><div class="inv-veh-val">${make}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Model</div><div class="inv-veh-val">${model}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Year</div><div class="inv-veh-val">${year}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Engine</div><div class="inv-veh-val">${engine}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Colour</div><div class="inv-veh-val">${colour}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Mileage</div><div class="inv-veh-val">${mile}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Selling Dealer</div><div class="inv-veh-val">${dealer}</div></div>
      <div class="inv-veh-item"><div class="inv-veh-label">Vehicle Price</div><div class="inv-veh-val price">KES ${fmt(price)}</div></div>
    </div>
  </div>

  <!-- FINANCE BREAKDOWN -->
  <div class="inv-section">
    <div class="inv-section-title">Finance Breakdown</div>
    <div class="inv-finance-grid">
      <div>
        <div class="inv-box">
          <div class="inv-box-title">Loan Summary</div>
          <div class="inv-fin-row"><span class="fl">Vehicle Price</span><span class="fv">KES ${fmt(price)}</span></div>
          <div class="inv-fin-row"><span class="fl">Down Payment</span><span class="fv">KES ${fmt(down)}</span></div>
          <div class="inv-fin-row highlight"><span class="fl">Loan Principal</span><span class="fv">KES ${fmt(d.loan)}</span></div>
          <div class="inv-fin-row"><span class="fl">Interest Rate (p.a.)</span><span class="fv">${d.rate}%</span></div>
          <div class="inv-fin-row"><span class="fl">Loan Tenure</span><span class="fv">${d.months} months</span></div>
          <div class="inv-fin-row"><span class="fl">Total Interest</span><span class="fv">KES ${fmt(d.interest)}</span></div>
          <div class="inv-fin-row total-row"><span class="fl">Total Repayment</span><span class="fv">KES ${fmt(d.total)}</span></div>
        </div>
      </div>
      <div class="inv-monthly-box">
        <div class="inv-monthly-label">Estimated Monthly Instalment</div>
        <div class="inv-monthly-amount">KES ${fmt(d.monthly)}</div>
        <div class="inv-monthly-currency">per month for ${d.months} months</div>
        <div class="inv-monthly-note">Calculated using standard reducing balance method at ${d.rate}% p.a. Final rates subject to bank approval.</div>
      </div>
    </div>
  </div>

  <!-- AMORTISATION TABLE -->
  <div class="inv-section">
    <div class="inv-section-title">Full Repayment Schedule</div>
    <div class="scroll-x">
      <table class="inv-amort-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Opening Balance</th>
            <th>Monthly Payment</th>
            <th>Principal</th>
            <th>Interest</th>
            <th>Closing Balance</th>
          </tr>
        </thead>
        <tbody>${amortHTML}</tbody>
      </table>
    </div>
  </div>

  <!-- BANK INSTRUCTIONS -->
  <div class="inv-instructions">
  <div class="inv-section-title">How to Use This Document <span class="inv-section-sep"></span></div>
    <div class="inv-steps">
      <div class="inv-step"><div class="inv-step-num">1</div><div class="inv-step-text">Print or download this Proforma Invoice as a PDF</div></div>
      <div class="inv-step"><div class="inv-step-num">2</div><div class="inv-step-text">Visit your bank's <strong>Asset Finance Department</strong></div></div>
      <div class="inv-step"><div class="inv-step-num">3</div><div class="inv-step-text">Present this document along with your logbook/import docs</div></div>
      <div class="inv-step"><div class="inv-step-num">4</div><div class="inv-step-text">Bank processes your asset finance loan application</div></div>
    </div>
    <div class="important-note">
      <strong>Important:</strong> This Proforma Invoice is valid for 30 days from the issue date. The estimated monthly instalments are indicative only. Actual rates and repayment amounts are subject to final bank approval and may vary.
    </div>
  </div>

  <!-- SIGNATURES -->
  <div class="inv-section no-border">
    <div class="inv-section-title">Authorisation</div>
    <div class="sig-grid">
      <div>
        <div class="sig-label">Dealer Representative Signature</div>
        <div class="sig-name">${dealer}</div>
        <div class="sig-sub">Authorised Dealer</div>
      </div>
      <div>
        <div class="sig-label">Buyer Signature</div>
        <div class="sig-name">${name}</div>
        <div class="sig-sub">Buyer / Applicant</div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="inv-footer">
    <div>📞 +254 700 000 000<br/>✉️ info@newageauto.co.ke</div>
    <div class="inv-footer-center">
      <strong>NEW AGE AUTOMOTIVE</strong><br/>
      Nairobi, Kenya &nbsp;|&nbsp; Ref: ${refNo}
    </div>
    <div class="inv-footer-right">🌐 www.newageauto.co.ke<br/>Generated: ${dateStr}</div>
  </div>
  `;

  $('invoice-preview').classList.add('show');
  $('invoice-preview').scrollTop = 0;
  // remember last generated invoice ref for download naming
  window._lastInvoiceRef = refNo;
  window._lastInvoiceElement = document.getElementById('print-target');
}

function closeInvoice() {
  $('invoice-preview').classList.remove('show');
}

// Print only invoice when modal is open
window.onbeforeprint = function() {
  if ($('invoice-preview').classList.contains('show')) {
    document.body.style.overflow = 'hidden';
  }
};

function printInvoice(){
  if (!$('invoice-preview').classList.contains('show')) { alert('Please generate the Proforma Invoice first.'); return; }
  window.print();
}

function downloadInvoice(){
  const el = window._lastInvoiceElement || document.getElementById('print-target');
  if (!el) { alert('No invoice ready to download. Generate the invoice first.'); return; }
  const ref = window._lastInvoiceRef || ('NAA-PI-' + Date.now());
  const opt = { margin:0.5, filename: `${ref}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} };
  if (window.html2pdf) {
    html2pdf().from(el).set(opt).save();
  } else {
    // fallback: open print dialog
    window.print();
  }
}

// Prefill support and auto-generate after login
document.addEventListener('DOMContentLoaded', ()=>{
  try{
    const pre = JSON.parse(localStorage.getItem('proforma_prefill')||'null');
    if (pre) {
      if (pre.price) $('price').value = pre.price;
      if (pre.tenure) $('tenure').value = pre.tenure;
      if (pre.rate) $('rate').value = pre.rate;
      if (pre.make) $('v_make').value = pre.make;
      if (pre.model) $('v_model').value = pre.model;
      if (pre.dealer) $('v_dealer').value = pre.dealer;
      syncSlider($('rate').value);
      calc();
      localStorage.removeItem('proforma_prefill');
    }
  }catch(e){}
  if (localStorage.getItem('proforma_generate')){
    localStorage.removeItem('proforma_generate');
    // delay slightly to ensure UI ready
    setTimeout(()=>generateInvoice(),600);
  }
});

// Initial calc
calc();