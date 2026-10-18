(() => {
  "use strict";

  const STORAGE_AUTH = "msaieti-auth-user";
  const STORAGE_DATA = "msaieti-data-v1";
  const SAVE_DEBOUNCE_MS = 600;
  const MAX_LOGS = 2000;
  const MIN_PASSWORD_LEN = 6;

  const ACTION_LABELS = {
    login: "Ienāca",
    logout: "Izgāja",
    add_person: "Pievienoja personu",
    edit_person: "Laboja personu",
    remove_person: "Dzēsa personu",
    add_team: "Pievienoja komandu",
    edit_team: "Laboja komandu",
    remove_team: "Dzēsa komandu",
    generate_teams: "Ģenerēja komandas",
    add_user: "Pievienoja lietotāju",
    edit_user: "Laboja lietotāju",
    remove_user: "Dzēsa lietotāju",
    change_password: "Mainīja paroli",
    admin_set_password: "Iestatīja lietotāja paroli",
  };

  const TYPE_LABELS = {
    participant: "Dalībnieks",
    captain: "Kapitāns",
    organizer: "Organizators",
    helper: "Palīgs",
  };

  const $ = (sel) => document.querySelector(sel);

  let currentUser = null;
  let usersCache = [];
  let peopleCache = [];
  let teamsCache = [];
  let logsCache = [];
  let saveTimer = null;
  let remoteEnabled = false;
  let syncState = "idle";
  let adminPassTargetId = null;

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
    if (target.id === currentUser.id) return true;
    if (!currentUser.isAdmin) return false;
    if (!target.isAdmin) return true;
    return isMainAdmin(currentUser);
  }

  function canDeleteUser(target) {
    if (!currentUser || !target) return false;
    if (isMainAdmin(target)) return false;
    if (!currentUser.isAdmin) return false;
    if (target.isAdmin && !isMainAdmin(currentUser)) return false;
    return true;
  }

  // ---------- IDs ----------
  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

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

  function showLogin() {
    $("#login-view").classList.remove("d-none");
    $("#app-view").classList.add("d-none");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
    document.querySelectorAll("#main-tabs .nav-link").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.add("d-none"));
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
    switchTab("tab-teams");
    updateSyncBadge();
    await loadFromRemoteOrLocal();
    ensureSeedUsers();
    renderAll();
  }

  // ---------- Data load / save ----------
  function hasRemote() {
    return typeof REMOTE_URL === "string" && REMOTE_URL.trim().length > 10;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_DATA);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function saveLocal() {
    const payload = {
      users: usersCache,
      people: peopleCache,
      teams: teamsCache,
      logs: logsCache.slice(-MAX_LOGS),
    };
    localStorage.setItem(STORAGE_DATA, JSON.stringify(payload));
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.users)) usersCache = data.users;
    if (Array.isArray(data.people)) peopleCache = data.people;
    if (Array.isArray(data.teams)) teamsCache = data.teams;
    if (Array.isArray(data.logs)) logsCache = data.logs;
  }

  async function fetchRemote() {
    const res = await fetch(REMOTE_URL, { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok === false) throw new Error(data && data.error ? data.error : "Remote error");
    return data;
  }

  async function pushRemote() {
    const body = {
      users: usersCache,
      people: peopleCache,
      teams: teamsCache,
      logs: logsCache.slice(-MAX_LOGS),
    };
    const res = await fetch(REMOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok === false) throw new Error(data && data.error ? data.error : "Remote error");
    return data;
  }

  async function loadFromRemoteOrLocal() {
    remoteEnabled = hasRemote();
    syncState = "loading";
    updateSyncBadge();
    try {
      if (remoteEnabled) {
        const data = await fetchRemote();
        applyPayload(data);
        saveLocal();
        syncState = "ok";
      } else {
        applyPayload(loadLocal());
        syncState = "local";
      }
    } catch (err) {
      console.warn("Remote load failed, using local", err);
      applyPayload(loadLocal());
      syncState = "error";
    }
    updateSyncBadge();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
  }

  async function doSave() {
    saveTimer = null;
    saveLocal();
    if (!remoteEnabled) {
      syncState = "local";
      updateSyncBadge();
      return;
    }
    syncState = "saving";
    updateSyncBadge();
    try {
      await pushRemote();
      syncState = "ok";
    } catch (err) {
      console.warn("Remote save failed", err);
      syncState = "error";
    }
    updateSyncBadge();
  }

  function updateSyncBadge() {
    const el = $("#sync-badge");
    if (!el) return;
    const map = {
      idle: ["bg-secondary", "—"],
      loading: ["bg-info", "Ielādē…"],
      saving: ["bg-info", "Saglabā…"],
      ok: ["bg-success", "Sinhronizēts"],
      local: ["bg-secondary", "Lokāli"],
      error: ["bg-danger", "Kļūda"],
    };
    const [cls, text] = map[syncState] || map.idle;
    el.className = "badge sync-badge ms-1 " + cls;
    el.textContent = text;
  }

  function ensureSeedUsers() {
    if (!usersCache.length) {
      usersCache = JSON.parse(JSON.stringify(SEED_USERS));
      scheduleSave();
    } else {
      const hasAdmin = usersCache.some((u) => String(u.username).toLowerCase() === "admin");
      if (!hasAdmin) {
        usersCache.unshift(JSON.parse(JSON.stringify(SEED_USERS[0])));
        scheduleSave();
      }
    }
  }

  // ---------- Logs ----------
  function addLog(action, detail) {
    logsCache.push({
      ts: new Date().toISOString(),
      userId: currentUser ? currentUser.id : null,
      username: currentUser ? currentUser.username : "?",
      action,
      detail: detail || "",
    });
    if (logsCache.length > MAX_LOGS) logsCache = logsCache.slice(-MAX_LOGS);
  }

  // ---------- Tabs ----------
  function switchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
    document.querySelectorAll("#main-tabs .nav-link").forEach((b) => b.classList.remove("active"));
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.remove("d-none");
    const btn = document.querySelector(`#main-tabs [data-tab="${tabId}"]`);
    if (btn) btn.classList.add("active");
  }

  // ---------- Render ----------
  function renderAll() {
    renderTeams();
    renderPeople();
    if (currentUser && currentUser.isAdmin) {
      renderUsers();
      renderLogs();
    }
  }

  function teamLabel(team) {
    if (!team) return "—";
    const n = team.number != null ? team.number : "?";
    return team.name ? `${n}. ${team.name}` : `Komanda ${n}`;
  }

  function getPersonTeamId(personId) {
    for (const t of teamsCache) {
      if ((t.captainIds || []).includes(personId)) return t.id;
      if ((t.participantIds || []).includes(personId)) return t.id;
    }
    return null;
  }

  function syncPersonToTeams(person) {
    // Remove from all teams first
    for (const t of teamsCache) {
      t.captainIds = (t.captainIds || []).filter((id) => id !== person.id);
      t.participantIds = (t.participantIds || []).filter((id) => id !== person.id);
    }
    if (!person.teamId) return;
    const team = teamsCache.find((t) => t.id === person.teamId);
    if (!team) {
      person.teamId = null;
      return;
    }
    if (person.type === "captain") {
      if (!team.captainIds) team.captainIds = [];
      if (!team.captainIds.includes(person.id)) team.captainIds.push(person.id);
    } else {
      if (!team.participantIds) team.participantIds = [];
      if (!team.participantIds.includes(person.id)) team.participantIds.push(person.id);
    }
  }

  function renderTeams() {
    const list = $("#teams-list");
    const empty = $("#teams-empty");
    $("#teams-count").textContent = teamsCache.length;

    if (!teamsCache.length) {
      list.innerHTML = "";
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");

    const sorted = [...teamsCache].sort((a, b) => (a.number || 0) - (b.number || 0));
    list.innerHTML = sorted
      .map((t) => {
        const captains = (t.captainIds || [])
          .map((id) => peopleCache.find((p) => p.id === id))
          .filter(Boolean);
        const participants = (t.participantIds || [])
          .map((id) => peopleCache.find((p) => p.id === id))
          .filter(Boolean);
        const mentor = t.mentorId
          ? usersCache.find((u) => u.id === t.mentorId)
          : null;
        return `
        <div class="col-md-6 col-lg-4">
          <div class="card team-card h-100 shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h3 class="h6 mb-0">${escapeHtml(teamLabel(t))}</h3>
                <div class="btn-group btn-group-sm">
                  <button type="button" class="btn btn-outline-secondary btn-edit-team" data-id="${t.id}" title="Rediģēt">✎</button>
                  <button type="button" class="btn btn-outline-danger btn-remove-team" data-id="${t.id}" title="Dzēst">×</button>
                </div>
              </div>
              <p class="small text-muted mb-1">
                Mentors: <strong>${mentor ? escapeHtml(mentor.name || mentor.username) : "—"}</strong>
              </p>
              <p class="small mb-1">
                <span class="status-pill person-type-captain">Kapitāni</span>
                ${
                  captains.length
                    ? captains.map((c) => escapeHtml(c.name)).join(", ")
                    : "<span class=\"text-muted\">nav</span>"
                }
              </p>
              <p class="small mb-0">
                <span class="status-pill person-type-participant">Dalībnieki</span>
                ${participants.length} cilvēki
              </p>
              ${
                participants.length
                  ? `<ul class="small mb-0 mt-1 ps-3">${participants
                      .map((p) => `<li>${escapeHtml(p.name)} <span class="text-muted">(${p.grade}. kl.)</span></li>`)
                      .join("")}</ul>`
                  : ""
              }
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderPeople() {
    const tbody = $("#people-tbody");
    const empty = $("#people-empty");
    const q = ($("#people-search").value || "").trim().toLowerCase();
    let list = [...peopleCache];
    if (q) {
      list = list.filter((p) => (p.name || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "lv"));

    $("#people-count").textContent = peopleCache.length;

    if (!list.length) {
      tbody.innerHTML = "";
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");

    tbody.innerHTML = list
      .map((p) => {
        const teamId = p.teamId || getPersonTeamId(p.id);
        const team = teamId ? teamsCache.find((t) => t.id === teamId) : null;
        const typeCls =
          p.type === "captain" ? "person-type-captain" : "person-type-participant";
        return `<tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${p.grade}. kl.</td>
          <td><span class="status-pill ${typeCls}">${TYPE_LABELS[p.type] || p.type}</span></td>
          <td>${team ? escapeHtml(teamLabel(team)) : "—"}</td>
          <td class="table-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm btn-edit-person" data-id="${p.id}">Labot</button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-remove-person" data-id="${p.id}">Dzēst</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderUsers() {
    const tbody = $("#users-tbody");
    $("#users-count").textContent = usersCache.length;
    const sorted = [...usersCache].sort((a, b) => {
      if (isMainAdmin(a)) return -1;
      if (isMainAdmin(b)) return 1;
      return (a.username || "").localeCompare(b.username || "", "lv");
    });

    tbody.innerHTML = sorted
      .map((u) => {
        const roleCls =
          u.role === "helper" ? "person-type-helper" : "person-type-organizer";
        const canDel = canDeleteUser(u);
        const canPass = canSetPasswordFor(u) && u.id !== currentUser.id;
        return `<tr>
          <td><code>${escapeHtml(u.username)}</code>${isMainAdmin(u) ? ' <span class="badge bg-dark">galvenais</span>' : ""}</td>
          <td>${escapeHtml(u.name || "—")}</td>
          <td><span class="status-pill ${roleCls}">${TYPE_LABELS[u.role] || u.role || "organizators"}</span></td>
          <td>${u.isAdmin ? "Jā" : "Nē"}</td>
          <td class="table-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm btn-edit-user" data-id="${u.id}">Labot</button>
            ${
              canPass
                ? `<button type="button" class="btn btn-outline-warning btn-sm btn-set-pass" data-id="${u.id}">Parole</button>`
                : ""
            }
            ${
              canDel
                ? `<button type="button" class="btn btn-outline-danger btn-sm btn-remove-user" data-id="${u.id}">Dzēst</button>`
                : ""
            }
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderLogs() {
    const tbody = $("#logs-tbody");
    const recent = [...logsCache].reverse().slice(0, 150);
    tbody.innerHTML = recent
      .map((l) => {
        const t = l.ts ? new Date(l.ts).toLocaleString("lv-LV") : "—";
        return `<tr>
          <td>${escapeHtml(t)}</td>
          <td>${escapeHtml(l.username || "?")}</td>
          <td>${escapeHtml(ACTION_LABELS[l.action] || l.action)}</td>
          <td>${escapeHtml(l.detail || "")}</td>
        </tr>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Fill selects ----------
  function fillTeamSelect(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">— Nav piešķirta —</option>';
    const sorted = [...teamsCache].sort((a, b) => (a.number || 0) - (b.number || 0));
    for (const t of sorted) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = teamLabel(t);
      if (t.id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  function fillMentorSelect(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">— Nav —</option>';
    for (const u of usersCache) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = (u.name || u.username) + (u.role === "helper" ? " (palīgs)" : "");
      if (u.id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  // ---------- Login / logout ----------
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
    showLogin();
  }

  // ---------- Person CRUD ----------
  function openPersonModal(person) {
    $("#modal-person-title").textContent = person ? "Labot personu" : "Pievienot personu";
    $("#person-edit-id").value = person ? person.id : "";
    $("#person-name").value = person ? person.name : "";
    $("#person-grade").value = person ? String(person.grade || 3) : "3";
    $("#person-type").value = person ? person.type : "participant";
    fillTeamSelect($("#person-team"), person ? person.teamId : "");
    bootstrap.Modal.getOrCreateInstance($("#modal-person")).show();
  }

  function savePerson() {
    const id = $("#person-edit-id").value;
    const name = ($("#person-name").value || "").trim();
    const grade = parseInt($("#person-grade").value, 10) || 3;
    const type = $("#person-type").value || "participant";
    const teamId = $("#person-team").value || null;

    if (!name) {
      alert("Ievadiet vārdu.");
      return;
    }

    if (id) {
      const p = peopleCache.find((x) => x.id === id);
      if (!p) return;
      p.name = name;
      p.grade = grade;
      p.type = type;
      p.teamId = teamId;
      syncPersonToTeams(p);
      addLog("edit_person", name);
    } else {
      const p = {
        id: uid("p"),
        name,
        grade,
        type,
        teamId,
      };
      peopleCache.push(p);
      syncPersonToTeams(p);
      addLog("add_person", name);
    }
    scheduleSave();
    renderAll();
    bootstrap.Modal.getInstance($("#modal-person")).hide();
  }

  function removePerson(id) {
    const p = peopleCache.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Dzēst «${p.name}»?`)) return;
    peopleCache = peopleCache.filter((x) => x.id !== id);
    for (const t of teamsCache) {
      t.captainIds = (t.captainIds || []).filter((cid) => cid !== id);
      t.participantIds = (t.participantIds || []).filter((cid) => cid !== id);
    }
    addLog("remove_person", p.name);
    scheduleSave();
    renderAll();
  }

  // ---------- Team CRUD ----------
  function openTeamModal(team) {
    $("#modal-team-title").textContent = team ? "Rediģēt komandu" : "Jauna komanda";
    $("#team-edit-id").value = team ? team.id : "";
    $("#team-number").value = team ? team.number : nextTeamNumber();
    $("#team-name").value = team ? team.name || "" : "";
    fillMentorSelect($("#team-mentor"), team ? team.mentorId : "");
    bootstrap.Modal.getOrCreateInstance($("#modal-team")).show();
  }

  function nextTeamNumber() {
    if (!teamsCache.length) return 1;
    return Math.max(...teamsCache.map((t) => t.number || 0)) + 1;
  }

  function saveTeam() {
    const id = $("#team-edit-id").value;
    const number = parseInt($("#team-number").value, 10) || 1;
    const name = ($("#team-name").value || "").trim();
    const mentorId = $("#team-mentor").value || null;

    if (id) {
      const t = teamsCache.find((x) => x.id === id);
      if (!t) return;
      t.number = number;
      t.name = name;
      t.mentorId = mentorId;
      addLog("edit_team", teamLabel(t));
    } else {
      const t = {
        id: uid("t"),
        number,
        name,
        mentorId,
        captainIds: [],
        participantIds: [],
      };
      teamsCache.push(t);
      addLog("add_team", teamLabel(t));
    }
    scheduleSave();
    renderAll();
    bootstrap.Modal.getInstance($("#modal-team")).hide();
  }

  function removeTeam(id) {
    const t = teamsCache.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Dzēst «${teamLabel(t)}»? Dalībnieki tiks atsaistīti.`)) return;
    for (const p of peopleCache) {
      if (p.teamId === id) p.teamId = null;
    }
    teamsCache = teamsCache.filter((x) => x.id !== id);
    addLog("remove_team", teamLabel(t));
    scheduleSave();
    renderAll();
  }

  function generateTeams() {
    const n = parseInt($("#gen-teams-count").value, 10);
    if (!n || n < 1 || n > 20) {
      alert("Ievadiet skaitu no 1 līdz 20.");
      return;
    }
    if (!confirm(`Izveidot ${n} komandas? Esošās komandas tiks dzēstas.`)) return;

    for (const p of peopleCache) p.teamId = null;
    teamsCache = [];
    for (let i = 1; i <= n; i++) {
      teamsCache.push({
        id: uid("t"),
        number: i,
        name: "",
        mentorId: null,
        captainIds: [],
        participantIds: [],
      });
    }
    addLog("generate_teams", String(n));
    scheduleSave();
    renderAll();
    bootstrap.Modal.getInstance($("#modal-generate-teams")).hide();
  }

  // ---------- User CRUD ----------
  function openUserModal(user) {
    $("#modal-user-title").textContent = user ? "Labot lietotāju" : "Pievienot lietotāju";
    $("#user-edit-id").value = user ? user.id : "";
    $("#user-username").value = user ? user.username : "";
    $("#user-username").disabled = user ? isMainAdmin(user) : false;
    $("#user-name").value = user ? user.name || "" : "";
    $("#user-role").value = user ? user.role || "organizer" : "organizer";
    $("#user-is-admin").checked = user ? !!user.isAdmin : false;
    if (user && isMainAdmin(user)) {
      $("#user-is-admin").checked = true;
      $("#user-is-admin").disabled = true;
    } else {
      $("#user-is-admin").disabled = !isMainAdmin(currentUser);
    }
    $("#user-password").value = "";
    $("#user-password-group").querySelector(".form-text").textContent = user
      ? "Atstājiet tukšu, lai nemainītu. Min. 6 simboli."
      : "Min. 6 simboli.";
    bootstrap.Modal.getOrCreateInstance($("#modal-user")).show();
  }

  async function saveUser() {
    const id = $("#user-edit-id").value;
    const username = ($("#user-username").value || "").trim();
    const name = ($("#user-name").value || "").trim();
    const role = $("#user-role").value || "organizer";
    let isAdmin = $("#user-is-admin").checked;
    const password = $("#user-password").value || "";

    if (!username) {
      alert("Ievadiet lietotājvārdu.");
      return;
    }
    if (!id && password.length < MIN_PASSWORD_LEN) {
      alert("Parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.");
      return;
    }
    if (password && password.length < MIN_PASSWORD_LEN) {
      alert("Parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.");
      return;
    }

    const dup = usersCache.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.id !== id
    );
    if (dup) {
      alert("Šāds lietotājvārds jau eksistē.");
      return;
    }

    if (id) {
      const u = usersCache.find((x) => x.id === id);
      if (!u) return;
      if (isMainAdmin(u)) {
        isAdmin = true;
      } else if (!isMainAdmin(currentUser)) {
        isAdmin = !!u.isAdmin;
      }
      u.username = isMainAdmin(u) ? u.username : username;
      u.name = name;
      u.role = role;
      u.isAdmin = isAdmin;
      if (password) await setUserPasswordFields(u, password);
      addLog("edit_user", u.username);
    } else {
      if (!isMainAdmin(currentUser)) isAdmin = false;
      const u = {
        id: uid("u"),
        username,
        name,
        role,
        isAdmin,
      };
      await setUserPasswordFields(u, password);
      usersCache.push(u);
      addLog("add_user", username);
    }
    scheduleSave();
    renderAll();
    bootstrap.Modal.getInstance($("#modal-user")).hide();
  }

  function removeUser(id) {
    const u = usersCache.find((x) => x.id === id);
    if (!u || !canDeleteUser(u)) return;
    if (!confirm(`Dzēst lietotāju «${u.username}»?`)) return;
    // Unassign as mentor
    for (const t of teamsCache) {
      if (t.mentorId === id) t.mentorId = null;
    }
    usersCache = usersCache.filter((x) => x.id !== id);
    addLog("remove_user", u.username);
    scheduleSave();
    renderAll();
  }

  // ---------- Password change ----------
  async function changeOwnPassword() {
    const err = $("#cp-error");
    err.classList.add("d-none");
    const current = $("#cp-current").value || "";
    const neu = $("#cp-new").value || "";
    const neu2 = $("#cp-new2").value || "";

    if (neu.length < MIN_PASSWORD_LEN) {
      err.textContent = "Jaunajai parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.";
      err.classList.remove("d-none");
      return;
    }
    if (neu !== neu2) {
      err.textContent = "Paroles nesakrīt.";
      err.classList.remove("d-none");
      return;
    }
    const user = usersCache.find((u) => u.id === currentUser.id);
    if (!user || !(await verifyUserPassword(user, current))) {
      err.textContent = "Pašreizējā parole ir nepareiza.";
      err.classList.remove("d-none");
      return;
    }
    await setUserPasswordFields(user, neu);
    addLog("change_password", "");
    scheduleSave();
    bootstrap.Modal.getInstance($("#modal-change-password")).hide();
    $("#cp-current").value = "";
    $("#cp-new").value = "";
    $("#cp-new2").value = "";
  }

  async function adminSetPassword() {
    const err = $("#ap-error");
    err.classList.add("d-none");
    const neu = $("#ap-new").value || "";
    if (neu.length < MIN_PASSWORD_LEN) {
      err.textContent = "Parolei jābūt vismaz " + MIN_PASSWORD_LEN + " simboliem.";
      err.classList.remove("d-none");
      return;
    }
    const user = usersCache.find((u) => u.id === adminPassTargetId);
    if (!user || !canSetPasswordFor(user)) return;
    await setUserPasswordFields(user, neu);
    addLog("admin_set_password", user.username);
    scheduleSave();
    bootstrap.Modal.getInstance($("#modal-admin-password")).hide();
    $("#ap-new").value = "";
    adminPassTargetId = null;
  }

  // ---------- Events ----------
  function bindEvents() {
    $("#btn-login").addEventListener("click", tryLogin);
    $("#password-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryLogin();
    });
    $("#username-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryLogin();
    });

    $("#btn-logout").addEventListener("click", logout);
    $("#btn-change-password").addEventListener("click", () => {
      $("#cp-current").value = "";
      $("#cp-new").value = "";
      $("#cp-new2").value = "";
      $("#cp-error").classList.add("d-none");
      bootstrap.Modal.getOrCreateInstance($("#modal-change-password")).show();
    });
    $("#btn-cp-save").addEventListener("click", changeOwnPassword);

    document.querySelectorAll("#main-tabs [data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });

    $("#btn-add-person").addEventListener("click", () => openPersonModal(null));
    $("#btn-person-save").addEventListener("click", savePerson);
    $("#people-search").addEventListener("input", renderPeople);

    $("#btn-add-team").addEventListener("click", () => openTeamModal(null));
    $("#btn-team-save").addEventListener("click", saveTeam);
    $("#btn-generate-teams").addEventListener("click", () => {
      $("#gen-teams-count").value = "10";
      bootstrap.Modal.getOrCreateInstance($("#modal-generate-teams")).show();
    });
    $("#btn-gen-teams-confirm").addEventListener("click", generateTeams);

    $("#btn-add-user").addEventListener("click", () => openUserModal(null));
    $("#btn-user-save").addEventListener("click", saveUser);
    $("#btn-ap-save").addEventListener("click", adminSetPassword);

    // Delegated clicks
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.classList.contains("btn-edit-person")) {
        const p = peopleCache.find((x) => x.id === t.dataset.id);
        if (p) openPersonModal(p);
      } else if (t.classList.contains("btn-remove-person")) {
        removePerson(t.dataset.id);
      } else if (t.classList.contains("btn-edit-team")) {
        const team = teamsCache.find((x) => x.id === t.dataset.id);
        if (team) openTeamModal(team);
      } else if (t.classList.contains("btn-remove-team")) {
        removeTeam(t.dataset.id);
      } else if (t.classList.contains("btn-edit-user")) {
        const u = usersCache.find((x) => x.id === t.dataset.id);
        if (u) openUserModal(u);
      } else if (t.classList.contains("btn-remove-user")) {
        removeUser(t.dataset.id);
      } else if (t.classList.contains("btn-set-pass")) {
        const u = usersCache.find((x) => x.id === t.dataset.id);
        if (!u || !canSetPasswordFor(u)) return;
        adminPassTargetId = u.id;
        $("#ap-target-label").textContent = "Lietotājs: " + u.username;
        $("#ap-new").value = "";
        $("#ap-error").classList.add("d-none");
        bootstrap.Modal.getOrCreateInstance($("#modal-admin-password")).show();
      }
    });
  }

  // ---------- Init ----------
  async function init() {
    bindEvents();
    const session = loadSession();
    if (session && session.id && session.username) {
      currentUser = session;
      await showApp();
    } else {
      showLogin();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
