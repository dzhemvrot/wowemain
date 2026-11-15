const API_BASE = 'https://school-api.wmcoeu.workers.dev/nominations';
const TOKEN_KEY = 'wowemain-nominations-session';
const MIN_REASON = 10;

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  email: '',
  role: '',
  classes: [],
  nominations: [],
  roster: [],
  className: '',
  submitted: false,
  votingOpen: false,
};

const $ = (selector) => document.querySelector(selector);
const views = {
  loading: $('#view-loading'), login: $('#view-login'), closed: $('#view-closed'),
  done: $('#view-done'), setup: $('#view-setup'), form: $('#view-form'),
};
const els = {
  message: $('#msg'), classSelect: $('#sel-class'), btnStart: $('#btn-start'),
  nominations: $('#nominations'), progress: $('#progress'), btnSubmit: $('#btn-submit'),
  whoClass: $('#who-class'), linkChange: $('#link-change'), linkLogout: $('#link-logout'),
  userLine: $('#user-line'), panelLink: $('#link-panel'), btnReload: $('#btn-reload'),
};

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function show(name) {
  for (const [key, el] of Object.entries(views)) el.classList.toggle('d-none', key !== name);
}
function showMessage(text, type = 'danger') {
  els.message.textContent = text;
  els.message.className = `alert alert-${type} mt-3`;
}
function clearMessage() {
  els.message.className = 'alert d-none';
  els.message.textContent = '';
}
function setLoggedOut(message = '') {
  state.token = '';
  state.email = '';
  state.role = '';
  sessionStorage.removeItem(TOKEN_KEY);
  els.userLine.textContent = '';
  els.panelLink.classList.add('d-none');
  els.linkLogout.classList.add('d-none');
  show('login');
  if (message) showMessage(message, 'warning');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'follow',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    if (response.status === 401 && path !== '/auth/exchange') {
      setLoggedOut('Sesija beigusies. Pieraksties vēlreiz ar skolas Microsoft kontu.');
    }
    throw new Error(data.error || `Pieprasījums neizdevās (${response.status}).`);
  }
  return data;
}

async function consumeAuthCode() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_code');
  if (!code) return;
  url.searchParams.delete('auth_code');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  try {
    const response = await api('/auth/exchange', { method: 'POST', body: { code } });
    state.token = response.token;
    sessionStorage.setItem(TOKEN_KEY, state.token);
  } catch (error) {
    setLoggedOut(error.message || 'Neizdevās pabeigt Microsoft pierakstīšanos.');
  }
}

// ---------- flow ----------
async function start() {
  clearMessage();
  show('loading');
  await consumeAuthCode();
  if (!state.token) { show('login'); return; }   // not signed in -> only the login screen
  try {
    const auth = await api('/auth/me');
    if (!auth.user) { setLoggedOut(); return; }
    state.email = auth.user.email;
    state.role = auth.user.role;
    els.userLine.textContent = `Pierakstīts: ${state.email} `;
    els.linkLogout.classList.remove('d-none');
    els.panelLink.classList.toggle('d-none', state.role !== 'organizer');

    const data = await api('/student/data');
    state.classes = data.classes || [];
    state.nominations = data.nominations || [];
    state.submitted = !!data.submitted;
    state.votingOpen = !!data.votingOpen;
    route();
  } catch (error) {
    if (state.token) setLoggedOut(error.message || 'Kļūda ielādējot balsošanas lapu.');
  }
}

function route() {
  if (state.submitted) { show('done'); return; }      // already voted: never show the form
  if (!state.votingOpen) { show('closed'); return; }
  if (!state.classes.length || !state.nominations.length) {
    show('closed');
    showMessage('Balsošana vēl nav sagatavota (nav klašu vai nomināciju).', 'warning');
    return;
  }
  els.classSelect.innerHTML = '<option value="">— izvēlies klasi —</option>' +
    state.classes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  els.btnStart.disabled = true;
  show('setup');
}

async function beginVoting() {
  const className = els.classSelect.value;
  if (!className) return;
  els.btnStart.disabled = true;
  try {
    const data = await api(`/student/class?name=${encodeURIComponent(className)}`);
    state.roster = data.students || [];
    if (!state.roster.length) { showMessage(`Klasei ${className} nav saraksta. Sazinies ar organizatoriem.`, 'warning'); return; }
    state.className = className;
    els.whoClass.textContent = className;
    clearMessage();
    buildForm();
    show('form');
    window.scrollTo({ top: 0 });
  } catch (error) {
    showMessage(error.message, 'danger');
  } finally {
    els.btnStart.disabled = !els.classSelect.value;
  }
}

// ---------- form ----------
function buildForm() {
  els.nominations.innerHTML = state.nominations.map((n) => `
    <div class="choice-row mb-4" data-nom="${esc(n.id)}">
      <h3 class="h5 mb-1">${esc(n.title)}</h3>
      ${n.description ? `<div class="nomination-desc mb-2">${esc(n.description)}</div>` : ''}
      ${[1, 2, 3].map((rank) => `
        <div class="pick mb-3">
          <label class="form-label">${rank}. izvēle${rank === 1 ? '' : ' (nav obligāta)'}</label>
          <select class="form-select pick-select"></select>
          <textarea class="form-control mt-2 pick-reason d-none" rows="2" maxlength="1200"
            placeholder="Kāpēc tu izvēlies šo cilvēku? (vismaz ${MIN_REASON} rakstzīmes)"></textarea>
        </div>`).join('')}
    </div>`).join('');
  refreshSelects();
  updateProgress();
}

// Each nomination: slot 2 opens after slot 1, slot 3 after slot 2; a person can be picked only once per nomination.
function refreshSelects() {
  document.querySelectorAll('.choice-row').forEach((block) => {
    const picks = [...block.querySelectorAll('.pick')];
    let prevFilled = true;
    picks.forEach((p) => {                               // pass 1: clear slots that follow an empty one
      const sel = p.querySelector('select');
      if (!prevFilled) sel.value = '';
      prevFilled = !!sel.value;
    });
    const chosen = picks.map((p) => p.querySelector('select').value);
    prevFilled = true;
    picks.forEach((p, i) => {                            // pass 2: rebuild options
      const sel = p.querySelector('select');
      const reason = p.querySelector('textarea');
      const taken = new Set(chosen.filter((v, j) => v && j !== i));
      const current = chosen[i];
      sel.innerHTML = '<option value="">— izvēlies —</option>' +
        state.roster.filter((s) => !taken.has(s.id)).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      sel.value = current;
      sel.disabled = !prevFilled;
      reason.classList.toggle('d-none', !sel.value);
      if (!sel.value) reason.value = '';
      prevFilled = !!sel.value;
    });
  });
}

function collect() {
  const entries = [];
  let complete = 0;
  let shortReason = false;
  document.querySelectorAll('.choice-row').forEach((block) => {
    let hasFirst = false;
    let blockOk = true;
    [...block.querySelectorAll('.pick')].forEach((p, i) => {
      const nomineeId = p.querySelector('select').value;
      if (!nomineeId) return;
      const explanation = p.querySelector('textarea').value.trim();
      if (explanation.length < MIN_REASON) { blockOk = false; shortReason = true; }
      if (i === 0) hasFirst = true;
      entries.push({ nominationId: block.dataset.nom, nomineeId, rank: i + 1, explanation });
    });
    if (hasFirst && blockOk) complete++;
  });
  return { entries, complete, total: state.nominations.length, shortReason };
}

function updateProgress() {
  const { complete, total, shortReason } = collect();
  els.progress.textContent = `Pabeigtas nominācijas: ${complete} no ${total}` +
    (shortReason ? ` · katram izvēlētajam jāraksta pamatojums (vismaz ${MIN_REASON} rakstzīmes)` : '');
  els.btnSubmit.disabled = !(total > 0 && complete === total);
}

async function submitBallot(event) {
  event.preventDefault();
  const { entries, complete, total } = collect();
  if (complete !== total) return;
  if (!confirm('Iesniegt balsojumu? Pēc tam to vairs nevarēs mainīt.')) return;
  els.btnSubmit.disabled = true;
  try {
    await api('/ballot/submit', { method: 'POST', body: { className: state.className, entries } });
    state.submitted = true;
    clearMessage();
    show('done');
    window.scrollTo({ top: 0 });
  } catch (error) {
    if (/jau ir iesniegts/.test(error.message)) { state.submitted = true; show('done'); return; }
    showMessage(error.message || 'Balsojums netika pieņemts.', 'danger');
    updateProgress();
  }
}

// ---------- events ----------
els.classSelect.addEventListener('change', () => { els.btnStart.disabled = !els.classSelect.value; });
els.btnStart.addEventListener('click', beginVoting);
els.nominations.addEventListener('change', (e) => { if (e.target.matches('.pick-select')) { refreshSelects(); updateProgress(); } });
els.nominations.addEventListener('input', (e) => { if (e.target.matches('.pick-reason')) updateProgress(); });
$('#view-form').addEventListener('submit', submitBallot);
els.linkChange.addEventListener('click', (e) => { e.preventDefault(); clearMessage(); show('setup'); });
els.btnReload.addEventListener('click', () => window.location.reload());
els.linkLogout.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch (_) { /* ignore */ }
  setLoggedOut();
});
window.addEventListener('DOMContentLoaded', start);
