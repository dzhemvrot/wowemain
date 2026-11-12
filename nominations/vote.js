const API_BASE = 'https://school-api.wmcoeu.workers.dev/nominations';
const TOKEN_KEY = 'wowemain-nominations-session';
const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  user: null,
  classes: [],
  nominations: [],
  roster: [],
  student: null,
  submitted: false,
  votingOpen: false,
};

const $ = (selector) => document.querySelector(selector);
const els = {
  message: $('#msg'),
  loading: $('#view-loading'),
  login: $('#view-login'),
  closed: $('#view-closed'),
  done: $('#view-done'),
  setup: $('#view-setup'),
  form: $('#view-form'),
  classSelect: $('#sel-class'),
  nameSelect: $('#sel-name'),
  btnStart: $('#btn-start'),
  nominations: $('#nominations'),
  progress: $('#progress'),
  btnSubmit: $('#btn-submit'),
  whoClass: $('#who-class'),
  whoName: $('#who-name'),
  linkChange: $('#link-change'),
  linkLogout: $('#link-logout'),
  userLine: $('#user-line'),
  panelLink: $('#link-panel'),
  btnReload: $('#btn-reload'),
};

function showMessage(text, type = 'danger') {
  els.message.textContent = text;
  els.message.className = `alert alert-${type} mt-3`;
  els.message.classList.remove('d-none');
}

function clearMessage() {
  els.message.classList.add('d-none');
  els.message.textContent = '';
}

function setLoggedOut(message = '') {
  state.token = '';
  state.user = null;
  sessionStorage.removeItem(TOKEN_KEY);
  els.login.classList.remove('d-none');
  els.closed.classList.add('d-none');
  els.done.classList.add('d-none');
  els.setup.classList.add('d-none');
  els.form.classList.add('d-none');
  els.loading.classList.add('d-none');
  if (message) showMessage(message, 'warning');
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

async function loadStudentData() {
  const data = await api('/student/data');
  state.classes = data.classes || [];
  state.nominations = data.nominations || [];
  state.submitted = !!data.submitted;
  state.votingOpen = !!data.votingOpen;
  state.user = data.email || state.user;
  renderClassOptions();
  renderForm();
}

function renderClassOptions() {
  const current = els.classSelect.value || '';
  els.classSelect.innerHTML = '<option value="">— izvēlies klasi —</option>' +
    state.classes.map((className) => `<option value="${className}">${className}</option>`).join('');
  if (state.classes.includes(current)) els.classSelect.value = current;
}

async function loadRosterForClass(className) {
  if (!className) {
    state.roster = [];
    els.nameSelect.innerHTML = '<option value="">— izvēlies savu vārdu —</option>';
    els.btnStart.disabled = true;
    return;
  }
  const data = await api(`/student/class?name=${encodeURIComponent(className)}`);
  state.roster = data.students || [];
  els.nameSelect.innerHTML = '<option value="">— izvēlies savu vārdu —</option>' +
    state.roster.map((student) => `<option value="${student.id}">${student.name}</option>`).join('');
  els.btnStart.disabled = !state.roster.length;
  if (!state.roster.length) {
    showMessage(`Klasei “${className}” nav studentu. Jūs varat ievadīt savu vārdu manuāli.`, 'warning');
  }
}

function renderForm() {
  if (state.submitted) {
    showDone();
    return;
  }

  if (!state.votingOpen) {
    showClosed();
    return;
  }

  els.setup.classList.remove('d-none');
  els.form.classList.add('d-none');
  els.loading.classList.add('d-none');
  els.login.classList.add('d-none');
  els.closed.classList.add('d-none');
  els.done.classList.add('d-none');
  els.userLine.textContent = state.user ? ` | ${state.user}` : '';
  if (state.user) {
    els.panelLink.classList.remove('d-none');
    els.linkLogout.classList.remove('d-none');
  }
}

function showClosed() {
  els.closed.classList.remove('d-none');
  els.setup.classList.add('d-none');
  els.form.classList.add('d-none');
  els.login.classList.add('d-none');
  els.loading.classList.add('d-none');
  els.done.classList.add('d-none');
}

function showDone() {
  els.done.classList.remove('d-none');
  els.setup.classList.add('d-none');
  els.form.classList.add('d-none');
  els.closed.classList.add('d-none');
  els.login.classList.add('d-none');
  els.loading.classList.add('d-none');
}

function beginVoting() {
  const className = els.classSelect.value;
  const studentId = els.nameSelect.value;
  if (!className || !studentId) return;
  const student = state.roster.find((row) => row.id === studentId);
  if (!student) return;
  state.student = { className, ...student };
  els.whoClass.textContent = className;
  els.whoName.textContent = student.name;
  buildNominationForm();
  els.setup.classList.add('d-none');
  els.form.classList.remove('d-none');
  els.linkChange.addEventListener('click', (event) => {
    event.preventDefault();
    els.form.classList.add('d-none');
    els.setup.classList.remove('d-none');
  }, { once: true });
}

function buildNominationForm() {
  if (!state.nominations.length) {
    els.nominations.innerHTML = '<div class="alert alert-secondary">Nav pievienota neviena nominācija.</div>';
    return;
  }

  const classNames = state.roster.map((student) => ({ value: student.id, label: student.name }));
  els.nominations.innerHTML = state.nominations.map((nomination) => {
    const options = ['<option value="">— izvēlies —</option>']
      .concat(classNames.map((student) => `<option value="${student.value}">${student.label}</option>`))
      .join('');

    return `
      <div class="choice-row ${classNames.length ? '' : 'is-empty'} mb-3">
        <h3 class="h5 mb-1">${nomination.title}</h3>
        ${nomination.description ? `<div class="nomination-desc mb-3">${nomination.description}</div>` : ''}
        <div class="mb-2">
          <label class="form-label">1. izvēle</label>
          <select class="form-select choice-select" data-nomination-id="${nomination.id}" data-rank="1">
            ${options}
          </select>
        </div>
        <div class="mb-2">
          <label class="form-label">2. izvēle</label>
          <select class="form-select choice-select" data-nomination-id="${nomination.id}" data-rank="2">
            ${options}
          </select>
        </div>
        <div class="mb-2">
          <label class="form-label">3. izvēle</label>
          <select class="form-select choice-select" data-nomination-id="${nomination.id}" data-rank="3">
            ${options}
          </select>
        </div>
      </div>
    `;
  }).join('');

  const selects = [...document.querySelectorAll('.choice-select')];
  selects.forEach((select) => {
    select.addEventListener('change', () => updateProgress());
  });
  updateProgress();
}

function updateProgress() {
  const selects = [...document.querySelectorAll('.choice-select')];
  let total = 0;
  const byNomination = new Map();
  for (const select of selects) {
    const nominationId = select.dataset.nominationId;
    const rank = Number(select.dataset.rank);
    const value = select.value;
    if (!byNomination.has(nominationId)) byNomination.set(nominationId, new Map());
    const group = byNomination.get(nominationId);
    if (value) { group.set(rank, value); total += 1; }
  }

  let valid = true;
  for (const [nominationId, group] of byNomination.entries()) {
    const chosenIds = [...group.values()];
    if (new Set(chosenIds).size !== chosenIds.length) valid = false;
    if (chosenIds.length > 0 && chosenIds.length < 3) {
      valid = valid && [...Array(3).keys()].every((index) => group.has(index + 1) || !group.has(index + 1));
    }
  }

  const totalNominationCount = state.nominations.length || 0;
  els.progress.textContent = `${total} izvēles no ${totalNominationCount * 3} iespējami`; 
  els.btnSubmit.disabled = !(total >= totalNominationCount);
  if (!valid) {
    els.progress.textContent += ' · pārbaudi dublikātus un secību';
  }
}

async function submitBallot() {
  const entries = [];
  const nominationMap = new Map();
  const selects = [...document.querySelectorAll('.choice-select')];
  for (const select of selects) {
    const value = select.value;
    if (!value) continue;
    const nominationId = select.dataset.nominationId;
    const rank = Number(select.dataset.rank);
    if (!nominationMap.has(nominationId)) nominationMap.set(nominationId, []);
    nominationMap.get(nominationId).push({ nominationId, nomineeId: value, rank });
  }

  for (const nomination of state.nominations) {
    const picks = nominationMap.get(nomination.id) || [];
    if (!picks.length) {
      showMessage('Katrā nominācijā jāizvēlas vismaz viens cilvēks.', 'warning');
      return;
    }
    for (const pick of picks) {
      const nominee = state.roster.find((person) => person.id === pick.nomineeId);
      if (!nominee) {
        showMessage('Kļūda nominācijā — izvēlētais students nav atrasts.', 'danger');
        return;
      }
      entries.push({
        nominationId: pick.nominationId,
        nomineeId: pick.nomineeId,
        rank: pick.rank,
        explanation: 'Balsots pēc pieprasītā procesa',
      });
    }
  }

  try {
    await api('/ballot/submit', {
      method: 'POST',
      body: {
        studentId: state.student.id,
        className: state.student.className,
        studentName: state.student.name,
        entries,
      },
    });
    state.submitted = true;
    showDone();
    sessionStorage.setItem(TOKEN_KEY, state.token);
  } catch (error) {
    showMessage(error.message || 'Balsojums netika pieņemts.', 'danger');
  }
}

async function startFromAuth() {
  clearMessage();
  const exchanged = await consumeAuthCode();
  if (!state.token && !exchanged) return;
  try {
    const auth = await api('/auth/me');
    if (!auth.user) {
      setLoggedOut();
      return;
    }
    state.user = auth.user.email || auth.user.user || null;
    els.login.classList.add('d-none');
    els.loading.classList.remove('d-none');
    await loadStudentData();
    els.loading.classList.add('d-none');
    renderForm();
  } catch (error) {
    setLoggedOut(error.message || 'Kļūda ielādējot balsošanas lapu.');
  }
}

els.classSelect.addEventListener('change', async () => {
  const className = els.classSelect.value;
  els.btnStart.disabled = !className;
  if (!className) {
    els.nameSelect.innerHTML = '<option value="">— izvēlies savu vārdu —</option>';
    return;
  }
  await loadRosterForClass(className);
});

els.btnStart.addEventListener('click', beginVoting);
els.btnSubmit.addEventListener('click', submitBallot);
els.btnReload.addEventListener('click', () => window.location.reload());
els.linkLogout.addEventListener('click', async (event) => {
  event.preventDefault();
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch (_) {}
  setLoggedOut();
});

window.addEventListener('DOMContentLoaded', startFromAuth);
