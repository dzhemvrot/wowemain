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
    set_joined: "Mainīja pievienošanās datumu",
    add_user: "Pievienoja lietotāju",
    remove_user: "Dzēsa lietotāju",
    change_password: "Mainīja paroli",
    admin_set_password: "Iestatīja lietotāja paroli",
    export_csv: "Eksportēja CSV",
    export_all_csv: "Eksportēja vēsturi CSV",
  };

  const MIN_PASSWORD_LEN = 6;

  const $ = (sel) => document.querySelector(sel);

  let adminSetPassTargetId = null;

  // ---------- Password hashing (SHA-256 + salt) ----------
  function randomSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }

  async function hashPassword(password, salt) {
    return sha256Hex(salt + password);
  }

  async function verifyUserPassword(user, password) {
    if (!user) return false;
    // Legacy plain-text (migrate on successful login)
    if (user.password != null && user.password !== "" && !user.passwordHash) {
      return user.password === password;
    }
    if (!user.passwordHash || !user.salt) return false;
    const h = await hashPassword(password, user.salt);
    return h === user.passwordHash;
  }

  async function setUserPasswordFields(user, newPassword) {
    const salt = randomSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    user.salt = salt;
    user.passwordHash = passwordHash;
    delete user.password;
  }

  function isMainAdmin(user) {
    return user && String(user.username).toLowerCase() === "admin";
  }

  function canSetPasswordFor(target) {
    if (!currentUser || !target) return false;
    if (target.id === currentUser.id) return true; // own — handled separately
    if (!currentUser.isAdmin) return false;
    if (!target.isAdmin) return true; // any admin → non-admin
    // target is admin: only main admin may set
    return isMainAdmin(currentUser);
  }

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
    // Hide all app panels so admin tabs don't leak into next session
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
    document.querySelectorAll("#main-tabs .nav-link").forEach((b) => {
      b.classList.remove("active");
    });
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.classList.add("d-none");
    });
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
    // Always land on a non-admin tab after login
    switchTab("tab-attendance");
    const today = toISODate(new Date());
    $("#date-input").value = today;
    updateSyncBadge();
    await loadFromRemoteOrLocal();
    ensureSeedUsers();
    await migrateLegacyPasswordsInStore();
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
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (!user || !(await verifyUserPassword(user, password))) {
      err.classList.remove("d-none");
      return;
    }
    // Migrate legacy plaintext → hash on successful login
    if (user.password != null && !user.passwordHash) {
      await setUserPasswordFields(user, password);
      scheduleSave();
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
    adminSetPassTargetId = null;
    showLogin();
  }

  // ---------- Tabs ----------
  function switchTab(tabId) {
    // Non-admins cannot open admin tabs
    if (
      (tabId === "tab-users" || tabId === "tab-logs") &&
      !(currentUser && currentUser.isAdmin)
    ) {
      tabId = "tab-attendance";
    }
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
    document.querySelectorAll("#main-tabs .nav-link").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.remove("d-none");
    if (tabId === "tab-history") fillHistorySelect();
    if (tabId === "tab-logs" && currentUser && currentUser.isAdmin) renderLogs();
    if (tabId === "tab-users" && currentUser && currentUser.isAdmin) {
      renderUsersList();
      hideAdminSetPass();
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
    const joinedOn =
      m.joinedOn && /^\d{4}-\d{2}-\d{2}$/.test(String(m.joinedOn))
        ? String(m.joinedOn)
        : null; // null = no join date → eligible for all past dates
    return {
      id: m.id || newId("m"),
      name: String(m.name).trim(),
      canVote: !!m.canVote,
      joinedOn,
    };
  }

  /** Member counts for a meeting date if they had already joined (or never had a join date). */
  function isMemberActiveOn(m, dateStr) {
    if (!m) return false;
    if (!m.joinedOn) return true;
    return m.joinedOn <= dateStr;
  }

  function membersForDate(dateStr) {
    return membersCache.filter((m) => isMemberActiveOn(m, dateStr));
  }

  function normalizeUser(u) {
    if (!u || !u.username) return null;
    const out = {
      id: u.id || newId("u"),
      username: String(u.username).trim(),
      isAdmin: !!u.isAdmin,
    };
    if (u.passwordHash && u.salt) {
      out.passwordHash = String(u.passwordHash);
      out.salt = String(u.salt);
    } else if (u.password != null && u.password !== "") {
      // Legacy plaintext until next successful login migrates it
      out.password = String(u.password);
    }
    return out;
  }

  function cloneSeedMembers() {
    const seed = typeof SEED_MEMBERS !== "undefined" ? SEED_MEMBERS : [];
    return seed.map((m) => ({
      id: m.id,
      name: m.name,
      canVote: !!m.canVote,
      joinedOn: m.joinedOn || null,
    }));
  }

  function cloneSeedUsers() {
    const seed = typeof SEED_USERS !== "undefined" ? SEED_USERS : [];
    return seed.map((u) => normalizeUser(u)).filter(Boolean);
  }

  function ensureSeedUsers() {
    if (!usersCache.length) {
      usersCache = cloneSeedUsers();
      scheduleSave();
      return;
    }
    // If store has users but no main admin, merge seed admin if missing
    const hasAdminName = usersCache.some(
      (u) => u.username.toLowerCase() === "admin"
    );
    if (!hasAdminName) {
      const seed = cloneSeedUsers();
      const main = seed.find((u) => u.username.toLowerCase() === "admin");
      if (main) {
        usersCache.push(main);
        scheduleSave();
      }
    }
  }

  /** Strip any leftover plaintext passwords after all users have hashes. */
  async function migrateLegacyPasswordsInStore() {
    // Nothing automatic without knowing plaintext; login migrates per-user.
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
        (usersCache.filter((x) => x.isAdmin).length > 1 || !u.isAdmin) &&
        u.id !== (currentUser && currentUser.id);
      const canSetPass = canSetPasswordFor(u) && u.id !== currentUser.id;
      tr.innerHTML = `
        <td>${escapeHtml(u.username)}${
          isMainAdmin(u) ? ' <span class="badge bg-dark">galvenais</span>' : ""
        }</td>
        <td>${u.isAdmin ? "Administrators" : "Lietotājs"}</td>
        <td class="text-end">
          ${
            canSetPass
              ? `<button type="button" class="btn btn-outline-primary btn-sm btn-set-pass" data-id="${escapeHtml(u.id)}">Parole</button> `
              : ""
          }
          ${
            canDelete
              ? `<button type="button" class="btn btn-outline-danger btn-sm btn-remove-user" data-id="${escapeHtml(u.id)}">Dzēst</button>`
              : u.id === (currentUser && currentUser.id)
                ? `<span class="text-muted small">Tu</span>`
                : `<span class="text-muted small">—</span>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".btn-remove-user").forEach((btn) => {
      btn.addEventListener("click", () => removeUser(btn.dataset.id));
    });
    tbody.querySelectorAll(".btn-set-pass").forEach((btn) => {
      btn.addEventListener("click", () => showAdminSetPass(btn.dataset.id));
    });
  }

  async function addUser(username, password, isAdmin) {
    const name = String(username || "").trim();
    const pass = String(password || "");
    if (!name || !pass) {
      alert("Ievadi lietotājvārdu un paroli.");
      return false;
    }
    if (pass.length < MIN_PASSWORD_LEN) {
      alert("Parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.");
      return false;
    }
    // Only main admin can create other admins
    if (isAdmin && !isMainAdmin(currentUser)) {
      alert("Tikai galvenais admin var izveidot administratorus.");
      return false;
    }
    if (usersCache.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
      alert("Šāds lietotājvārds jau eksistē.");
      return false;
    }
    const user = {
      id: newId("u"),
      username: name,
      isAdmin: !!isAdmin,
    };
    await setUserPasswordFields(user, pass);
    usersCache.push(user);
    addLog("add_user", name + (isAdmin ? " (admin)" : ""));
    scheduleSave();
    renderUsersList();
    return true;
  }

  function showAdminSetPass(userId) {
    const u = usersCache.find((x) => x.id === userId);
    if (!u || !canSetPasswordFor(u)) {
      alert("Nav tiesību mainīt šī lietotāja paroli.");
      return;
    }
    adminSetPassTargetId = userId;
    $("#admin-set-pass-user").textContent = u.username;
    $("#admin-set-pass-input").value = "";
    $("#admin-set-pass-error").classList.add("d-none");
    $("#admin-set-pass-card").classList.remove("d-none");
  }

  function hideAdminSetPass() {
    adminSetPassTargetId = null;
    const card = $("#admin-set-pass-card");
    if (card) card.classList.add("d-none");
  }

  async function adminSetPassword() {
    const err = $("#admin-set-pass-error");
    err.classList.add("d-none");
    const u = usersCache.find((x) => x.id === adminSetPassTargetId);
    if (!u || !canSetPasswordFor(u)) {
      err.textContent = "Nav tiesību.";
      err.classList.remove("d-none");
      return;
    }
    const pass = $("#admin-set-pass-input").value || "";
    if (pass.length < MIN_PASSWORD_LEN) {
      err.textContent = "Parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.";
      err.classList.remove("d-none");
      return;
    }
    await setUserPasswordFields(u, pass);
    addLog("admin_set_password", u.username);
    scheduleSave();
    hideAdminSetPass();
    alert("Parole lietotājam «" + u.username + "» nomainīta.");
  }

  async function changeOwnPassword() {
    const err = $("#own-pass-error");
    const ok = $("#own-pass-ok");
    err.classList.add("d-none");
    ok.classList.add("d-none");
    const current = $("#own-pass-current").value || "";
    const neu = $("#own-pass-new").value || "";
    const conf = $("#own-pass-confirm").value || "";
    const user = usersCache.find((x) => x.id === currentUser.id);
    if (!user) {
      err.textContent = "Lietotājs nav atrasts.";
      err.classList.remove("d-none");
      return;
    }
    if (!(await verifyUserPassword(user, current))) {
      err.textContent = "Pašreizējā parole nav pareiza.";
      err.classList.remove("d-none");
      return;
    }
    if (neu.length < MIN_PASSWORD_LEN) {
      err.textContent = "Jaunajai parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.";
      err.classList.remove("d-none");
      return;
    }
    if (neu !== conf) {
      err.textContent = "Jaunā parole un apstiprinājums nesakrīt.";
      err.classList.remove("d-none");
      return;
    }
    await setUserPasswordFields(user, neu);
    addLog("change_password", currentUser.username);
    scheduleSave();
    $("#own-pass-current").value = "";
    $("#own-pass-new").value = "";
    $("#own-pass-confirm").value = "";
    ok.classList.remove("d-none");
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
  function voters(dateStr) {
    const list = dateStr ? membersForDate(dateStr) : membersCache;
    return list.filter((m) => m.canVote);
  }

  function nonVoters(dateStr) {
    const list = dateStr ? membersForDate(dateStr) : membersCache;
    return list.filter((m) => !m.canVote);
  }

  function addMember(name, canVote, joinedOn) {
    const n = String(name || "").trim();
    if (!n) return false;
    let join = joinedOn && /^\d{4}-\d{2}-\d{2}$/.test(joinedOn) ? joinedOn : null;
    // Default new members to today so they don't appear on older meetings
    if (!join) join = toISODate(new Date());
    membersCache.push({
      id: newId("m"),
      name: n,
      canVote: !!canVote,
      joinedOn: join,
    });
    membersCache.sort((a, b) => a.name.localeCompare(b.name, "lv"));
    addLog(
      "add_member",
      n +
        (canVote ? " (balsstiesības)" : "") +
        " no " +
        formatLatvianDate(join)
    );
    scheduleSave();
    renderMembersList();
    fillHistorySelect();
    if (currentDate) openDate(currentDate, true);
    return true;
  }

  function setMemberJoinedOn(id, joinedOn) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    if (!joinedOn) {
      m.joinedOn = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(joinedOn)) {
      m.joinedOn = joinedOn;
    } else {
      return;
    }
    addLog(
      "set_joined",
      m.name +
        " · " +
        (m.joinedOn ? formatLatvianDate(m.joinedOn) : "no sākuma")
    );
    scheduleSave();
    renderMembersList();
    if (currentDate) openDate(currentDate, true);
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
      const joinVal = m.joinedOn || "";
      tr.innerHTML = `
        <td>${escapeHtml(m.name)}</td>
        <td>${m.canVote ? "Jā" : "Nē"}</td>
        <td>
          <input type="date" class="form-control form-control-sm joined-input" data-id="${escapeHtml(m.id)}" value="${escapeHtml(joinVal)}" style="max-width:150px" title="Tukšs = no paša sākuma">
        </td>
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
    tbody.querySelectorAll(".joined-input").forEach((input) => {
      input.addEventListener("change", () => {
        setMemberJoinedOn(input.dataset.id, input.value || null);
      });
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

  // ---------- Quorum (only members already joined by that date) ----------
  function computeQuorum(dateStr) {
    const day = getDayAttendance(dateStr);
    const voting = voters(dateStr);
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
    const v = voters(dateStr);
    const nv = nonVoters(dateStr);
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
    // Only members who had already joined by this date
    membersForDate(currentDate).forEach((m) => {
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
    const joinNote = member.joinedOn
      ? " (no " + formatLatvianDate(member.joinedOn) + ")"
      : " (no sākuma)";
    $("#history-title").textContent = member.name + joinNote;

    const dates = Object.keys(attendanceCache).sort().reverse();
    const rows = [];
    let cPresent = 0;
    let cAbsent = 0;
    let cExcused = 0;
    dates.forEach((dateStr) => {
      // Skip days before this person joined
      if (!isMemberActiveOn(member, dateStr)) return;
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
    [...voters(dateStr), ...nonVoters(dateStr)].forEach((m) => {
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
    dates.forEach((dateStr) => {
      const day = getDayAttendance(dateStr);
      [...voters(dateStr), ...nonVoters(dateStr)].forEach((m) => {
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

    // Default join date for new members = today
    const joinedInput = $("#new-member-joined");
    if (joinedInput && !joinedInput.value) {
      joinedInput.value = toISODate(new Date());
    }

    $("#btn-add-member").addEventListener("click", () => {
      if (
        addMember(
          $("#new-member-name").value,
          $("#new-member-vote").checked,
          $("#new-member-joined").value
        )
      ) {
        $("#new-member-name").value = "";
        $("#new-member-joined").value = toISODate(new Date());
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

    $("#btn-add-user").addEventListener("click", async () => {
      if (
        await addUser(
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
    $("#btn-change-own-pass").addEventListener("click", () => changeOwnPassword());
    $("#btn-admin-set-pass").addEventListener("click", () => adminSetPassword());
    $("#btn-admin-set-pass-cancel").addEventListener("click", hideAdminSetPass);

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
