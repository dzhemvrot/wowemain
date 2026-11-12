const API_BASE = 'https://school-api.wmcoeu.workers.dev/nominations';
const TOKEN_KEY = 'wowemain-nominations-session';

const state = { token: sessionStorage.getItem(TOKEN_KEY) || '', user: null, nominations: [], classes: [], submissions: [], ballots: [], log: [], results: [], votingOpen: false };
const $ = (selector) => document.querySelector(selector);
const els = {
  loginView: $('#login-view'), loginError: $('#login-error'), appView: $('#app-view'), userLabel: $('#user-label'),
  message: $('#app-message'), nominationForm: $('#nomination-form'), nominationTitle: $('#nomination-title'),
  nominationDescription: $('#nomination-description'), nominationList: $('#nomination-list'), classList: $('#class-list'),
  studentCount: $('#student-count-badge'), submissions: $('#submission-list'), results: $('#results-list'),
  filter: $('#result-filter-nomination'), rosterInput: $('#roster-import-input'), exportButton: $('#btn-export-csv'),
  votingStatus: $('#voting-status'), ballots: $('#ballot-list'), logList: $('#log-list'), logFilter: $('#log-filter'),
};

const LOG_LABELS = {
  vote_entry: 'Balss', ballot_submit: 'Balsojums iesniegts', ballot_delete: 'Balsojums dzēsts',
  roster_import: 'Importēja sarakstu', class_delete: 'Dzēsa klasi', moderate_entry: 'Moderācija',
  add_nomination: 'Pievienoja nomināciju', delete_nomination: 'Dzēsa nomināciju',
  open_voting: 'Atvēra balsošanu', close_voting: 'Slēdza balsošanu',
};

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function showMessage(message, type = 'success') {
  els.message.textContent = message;
  els.message.className = `alert alert-${type}`;
  els.message.classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function clearMessage() { els.message.classList.add('d-none'); }
function setLoggedOut(message = '') {
  state.token = '';
  state.user = null;
  sessionStorage.removeItem(TOKEN_KEY);
  els.appView.classList.add('d-none');
  els.loginView.classList.remove('d-none');
  if (message) {
    els.loginError.textContent = message;
    els.loginError.classList.remove('d-none');
  }
}
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'follow',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    if (response.status === 401 && path !== '/auth/exchange') {
      setLoggedOut('Sesija beigusies. Ienāc vēlreiz ar skolas Microsoft kontu.');
    }
    throw new Error(data.error || `Pieprasījums neizdevās (${response.status}).`);
  }
  return data;
}

async function consumeAuthCode() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_code');
  if (!code) return false;
  url.searchParams.delete('auth_code');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  try {
    const response = await api('/auth/exchange', { method: 'POST', body: { code } });
    state.token = response.token;
    sessionStorage.setItem(TOKEN_KEY, state.token);
    return true;
  } catch (error) {
    setLoggedOut(error.message || 'Neizdevās pabeigt Microsoft pierakstīšanos.');
    return false;
  }
}

// ---------- Rendering ----------
function statusText(status) {
  return ({ valid: 'Apstiprināts', pending: 'Gaida', rejected: 'Noraidīts' })[status] || 'Nezināms';
}
function statusClass(status) {
  return ({ valid: 'badge-status-valid', pending: 'badge-status-pending', rejected: 'badge-status-rejected' })[status] || 'text-bg-secondary';
}
function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? String(iso || '') : d.toLocaleString('lv-LV');
}
function renderNominations() {
  if (!state.nominations.length) {
    els.nominationList.innerHTML = '<div class="empty-state">Vēl nav pievienota neviena nominācija.</div>';
  } else {
    els.nominationList.innerHTML = state.nominations.map((item) => `
      <div class="nomination-item">
        <div><strong>${esc(item.title)}</strong><small>${esc(item.description || 'Bez apraksta')}</small></div>
        <button class="btn btn-sm btn-outline-danger" data-action="delete-nomination" data-id="${esc(item.id)}">Dzēst</button>
      </div>`).join('');
  }
  const selected = els.filter.value;
  els.filter.innerHTML = '<option value="all">Visas nominācijas</option>' + state.nominations.map((item) =>
    `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('');
  if ([...els.filter.options].some((option) => option.value === selected)) els.filter.value = selected;
}
function renderClasses() {
  const count = state.classes.reduce((sum, item) => sum + Number(item.student_count || 0), 0);
  els.studentCount.textContent = `${count} skolēnu`;
  if (!state.classes.length) {
    els.classList.innerHTML = '<div class="empty-state">Nav importētu klašu. Importējiet CSV vai Excel failus ar klašu sarakstiem.</div>';
    return;
  }
  els.classList.innerHTML = state.classes.map((item) => `
    <div class="class-card"><h3>${esc(item.class_name)}</h3>
      <div class="class-meta">${Number(item.student_count)} skolēni</div>
      <span class="class-badge">Balsojuši: ${Number(item.voted_count)} / ${Number(item.student_count)}</span>
      <div class="mt-2"><button class="btn btn-sm btn-outline-danger" data-action="delete-class" data-class="${esc(item.class_name)}">Dzēst klasi</button></div>
    </div>`).join('');
}
function renderSubmissions() {
  if (!state.submissions.length) {
    els.submissions.innerHTML = '<tr><td colspan="8" class="empty-state">Vēl nav iesniegtu balsojumu.</td></tr>';
    return;
  }
  els.submissions.innerHTML = state.submissions.map((entry) => `
    <tr>
      <td>${esc(entry.className)}</td><td>${esc(entry.nominationTitle)}</td><td>${esc(entry.nominee)}</td>
      <td>${esc(entry.voter || '—')}</td><td>${Number(entry.rank)}. izvēle</td><td class="reason-cell">${esc(entry.reason)}</td>
      <td><span class="badge ${statusClass(entry.status)} rounded-pill">${statusText(entry.status)}</span></td>
      <td class="text-end"><div class="action-group justify-content-end">
        ${entry.status !== 'valid' ? `<button class="btn btn-sm btn-success" data-action="moderate" data-status="valid" data-id="${esc(entry.id)}">Apstiprināt</button>` : ''}
        ${entry.status !== 'rejected' ? `<button class="btn btn-sm btn-outline-danger" data-action="moderate" data-status="rejected" data-id="${esc(entry.id)}">Noraidīt</button>` : ''}
        ${entry.status === 'rejected' ? `<button class="btn btn-sm btn-outline-secondary" data-action="moderate" data-status="pending" data-id="${esc(entry.id)}">Atjaunot</button>` : ''}
      </div></td>
    </tr>`).join('');
}
function renderBallots() {
  if (!state.ballots.length) {
    els.ballots.innerHTML = '<tr><td colspan="6" class="empty-state">Vēl neviens nav nobalsojis.</td></tr>';
    return;
  }
  els.ballots.innerHTML = state.ballots.map((b) => `
    <tr><td>${esc(fmtTime(b.submittedAt))}</td><td>${esc(b.className)}</td><td>${esc(b.voter)}</td>
      <td class="small text-muted">${esc(b.voterEmail)}</td><td>${Number(b.entryCount)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-action="delete-ballot" data-id="${esc(b.id)}">Dzēst</button></td></tr>`).join('');
}
function renderResults() {
  const nominationId = els.filter.value;
  const rows = state.results.filter((row) => nominationId === 'all' || row.nominationId === nominationId).filter((row) => row.place <= 3);
  if (!rows.length) {
    els.results.innerHTML = '<tr><td colspan="8" class="empty-state">Nav apstiprinātu rezultātu atlasītajai nominācijai.</td></tr>';
    return;
  }
  els.results.innerHTML = rows.map((row) => `
    <tr><td>${esc(row.className)}</td><td>${esc(row.nominationTitle)}</td><td>${row.place}.</td><td><strong>${esc(row.nominee)}</strong></td>
      <td>${Number(row.points)}</td><td>${Number(row.first)}</td><td>${Number(row.second)}</td><td>${Number(row.third)}</td></tr>`).join('');
}
function visibleLog() {
  return els.logFilter.value === 'all' ? state.log : state.log.filter((l) => l.action === 'vote_entry');
}
function renderLog() {
  const rows = visibleLog();
  if (!rows.length) {
    els.logList.innerHTML = '<tr><td colspan="4" class="empty-state">Nav ierakstu.</td></tr>';
    return;
  }
  els.logList.innerHTML = rows.map((l) => `
    <tr><td class="text-nowrap">${esc(fmtTime(l.ts))}</td><td class="small">${esc(l.actor)}</td>
      <td>${esc(LOG_LABELS[l.action] || l.action)}</td><td>${esc(l.details || '')}</td></tr>`).join('');
}
function renderVoting() {
  els.votingStatus.textContent = state.votingOpen ? 'Balsošana ir atvērta.' : 'Balsošana ir slēgta.';
  $('#btn-voting-open').disabled = state.votingOpen;
  $('#btn-voting-close').disabled = !state.votingOpen;
}
function renderAll() {
  renderNominations(); renderClasses(); renderSubmissions(); renderBallots(); renderResults(); renderLog(); renderVoting();
}
async function loadData() {
  clearMessage();
  const data = await api('/data');
  state.nominations = data.nominations || [];
  state.classes = data.classes || [];
  state.submissions = data.submissions || [];
  state.ballots = data.ballots || [];
  state.log = data.log || [];
  state.results = data.results || [];
  state.votingOpen = !!data.votingOpen;
  renderAll();
}

// ---------- Actions ----------
async function addNomination(event) {
  event.preventDefault();
  const title = els.nominationTitle.value.trim();
  const description = els.nominationDescription.value.trim();
  if (!title) return;
  try {
    await api('/nominations/add', { method: 'POST', body: { title, description } });
    els.nominationForm.reset(); await loadData(); showMessage('Nominācija pievienota.');
  } catch (error) { showMessage(error.message, 'danger'); }
}
async function nominationAction(event) {
  const button = event.target.closest('[data-action="delete-nomination"]');
  if (!button) return;
  const nomination = state.nominations.find((item) => item.id === button.dataset.id);
  if (!nomination || !confirm(`Dzēst nomināciju “${nomination.title}”? Saistītie balsojumi arī tiks dzēsti.`)) return;
  try {
    await api('/nominations/delete', { method: 'POST', body: { id: button.dataset.id } });
    await loadData(); showMessage('Nominācija dzēsta.');
  } catch (error) { showMessage(error.message, 'danger'); }
}
async function classAction(event) {
  const button = event.target.closest('[data-action="delete-class"]');
  if (!button) return;
  const className = button.dataset.class;
  if (!confirm(`Dzēst visu klasi ${className}? Tiks dzēsti arī šīs klases skolēnu balsojumi un balsojumi par viņiem.`)) return;
  try {
    await api('/rosters/delete-class', { method: 'POST', body: { className } });
    await loadData(); showMessage(`Klase ${className} dzēsta.`);
  } catch (error) { showMessage(error.message, 'danger'); }
}
async function ballotAction(event) {
  const button = event.target.closest('[data-action="delete-ballot"]');
  if (!button) return;
  const ballot = state.ballots.find((b) => b.id === button.dataset.id);
  if (!ballot || !confirm(`Dzēst balsojumu: ${ballot.className} · ${ballot.voter}? Skolēns varēs balsot vēlreiz.`)) return;
  try {
    await api('/ballots/delete', { method: 'POST', body: { id: ballot.id } });
    await loadData(); showMessage('Balsojums dzēsts.');
  } catch (error) { showMessage(error.message, 'danger'); }
}
async function moderate(event) {
  const button = event.target.closest('[data-action="moderate"]');
  if (!button) return;
  const status = button.dataset.status;
  if (status === 'rejected' && !confirm('Noraidīt šo nomināciju? Tā vairs netiks ieskaitīta rezultātos.')) return;
  try {
    await api('/entries/moderate', { method: 'POST', body: { id: button.dataset.id, status } });
    await loadData(); showMessage('Moderācijas statuss saglabāts.');
  } catch (error) { showMessage(error.message, 'danger'); }
}
async function setVoting(open) {
  if (open && !confirm('Atvērt balsošanu skolēniem?')) return;
  if (!open && !confirm('Slēgt balsošanu?')) return;
  try {
    const result = await api(`/voting/${open ? 'open' : 'close'}`, { method: 'POST', body: {} });
    state.votingOpen = result.open; renderVoting(); showMessage(open ? 'Balsošana atvērta.' : 'Balsošana slēgta.');
  } catch (error) { showMessage(error.message, 'danger'); }
}
function downloadCsv(filename, values) {
  const csv = '\ufeff' + values.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  const selected = els.filter.value;
  const rows = state.results.filter((row) => row.place <= 3 && (selected === 'all' || row.nominationId === selected));
  if (!rows.length) { showMessage('Nav apstiprinātu rezultātu eksportēšanai.', 'warning'); return; }
  downloadCsv('nominaciju-rezultati.csv', [
    ['Klase', 'Nominācija', 'Vieta', 'Skolēns', 'Punkti', '1. vieta', '2. vieta', '3. vieta'],
    ...rows.map((row) => [row.className, row.nominationTitle, row.place, row.nominee, row.points, row.first, row.second, row.third]),
  ]);
}
function exportLog() {
  const rows = visibleLog();
  if (!rows.length) { showMessage('Žurnālā nav ierakstu.', 'warning'); return; }
  downloadCsv('nominaciju-zurnals.csv', [
    ['Laiks', 'Konts', 'Darbība', 'Detaļas'],
    ...rows.map((l) => [fmtTime(l.ts), l.actor, LOG_LABELS[l.action] || l.action, l.details || '']),
  ]);
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* clear local token regardless */ }
  setLoggedOut();
}
async function start() {
  const exchanged = await consumeAuthCode();
  if (!state.token && !exchanged) return;
  try {
    const auth = await api('/auth/me');
    if (!auth.user) { setLoggedOut(); return; }
    if (auth.user.role !== 'organizer') { window.location.replace('vote.html'); return; }
    state.user = auth.user;
    els.loginView.classList.add('d-none');
    els.appView.classList.remove('d-none');
    els.userLabel.textContent = `${auth.user.email} · organizators`;
    await loadData();
  } catch (error) {
    if (!els.loginView.classList.contains('d-none')) return;
    setLoggedOut(error.message || 'Neizdevās ielādēt organizatora paneli.');
  }
}

els.nominationForm.addEventListener('submit', addNomination);
els.nominationList.addEventListener('click', nominationAction);
els.classList.addEventListener('click', classAction);
els.ballots.addEventListener('click', ballotAction);
els.submissions.addEventListener('click', moderate);
els.filter.addEventListener('change', renderResults);
els.logFilter.addEventListener('change', renderLog);
els.rosterInput.addEventListener('change', importRoster);
els.exportButton.addEventListener('click', exportCsv);
$('#btn-export-log').addEventListener('click', exportLog);
$('#btn-refresh').addEventListener('click', () => loadData().then(() => showMessage('Dati atjaunoti.')).catch((error) => showMessage(error.message, 'danger')));
$('#btn-voting-open').addEventListener('click', () => setVoting(true));
$('#btn-voting-close').addEventListener('click', () => setVoting(false));
$('#btn-logout').addEventListener('click', logout);
start();
