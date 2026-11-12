const STORAGE_KEY = 'wowemain-nominations-state-v1';

const defaultState = {
  nominations: [
    { id: crypto.randomUUID(), title: 'Gada radošā dvēsele', description: 'Personība, kas iedvesmo klasesbiedrus.' },
    { id: crypto.randomUUID(), title: 'Gada sportists', description: 'Motivēts, aktīvs un komandas gars.' },
    { id: crypto.randomUUID(), title: 'Gada draugs', description: 'Palīdz citiem un veido pozitīvu atmosfēru.' }
  ],
  rosters: {
    '10.A': [
      'Anna Ozola', 'Jānis Bērziņš', 'Līga Siliņa', 'Emīls Krūmiņš', 'Katrīna Kalniņa', 'Mārtiņš Liepiņš'
    ],
    '10.B': [
      'Ieva Jansone', 'Rihards Kļaviņš', 'Liene Mežule', 'Oskars Grīnbergs', 'Darta Vilka', 'Kristaps Lejnieks'
    ],
    '11.A': [
      'Alise Priedīte', 'Henrijs Dārziņš', 'Marta Kārkliņa', 'Toms Vīksna', 'Zane Lāce', 'Jēkabs Zariņš'
    ]
  },
  submissions: [
    {
      id: crypto.randomUUID(),
      className: '10.A',
      nominationId: 'demo',
      nominationTitle: 'Gada radošā dvēsele',
      nominee: 'Anna Ozola',
      voter: 'Studentis 1',
      rank: 1,
      reason: 'Viņa ir ļoti radoša un vienmēr idejas, kas padara klasi interesantāku.',
      status: 'valid'
    },
    {
      id: crypto.randomUUID(),
      className: '10.A',
      nominationId: 'demo',
      nominationTitle: 'Gada sportists',
      nominee: 'Jānis Bērziņš',
      voter: 'Studentis 2',
      rank: 2,
      reason: 'Piedalās sacensībās un iedvesmo citus sportot.',
      status: 'pending'
    },
    {
      id: crypto.randomUUID(),
      className: '10.B',
      nominationId: 'demo',
      nominationTitle: 'Gada draugs',
      nominee: 'Liene Mežule',
      voter: 'Studentis 3',
      rank: 3,
      reason: 'Katru reizi palīdz klasesbiedriem un ir ļoti draudzīga.',
      status: 'rejected'
    }
  ]
};

const state = loadState();

const els = {
  nominationForm: document.getElementById('nomination-form'),
  nominationTitle: document.getElementById('nomination-title'),
  nominationDescription: document.getElementById('nomination-description'),
  nominationList: document.getElementById('nomination-list'),
  classList: document.getElementById('class-list'),
  studentCountBadge: document.getElementById('student-count-badge'),
  submissionList: document.getElementById('submission-list'),
  resultsList: document.getElementById('results-list'),
  filterNomination: document.getElementById('result-filter-nomination'),
  rosterImportInput: document.getElementById('roster-import-input'),
  exportButton: document.getElementById('btn-export-csv')
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);

  try {
    const parsed = JSON.parse(saved);
    return {
      nominations: Array.isArray(parsed.nominations) && parsed.nominations.length ? parsed.nominations : defaultState.nominations,
      rosters: parsed.rosters && typeof parsed.rosters === 'object' ? parsed.rosters : defaultState.rosters,
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : defaultState.submissions
    };
  } catch (error) {
    console.error('Failed to parse local state', error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAllStudents() {
  return Object.entries(state.rosters).reduce((acc, [className, students]) => {
    const names = Array.isArray(students) ? students : [];
    return acc + names.length;
  }, 0);
}

function formatStatus(status) {
  switch (status) {
    case 'valid':
      return 'Apstiprināts';
    case 'pending':
      return 'Gaida';
    case 'rejected':
      return 'Noraidīts';
    default:
      return 'Nezināms';
  }
}

function statusClass(status) {
  switch (status) {
    case 'valid':
      return 'badge-status-valid';
    case 'pending':
      return 'badge-status-pending';
    case 'rejected':
      return 'badge-status-rejected';
    default:
      return 'text-bg-secondary';
  }
}

function renderNominationList() {
  if (!state.nominations.length) {
    els.nominationList.innerHTML = '<div class="empty-state">Vēl nav pievienota neviena nominācija.</div>';
    return;
  }

  els.nominationList.innerHTML = state.nominations.map((item) => `
    <div class="nomination-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.description || 'Bez apraksta')}</small>
      </div>
      <div class="action-group">
        <button class="btn btn-sm btn-outline-danger" data-action="delete-nomination" data-id="${item.id}">Dzēst</button>
      </div>
    </div>
  `).join('');

  els.filterNomination.innerHTML = `<option value="all">Visas nominācijas</option>${state.nominations.map((n) => `
    <option value="${n.id}">${escapeHtml(n.title)}</option>
  `).join('')}`;
}

function renderClassList() {
  const classes = Object.entries(state.rosters);
  els.studentCountBadge.textContent = `${getAllStudents()} skolēnu`;

  if (!classes.length) {
    els.classList.innerHTML = '<div class="empty-state">Nav importētu klašu. Importējiet CSV/Excel failu.</div>';
    return;
  }

  els.classList.innerHTML = classes.map(([className, students]) => `
    <div class="class-card">
      <h3>${escapeHtml(className)}</h3>
      <div class="class-meta">${students.length} skolēni</div>
      <span class="class-badge">${students.length > 0 ? 'Aktīva klase' : 'Tukša klase'}</span>
    </div>
  `).join('');
}

function renderSubmissions() {
  if (!state.submissions.length) {
    els.submissionList.innerHTML = '<tr><td colspan="7" class="empty-state">Vēl nav iesniegti balsojumi.</td></tr>';
    return;
  }

  els.submissionList.innerHTML = state.submissions.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.className)}</td>
      <td>${escapeHtml(entry.nominationTitle || '—')}</td>
      <td>${escapeHtml(entry.nominee)}</td>
      <td>${entry.rank}. izvēle</td>
      <td>${escapeHtml(entry.reason || '—')}</td>
      <td><span class="badge ${statusClass(entry.status)} rounded-pill">${formatStatus(entry.status)}</span></td>
      <td class="text-end">
        <div class="action-group justify-content-end">
          <button class="btn btn-sm btn-success" data-action="approve-entry" data-id="${entry.id}">Apstiprināt</button>
          <button class="btn btn-sm btn-outline-danger" data-action="reject-entry" data-id="${entry.id}">Noraidīt</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function computeResults() {
  const selectedNomination = els.filterNomination.value;
  const rows = [];
  const voteWeight = { 1: 3, 2: 2, 3: 1 };

  const classes = Object.keys(state.rosters);

  classes.forEach((className) => {
    const nominationIds = state.nominations.map((n) => n.id);
    nominationIds.forEach((nominationId) => {
      if (selectedNomination !== 'all' && selectedNomination !== nominationId) return;

      const byNominee = new Map();
      state.submissions
        .filter((entry) => entry.className === className && entry.nominationId === nominationId && entry.status !== 'rejected')
        .forEach((entry) => {
          const key = entry.nominee;
          if (!byNominee.has(key)) {
            byNominee.set(key, {
              nominee: key,
              first: 0,
              second: 0,
              third: 0,
              total: 0
            });
          }
          const value = byNominee.get(key);
          if (entry.rank === 1) value.first += 1;
          if (entry.rank === 2) value.second += 1;
          if (entry.rank === 3) value.third += 1;
          value.total += voteWeight[entry.rank] || 0;
        });

      const nominees = [...byNominee.values()].sort((a, b) => b.total - a.total || b.first - a.first || b.second - a.second);
      const winner = nominees[0] || null;

      if (winner) {
        rows.push({
          className,
          nominationId,
          nominationTitle: state.nominations.find((n) => n.id === nominationId)?.title || 'Nominācija',
          winner: winner.nominee,
          total: winner.total,
          first: winner.first,
          second: winner.second,
          third: winner.third
        });
      }
    });
  });

  return rows.sort((a, b) => {
    if (a.className !== b.className) return a.className.localeCompare(b.className, 'lv');
    return a.nominationTitle.localeCompare(b.nominationTitle, 'lv');
  });
}

function renderResults() {
  const rows = computeResults();
  if (!rows.length) {
    els.resultsList.innerHTML = '<tr><td colspan="6" class="empty-state">Nav datu atlasītajai nominācijai.</td></tr>';
    return;
  }

  els.resultsList.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.className)}</td>
      <td>${escapeHtml(row.nominationTitle)}</td>
      <td><strong>${row.total}</strong> punkti</td>
      <td>${row.first}</td>
      <td>${row.second}</td>
      <td>${row.third}</td>
    </tr>
  `).join('');
}

function addNomination(event) {
  event.preventDefault();
  const title = els.nominationTitle.value.trim();
  const description = els.nominationDescription.value.trim();

  if (!title) {
    alert('Ievadiet nominācijas nosaukumu.');
    return;
  }

  state.nominations.push({
    id: uid(),
    title,
    description
  });

  els.nominationForm.reset();
  saveState();
  renderAll();
}

function deleteNomination(id) {
  state.nominations = state.nominations.filter((item) => item.id !== id);
  state.submissions = state.submissions.filter((entry) => entry.nominationId !== id);
  saveState();
  renderAll();
}

function updateEntryStatus(id, status) {
  const entry = state.submissions.find((item) => item.id === id);
  if (!entry) return;
  entry.status = status;
  saveState();
  renderAll();
}

function parseRosterFile(file) {
  return new Promise((resolve, reject) => {
    const name = (file.name || '').toLowerCase();
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result ?? '';
        let rows = [];

        if (name.endsWith('.csv') || name.endsWith('.txt')) {
          const lines = String(text).split(/\r?\n/).filter((line) => line.trim());
          const delimiter = lines[0]?.includes(';') ? ';' : ',';
          rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
        } else if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        } else {
          reject(new Error('Nepazīts faila formāts. Izmantojiet CSV, XLSX vai TXT.'));
          return;
        }

        const records = [];
        for (const row of rows) {
          if (!Array.isArray(row) || row.length < 2) continue;
          const values = row.map((cell) => String(cell).trim());
          const classIndex = values.findIndex((value) => /^\d{1,2}\s*([A-Za-z]|[A-Za-z]\s*[-/]\s*[A-Za-z])?$/.test(value));
          const nameIndex = values.findIndex((value) => /[A-Za-zĀČĒĢĪĶĻŅÖŖŠŪŽāčēģīķļņöŗšūž]/.test(value));

          if (classIndex === -1 || nameIndex === -1) continue;
          const className = values[classIndex].replace(/\s+/g, ' ').replace(/\.$/, '').trim();
          const studentName = values[nameIndex].replace(/\s+/g, ' ').trim();

          if (!className || !studentName) continue;
          records.push({ className, studentName });
        }

        if (!records.length) {
          reject(new Error('Fails netika nolasīts pareizi. Pārbaudiet, vai tajā ir klases nosaukums un skolēnu vārdi.'));
          return;
        }

        resolve(records);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Neizdevās nolasīt failu.'));

    if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

async function handleRosterImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const records = await parseRosterFile(file);
    const nextRosters = { ...state.rosters };

    for (const { className, studentName } of records) {
      const normalizedClass = className.trim();
      if (!normalizedClass) continue;
      const names = nextRosters[normalizedClass] || [];
      if (!names.includes(studentName)) names.push(studentName);
      nextRosters[normalizedClass] = names;
    }

    state.rosters = nextRosters;
    saveState();
    renderAll();
    event.target.value = '';
  } catch (error) {
    alert(error.message || 'Neizdevās importēt klases sarakstu.');
    event.target.value = '';
  }
}

function exportCsv() {
  const rows = computeResults();
  if (!rows.length) {
    alert('Nav datu eksportēšanai.');
    return;
  }

  const header = ['Klase', 'Nominācija', 'Vērtējums', '1. vieta', '2. vieta', '3. vieta'];
  const csvRows = [header.join(',')];

  rows.forEach((row) => {
    csvRows.push([
      row.className,
      row.nominationTitle,
      row.total,
      row.first,
      row.second,
      row.third
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nominaciju-rezultati.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  els.nominationForm.addEventListener('submit', addNomination);
  els.nominationList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete-nomination"]');
    if (!button) return;
    deleteNomination(button.dataset.id);
  });

  els.submissionList.addEventListener('click', (event) => {
    const approve = event.target.closest('[data-action="approve-entry"]');
    if (approve) {
      updateEntryStatus(approve.dataset.id, 'valid');
      return;
    }

    const reject = event.target.closest('[data-action="reject-entry"]');
    if (reject) {
      updateEntryStatus(reject.dataset.id, 'rejected');
    }
  });

  els.resultFilterNomination.addEventListener('change', renderResults);
  els.rosterImportInput.addEventListener('change', handleRosterImport);
  els.exportButton.addEventListener('click', exportCsv);
}

function renderAll() {
  renderNominationList();
  renderClassList();
  renderSubmissions();
  renderResults();
}

bindEvents();
renderAll();
