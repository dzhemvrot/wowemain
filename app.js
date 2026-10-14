(() => {
  "use strict";

  const STORAGE_AUTH = "sp-auth";
  const STORAGE_DATA = "sp-data-v2";
  const SAVE_DEBOUNCE_MS = 600;

  const STATUS_LABELS = {
    present: "Klāt",
    absent: "Nav",
    excused: "Attaisnoti",
  };

  const $ = (sel) => document.querySelector(sel);

  let currentDate = null;
  let membersCache = []; // [{ id, name, canVote }]
  let attendanceCache = {}; // { date: { id: status } }
  let saveTimer = null;
  let remoteEnabled = false;
  let syncState = "idle";

  // ---------- Auth ----------
  function isAuthenticated() {
    return sessionStorage.getItem(STORAGE_AUTH) === "1";
  }

  function setAuthenticated(ok) {
    if (ok) sessionStorage.setItem(STORAGE_AUTH, "1");
    else sessionStorage.removeItem(STORAGE_AUTH);
  }

  function showLogin() {
    $("#login-view").classList.remove("d-none");
    $("#app-view").classList.add("d-none");
  }

  async function showApp() {
    $("#login-view").classList.add("d-none");
    $("#app-view").classList.remove("d-none");
    const today = toISODate(new Date());
    $("#date-input").value = today;
    updateSyncBadge();
    await loadFromRemoteOrLocal();
    renderMembersList();
  }

  function tryLogin() {
    const input = $("#password-input");
    const err = $("#login-error");
    if (input.value === APP_PASSWORD) {
      setAuthenticated(true);
      err.classList.add("d-none");
      input.value = "";
      showApp();
    } else {
      err.classList.remove("d-none");
      input.focus();
      input.select();
    }
  }

  // ---------- Sync UI ----------
  function updateSyncBadge() {
    const el = $("#sync-status");
    if (!el) return;
    const map = {
      idle: remoteEnabled ? "☁️ Kopīgā glabātuvē" : "💾 Tikai šajā ierīcē",
      loading: "⏳ Ielādē…",
      saving: "⏳ Saglabā…",
      ok: "✅ Sinhronizēts",
      error: "⚠️ Sinhronizācijas kļūda (lokāli OK)",
      local: "💾 Tikai šajā ierīcē",
    };
    el.textContent = map[syncState] || map.idle;
    el.className =
      "badge " +
      (syncState === "error"
        ? "bg-warning text-dark"
        : syncState === "ok" || (remoteEnabled && syncState === "idle")
          ? "bg-success"
          : "bg-secondary");
  }

  // ---------- Payload helpers ----------
  function emptyPayload() {
    return { members: [], attendance: {} };
  }

  function payload() {
    return { members: membersCache, attendance: attendanceCache };
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") {
      membersCache = cloneSeed();
      attendanceCache = {};
      return;
    }
    // Legacy: only attendance map with date keys
    if (!data.members && !data.attendance) {
      const keys = Object.keys(data);
      if (keys.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(keys[0])) {
        attendanceCache = data;
        membersCache = cloneSeed();
        return;
      }
    }
    membersCache =
      Array.isArray(data.members) && data.members.length
        ? data.members.map(normalizeMember).filter(Boolean)
        : cloneSeed();
    attendanceCache =
      data.attendance && typeof data.attendance === "object"
        ? data.attendance
        : {};
  }

  function normalizeMember(m) {
    if (!m || !m.name) return null;
    return {
      id: m.id || newMemberId(),
      name: String(m.name).trim(),
      canVote: !!m.canVote,
    };
  }

  function cloneSeed() {
    const seed =
      typeof SEED_MEMBERS !== "undefined"
        ? SEED_MEMBERS
        : typeof MEMBERS !== "undefined"
          ? MEMBERS
          : [];
    return seed.map((m) => ({
      id: m.id,
      name: m.name,
      canVote: !!m.canVote,
    }));
  }

  function newMemberId() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- Local / remote ----------
  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DATA) || "null");
    } catch {
      return null;
    }
  }

  function saveLocal() {
    localStorage.setItem(STORAGE_DATA, JSON.stringify(payload()));
  }

  function hasRemote() {
    return typeof REMOTE_URL === "string" && REMOTE_URL.trim().length > 10;
  }

  async function fetchRemote() {
    const res = await fetch(REMOTE_URL.trim(), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json && (json.members !== undefined || json.attendance !== undefined)) {
      return {
        members: json.members || [],
        attendance: json.attendance || {},
      };
    }
    // legacy whole body was attendance
    return { members: [], attendance: json && typeof json === "object" ? json : {} };
  }

  async function pushRemote() {
    const res = await fetch(REMOTE_URL.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload()),
      redirect: "follow",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json().catch(() => ({}));
    if (json && json.ok === false) throw new Error(json.error || "save failed");
    return json;
  }

  async function loadFromRemoteOrLocal() {
    remoteEnabled = hasRemote();
    if (!remoteEnabled) {
      applyPayload(loadLocal());
      if (!membersCache.length) membersCache = cloneSeed();
      syncState = "local";
      updateSyncBadge();
      return;
    }
    syncState = "loading";
    updateSyncBadge();
    try {
      const remote = await fetchRemote();
      applyPayload(remote);
      if (!membersCache.length) membersCache = cloneSeed();
      saveLocal();
      syncState = "ok";
    } catch (err) {
      console.warn("Remote load failed", err);
      applyPayload(loadLocal());
      if (!membersCache.length) membersCache = cloneSeed();
      syncState = "error";
    }
    updateSyncBadge();
  }

  function scheduleSave() {
    saveLocal();
    if (!remoteEnabled) {
      syncState = "local";
      updateSyncBadge();
      return;
    }
    syncState = "saving";
    updateSyncBadge();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await pushRemote();
        syncState = "ok";
      } catch (err) {
        console.warn("Remote save failed", err);
        syncState = "error";
      }
      updateSyncBadge();
    }, SAVE_DEBOUNCE_MS);
  }

  // ---------- Members CRUD ----------
  function voters() {
    return membersCache.filter((m) => m.canVote);
  }

  function nonVoters() {
    return membersCache.filter((m) => !m.canVote);
  }

  function addMember(name, canVote) {
    const n = String(name || "").trim();
    if (!n) return false;
    membersCache.push({ id: newMemberId(), name: n, canVote: !!canVote });
    membersCache.sort((a, b) => a.name.localeCompare(b.name, "lv"));
    scheduleSave();
    renderMembersList();
    if (currentDate) openDate(currentDate, true);
    return true;
  }

  function removeMember(id) {
    if (!confirm("Dzēst šo dalībnieku no saraksta? Apmeklējuma vēsture paliks datos.")) return;
    membersCache = membersCache.filter((m) => m.id !== id);
    scheduleSave();
    renderMembersList();
    if (currentDate) openDate(currentDate, true);
  }

  function toggleVote(id) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    m.canVote = !m.canVote;
    scheduleSave();
    renderMembersList();
    if (currentDate) openDate(currentDate, true);
  }

  function renderMembersList() {
    const tbody = $("#members-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    membersCache.forEach((m) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(m.name)}</td>
        <td>${m.canVote ? "Jā" : "Nē"}</td>
        <td class="text-end member-row-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm btn-toggle-vote" data-id="${escapeHtml(m.id)}">
            ${m.canVote ? "Noņemt balsstiesības" : "Dot balsstiesības"}
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm btn-remove-member" data-id="${escapeHtml(m.id)}">Dzēst</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".btn-remove-member").forEach((btn) => {
      btn.addEventListener("click", () => removeMember(btn.dataset.id));
    });
    tbody.querySelectorAll(".btn-toggle-vote").forEach((btn) => {
      btn.addEventListener("click", () => toggleVote(btn.dataset.id));
    });
  }

  // ---------- Attendance ----------
  function getDayAttendance(dateStr) {
    return attendanceCache[dateStr] || {};
  }

  function setMemberStatus(dateStr, memberId, status) {
    if (!attendanceCache[dateStr]) attendanceCache[dateStr] = {};
    if (status === null) delete attendanceCache[dateStr][memberId];
    else attendanceCache[dateStr][memberId] = status;
    if (Object.keys(attendanceCache[dateStr]).length === 0) {
      delete attendanceCache[dateStr];
    }
    scheduleSave();
  }

  function clearDay(dateStr) {
    delete attendanceCache[dateStr];
    scheduleSave();
  }

  // ---------- Helpers ----------
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatLatvianDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function csvEscape(val) {
    const s = String(val ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  // ---------- Quorum (only "present" counts) ----------
  function computeQuorum(dateStr) {
    const day = getDayAttendance(dateStr);
    const voting = voters();
    const total = voting.length;
    let present = 0;
    let excused = 0;
    let absent = 0;
    voting.forEach((m) => {
      const s = day[m.id];
      if (s === "present") present++;
      else if (s === "excused") excused++;
      else if (s === "absent") absent++;
    });
    const pct50 = total > 0 ? present / total > 0.5 : false;
    const pct23 = total > 0 ? present / total >= 2 / 3 : false;
    return { total, present, excused, absent, pct50, pct23 };
  }

  function updateQuorumUI(dateStr) {
    const { total, present, excused, absent, pct50, pct23 } = computeQuorum(dateStr);
    $("#quorum-50-text").textContent = pct50
      ? `JĀ (${present}/${total})`
      : `NĒ (${present}/${total})`;
    $("#quorum-23-text").textContent = pct23
      ? `JĀ (${present}/${total})`
      : `NĒ (${present}/${total})`;
    $("#quorum-50").className = "quorum-box " + (pct50 ? "quorum-ok" : "quorum-fail");
    $("#quorum-23").className = "quorum-box " + (pct23 ? "quorum-ok" : "quorum-fail");
    const needed50 = Math.floor(total / 2) + 1;
    const needed23 = Math.ceil((total * 2) / 3);
    $("#quorum-detail").textContent =
      `Balsojošo: ${total}. Klāt: ${present}, attaisnoti: ${excused}, nav: ${absent}. ` +
      `Vajag >50%: ≥${needed50}; 2/3: ≥${needed23}.`;
  }

  // ---------- Tables ----------
  function statusButtons(memberId, current) {
    const p = current === "present" ? "checked" : "";
    const a = current === "absent" ? "checked" : "";
    const e = current === "excused" ? "checked" : "";
    return `
      <div class="btn-group btn-group-sm" role="group">
        <input type="radio" class="btn-check" name="att-${memberId}" id="p-${memberId}" value="present" ${p} autocomplete="off">
        <label class="btn btn-outline-success btn-present" for="p-${memberId}">Klāt</label>
        <input type="radio" class="btn-check" name="att-${memberId}" id="a-${memberId}" value="absent" ${a} autocomplete="off">
        <label class="btn btn-outline-danger btn-absent" for="a-${memberId}">Nav</label>
        <input type="radio" class="btn-check" name="att-${memberId}" id="e-${memberId}" value="excused" ${e} autocomplete="off">
        <label class="btn btn-outline-excused btn-excused" for="e-${memberId}">Attaisnoti</label>
      </div>
    `;
  }

  function renderTable(tbody, list, dayData) {
    tbody.innerHTML = "";
    list.forEach((m, i) => {
      const status = dayData[m.id] || null;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-muted">${i + 1}</td>
        <td>${escapeHtml(m.name)}</td>
        <td class="text-end">${statusButtons(m.id, status)}</td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", () => {
        const memberId = input.name.replace("att-", "");
        setMemberStatus(currentDate, memberId, input.value);
        updateQuorumUI(currentDate);
      });
    });
  }

  async function openDate(dateStr, skipRemoteRefresh) {
    if (!dateStr) return;
    if (remoteEnabled && !skipRemoteRefresh) {
      syncState = "loading";
      updateSyncBadge();
      try {
        applyPayload(await fetchRemote());
        if (!membersCache.length) membersCache = cloneSeed();
        saveLocal();
        syncState = "ok";
        renderMembersList();
      } catch (err) {
        console.warn(err);
        syncState = "error";
      }
      updateSyncBadge();
    }
    currentDate = dateStr;
    $("#selected-date-label").textContent = formatLatvianDate(dateStr);
    $("#calendar-view").classList.add("d-none");
    $("#attendance-view").classList.remove("d-none");

    const day = getDayAttendance(dateStr);
    const v = voters();
    const nv = nonVoters();
    $("#count-voters").textContent = v.length;
    $("#count-nonvoters").textContent = nv.length;
    renderTable($("#table-voters"), v, day);
    renderTable($("#table-nonvoters"), nv, day);
    updateQuorumUI(dateStr);
  }

  function backToCalendar() {
    currentDate = null;
    $("#attendance-view").classList.add("d-none");
    $("#calendar-view").classList.remove("d-none");
  }

  function setAllStatus(status) {
    if (!currentDate) return;
    if (!attendanceCache[currentDate]) attendanceCache[currentDate] = {};
    membersCache.forEach((m) => {
      attendanceCache[currentDate][m.id] = status;
    });
    scheduleSave();
    openDate(currentDate, true);
  }

  function clearCurrentDay() {
    if (!currentDate) return;
    if (!confirm("Vai tiešām notīrīt visu šīs dienas apmeklējumu?")) return;
    clearDay(currentDate);
    openDate(currentDate, true);
  }

  // ---------- CSV export ----------
  function statusLabel(code) {
    return STATUS_LABELS[code] || "—";
  }

  function buildDayCsv(dateStr) {
    const day = getDayAttendance(dateStr);
    const rows = [
      ["Datums", "Vārds, uzvārds", "Balsstiesības", "Statuss"].map(csvEscape).join(","),
    ];
    const ordered = [...voters(), ...nonVoters()];
    ordered.forEach((m) => {
      rows.push(
        [
          formatLatvianDate(dateStr),
          m.name,
          m.canVote ? "Jā" : "Nē",
          statusLabel(day[m.id]),
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    return rows.join("\r\n");
  }

  function buildAllCsv() {
    const dates = Object.keys(attendanceCache).sort();
    const rows = [
      ["Datums", "Vārds, uzvārds", "Balsstiesības", "Statuss"].map(csvEscape).join(","),
    ];
    const ordered = [...voters(), ...nonVoters()];
    dates.forEach((dateStr) => {
      const day = getDayAttendance(dateStr);
      ordered.forEach((m) => {
        if (!day[m.id]) return; // only rows with a recorded status
        rows.push(
          [
            formatLatvianDate(dateStr),
            m.name,
            m.canVote ? "Jā" : "Nē",
            statusLabel(day[m.id]),
          ]
            .map(csvEscape)
            .join(",")
        );
      });
    });
    return rows.join("\r\n");
  }

  function downloadCsv(filename, content) {
    // BOM for Excel Latvian
    const blob = new Blob(["\uFEFF" + content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentDay() {
    if (!currentDate) return;
    const name = `apmeklejums_${currentDate}.csv`;
    downloadCsv(name, buildDayCsv(currentDate));
  }

  function exportAll() {
    const name = `apmeklejums_vesture.csv`;
    downloadCsv(name, buildAllCsv());
  }

  async function manualRefresh() {
    await loadFromRemoteOrLocal();
    renderMembersList();
    if (currentDate) openDate(currentDate, true);
  }

  // ---------- Init ----------
  function init() {
    $("#btn-login").addEventListener("click", tryLogin);
    $("#password-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryLogin();
    });
    $("#btn-logout").addEventListener("click", () => {
      setAuthenticated(false);
      showLogin();
    });
    $("#btn-load-date").addEventListener("click", () => {
      openDate($("#date-input").value);
    });
    $("#btn-today").addEventListener("click", () => {
      const today = toISODate(new Date());
      $("#date-input").value = today;
      openDate(today);
    });
    $("#btn-change-date").addEventListener("click", backToCalendar);
    $("#btn-all-present").addEventListener("click", () => setAllStatus("present"));
    $("#btn-all-absent").addEventListener("click", () => setAllStatus("absent"));
    $("#btn-all-excused").addEventListener("click", () => setAllStatus("excused"));
    $("#btn-clear-day").addEventListener("click", clearCurrentDay);
    $("#btn-export-csv").addEventListener("click", exportCurrentDay);
    $("#btn-export-all-csv").addEventListener("click", exportAll);
    $("#btn-refresh").addEventListener("click", manualRefresh);

    $("#btn-add-member").addEventListener("click", () => {
      const name = $("#new-member-name").value;
      const canVote = $("#new-member-vote").checked;
      if (addMember(name, canVote)) {
        $("#new-member-name").value = "";
        $("#new-member-name").focus();
      } else {
        alert("Ievadi vārdu un uzvārdu.");
      }
    });
    $("#new-member-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#btn-add-member").click();
    });
    $("#btn-toggle-members").addEventListener("click", () => {
      $("#members-panel").classList.toggle("d-none");
    });

    if (isAuthenticated()) showApp();
    else showLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
