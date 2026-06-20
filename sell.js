/* ════════════════════════════════════════
   COUNTDOWN TIMER — set launch 21 days out
════════════════════════════════════════ */
const launchDate = new Date();
launchDate.setDate(launchDate.getDate() + 21);
launchDate.setHours(9, 0, 0, 0);

function updateCountdown() {
  const now = new Date();
  const diff = launchDate - now;

  if (diff <= 0) {
    document.getElementById('countdown').innerHTML = '<div class="cd-box" style="min-width:240px;"><div class="cd-num" style="font-size:20px;">We just launched! 🎉</div></div>';
    clearInterval(timer);
    return;
  }

  const days  = Math.floor(diff / (1000*60*60*24));
  const hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
  const mins  = Math.floor((diff % (1000*60*60)) / (1000*60));
  const secs  = Math.floor((diff % (1000*60)) / 1000);

  document.getElementById('cd-days').textContent  = String(days).padStart(2,'0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2,'0');
  document.getElementById('cd-mins').textContent  = String(mins).padStart(2,'0');
  document.getElementById('cd-secs').textContent  = String(secs).padStart(2,'0');
}

updateCountdown();
const timer = setInterval(updateCountdown, 1000);

/* ════════════════════════════════════════
   NOTIFY FORM
════════════════════════════════════════ */
document.getElementById('notifyForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById('notifyEmail').value.trim();
  if (!email) return;

  // In production this would POST to your backend / mailing list API
  document.getElementById('notifySuccess').classList.add('show');
  document.getElementById('notifyEmail').value = '';

  setTimeout(() => {
    document.getElementById('notifySuccess').classList.remove('show');
  }, 5000);
});