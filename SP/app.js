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
    public_open: "Atvēra publisko reģistrāciju",
    public_close: "Aizvēra publisko reģistrāciju",
    public_checkin: "Publiska apstiprināšana",
    vote_start: "Sāka balsošanu",
    vote_close: "Slēdza balsošanu",
    cast_vote: "Nobalsoja",
    admin_set_vote: "Admin mainīja balsi",
    vote_archive_delete: "Dzēsa balsošanu no arhīva",
    export_vote_csv: "Eksportēja balsošanas CSV",
    grant_vote: "Piešķīra balsstiesības",
    set_cv: "Atzīmēja CV",
    quorum_override: "Turpināja bez kvoruma",
    export_absence_csv: "Eksportēja apmeklējuma riska CSV",
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
  let publicSessionCache = {
    open: false,
    date: null,
    openedBy: null,
    openedAt: null,
  };
  let activeVoteCache = null;
  let voteArchiveCache = [];
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
    updatePublicSessionUI();
    updateLiveQuorumBanner();
    renderVotePanel();
    renderAbsenceReport();
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
    const ip = await fetchClientIp();
    addLog("login", ip ? "IP: " + ip : "IP: nezināma");
    scheduleSave();
    showApp();
  }

  /** Public IP via external lookup (browser cannot read it locally). */
  async function fetchClientIp() {
    const endpoints = [
      "https://api.ipify.org?format=json",
      "https://api64.ipify.org?format=json",
    ];
    for (const url of endpoints) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.ip) return String(data.ip);
      } catch (_) {
        /* try next */
      }
    }
    return null;
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
    if (tabId === "tab-vote") renderVotePanel();
    if (tabId === "tab-members") {
      renderMembersList();
      renderAbsenceReport();
    }
    if (tabId === "tab-attendance") updateLiveQuorumBanner();
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
      publicSession: publicSessionCache,
      activeVote: activeVoteCache,
      voteArchive: voteArchiveCache.slice(-200),
    };
  }

  function emptyPublicSession() {
    return { open: false, date: null, openedBy: null, openedAt: null };
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") {
      membersCache = cloneSeedMembers();
      attendanceCache = {};
      usersCache = cloneSeedUsers();
      logsCache = [];
      publicSessionCache = emptyPublicSession();
      activeVoteCache = null;
      voteArchiveCache = [];
      return;
    }
    if (!data.members && !data.attendance && !data.users) {
      const keys = Object.keys(data);
      if (keys.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(keys[0])) {
        attendanceCache = data;
        membersCache = cloneSeedMembers();
        usersCache = cloneSeedUsers();
        logsCache = [];
        publicSessionCache = emptyPublicSession();
        activeVoteCache = null;
        voteArchiveCache = [];
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
    publicSessionCache =
      data.publicSession && typeof data.publicSession === "object"
        ? {
            open: !!data.publicSession.open,
            date: data.publicSession.date || null,
            openedBy: data.publicSession.openedBy || null,
            openedAt: data.publicSession.openedAt || null,
          }
        : emptyPublicSession();
    activeVoteCache = data.activeVote || null;
    voteArchiveCache = Array.isArray(data.voteArchive) ? data.voteArchive : [];
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
      cvSubmitted: !!m.cvSubmitted,
    };
  }

  /** Distinct meeting dates where member was present (after joinedOn). */
  function countPresentSessions(memberId) {
    const m = membersCache.find((x) => x.id === memberId);
    if (!m) return 0;
    let n = 0;
    Object.keys(attendanceCache).forEach((dateStr) => {
      if (m.joinedOn && dateStr < m.joinedOn) return;
      if (attendanceCache[dateStr] && attendanceCache[dateStr][memberId] === "present") {
        n++;
      }
    });
    return n;
  }

  /**
   * Rolling window absence stats (default 60 days ≈ 2 months).
   * Denominator: meeting dates in window where member was already active
   * and there is any attendance record for that date for any member
   * (or specifically for them — we count dates that exist in attendanceCache).
   */
  function memberAbsenceStats(memberId, windowDays) {
    windowDays = windowDays || 60;
    const m = membersCache.find((x) => x.id === memberId);
    if (!m) {
      return {
        meetings: 0,
        present: 0,
        excused: 0,
        absent: 0,
        pctAbsent: 0,
        overLimit: false,
      };
    }
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - windowDays);
    const startIso = toISODate(start);
    const endIso = toISODate(today);
    let meetings = 0;
    let present = 0;
    let excused = 0;
    let absent = 0;
    Object.keys(attendanceCache)
      .filter((d) => d >= startIso && d <= endIso)
      .forEach((dateStr) => {
        if (m.joinedOn && dateStr < m.joinedOn) return;
        const day = attendanceCache[dateStr] || {};
        // Count as a meeting day for this member only if they have a status
        // or the day has any records (session existed)
        if (!Object.keys(day).length) return;
        meetings++;
        const s = day[memberId];
        if (s === "present") present++;
        else if (s === "excused") excused++;
        else if (s === "absent") absent++;
        else {
          // no mark for this member on a meeting day → treat as absent for risk?
          // Safer: only count explicit "absent" toward the 25% rule
        }
      });
    const pctAbsent = meetings > 0 ? (absent / meetings) * 100 : 0;
    return {
      meetings,
      present,
      excused,
      absent,
      pctAbsent,
      overLimit: meetings > 0 && pctAbsent > 25,
    };
  }

  function hasQuorumToday() {
    const today = toISODate(new Date());
    return computeQuorum(today).pct50;
  }

  function updateLiveQuorumBanner() {
    const banner = $("#live-quorum-banner");
    const text = $("#live-quorum-text");
    const detail = $("#live-quorum-detail");
    if (!banner || !text) return;
    const today = toISODate(new Date());
    const q = computeQuorum(today);
    const needed50 = Math.floor(q.total / 2) + 1;
    if (q.total === 0) {
      banner.className = "alert alert-secondary mb-4";
      text.textContent = "Nav balsojošo dalībnieku šodien.";
      if (detail)
        detail.textContent =
          "Pievieno balsstiesīgos vai atzīmē apmeklējumu.";
      return;
    }
    if (q.pct50) {
      banner.className = "alert alert-success mb-4";
      text.textContent =
        "Lemttiesīga — kvorums ir (>50%: " + q.present + "/" + q.total + ").";
    } else {
      banner.className = "alert alert-danger mb-4";
      text.textContent =
        "Nav kvoruma — balsojumi nav ieteicami (" +
        q.present +
        "/" +
        q.total +
        ", vajag ≥" +
        needed50 +
        ").";
    }
    if (detail) {
      detail.textContent =
        "Balsojošie (aktīvi šodien): " +
        q.total +
        ". Klāt: " +
        q.present +
        ", attaisnoti: " +
        q.excused +
        ", nav: " +
        q.absent +
        ". 2/3: " +
        (q.pct23 ? "jā" : "nē") +
        ".";
    }
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
      cvSubmitted: !!m.cvSubmitted,
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
      publicSession: json.publicSession || emptyPublicSession(),
      activeVote: json.activeVote || null,
      voteArchive: json.voteArchive || [],
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
      // Main admin account can never be deleted
      const canDelete =
        !isMainAdmin(u) &&
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
              : isMainAdmin(u)
                ? `<span class="text-muted small">Aizsargāts</span>`
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
    if (isMainAdmin(u)) {
      alert("Galveno admin kontu («admin») nevar dzēst.");
      return;
    }
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

  function addMember(name, canVote, joinedOn, cvSubmitted) {
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
      cvSubmitted: !!cvSubmitted,
    });
    membersCache.sort((a, b) => a.name.localeCompare(b.name, "lv"));
    addLog(
      "add_member",
      n +
        (canVote ? " (balsstiesības)" : "") +
        (cvSubmitted ? " (CV)" : "") +
        " no " +
        formatLatvianDate(join)
    );
    scheduleSave();
    renderMembersList();
    fillHistorySelect();
    updateLiveQuorumBanner();
    if (currentDate) openDate(currentDate, true);
    return true;
  }

  function setMemberCv(id, submitted) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    m.cvSubmitted = !!submitted;
    addLog("set_cv", m.name + " → " + (m.cvSubmitted ? "jā" : "nē"));
    scheduleSave();
    renderMembersList();
  }

  function grantVotingRights(id) {
    const m = membersCache.find((x) => x.id === id);
    if (!m) return;
    const sessions = countPresentSessions(id);
    if (sessions < 3) {
      alert(
        "Nepietiek sēžu («Klāt»): " +
          sessions +
          "/3. Balsstiesības pēc Nolikuma piešķir pēc 3 sēdēm."
      );
      return;
    }
    if (!m.cvSubmitted) {
      alert("Vispirms atzīmē, ka CV/anketa ir iesniegta.");
      return;
    }
    if (m.canVote) return;
    m.canVote = true;
    addLog("grant_vote", m.name + " (sēdes: " + sessions + ", CV: jā)");
    scheduleSave();
    renderMembersList();
    updateLiveQuorumBanner();
    if (currentDate) openDate(currentDate, true);
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
    updateLiveQuorumBanner();
    if (currentDate) openDate(currentDate, true);
  }

  function renderMembersList() {
    const tbody = $("#members-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    membersCache.forEach((m) => {
      const tr = document.createElement("tr");
      const joinVal = m.joinedOn || "";
      const sessions = countPresentSessions(m.id);
      const abs = memberAbsenceStats(m.id, 60);
      const ready = sessions >= 3 && m.cvSubmitted && !m.canVote;
      if (abs.overLimit) tr.classList.add("table-warning");
      tr.innerHTML = `
        <td>${escapeHtml(m.name)}</td>
        <td>
          <span class="${sessions >= 3 ? "text-success" : ""}">${sessions}/3</span>
          ${sessions >= 3 ? ' <span class="badge bg-success">gatavs</span>' : ""}
        </td>
        <td>
          <input type="checkbox" class="form-check-input member-cv-cb" data-id="${escapeHtml(m.id)}" ${m.cvSubmitted ? "checked" : ""} title="CV / anketa iesniegta">
        </td>
        <td>${m.canVote ? '<span class="text-success">Jā</span>' : "Nē"}</td>
        <td>
          ${
            abs.overLimit
              ? '<span class="text-danger" title=">25% Nav">⚠ ' +
                abs.pctAbsent.toFixed(0) +
                "%</span>"
              : abs.meetings
                ? abs.pctAbsent.toFixed(0) + "%"
                : "—"
          }
        </td>
        <td>
          <input type="date" class="form-control form-control-sm joined-input" data-id="${escapeHtml(m.id)}" value="${escapeHtml(joinVal)}" style="max-width:140px" title="Tukšs = no paša sākuma">
        </td>
        <td class="text-end member-row-actions">
          ${
            ready
              ? `<button type="button" class="btn btn-success btn-sm btn-grant-vote" data-id="${escapeHtml(m.id)}">Piešķirt balsstiesības</button> `
              : ""
          }
          <button type="button" class="btn btn-outline-secondary btn-sm btn-toggle-vote" data-id="${escapeHtml(m.id)}">
            ${m.canVote ? "Noņemt" : "Dot manuāli"}
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
    tbody.querySelectorAll(".btn-grant-vote").forEach((btn) => {
      btn.addEventListener("click", () => grantVotingRights(btn.dataset.id));
    });
    tbody.querySelectorAll(".member-cv-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        setMemberCv(cb.dataset.id, cb.checked);
      });
    });
    tbody.querySelectorAll(".joined-input").forEach((input) => {
      input.addEventListener("change", () => {
        setMemberJoinedOn(input.dataset.id, input.value || null);
      });
    });
    renderAbsenceReport();
  }

  function renderAbsenceReport() {
    const tbody = $("#absence-report-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = membersCache
      .map((m) => ({ m, s: memberAbsenceStats(m.id, 60) }))
      .sort((a, b) => b.s.pctAbsent - a.s.pctAbsent);
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-muted">Nav dalībnieku.</td></tr>';
      return;
    }
    rows.forEach(({ m, s }) => {
      const tr = document.createElement("tr");
      if (s.overLimit) tr.classList.add("table-warning");
      tr.innerHTML = `
        <td>${escapeHtml(m.name)}</td>
        <td>${s.meetings}</td>
        <td>${s.present}</td>
        <td>${s.excused}</td>
        <td>${s.absent}</td>
        <td>${s.meetings ? s.pctAbsent.toFixed(1) + "%" : "—"}</td>
        <td>${
          s.overLimit
            ? '<span class="text-danger">⚠ Virs 25%</span>'
            : s.meetings
              ? "OK"
              : "—"
        }</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function exportAbsenceReportCsv() {
    const lines = [
      ["Vārds", "Sēdes", "Klāt", "Attaisnoti", "Nav", "% Nav", "Brīdinājums"]
        .map(csvEscape)
        .join(","),
    ];
    membersCache.forEach((m) => {
      const s = memberAbsenceStats(m.id, 60);
      lines.push(
        [
          m.name,
          s.meetings,
          s.present,
          s.excused,
          s.absent,
          s.meetings ? s.pctAbsent.toFixed(1) : "",
          s.overLimit ? "JĀ >25%" : "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    downloadCsv("apmeklejuma_risks_60d.csv", lines.join("\r\n"));
    addLog("export_absence_csv", "60d");
    scheduleSave();
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
        updateLiveQuorumBanner();
        renderMembersList();
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
    updatePublicSessionUI();
    updateLiveQuorumBanner();
    renderVotePanel();
    renderAbsenceReport();
    if (currentUser && currentUser.isAdmin) {
      renderUsersList();
      renderLogs();
    }
    if (currentDate) openDate(currentDate, true);
  }

  // ---------- Public check-in session (for persons on checkin.html) ----------
  function isPublicOpenForToday() {
    const today = toISODate(new Date());
    return !!(
      publicSessionCache &&
      publicSessionCache.open &&
      publicSessionCache.date === today
    );
  }

  function updatePublicSessionUI() {
    const toggle = $("#public-checkin-toggle");
    const status = $("#public-checkin-status");
    const linkBox = $("#public-checkin-link-box");
    if (!toggle) return;
    const open = isPublicOpenForToday();
    toggle.checked = open;
    if (status) {
      if (open) {
        status.textContent =
          "Atvērts šodienai (" +
          formatLatvianDate(publicSessionCache.date) +
          ")" +
          (publicSessionCache.openedBy
            ? " · " + publicSessionCache.openedBy
            : "");
        status.className = "text-success small";
      } else {
        status.textContent = "Slēgts — personas redzēs, ka reģistrācija nav pieejama.";
        status.className = "text-muted small";
      }
    }
    if (linkBox) linkBox.classList.toggle("d-none", !open);
  }

  function setPublicSessionOpen(open) {
    const today = toISODate(new Date());
    if (open) {
      if (activeVoteCache && activeVoteCache.open) {
        alert(
          "Nevar atvērt publisko reģistrāciju, kamēr notiek balsošana. Vispirms slēdz balsošanu."
        );
        updatePublicSessionUI();
        return;
      }
      publicSessionCache = {
        open: true,
        date: today,
        openedBy: currentUser ? currentUser.username : "?",
        openedAt: new Date().toISOString(),
      };
      addLog("public_open", formatLatvianDate(today));
    } else {
      publicSessionCache = emptyPublicSession();
      addLog("public_close", "");
    }
    scheduleSave();
    updatePublicSessionUI();
  }

  // ---------- Voting (staff) ----------
  const VOTE_CHOICE_LV = { for: "Par", against: "Pret", abstain: "Atturas" };

  function computeVoteResults(vote) {
    const eligible = vote.eligible || [];
    const ballots = vote.ballots || {};
    let forCount = 0;
    let againstCount = 0;
    let abstainExplicit = 0;
    let didNotVote = 0;
    eligible.forEach((id) => {
      const c = ballots[id] && ballots[id].choice;
      if (c === "for") forCount++;
      else if (c === "against") againstCount++;
      else if (c === "abstain") abstainExplicit++;
      else didNotVote++;
    });
    const abstainTotal = abstainExplicit + didNotVote; // didn't vote = abstention
    const total = eligible.length;
    // Effective against for threshold
    let effectiveAgainst = againstCount;
    if (vote.ballot === "faa" && vote.abstainAs === "against") {
      effectiveAgainst += abstainTotal;
    }
    // For pass: forCount must be > 50% or > 2/3 of eligible
    const needSimple = total > 0 ? forCount / total > 0.5 : false;
    const needTwoThirds = total > 0 ? forCount / total > 2 / 3 : false;
    const passed =
      vote.majority === "two_thirds" ? needTwoThirds : needSimple;
    const thresholdLabel =
      vote.majority === "two_thirds" ? "> 2/3" : "> 50%";
    const minNeeded =
      vote.majority === "two_thirds"
        ? Math.floor((total * 2) / 3) + 1
        : Math.floor(total / 2) + 1;
    return {
      forCount,
      againstCount,
      abstainExplicit,
      didNotVote,
      abstainTotal,
      effectiveAgainst,
      total,
      passed,
      thresholdLabel,
      minNeeded,
      pct: total > 0 ? Math.round((forCount / total) * 1000) / 10 : 0,
    };
  }

  function fillEligibleCheckboxes() {
    const box = $("#vote-eligible-list");
    if (!box) return;
    const today = toISODate(new Date());
    const day = getDayAttendance(today);
    const active = membersForDate(today).sort((a, b) =>
      a.name.localeCompare(b.name, "lv")
    );
    box.innerHTML = "";
    if (!active.length) {
      box.innerHTML =
        '<p class="text-muted small mb-0">Šodien nav aktīvu dalībnieku. Vispirms atzīmē apmeklējumu.</p>';
      return;
    }
    active.forEach((m) => {
      const present = day[m.id] === "present";
      const id = "elig-" + m.id;
      const div = document.createElement("div");
      div.className = "form-check";
      div.innerHTML = `
        <input class="form-check-input vote-elig-cb" type="checkbox" id="${id}" data-id="${escapeHtml(m.id)}" ${present ? "checked" : ""}>
        <label class="form-check-label" for="${id}">${escapeHtml(m.name)}${present ? "" : ' <span class="text-muted">(nav «klāt»)</span>'}</label>
      `;
      box.appendChild(div);
    });
  }

  function updateVoteFormHints() {
    const ballot = ($("#vote-ballot-type") && $("#vote-ballot-type").value) || "fa";
    const abstainRow = $("#vote-abstain-row");
    if (abstainRow) abstainRow.classList.toggle("d-none", ballot !== "faa");
  }

  function buildVoteReviewHtml(cfg) {
    const names = cfg.eligible
      .map((id) => {
        const m = membersCache.find((x) => x.id === id);
        return m ? m.name : id;
      })
      .join(", ");
    return `
      <ul class="mb-0">
        <li><strong>Nosaukums:</strong> ${escapeHtml(cfg.title)}</li>
        <li><strong>Apraksts:</strong> ${cfg.description ? escapeHtml(cfg.description) : "—"}</li>
        <li><strong>Vairākums:</strong> ${cfg.majority === "two_thirds" ? "> 2/3" : "> 50%"} no tiesīgajiem</li>
        <li><strong>Varianti:</strong> ${cfg.ballot === "faa" ? "Par / Pret / Atturas" : "Par / Pret"}</li>
        ${
          cfg.ballot === "faa"
            ? "<li><strong>Atturēšanās:</strong> " +
              (cfg.abstainAs === "against" ? "kā pret" : "ignorēta") +
              "</li>"
            : ""
        }
        <li><strong>Režīms:</strong> ${cfg.secret ? "slēgta" : "atvērta"}</li>
        <li><strong>Tiesīgie (${cfg.eligible.length}):</strong> ${escapeHtml(names)}</li>
      </ul>
    `;
  }

  function startVoteFromForm() {
    if (activeVoteCache && activeVoteCache.open) {
      alert("Jau ir aktīva balsošana. Vispirms to slēdz.");
      return;
    }
    const title = ($("#vote-title-input").value || "").trim();
    if (!title) {
      alert("Ievadi balsošanas nosaukumu.");
      return;
    }
    const eligible = [];
    document.querySelectorAll(".vote-elig-cb:checked").forEach((cb) => {
      eligible.push(cb.dataset.id);
    });
    if (!eligible.length) {
      alert("Atzīmē vismaz vienu tiesīgo personu.");
      return;
    }
    // Soft quorum block (Reglaments §8) — override allowed & logged
    if (!hasQuorumToday()) {
      const q = computeQuorum(toISODate(new Date()));
      const ok = confirm(
        "Nav kvoruma šodien (klāt " +
          q.present +
          " no " +
          q.total +
          " balsstiesīgajiem; vajag >50%).\n\n" +
          "Vai turpināt bez kvoruma? (tiks ierakstīts žurnālā)"
      );
      if (!ok) return;
      addLog(
        "quorum_override",
        "balsošanas sākums bez kvoruma (" + q.present + "/" + q.total + ")"
      );
    }
    const ballot = $("#vote-ballot-type").value;
    const cfg = {
      title,
      description: ($("#vote-desc-input").value || "").trim(),
      majority: $("#vote-majority").value,
      ballot,
      abstainAs: ballot === "faa" ? $("#vote-abstain-as").value : "ignore",
      secret: $("#vote-secret").value === "1",
      eligible,
    };
    $("#vote-review-body").innerHTML = buildVoteReviewHtml(cfg);
    $("#vote-review-box").classList.remove("d-none");
    $("#vote-review-box").dataset.cfg = JSON.stringify(cfg);
  }

  function confirmStartVote() {
    const raw = $("#vote-review-box").dataset.cfg;
    if (!raw) return;
    const cfg = JSON.parse(raw);
    // Mutual exclusion: close public check-in
    if (publicSessionCache && publicSessionCache.open) {
      publicSessionCache = emptyPublicSession();
      addLog("public_close", "automātiski (sāka balsošanu)");
    }
    const today = toISODate(new Date());
    activeVoteCache = {
      id: "v" + Date.now().toString(36),
      title: cfg.title,
      description: cfg.description,
      majority: cfg.majority,
      ballot: cfg.ballot,
      abstainAs: cfg.abstainAs,
      secret: cfg.secret,
      date: today,
      eligible: cfg.eligible,
      ballots: {},
      open: true,
      createdBy: currentUser ? currentUser.username : "?",
      createdAt: new Date().toISOString(),
    };
    addLog("vote_start", cfg.title + " · tiesīgie: " + cfg.eligible.length);
    scheduleSave();
    $("#vote-review-box").classList.add("d-none");
    $("#vote-title-input").value = "";
    $("#vote-desc-input").value = "";
    updatePublicSessionUI();
    renderVotePanel();
  }

  function closeActiveVote() {
    if (!activeVoteCache || !activeVoteCache.open) return;
    if (
      !confirm(
        "Vai tiešām slēgt balsošanu? Pēc slēgšanas personas vairs nevarēs balsot vai mainīt balsi."
      )
    )
      return;
    const results = computeVoteResults(activeVoteCache);
    const closed = Object.assign({}, activeVoteCache, {
      open: false,
      closedAt: new Date().toISOString(),
      closedBy: currentUser ? currentUser.username : "?",
      results,
    });
    voteArchiveCache = [closed].concat(voteArchiveCache).slice(0, 200);
    activeVoteCache = null;
    addLog(
      "vote_close",
      closed.title + " · " + (results.passed ? "PIEŅEMTS" : "NORAIDĪTS")
    );
    scheduleSave();
    renderVotePanel();
  }

  function formatAdminVoteMarks(b) {
    if (!b || !b.adminChanges || !b.adminChanges.length) return "";
    return b.adminChanges
      .map((c) => {
        const when = c.at ? formatLogTime(c.at) : "";
        const from = c.from ? VOTE_CHOICE_LV[c.from] || c.from : "—";
        const to = c.to ? VOTE_CHOICE_LV[c.to] || c.to : "—";
        return (
          '<div class="small text-warning-emphasis">' +
          "Admin " +
          escapeHtml(c.by || "?") +
          " mainīja " +
          escapeHtml(from) +
          " → " +
          escapeHtml(to) +
          (when ? " (" + escapeHtml(when) + ")" : "") +
          "</div>"
        );
      })
      .join("");
  }

  function renderVoteResultsHtml(vote, opts) {
    opts = opts || {};
    const allowAdminEdit = !!(opts.allowAdminEdit && currentUser && currentUser.isAdmin && vote.open);
    const r = vote.results || computeVoteResults(vote);
    const choices =
      vote.ballot === "faa" ? ["for", "against", "abstain"] : ["for", "against"];
    const rows = (vote.eligible || [])
      .map((id) => {
        const m = membersCache.find((x) => x.id === id);
        const name = m ? m.name : id;
        const b = (vote.ballots || {})[id];
        const choice = b && b.choice ? VOTE_CHOICE_LV[b.choice] : "Nav balsojis";
        const hist =
          b && b.history && b.history.length > 1
            ? ' <span class="text-muted small">(personas maiņas: ' +
              (b.history.length - 1) +
              "×)</span>"
            : "";
        const adminMarks = formatAdminVoteMarks(b);
        let adminCtrl = "";
        if (allowAdminEdit) {
          const optsHtml = choices
            .map(
              (ch) =>
                '<option value="' +
                ch +
                '"' +
                (b && b.choice === ch ? " selected" : "") +
                ">" +
                (VOTE_CHOICE_LV[ch] || ch) +
                "</option>"
            )
            .join("");
          adminCtrl =
            '<div class="mt-1"><select class="form-select form-select-sm admin-vote-select" data-mid="' +
            escapeHtml(id) +
            '" style="max-width:140px;display:inline-block">' +
            '<option value="">— mainīt —</option>' +
            optsHtml +
            "</select> " +
            '<button type="button" class="btn btn-sm btn-outline-warning btn-admin-set-vote" data-mid="' +
            escapeHtml(id) +
            '">Saglabāt</button></div>';
        }
        return (
          "<tr><td>" +
          escapeHtml(name) +
          "</td><td>" +
          escapeHtml(choice) +
          hist +
          adminMarks +
          adminCtrl +
          "</td></tr>"
        );
      })
      .join("");
    const summaryBadge = vote.open
      ? ""
      : `<span class="badge ${r.passed ? "bg-success" : "bg-danger"}">${
          r.passed ? "PIEŅEMTS" : "NORAIDĪTS"
        }</span>`;
    return `
      <div class="mb-2">
        ${summaryBadge}
        <span class="small text-muted ${vote.open ? "" : "ms-2"}">${escapeHtml(
          r.thresholdLabel
        )} no ${r.total} (vajag ≥ ${r.minNeeded} «Par») · Par: <strong>${
          r.forCount
        }</strong> (${r.pct}%) · Pret: <strong>${
          r.againstCount
        }</strong> · Atturas/nav: <strong>${r.abstainTotal}</strong>
        ${
          vote.ballot === "faa" && vote.abstainAs === "against"
            ? " <span class=\"text-muted\">(atturēšanās skaitās pret)</span>"
            : ""
        }</span>
      </div>
      <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Persona</th><th>Balss</th></tr></thead><tbody>${rows}</tbody></table></div>
    `;
  }

  function adminSetMemberVote(memberId, newChoice) {
    if (!currentUser || !currentUser.isAdmin) {
      alert("Tikai administrators var mainīt balsis.");
      return;
    }
    if (!activeVoteCache || !activeVoteCache.open) {
      alert("Balsošana nav aktīva.");
      return;
    }
    if (!newChoice) return;
    if (
      activeVoteCache.ballot === "fa" &&
      newChoice === "abstain"
    ) {
      alert("Šajā balsošanā nav «Atturas».");
      return;
    }
    if ((activeVoteCache.eligible || []).indexOf(memberId) < 0) return;
    if (!activeVoteCache.ballots) activeVoteCache.ballots = {};
    const prev = activeVoteCache.ballots[memberId] || {
      choice: null,
      history: [],
      adminChanges: [],
    };
    const from = prev.choice || null;
    if (from === newChoice) return;
    if (!prev.history) prev.history = [];
    prev.history.push({
      choice: newChoice,
      ts: new Date().toISOString(),
      byAdmin: currentUser.username,
    });
    if (!prev.adminChanges) prev.adminChanges = [];
    prev.adminChanges.push({
      by: currentUser.username,
      at: new Date().toISOString(),
      from: from,
      to: newChoice,
    });
    prev.choice = newChoice;
    activeVoteCache.ballots[memberId] = prev;
    const m = membersCache.find((x) => x.id === memberId);
    addLog(
      "admin_set_vote",
      (m ? m.name : memberId) +
        " · " +
        (from ? VOTE_CHOICE_LV[from] : "—") +
        " → " +
        VOTE_CHOICE_LV[newChoice]
    );
    scheduleSave();
    renderVotePanel();
  }

  function deleteArchiveVote(idx) {
    if (!currentUser || !currentUser.isAdmin) {
      alert("Tikai administrators var dzēst no arhīva.");
      return;
    }
    const v = voteArchiveCache[idx];
    if (!v) return;
    if (!confirm('Dzēst no arhīva: «' + v.title + '»?')) return;
    voteArchiveCache.splice(idx, 1);
    addLog("vote_archive_delete", v.title || v.id || "");
    scheduleSave();
    renderVotePanel();
  }

  function exportVoteCsv(vote) {
    const r = vote.results || computeVoteResults(vote);
    const lines = [];
    lines.push(
      ["Lauks", "Vērtība"].map(csvEscape).join(",")
    );
    lines.push(["Nosaukums", vote.title || ""].map(csvEscape).join(","));
    lines.push(
      ["Rezultāts", r.passed ? "PIEŅEMTS" : "NORAIDĪTS"].map(csvEscape).join(",")
    );
    lines.push(
      ["Vairākums", vote.majority === "two_thirds" ? ">2/3" : ">50%"]
        .map(csvEscape)
        .join(",")
    );
    lines.push(["Par", r.forCount].map(csvEscape).join(","));
    lines.push(["Pret", r.againstCount].map(csvEscape).join(","));
    lines.push(
      ["Atturas/nav balsojuši", r.abstainTotal].map(csvEscape).join(",")
    );
    lines.push(["Tiesīgie kopā", r.total].map(csvEscape).join(","));
    lines.push([]);
    lines.push(
      ["Persona", "Balss", "Admin piezīmes"].map(csvEscape).join(",")
    );
    (vote.eligible || []).forEach((id) => {
      const m = membersCache.find((x) => x.id === id);
      const b = (vote.ballots || {})[id];
      const choice = b && b.choice ? VOTE_CHOICE_LV[b.choice] : "Nav balsojis";
      let notes = "";
      if (b && b.adminChanges && b.adminChanges.length) {
        notes = b.adminChanges
          .map((c) => {
            return (
              (c.by || "?") +
              ": " +
              (c.from ? VOTE_CHOICE_LV[c.from] || c.from : "—") +
              "→" +
              (c.to ? VOTE_CHOICE_LV[c.to] || c.to : "—") +
              (c.at ? " (" + formatLogTime(c.at) + ")" : "")
            );
          })
          .join("; ");
      }
      lines.push(
        [m ? m.name : id, choice, notes].map(csvEscape).join(",")
      );
    });
    const safe =
      (vote.title || "balsojums").replace(/[^\w\-āčēģīķļņšūž]+/gi, "_") ||
      "balsojums";
    downloadCsv(safe + ".csv", lines.join("\r\n"));
    addLog("export_vote_csv", vote.title || "");
    scheduleSave();
  }

  function renderVotePanel() {
    const createBox = $("#vote-create-box");
    const activeBox = $("#vote-active-box");
    const archiveBox = $("#vote-archive-list");
    if (!createBox) return;

    if (activeVoteCache && activeVoteCache.open) {
      createBox.classList.add("d-none");
      activeBox.classList.remove("d-none");
      $("#vote-active-title").textContent = activeVoteCache.title;
      const prog = (activeVoteCache.eligible || []).length;
      let voted = 0;
      (activeVoteCache.eligible || []).forEach((id) => {
        if (
          activeVoteCache.ballots &&
          activeVoteCache.ballots[id] &&
          activeVoteCache.ballots[id].choice
        )
          voted++;
      });
      $("#vote-active-meta").textContent =
        "Nobalsējuši: " +
        voted +
        " / " +
        prog +
        " · " +
        (activeVoteCache.secret ? "slēgta" : "atvērta") +
        " · " +
        (activeVoteCache.majority === "two_thirds" ? ">2/3" : ">50%");
      // Staff always see full detail (secret only hides choices from the public page)
      $("#vote-active-live").classList.remove("d-none");
      $("#vote-active-live").innerHTML = renderVoteResultsHtml(activeVoteCache, {
        allowAdminEdit: true,
      });
      $("#vote-active-live")
        .querySelectorAll(".btn-admin-set-vote")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const mid = btn.dataset.mid;
            const sel = $("#vote-active-live").querySelector(
              'select.admin-vote-select[data-mid="' + mid + '"]'
            );
            const val = sel ? sel.value : "";
            if (!val) {
              alert("Izvēlies jauno balsi.");
              return;
            }
            adminSetMemberVote(mid, val);
          });
        });
    } else {
      activeBox.classList.add("d-none");
      createBox.classList.remove("d-none");
      fillEligibleCheckboxes();
      updateVoteFormHints();
    }

    if (archiveBox) {
      archiveBox.innerHTML = "";
      if (!voteArchiveCache.length) {
        archiveBox.innerHTML =
          '<p class="text-muted small">Arhīvs tukšs.</p>';
      } else {
        voteArchiveCache.forEach((v, idx) => {
          const r = v.results || computeVoteResults(v);
          const card = document.createElement("div");
          card.className = "border rounded p-3 mb-2";
          const adminBtns =
            currentUser && currentUser.isAdmin
              ? ` <button type="button" class="btn btn-sm btn-outline-danger btn-archive-delete" data-idx="${idx}">Dzēst</button>`
              : "";
          card.innerHTML = `
            <div class="d-flex justify-content-between flex-wrap gap-2">
              <strong>${escapeHtml(v.title)}</strong>
              <span class="badge ${r.passed ? "bg-success" : "bg-danger"}">${
                r.passed ? "PIEŅEMTS" : "NORAIDĪTS"
              }</span>
            </div>
            <p class="small text-muted mb-1">${
              v.closedAt ? formatLogTime(v.closedAt) : ""
            } · ${escapeHtml(v.closedBy || "")}</p>
            <button type="button" class="btn btn-sm btn-outline-secondary btn-archive-detail" data-idx="${idx}">Rādīt detaļas</button>
            <button type="button" class="btn btn-sm btn-outline-success btn-archive-csv" data-idx="${idx}">⬇ CSV</button>
            ${adminBtns}
            <div class="archive-detail d-none mt-2"></div>
          `;
          archiveBox.appendChild(card);
        });
        archiveBox.querySelectorAll(".btn-archive-detail").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const detail = btn.parentElement.querySelector(".archive-detail");
            if (detail.classList.contains("d-none")) {
              detail.innerHTML = renderVoteResultsHtml(voteArchiveCache[idx], {
                allowAdminEdit: false,
              });
              detail.classList.remove("d-none");
              btn.textContent = "Slēpt";
            } else {
              detail.classList.add("d-none");
              btn.textContent = "Rādīt detaļas";
            }
          });
        });
        archiveBox.querySelectorAll(".btn-archive-csv").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            exportVoteCsv(voteArchiveCache[idx]);
          });
        });
        archiveBox.querySelectorAll(".btn-archive-delete").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            deleteArchiveVote(idx);
          });
        });
      }
    }
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

    const pubToggle = $("#public-checkin-toggle");
    if (pubToggle) {
      pubToggle.addEventListener("change", () => {
        setPublicSessionOpen(pubToggle.checked);
      });
    }
    const copyBtn = $("#btn-copy-checkin-link");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const url = new URL("checkin.html", window.location.href).href;
        navigator.clipboard.writeText(url).then(
          () => {
            copyBtn.textContent = "Nokopēts!";
            setTimeout(() => {
              copyBtn.textContent = "Kopēt saiti";
            }, 1500);
          },
          () => alert(url)
        );
      });
    }

    const copyVoteBtn = $("#btn-copy-vote-link");
    if (copyVoteBtn) {
      copyVoteBtn.addEventListener("click", () => {
        const url = new URL("vote.html", window.location.href).href;
        navigator.clipboard.writeText(url).then(
          () => {
            copyVoteBtn.textContent = "Nokopēts!";
            setTimeout(() => {
              copyVoteBtn.textContent = "Kopēt saiti";
            }, 1500);
          },
          () => alert(url)
        );
      });
    }
    const btnVotePreview = $("#btn-vote-preview");
    if (btnVotePreview) {
      btnVotePreview.addEventListener("click", startVoteFromForm);
    }
    const btnVoteConfirm = $("#btn-vote-confirm-start");
    if (btnVoteConfirm) {
      btnVoteConfirm.addEventListener("click", confirmStartVote);
    }
    const btnVoteCancel = $("#btn-vote-cancel-start");
    if (btnVoteCancel) {
      btnVoteCancel.addEventListener("click", () => {
        $("#vote-review-box").classList.add("d-none");
      });
    }
    const btnVoteClose = $("#btn-vote-close");
    if (btnVoteClose) {
      btnVoteClose.addEventListener("click", closeActiveVote);
    }
    const ballotType = $("#vote-ballot-type");
    if (ballotType) {
      ballotType.addEventListener("change", updateVoteFormHints);
    }

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
          $("#new-member-joined").value,
          $("#new-member-cv") && $("#new-member-cv").checked
        )
      ) {
        $("#new-member-name").value = "";
        $("#new-member-joined").value = toISODate(new Date());
        if ($("#new-member-cv")) $("#new-member-cv").checked = false;
        if ($("#new-member-vote")) $("#new-member-vote").checked = false;
        $("#new-member-name").focus();
      } else {
        alert("Ievadi vārdu un uzvārdu.");
      }
    });
    const absCsv = $("#btn-absence-report-csv");
    if (absCsv) {
      absCsv.addEventListener("click", exportAbsenceReportCsv);
    }
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
