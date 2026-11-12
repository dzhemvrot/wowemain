// Roster import for the nominations organizer panel.
// Same parsing strategy as msaieti/app.js (three parsers, the one that finds the most names wins),
// extended to grades 1-12. Load this BEFORE app.js; app.js must not define these functions itself.

const ROSTER_MAX_BYTES = 5 * 1024 * 1024;

// "3a", "3.a", "3. a" -> "3.a"; bare grade "3" -> "3.a" (like msaieti). strict = a letter is required,
// so plain row numbers are never mistaken for classes.
function normalizeClass(raw, strict = false) {
  if (raw == null) return null;
  const s = String(raw).replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/\s+/g, '').replace(/\.+$/, '');
  if (!s) return null;
  const m = s.match(/^(1[0-2]|[1-9])\.?([a-z])?$/);
  if (!m || (strict && !m[2])) return null;
  return `${m[1]}.${m[2] || 'a'}`;
}

function cleanName(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\u00a0/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

// ONE delimiter per file (chosen from the first line), quotes respected.
// Splitting on every , ; and tab at once broke names like "Balulis, Nikita" in ;-separated files.
function csvRows(text) {
  text = String(text).replace(/^\ufeff/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

// File names like 2.xlsx, 3a.xlsx, 3.b.xlsx
function classFromFilename(filename) {
  if (!filename) return null;
  const base = String(filename).replace(/^.*[\\/]/, '').replace(/\.(xlsx|xls|csv|txt)$/i, '').trim();
  return normalizeClass(base);
}

// Title row like "..., Rīgas 22. vidusskola, 3.a, Klases stunda"
function classFromTitleCell(text) {
  if (text == null) return null;
  const s = String(text).replace(/\u00a0/g, ' ');
  const m1 = s.match(/(?:^|[\s,;])(1[0-2]|[1-9])\s*\.?\s*([a-zA-Z])(?=$|[\s,;.])/);
  if (m1) return `${m1[1]}.${m1[2].toLowerCase()}`;
  const m2 = s.match(/(?:^|[\s,;])(1[0-2]|[1-9])(?:[\s,;]|$)/);
  return m2 ? `${m2[1]}.a` : null;
}

function looksLikeRosterHeader(row) {
  if (!row || !row.length) return false;
  const joined = row.map((c) => String(c == null ? '' : c).toLowerCase()).join(' ');
  return /uzvārds|uzvards|vārds|vards|paraksts|datums/.test(joined) && (/nr\.?/.test(joined) || /№/.test(joined));
}

function looksLikePersonName(s) {
  const n = cleanName(s);
  if (!n || n.length < 2) return false;
  if (/^(nr\.?|№|datums|paraksts|uzvārds|uzvards)$/i.test(n)) return false;
  if (/^\d+$/.test(n)) return false;
  return /[A-Za-zĀČĒĢĪĶĻŅŠŪŽāčēģīķļņšūžА-Яа-яЁёІіЇїЄє]/.test(n);
}

// Single-class sheet: Nr. | Uzvārds Vārds | Datums | Paraksts
function parseClassRosterSheet(rows, filename) {
  if (!rows || !rows.length) return [];
  let cls = classFromFilename(filename) || classFromTitleCell(rows[0] && rows[0][0]) ||
    classFromTitleCell(rows[0] && rows[0].filter((c) => c != null).join(' '));
  if (!cls) {
    for (let i = 0; i < Math.min(5, rows.length) && !cls; i++) {
      for (const cell of rows[i] || []) { cls = classFromTitleCell(cell) || normalizeClass(cell, true); if (cls) break; }
    }
  }
  if (!cls) return [];

  let nameCol = 1;
  let startRow = 0;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if (looksLikeRosterHeader(rows[i])) {
      startRow = i + 1;
      const header = rows[i].map((c) => String(c == null ? '' : c).toLowerCase());
      const ni = header.findIndex((h) => /uzvārds|uzvards|vārds|vards|name|fio/.test(h));
      if (ni >= 0) nameCol = ni;
      break;
    }
  }
  if (startRow === 0) {
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const r = rows[i];
      if (!r) continue;
      if (r[0] != null && /^\d+$/.test(String(r[0]).trim()) && looksLikePersonName(r[1])) { startRow = i; nameCol = 1; break; }
      if (looksLikePersonName(r[0]) && !normalizeClass(r[0], true)) { startRow = i; nameCol = 0; break; }
    }
  }

  const out = [];
  const seen = new Set();
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    let rawName = r[nameCol];
    if (!looksLikePersonName(rawName)) {
      if (looksLikePersonName(r[1])) rawName = r[1];
      else if (looksLikePersonName(r[0]) && !/^\d+$/.test(String(r[0]).trim())) rawName = r[0];
      else continue;
    }
    if (/^\d+$/.test(String(rawName).trim())) continue;
    if (/garderob|vidusskol|klases stunda|paraksts/i.test(String(rawName))) continue;
    const name = cleanName(rawName);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, className: cls });
  }
  return out;
}

// Several classes side by side: class header in one column, names in the next (last year's layout).
function parseDualColumnSheet(rows) {
  const out = [];
  function walk(hCol, nCol) {
    let cur = null;
    for (const row of rows) {
      const h = row[hCol];
      if (h != null && String(h).trim()) cur = normalizeClass(h, true);
      const name = cleanName(row[nCol]);
      if (name && cur && looksLikePersonName(name)) out.push({ name, className: cur });
    }
  }
  walk(0, 1);
  if (rows[0] && rows[0].length >= 4) walk(2, 3);
  return out;
}

// Plain table with class and name columns (any order, header optional).
function parseSimpleTable(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((c) => String(c == null ? '' : c).toLowerCase().trim());
  let classIdx = header.findIndex((h) => /klase|class|grade|класс/.test(h));
  let nameIdx = header.findIndex((h) => /vārds|vards|name|имя|fio|uzvārds/.test(h));
  let start = 1;
  if (classIdx < 0 || nameIdx < 0) {
    classIdx = -1; nameIdx = -1; start = 0;
    for (const r of rows.slice(0, 5)) {
      if (!r) continue;
      if (normalizeClass(r[0], true) && cleanName(r[1])) { classIdx = 0; nameIdx = 1; break; }
      if (normalizeClass(r[1], true) && cleanName(r[0])) { classIdx = 1; nameIdx = 0; break; }
    }
    if (classIdx < 0) return [];
  }
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const cls = normalizeClass(r[classIdx]);
    const name = cleanName(r[nameIdx]);
    if (cls && name && looksLikePersonName(name)) out.push({ name, className: cls });
  }
  return out;
}

function detectAndParseRows(rows, filename) {
  if (!rows || !rows.length) return [];
  const candidates = [parseClassRosterSheet(rows, filename), parseDualColumnSheet(rows), parseSimpleTable(rows)]
    .sort((a, b) => b.length - a.length);
  return candidates[0] || [];
}

async function readRoster(file) {
  if (file.size > ROSTER_MAX_BYTES) throw new Error(`${file.name}: fails ir lielāks par 5 MB.`);
  const lower = file.name.toLowerCase();
  let rows;
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) rows = csvRows(await file.text());
  else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') throw new Error('Excel lasītājs nav ielādēts. Izmantojiet CSV.');
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (!book.SheetNames.length) throw new Error(`${file.name}: Excel failā nav lapu.`);
    rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
  } else throw new Error(`${file.name}: atbalstīti CSV, XLSX, XLS un TXT faili.`);
  const students = detectAndParseRows(rows, file.name);
  if (!students.length) throw new Error(`${file.name}: neatradu nevienu skolēnu. Pārbaudi, vai klase ir norādīta faila nosaukumā, virsrakstā vai kolonnā.`);
  return students;
}
