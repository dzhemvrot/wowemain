(() => {
  "use strict";

  const STORAGE_AUTH = "sp-auth-user";
  const STORAGE_DATA = "sp-data-v3";
  const SAVE_DEBOUNCE_MS = 600;
  const MAX_LOGS = 2000;

  const STATUS_LABELS = {
    present: "Klāt",
    absent: "Nav",
    excused: "Attaisnoti",
  };

  const ACTION_LABELS = {
    login: "Ienāca",
    logout: "Izgāja",
    set_status: "Mainīja statusu",
    set_all: "Atzīmēja visus",
    clear_day: "Notīrīja dienu",
    add_member: "Pievienoja dalībnieku",
    remove_member: "Dzēsa dalībnieku",
    toggle_vote: "Mainīja balsstiesības",
    add_user: "Pievienoja lietotāju",
    remove_user: "Dzēsa lietotāju",
    export_csv: "Eksportēja CSV",
    export_all_csv: "Eksportēja vēsturi CSV",
  };

  const $ = (sel) => document.querySelector(sel);

  let currentUser = null; // { id, username, isAdmin }
  let currentDate = null;
  let membersCache = [];
  let attendanceCache = {};
  let usersCache = [];
  let logsCache = [];
  let saveTimer = null;
  let remoteEnabled = false;
  let syncState = "idle";

  // ---------- Session ----------
  function loadSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_AUTH);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSession(user) {
    if (user) sessionStorage.setItem(STORAGE_AUTH, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_AUTH);
  }

  function isAuthenticated() {
    return !!currentUser;
  }

  function showLogin() {
    $("#login-view").classList.remove("d-none");
    $("#app-view").classList.add("d-none");
  }

  async function showApp() {
    $("#login-view").classList.add("d-none");
    $("#app-view").classList.remove("d-none");
    $("#user-label").textContent = currentUser
      ? currentUser.username + (currentUser.isAdmin ? " (admin)" : "")
      : "";
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.classList.toggle("d-none", !(currentUser && currentUser.isAdmin));
    });
    const today = toISODate(new Date());
    $("#date-input").value = today;
    updateSyncBadge();
    await loadFromRemoteOrLocal();
    // Ensure seed users exist in store
    ensureSeedUsers();
    renderMembersList();
    fillHistorySelect();
    if (currentUser && currentUser.isAdmin) {
      renderUsersList();
      renderLogs();
    }
  }

  async function tryLogin() {
    const username = ($("#username-input").value || "").trim();
    const password = $("#password-input").value || "";
    const err = $("#login-error");

    // Need users loaded (local or remote) before auth
    remoteEnabled = hasRemote();
    try {
      if (remoteEnabled) {
        applyPayload(await fetchRemote());
        saveLocal();
      } else {
        applyPayload(loadLocal());
      }
    } catch {
      applyPayload(loadLocal());
    }
    ensureSeedUsers();

    const user = usersCache.find(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );
    if (!user) {
      err.classList.remove("d-none");
      return;
    }
    err.classList.add("d-none");
    currentUser = {
      id: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
    };
    saveSession(currentUser);
    $("#username-input").value = "";
    $("#password-input").value = "";
    addLog("login", "");
    scheduleSave();
    showApp();
  }

  function logout() {
    addLog("logout", "");
    scheduleSave();
    currentUser = null;
    saveSession(null);
    showLogin();
  }

  // ---------- Tabs ----------
  function switchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
    document.querySelectorAll("#main-tabs .nav-link").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.remove("d-none");
    if (tabId === "tab-history") fillHistorySelect();
    if (tabId === "tab-logs" && currentUser && currentUser.isAdmin) renderLogs();
    if (tabId === "tab-users" && currentUser && currentUser.isAdmin) renderUsersList();
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

  // ---------- Payload ----------
  function payload() {
    return {
      members: membersCache,
      attendance: attendanceCache,
      users: usersCache,
      logs: logsCache.slice(-MAX_LOGS),
    };
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") {
      membersCache = cloneSeedMembers();
      attendanceCache = {};
      usersCache = cloneSeedUsers();
      logsCache = [];
      return;
    }
    if (!data.members && !data.attendance && !data.users) {
      const keys = Object.keys(data);
      if (keys.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(keys[0])) {
        attendanceCache = data;
        membersCache = cloneSeedMembers();
        usersCache = cloneSeedUsers();
        logsCache = [];
        return;
      }
    }
    membersCache =
      Array.isArray(data.members) && data.members.length
        ? data.members.map(normalizeMember).filter(Boolean)
        : cloneSeedMembers();
    attendanceCache =
      data.attendance && typeof data.attendance === "object"
        ? data.attendance
        : {};
    usersCache = Array.isArray(data.users)
      ? data.users.map(normalizeUser).filter(Boolean)
      : [];
    logsCache = Array.isArray(data.logs) ? data.logs : [];
  }

  function normalizeMember(m) {
    if (!m || !m.name) return null;
    return {
      id: m.id || newId("m"),
      name: String(m.name).trim(),
      canVote: !!m.canVote,
    };
  }

  function normalizeUser(u) {
    if (!u || !u.username) return null;
    return {
      id: u.id || newId("u"),
      username: String(u.username).trim(),
      password: String(u.password ?? ""),
      isAdmin: !!u.isAdmin,
    };
  }

  function cloneSeedMembers() {
    const seed = typeof SEED_MEMBERS !== "undefined" ? SEED_MEMBERS : [];
    return seed.map((m) => ({ id: m.id, name: m.name, canVote: !!m.canVote }));
  }

  function cloneSeedUsers() {
    const seed = typeof SEED_USERS !== "undefined" ? SEED_USERS : [];
    return seed.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      isAdmin: !!u.isAdmin,
    }));
  }

  function ensureSeedUsers() {
    if (!usersCache.length) {
      usersCache = cloneSeedUsers();
      scheduleSave();
    }
  }

  function newId(prefix) {
    return (
      prefix +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6)
    );
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
    const res = await fetch(REMOTE_URL.trim(), {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return {
      members: json.members || [],
      attendance: json.attendance || {},
      users: json.users || [],
      logs: json.logs || [],
    };
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
      if (!membersCache.length) membersCache = cloneSeedMembers();
      if (!usersCache.length) usersCache = cloneSeedUsers();
      syncState = "local";
      updateSyncBadge();
      return;
    }
    syncState = "loading";
    updateSyncBadge();
    try {
      applyPayload(await fetchRemote());
      if (!membersCache.length) membersCache = cloneSeedMembers();
      if (!usersCache.length) usersCache = cloneSeedUsers();
      saveLocal();
      syncState = "ok";
    } catch (err) {
      console.warn("Remote load failed", err);
      applyPayload(loadLocal());
      if (!membersCache.length) membersCache = cloneSeedMembers();
      if (!usersCache.length) usersCache = cloneSeedUsers();
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

  // ---------- Logging ----------
  function addLog(action, details) {
    logsCache.push({
      ts: new Date().toISOString(),
      username: currentUser ? currentUser.username : "?",
      action,
      details: details || "",
    });
    if (logsCache.length > MAX_LOGS) {
      logsCache = logsCache.slice(-MAX_LOGS);
    }
  }

  function formatLogTime(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      return (
        pad(d.getDate()) +
        "." +
        pad(d.getMonth() + 1) +
        "." +
        d.getFullYear() +
        " " +
        pad(d.getHours()) +
        ":" +
        pad(d.getMinutes()) +
        ":" +
        pad(d.getSeconds())
      );
    } catch {
      return iso;
    }
  }

  function renderLogs() {
    const tbody = $("#logs-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = logsCache.slice().reverse();
    rows.forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-nowrap">${escapeHtml(formatLogTime(log.ts))}</td>
        <td>${escapeHtml(log.username)}</td>
        <td>${escapeHtml(ACTION_LABELS[log.action] || log.action)}</td>
        <td>${escapeHtml(log.details || "")}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------- Users (admin) ----------
  function renderUsersList() {
    const tbody = $("#users-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    usersCache.forEach((u) => {
      const tr = document.createElement("tr");
      const canDelete =
        usersCache.filter((x) => x.isAdmin).length > 1 || !u.isAdmin;
      tr.innerHTML = `
        <td>${escapeHtml(u.username)}</td>
        <td>${u.isAdmin ? "Administrators" : "Lietotājs"}</td>
        <td class="text-end">
          ${
            canDelete
              ? `<button type="button" class="btn btn-outline-danger btn-sm btn-remove-user" data-id="${escapeHtml(u.id)}">Dzēst</button>`
              : `<span class="text-muted small">Pēdējais admin</span>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".btn-remove-user").forEach((btn) => {
      btn.addEventListener("click", () => removeUser(btn.dataset.id));
    });
  }

  function addUser(username, password, isAdmin) {
    const name = String(username || "").trim();
    const pass = String(password || "");
    if (!name || !pass) {
      alert("Ievadi lietotājvārdu un paroli.");
      return false;
    }
    if (usersCache.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
      alert("Šāds lietotājvārds jau eksistē.");
      return false;
    }
    usersCache.push({
      id: newId("u"),
      username: name,
      password: pass,
      isAdmin: !!isAdmin,
    });
    addLog("add_user", name + (isAdmin ? " (admin)" : ""));
    scheduleSave();
    renderUsersList();
    return true;
  }

  function removeUser(id) {
    const u = usersCache.find((x) => x.id === id);
    if (!u) return;
    if (u.id === currentUser.id) {
      alert("Nevar dzēst pašreizējo kontu.");
      return;
    }
    if (u.isAdmin && usersCache.filter((x) => x.isAdmin).length <= 1) {
      alert("Nevar dzēst pēdējo administratoru.");
      return;
    }
    if (!confirm("Dzēst lietotāju «" + u.username + "»?")) return;
    usersCache = usersCache.filter((x) => x.id !== id);
    addLog("remove_user", u.username);
    scheduleSave();
    renderUsersList();
  }

  // ---------- Members ----------
  function voters() {
    return membersCache.filter((m) => m.canVote);
  }

  function nonVoters() {
    return membersCache.filter((m) => !m.canVote);
  }

  function addMember(name, canVote) {
    const n = String(name || "").trim();
    if (!n) return false;
    membersCache.push({ id: newId("m"), name: n, canVote: !!canVote });
    membersCache.sort((a, b) => a.name.localeCompare(b.name, "lv"));
    addLog("add_member", n + (canVote ? " (balsstiesības)" : ""));
    scheduleSave();
    renderMembersList();
    fillHistorySelect();
    if (currentDate) openDate(currentDate, true);
    return true;
  }

  function removeMember(id) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    if (!confirm("Dzēst dalībnieku «" + m.name + "»?")) return;
    membersCache = membersCache.filter((x) => x.id !== id);
    addLog("remove_member", m.name);
    scheduleSave();
    renderMembersList();
    fillHistorySelect();
    if (currentDate) openDate(currentDate, true);
  }

  function toggleVote(id) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    m.canVote = !m.canVote;
    addLog("toggle_vote", m.name + " → " + (m.canVote ? "jā" : "nē"));
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
    const m = membersCache.find((x) => x.id === memberId);
    addLog(
      "set_status",
      (m ? m.name : memberId) +
        " · " +
        formatLatvianDate(dateStr) +
        " · " +
        (STATUS_LABELS[status] || status)
    );
    scheduleSave();
  }

  function clearDay(dateStr) {
    delete attendanceCache[dateStr];
    addLog("clear_day", formatLatvianDate(dateStr));
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

  // ---------- Quorum ----------
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
    return {
      total,
      present,
      excused,
      absent,
      pct50: total > 0 ? present / total > 0.5 : false,
      pct23: total > 0 ? present / total >= 2 / 3 : false,
    };
  }

  function updateQuorumUI(dateStr) {
    const { total, present, excused, absent, pct50, pct23 } =
      computeQuorum(dateStr);
    $("#quorum-50-text").textContent = pct50
      ? `JĀ (${present}/${total})`
      : `NĒ (${present}/${total})`;
    $("#quorum-23-text").textContent = pct23
      ? `JĀ (${present}/${total})`
      : `NĒ (${present}/${total})`;
    $("#quorum-50").className =
      "quorum-box " + (pct50 ? "quorum-ok" : "quorum-fail");
    $("#quorum-23").className =
      "quorum-box " + (pct23 ? "quorum-ok" : "quorum-fail");
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
        if (!membersCache.length) membersCache = cloneSeedMembers();
        if (!usersCache.length) usersCache = cloneSeedUsers();
        saveLocal();
        syncState = "ok";
        renderMembersList();
        fillHistorySelect();
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
    addLog(
      "set_all",
      formatLatvianDate(currentDate) + " · " + (STATUS_LABELS[status] || status)
    );
    scheduleSave();
    openDate(currentDate, true);
  }

  function clearCurrentDay() {
    if (!currentDate) return;
    if (!confirm("Vai tiešām notīrīt visu šīs dienas apmeklējumu?")) return;
    clearDay(currentDate);
    openDate(currentDate, true);
  }

  // ---------- Person history ----------
  function fillHistorySelect() {
    const sel = $("#history-member");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— izvēlies —</option>';
    const ordered = [...membersCache].sort((a, b) =>
      a.name.localeCompare(b.name, "lv")
    );
    ordered.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + (m.canVote ? "" : " (bez balsstiesībām)");
      sel.appendChild(opt);
    });
    if (prev && ordered.some((m) => m.id === prev)) sel.value = prev;
  }

  function showPersonHistory() {
    const id = $("#history-member").value;
    const result = $("#history-result");
    if (!id) {
      result.classList.add("d-none");
      return;
    }
    const member = membersCache.find((m) => m.id === id);
    if (!member) {
      result.classList.add("d-none");
      return;
    }
    result.classList.remove("d-none");
    $("#history-title").textContent = member.name;

    const dates = Object.keys(attendanceCache).sort().reverse();
    const rows = [];
    let cPresent = 0;
    let cAbsent = 0;
    let cExcused = 0;
    dates.forEach((dateStr) => {
      const st = (attendanceCache[dateStr] || {})[id];
      if (!st) return;
      if (st === "present") cPresent++;
      else if (st === "absent") cAbsent++;
      else if (st === "excused") cExcused++;
      rows.push({ dateStr, st });
    });

    $("#hist-count-present").textContent = "Klāt: " + cPresent;
    $("#hist-count-absent").textContent = "Nav: " + cAbsent;
    $("#hist-count-excused").textContent = "Attaisnoti: " + cExcused;
    $("#hist-count-total").textContent = "Kopā: " + rows.length;

    const tbody = $("#history-tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="2" class="text-muted">Nav ierakstu.</td></tr>';
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(formatLatvianDate(r.dateStr))}</td>
        <td><span class="status-pill ${escapeHtml(r.st)}">${escapeHtml(
          STATUS_LABELS[r.st] || r.st
        )}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------- CSV ----------
  function statusLabel(code) {
    return STATUS_LABELS[code] || "—";
  }

  function buildDayCsv(dateStr) {
    const day = getDayAttendance(dateStr);
    const rows = [
      ["Datums", "Vārds, uzvārds", "Balsstiesības", "Statuss"]
        .map(csvEscape)
        .join(","),
    ];
    [...voters(), ...nonVoters()].forEach((m) => {
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
      ["Datums", "Vārds, uzvārds", "Balsstiesības", "Statuss"]
        .map(csvEscape)
        .join(","),
    ];
    const ordered = [...voters(), ...nonVoters()];
    dates.forEach((dateStr) => {
      const day = getDayAttendance(dateStr);
      ordered.forEach((m) => {
        if (!day[m.id]) return;
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
    addLog("export_csv", formatLatvianDate(currentDate));
    scheduleSave();
    downloadCsv("apmeklejums_" + currentDate + ".csv", buildDayCsv(currentDate));
  }

  function exportAll() {
    addLog("export_all_csv", "");
    scheduleSave();
    downloadCsv("apmeklejums_vesture.csv", buildAllCsv());
  }

  async function manualRefresh() {
    await loadFromRemoteOrLocal();
    renderMembersList();
    fillHistorySelect();
    if (currentUser && currentUser.isAdmin) {
      renderUsersList();
      renderLogs();
    }
    if (currentDate) openDate(currentDate, true);
  }

  // ---------- Init ----------
  function init() {
    $("#btn-login").addEventListener("click", tryLogin);
    $("#password-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryLogin();
    });
    $("#username-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#password-input").focus();
    });
    $("#btn-logout").addEventListener("click", logout);

    document.querySelectorAll("#main-tabs .nav-link").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
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
      if (addMember($("#new-member-name").value, $("#new-member-vote").checked)) {
        $("#new-member-name").value = "";
        $("#new-member-name").focus();
      } else {
        alert("Ievadi vārdu un uzvārdu.");
      }
    });
    $("#new-member-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#btn-add-member").click();
    });

    $("#btn-show-history").addEventListener("click", showPersonHistory);
    $("#history-member").addEventListener("change", showPersonHistory);

    $("#btn-add-user").addEventListener("click", () => {
      if (
        addUser(
          $("#new-user-name").value,
          $("#new-user-pass").value,
          $("#new-user-admin").checked
        )
      ) {
        $("#new-user-name").value = "";
        $("#new-user-pass").value = "";
        $("#new-user-admin").checked = false;
      }
    });
    $("#btn-refresh-logs").addEventListener("click", async () => {
      await loadFromRemoteOrLocal();
      renderLogs();
    });

    currentUser = loadSession();
    if (currentUser) showApp();
    else showLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
