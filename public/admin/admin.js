/* Shared by the /admin/ pages: sign out, and a small status toast. */
async function signOut() {
  try { await fetch('/api/signout', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
  // Stop Chrome signing straight back in the next time /signin/ is opened.
  try { if (navigator.credentials && navigator.credentials.preventSilentAccess) await navigator.credentials.preventSilentAccess(); } catch (e) {}
  location.href = '/';
}

let toastTimer = null;
function toast(text, isError) {
  let el = document.getElementById('admin-toast');
  if (!el) { el = document.createElement('div'); el.id = 'admin-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

/* fetch for /admin/api/: a 401 means the session has run out, so go and sign in again. */
async function adminFetch(url, opts) {
  const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
  if (res.status === 401) { location.href = '/signin/?next=' + encodeURIComponent(location.pathname); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

/* Two clicks to do anything destructive: the first arms the button, the second
 * does it, and it disarms itself after 4 seconds. */
function confirmClick(btn, label, action) {
  if (btn.classList.contains('armed')) { btn.classList.remove('armed'); clearTimeout(btn._t); action(); return; }
  const original = btn.textContent;
  btn.classList.add('armed'); btn.textContent = label;
  btn._t = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = original; }, 4000);
}
