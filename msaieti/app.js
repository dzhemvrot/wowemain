(() => {
  "use strict";

  const STORAGE_AUTH = "msaieti-auth-user";
  const STORAGE_DATA = "msaieti-data-v2";
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
    import_people: "Importēja dalībniekus",
    toggle_destructor: "Mainīja destruktoru",
    generate_numbers: "Ģenerēja numurus",
    clear_numbers: "Notīrīja numurus",
    phase_names: "Ieslēdza 2. posmu (vārdi)",
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
  /** @type {{ phase: 'numbers'|'names', numberScheme: 'prefix'|'legacy' }} */
  let settingsCache = { phase: "numbers", numberScheme: "prefix" };
  /** @type {{ startTime: string, endTime: string, transitionMin: number, stations: { room: string, organizerIds: string[] }[] }} */
  let carouselCache = {
    startTime: "11:45",
    endTime: "13:25",
    transitionMin: 2,
    stations: [],
  };
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
      let raw = localStorage.getItem(STORAGE_DATA);
      if (!raw) raw = localStorage.getItem("msaieti-data-v1");
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
      settings: settingsCache,
      carousel: carouselCache,
    };
    localStorage.setItem(STORAGE_DATA, JSON.stringify(payload));
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.users)) usersCache = data.users;
    if (Array.isArray(data.people)) peopleCache = data.people;
    if (Array.isArray(data.teams)) teamsCache = data.teams;
    if (Array.isArray(data.logs)) logsCache = data.logs;
    if (data.settings && typeof data.settings === "object") {
      settingsCache = {
        phase: data.settings.phase === "names" ? "names" : "numbers",
        numberScheme:
          data.settings.numberScheme === "legacy" ? "legacy" : "prefix",
      };
    }
    if (data.carousel && typeof data.carousel === "object") {
      carouselCache = {
        startTime: data.carousel.startTime || "11:45",
        endTime: data.carousel.endTime || "13:25",
        transitionMin:
          typeof data.carousel.transitionMin === "number"
            ? data.carousel.transitionMin
            : parseInt(data.carousel.transitionMin, 10) || 2,
        stations: Array.isArray(data.carousel.stations)
          ? data.carousel.stations.map(normalizeStation)
          : [],
      };
    }
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
      settings: settingsCache,
      carousel: carouselCache,
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
    renderDistribute();
    renderCarousel();
    if (currentUser && currentUser.isAdmin) {
      renderUsers();
      renderLogs();
    }
  }

  function firstName(full) {
    const s = String(full || "").trim();
    if (!s) return "?";
    const parts = s.split(/\s+/).filter(Boolean);
    // Lists are usually "Surname Name" → use given name (last token)
    if (parts.length >= 2) return parts[parts.length - 1];
    return parts[0];
  }

  function teamLabel(team) {
    if (!team) return "—";
    const n = team.number != null ? team.number : "?";
    if (team.name && String(team.name).trim()) {
      return `${n}. ${String(team.name).trim()}`;
    }
    const captains = (team.captainIds || [])
      .map((id) => peopleCache.find((p) => p.id === id))
      .filter(Boolean)
      .map((c) => firstName(c.name));
    if (captains.length >= 2) {
      return `Komanda ${captains[0]} un ${captains[1]}`;
    }
    if (captains.length === 1) {
      return `Komanda ${captains[0]}`;
    }
    return `Komanda ${n}`;
  }

  function classLabel(person) {
    if (!person || person.type === "captain") return "—";
    const g = person.grade != null ? person.grade : "?";
    const l = person.letter || "a";
    return `${g}.${l}`;
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
      // Max 2 captains per team
      if (!team.captainIds.includes(person.id)) {
        if (team.captainIds.length >= 2) {
          person.teamId = null;
          return;
        }
        team.captainIds.push(person.id);
      }
    } else {
      if (!team.participantIds) team.participantIds = [];
      if (!team.participantIds.includes(person.id)) team.participantIds.push(person.id);
    }
  }

  /** Assign exactly the given captain ids to a team; clear them from other teams. */
  function setTeamCaptains(team, captainId1, captainId2) {
    const ids = [captainId1, captainId2].filter(Boolean);
    // Remove these people from every team's captain list and clear their teamId if captain
    for (const t of teamsCache) {
      const before = (t.captainIds || []).slice();
      t.captainIds = before.filter((id) => !ids.includes(id));
    }
    for (const cid of ids) {
      const p = peopleCache.find((x) => x.id === cid);
      if (p) {
        p.type = "captain";
        p.teamId = null;
        p.grade = null;
        p.letter = null;
      }
    }
    // Clear previous captains of this team (they become unassigned)
    const prev = (team.captainIds || []).slice();
    for (const cid of prev) {
      if (!ids.includes(cid)) {
        const p = peopleCache.find((x) => x.id === cid);
        if (p && p.type === "captain") p.teamId = null;
      }
    }
    team.captainIds = ids;
    for (const cid of ids) {
      const p = peopleCache.find((x) => x.id === cid);
      if (p) p.teamId = team.id;
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
                ${
                  captains.length !== 2
                    ? ' <span class="text-danger small">(jābūt 2)</span>'
                    : ""
                }
              </p>
              <p class="small mb-0">
                <span class="status-pill person-type-participant">Dalībnieki</span>
                ${participants.length} cilvēki
              </p>
              ${
                participants.length
                  ? `<ul class="small mb-0 mt-1 ps-3">${participants
                      .map((p) => `<li>${escapeHtml(p.name)} <span class="text-muted">(${classLabel(p)})</span></li>`)
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
    const capBody = $("#captains-tbody");
    const capEmpty = $("#captains-empty");
    const q = ($("#people-search").value || "").trim().toLowerCase();
    const sortMode = ($("#people-sort") && $("#people-sort").value) || "name";

    let participants = peopleCache.filter((p) => p.type === "participant");
    if (q) {
      participants = participants.filter((p) =>
        (p.name || "").toLowerCase().includes(q)
      );
    }
    participants.sort((a, b) => {
      if (sortMode === "class") {
        const ca = classLabel(a);
        const cb = classLabel(b);
        const c = ca.localeCompare(cb, "lv");
        if (c !== 0) return c;
      }
      return (a.name || "").localeCompare(b.name || "", "lv");
    });

    const captains = peopleCache
      .filter((p) => p.type === "captain")
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "lv"));

    const pc = $("#participants-count");
    const cc = $("#captains-count");
    if (pc) {
      pc.textContent = String(
        peopleCache.filter((p) => p.type === "participant").length
      );
    }
    if (cc) cc.textContent = String(captains.length);

    // Participants table
    if (!tbody) return;
    if (!participants.length) {
      tbody.innerHTML = "";
      if (empty) empty.classList.remove("d-none");
    } else {
      if (empty) empty.classList.add("d-none");
      tbody.innerHTML = participants
        .map((p) => {
          const teamId = p.teamId || getPersonTeamId(p.id);
          const team = teamId ? teamsCache.find((t) => t.id === teamId) : null;
          const rowCls = p.isDestructor ? "destructor-row" : "";
          return `<tr class="${rowCls}">
          <td><input type="checkbox" class="form-check-input person-select" data-id="${p.id}"></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(classLabel(p))}</td>
          <td><input type="checkbox" class="form-check-input btn-toggle-destructor" data-id="${p.id}" ${
            p.isDestructor ? "checked" : ""
          } title="Destruktors"></td>
          <td>${
            p.number
              ? `<span class="num-chip ${p.isDestructor ? "destructor" : ""}">${escapeHtml(
                  p.number
                )}</span>`
              : "—"
          }</td>
          <td>${team ? escapeHtml(teamLabel(team)) : "—"}</td>
          <td class="table-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm btn-edit-person" data-id="${p.id}">Labot</button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-remove-person" data-id="${p.id}">Dzēst</button>
          </td>
        </tr>`;
        })
        .join("");
    }

    // Captains table
    if (capBody) {
      if (!captains.length) {
        capBody.innerHTML = "";
        if (capEmpty) capEmpty.classList.remove("d-none");
      } else {
        if (capEmpty) capEmpty.classList.add("d-none");
        capBody.innerHTML = captains
          .map((p) => {
            const teamId = p.teamId || getPersonTeamId(p.id);
            const team = teamId ? teamsCache.find((t) => t.id === teamId) : null;
            return `<tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${team ? escapeHtml(teamLabel(team)) : "—"}</td>
            <td class="table-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm btn-edit-person" data-id="${p.id}">Labot</button>
              <button type="button" class="btn btn-outline-danger btn-sm btn-remove-person" data-id="${p.id}">Dzēst</button>
            </td>
          </tr>`;
          })
          .join("");
      }
    }

    const selAll = $("#people-select-all");
    if (selAll) selAll.checked = false;
    updateDeleteSelectedBtn();
  }

  function updateDeleteSelectedBtn() {
    const btn = $("#btn-delete-selected");
    if (!btn) return;
    const n = document.querySelectorAll(".person-select:checked").length;
    btn.disabled = n === 0;
    btn.textContent = n ? `Dzēst atzīmētos (${n})` : "Dzēst atzīmētos";
  }

  function deleteSelectedPeople() {
    const ids = [...document.querySelectorAll(".person-select:checked")].map(
      (el) => el.dataset.id
    );
    if (!ids.length) return;
    if (!confirm(`Dzēst ${ids.length} dalībniekus?`)) return;
    const names = [];
    for (const id of ids) {
      const p = peopleCache.find((x) => x.id === id);
      if (p) names.push(p.name);
      peopleCache = peopleCache.filter((x) => x.id !== id);
      for (const t of teamsCache) {
        t.captainIds = (t.captainIds || []).filter((cid) => cid !== id);
        t.participantIds = (t.participantIds || []).filter((cid) => cid !== id);
        if (t.numberSlots) {
          for (const s of t.numberSlots) {
            if (s.personId === id) s.personId = null;
          }
        }
      }
    }
    addLog("remove_person", `masveida: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""} (${ids.length})`);
    scheduleSave();
    renderAll();
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

  // ---------- Import ----------
  function normalizeClassKey(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/\u00a0/g, " ").trim().toLowerCase();
    s = s.replace(/\s+/g, "").replace(/\.+$/, "");
    if (!s) return null;
    // "2" → 2.a ; "3a" / "3.a" / "3. a" → 3.a
    const m = s.match(/^([2-4])[\.\s]*([abc])?$/i);
    if (m) {
      const grade = parseInt(m[1], 10);
      const letter = (m[2] || "a").toLowerCase();
      return { grade, letter };
    }
    return null;
  }

  function cleanName(raw) {
    if (raw == null) return "";
    return String(raw)
      .replace(/\u00a0/g, " ")
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Parse dual-column class-header layout (like last year's xlsx). */
  function parseDualColumnSheet(rows) {
    const out = [];
    function walk(hCol, nCol) {
      let cur = null;
      for (const row of rows) {
        const h = row[hCol];
        const n = row[nCol];
        if (h != null && String(h).trim()) {
          cur = normalizeClassKey(h);
        }
        const name = cleanName(n);
        if (name && cur) {
          out.push({ name, grade: cur.grade, letter: cur.letter });
        }
      }
    }
    walk(0, 1);
    if (rows[0] && rows[0].length >= 4) walk(2, 3);
    return out;
  }

  /** Parse simple table: Class + Name columns (any order). */
  function parseSimpleTable(rows) {
    if (!rows.length) return [];
    const header = rows[0].map((c) =>
      String(c == null ? "" : c)
        .toLowerCase()
        .trim()
    );
    let classIdx = header.findIndex((h) =>
      /klase|class|grade|класс/.test(h)
    );
    let nameIdx = header.findIndex((h) =>
      /vārds|vards|name|имя|fio|uzvārds/.test(h)
    );
    let start = 1;
    if (classIdx < 0 || nameIdx < 0) {
      // no header — assume name, class or class, name
      classIdx = -1;
      nameIdx = -1;
      start = 0;
      const sample = rows.slice(0, 5);
      for (const r of sample) {
        if (!r) continue;
        if (normalizeClassKey(r[0]) && cleanName(r[1])) {
          classIdx = 0;
          nameIdx = 1;
          break;
        }
        if (normalizeClassKey(r[1]) && cleanName(r[0])) {
          classIdx = 1;
          nameIdx = 0;
          break;
        }
      }
      if (classIdx < 0) return [];
    }
    const out = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const cls = normalizeClassKey(r[classIdx]);
      const name = cleanName(r[nameIdx]);
      if (cls && name) out.push({ name, grade: cls.grade, letter: cls.letter });
    }
    return out;
  }

  function detectAndParseRows(rows) {
    if (!rows || !rows.length) return [];
    // Heuristic: dual-column if first cell looks like class and col2 is name, and col3 also class-ish
    const dual = parseDualColumnSheet(rows);
    const simple = parseSimpleTable(rows);
    // Prefer dual if it found more names (typical for school file)
    if (dual.length >= simple.length && dual.length > 0) return dual;
    return simple;
  }

  async function handleImportFile(file) {
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    let rows = [];
    try {
      if (name.endsWith(".csv") || name.endsWith(".txt")) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const delim = lines[0].includes(";") ? ";" : ",";
        rows = lines.map((l) => l.split(delim).map((c) => c.trim()));
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        if (typeof XLSX === "undefined") {
          alert("XLSX bibliotēka nav ielādēta. Mēģiniet CSV.");
          return;
        }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      } else {
        alert("Neatbalstīts fails. Izmantojiet .xlsx vai .csv");
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Neizdevās nolasīt failu: " + err.message);
      return;
    }

    const parsed = detectAndParseRows(rows);
    if (!parsed.length) {
      alert("Failā neatradu nevienu dalībnieku. Pārbaudiet formātu.");
      return;
    }

    // Merge: skip exact name+class duplicates
    const existing = new Set(
      peopleCache
        .filter((p) => p.type === "participant")
        .map((p) => `${(p.name || "").toLowerCase()}|${p.grade}|${p.letter}`)
    );
    let added = 0;
    for (const row of parsed) {
      const key = `${row.name.toLowerCase()}|${row.grade}|${row.letter}`;
      if (existing.has(key)) continue;
      existing.add(key);
      peopleCache.push({
        id: uid("p"),
        name: row.name,
        type: "participant",
        grade: row.grade,
        letter: row.letter,
        teamId: null,
        isDestructor: false,
        number: null,
      });
      added++;
    }
    addLog("import_people", `+${added} (fails: ${file.name}, atrasti ${parsed.length})`);
    scheduleSave();
    renderAll();
    alert(`Importēts: ${added} jauni dalībnieki (failā atrasti ${parsed.length}).`);
  }

  // ---------- Numbers / distribution ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function participantsOnly() {
    return peopleCache.filter((p) => p.type === "participant");
  }

  function classKey(p) {
    return `${p.grade}.${p.letter || "a"}`;
  }

  function formatNumber(scheme, grade, letter, index1) {
    const L = (letter || "a").toUpperCase();
    const n = String(index1).padStart(2, "0");
    if (scheme === "legacy") {
      // Different starting digit per class key for visual distinction
      const order = ["2.a", "2.b", "2.c", "3.a", "3.b", "3.c", "4.a", "4.b", "4.c"];
      const idx = Math.max(0, order.indexOf(`${grade}.${(letter || "a").toLowerCase()}`));
      return `${idx}${n}`;
    }
    return `${grade}${L}${n}`;
  }

  /**
   * Full number pipeline:
   * 1. Build numbers per class matching participant counts
   * 2. Assign destructor numbers to destructor people (same class)
   * 3. Distribute all numbers to teams: balance by class + destructors; remainder random
   * 4. Non-destructor numbers sit on teams as slots; destructor numbers also linked to people
   */
  function runNumberDistribution() {
    const parts = participantsOnly();
    const teams = [...teamsCache].sort((a, b) => (a.number || 0) - (b.number || 0));
    if (!parts.length) {
      alert("Nav dalībnieku.");
      return;
    }
    if (!teams.length) {
      alert("Vispirms izveidojiet komandas.");
      return;
    }

    const scheme =
      ($("#number-scheme") && $("#number-scheme").value) ||
      settingsCache.numberScheme ||
      "prefix";
    settingsCache.numberScheme = scheme === "legacy" ? "legacy" : "prefix";
    settingsCache.phase = "numbers";

    // Reset numbers / team assignment for participants only
    for (const p of parts) {
      p.number = null;
      p.teamId = null;
    }
    for (const t of teams) {
      t.numberSlots = [];
      t.participantIds = [];
    }

    // Group by class
    const byClass = {};
    for (const p of parts) {
      const k = classKey(p);
      if (!byClass[k]) byClass[k] = [];
      byClass[k].push(p);
    }

    // Generate numbers per class and assign destructor numbers
    /** @type {{ code: string, classKey: string, isDestructor: boolean, personId: string|null }[]} */
    const allNumbers = [];

    for (const [ck, list] of Object.entries(byClass)) {
      const [gStr, letStr] = ck.split(".");
      const grade = parseInt(gStr, 10);
      const letter = letStr || "a";
      const codes = [];
      for (let i = 1; i <= list.length; i++) {
        codes.push(formatNumber(scheme, grade, letter, i));
      }
      const shuffledCodes = shuffle(codes);
      const destructors = shuffle(list.filter((p) => p.isDestructor));
      const normal = shuffle(list.filter((p) => !p.isDestructor));

      // Assign destructor numbers to destructor people
      for (let i = 0; i < destructors.length; i++) {
        const code = shuffledCodes[i];
        destructors[i].number = code;
        allNumbers.push({
          code,
          classKey: ck,
          isDestructor: true,
          personId: destructors[i].id,
        });
      }
      // Remaining codes for non-destructors (not yet linked to people)
      for (let i = destructors.length; i < shuffledCodes.length; i++) {
        allNumbers.push({
          code: shuffledCodes[i],
          classKey: ck,
          isDestructor: false,
          personId: null,
        });
      }
      // Keep normal people without numbers until phase 2
      void normal;
    }

    // --- Distribute numbers to teams ---
    // Priority 1: equal destructors across teams
    // Priority 2: balanced classes
    // Priority 3: similar total size
    const teamBags = teams.map((t) => ({
      team: t,
      slots: [],
      classCounts: {},
      destrCount: 0,
    }));

    function pickBagFor(num) {
      teamBags.sort((a, b) => {
        // Destructor numbers: equalize destr count first
        if (num.isDestructor) {
          if (a.destrCount !== b.destrCount) return a.destrCount - b.destrCount;
        }
        // For everyone (incl. after destr placed): class balance, then total size
        // Do NOT keep sorting by destrCount for normal numbers — that starves
        // teams that already received an extra destructor.
        const ca = a.classCounts[num.classKey] || 0;
        const cb = b.classCounts[num.classKey] || 0;
        if (ca !== cb) return ca - cb;
        if (a.slots.length !== b.slots.length) return a.slots.length - b.slots.length;
        return Math.random() - 0.5;
      });
      return teamBags[0];
    }

    // First place all destructor numbers (even spread)
    const destrNums = shuffle(allNumbers.filter((n) => n.isDestructor));
    const normalNums = shuffle(allNumbers.filter((n) => !n.isDestructor));
    for (const num of destrNums) {
      const bag = pickBagFor(num);
      bag.slots.push(num);
      bag.classCounts[num.classKey] = (bag.classCounts[num.classKey] || 0) + 1;
      bag.destrCount++;
    }
    // Then place the rest
    for (const num of normalNums) {
      const bag = pickBagFor(num);
      bag.slots.push(num);
      bag.classCounts[num.classKey] = (bag.classCounts[num.classKey] || 0) + 1;
    }

    // Write back to teams + link destructor people to teams
    for (const bag of teamBags) {
      bag.team.numberSlots = bag.slots.map((s) => ({
        code: s.code,
        classKey: s.classKey,
        isDestructor: s.isDestructor,
        personId: s.personId,
      }));
      for (const s of bag.slots) {
        if (s.personId) {
          const p = peopleCache.find((x) => x.id === s.personId);
          if (p) p.teamId = bag.team.id;
        }
      }
    }

    addLog(
      "generate_numbers",
      `x=${parts.length}, n=${parts.filter((p) => p.isDestructor).length}, y=${teams.length}, scheme=${scheme}`
    );
    scheduleSave();
    // Stay on / refresh distribution board so numbers are visible immediately
    switchTab("tab-distribute");
    renderAll();
  }

  function moveNumberToTeam(code, fromTeamId, toTeamId) {
    if (!code || !fromTeamId || !toTeamId || fromTeamId === toTeamId) return;
    const from = teamsCache.find((t) => t.id === fromTeamId);
    const to = teamsCache.find((t) => t.id === toTeamId);
    if (!from || !to) return;
    const slots = from.numberSlots || [];
    const idx = slots.findIndex((s) => String(s.code) === String(code));
    if (idx < 0) return;
    const [slot] = slots.splice(idx, 1);
    from.numberSlots = slots;
    if (!to.numberSlots) to.numberSlots = [];
    to.numberSlots.push(slot);
    if (slot.personId) {
      const p = peopleCache.find((x) => x.id === slot.personId);
      if (p) p.teamId = to.id;
    }
    addLog("edit_team", `numurs ${code}: ${teamLabel(from)} → ${teamLabel(to)}`);
    scheduleSave();
    renderDistribute();
    renderPeople();
  }

  function clearNumbers() {
    if (!confirm("Notīrīt visus numurus un numuru piesaisti komandām?")) return;
    for (const p of peopleCache) {
      if (p.type === "participant") {
        p.number = null;
        // keep teamId if in names phase? clearing numbers only
      }
    }
    for (const t of teamsCache) {
      t.numberSlots = [];
    }
    addLog("clear_numbers", "");
    scheduleSave();
    renderAll();
  }

  function setPhase(phase) {
    const next = phase === "names" ? "names" : "numbers";
    if (settingsCache.phase === next) {
      updatePhaseUI();
      return;
    }
    settingsCache.phase = next;
    addLog(next === "names" ? "phase_names" : "generate_numbers", "posms: " + next);
    scheduleSave();
    updatePhaseUI();
    renderDistribute();
  }

  function updatePhaseUI() {
    const isNames = settingsCache.phase === "names";
    const bNum = $("#btn-phase-numbers");
    const bNam = $("#btn-phase-names");
    if (bNum) {
      bNum.classList.toggle("btn-secondary", !isNames);
      bNum.classList.toggle("btn-outline-secondary", isNames);
      bNum.classList.toggle("active", !isNames);
    }
    if (bNam) {
      bNam.classList.toggle("btn-primary", isNames);
      bNam.classList.toggle("btn-outline-primary", !isNames);
      bNam.classList.toggle("active", isNames);
    }
    const phaseLabel = $("#phase-label");
    if (phaseLabel) {
      phaseLabel.textContent = isNames
        ? "Pašreiz: 2. posms — kapitānu lapa ir atvērta (captain.html)"
        : "Pašreiz: 1. posms — numuri (kapitānu lapa slēgta)";
    }
  }

  function renderDistribute() {
    const parts = participantsOnly();
    const x = parts.length;
    const n = parts.filter((p) => p.isDestructor).length;
    const y = teamsCache.length;
    const elX = $("#dist-x");
    const elN = $("#dist-n");
    const elY = $("#dist-y");
    if (elX) elX.textContent = String(x);
    if (elN) elN.textContent = String(n);
    if (elY) elY.textContent = String(y);

    const byClass = {};
    for (const p of parts) {
      const k = classKey(p);
      byClass[k] = (byClass[k] || 0) + 1;
    }
    const bc = $("#dist-by-class");
    if (bc) {
      bc.textContent = Object.keys(byClass)
        .sort()
        .map((k) => `${k}: ${byClass[k]}`)
        .join(" · ");
    }
    const pt = $("#dist-per-team");
    if (pt) {
      if (y > 0 && x > 0) {
        const base = Math.floor(x / y);
        const rem = x % y;
        const dBase = Math.floor(n / y);
        const dRem = n % y;
        pt.innerHTML = `~${base}${rem ? `–${base + 1}` : ""} bērni/komanda` +
          (n
            ? `; destr.: ~${dBase}${dRem ? `–${dBase + 1}` : ""}`
            : "");
      } else pt.textContent = "—";
    }

    const schemeSel = $("#number-scheme");
    if (schemeSel) schemeSel.value = settingsCache.numberScheme || "prefix";
    updatePhaseUI();

    const board = $("#dist-teams-board");
    const empty = $("#dist-empty");
    if (!board) return;

    if (!teamsCache.length) {
      board.innerHTML = "";
      if (empty) empty.classList.remove("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");

    const sorted = [...teamsCache].sort((a, b) => (a.number || 0) - (b.number || 0));
    const isNames = settingsCache.phase === "names";

    board.innerHTML = sorted
      .map((t) => {
        const slots = Array.isArray(t.numberSlots) ? t.numberSlots : [];
        const captains = (t.captainIds || [])
          .map((id) => peopleCache.find((p) => p.id === id))
          .filter(Boolean);
        const members = peopleCache.filter(
          (p) => p.type === "participant" && p.teamId === t.id
        );
        const destrSlots = slots.filter((s) => s.isDestructor).length;

        // Per-class counts from number slots (works in numbers phase)
        const classCounts = {};
        for (const s of slots) {
          const ck = classKeyFromSlot(s);
          if (ck) classCounts[ck] = (classCounts[ck] || 0) + 1;
        }
        const classSummary = Object.keys(classCounts)
          .sort()
          .map((k) => `${k}: ${classCounts[k]}`)
          .join(" · ");

        let body = "";

        // Always show class breakdown when there are slots
        if (slots.length) {
          body += `<p class="small mb-1"><strong>Pa klasēm:</strong> ${
            classSummary || "—"
          }</p>`;
          body += `<p class="small text-muted mb-1">Kopā: ${slots.length}${
            destrSlots ? ` · destruktors: ${destrSlots}` : ""
          }</p>`;
        }

        // Numbers — always visible when slots exist (both phases)
        body += `<div class="mb-2"><span class="small text-muted">Numuri</span>`;
        if (slots.length) {
          const ordered = [...slots].sort((a, b) =>
            String(a.code).localeCompare(String(b.code), "lv")
          );
          const teamOpts = sorted
            .filter((tt) => tt.id !== t.id)
            .map(
              (tt) =>
                `<option value="${tt.id}">→ ${escapeHtml(teamLabel(tt))}</option>`
            )
            .join("");
          body += `<div class="d-flex flex-wrap align-items-center gap-1 mt-1">`;
          body += ordered
            .map((s) => {
              const person = s.personId
                ? peopleCache.find((p) => p.id === s.personId)
                : null;
              const title = person
                ? escapeHtml(person.name)
                : s.isDestructor
                ? "destruktors"
                : "";
              return `<span class="num-chip ${
                s.isDestructor ? "destructor" : ""
              }" title="${title}"><span>${escapeHtml(s.code)}${
                person ? " ★" : ""
              }</span>
                <select class="form-select form-select-sm num-move-select" data-code="${escapeHtml(
                  String(s.code)
                )}" data-from="${t.id}" aria-label="Pārvietot numuru" style="width:auto;max-width:6.5rem;font-size:0.7rem;padding:0 0.2rem;height:1.35rem;display:inline-block;margin-left:0.15rem">
                  <option value="">↕</option>
                  ${teamOpts}
                </select>
              </span>`;
            })
            .join("");
          body += `</div>`;
        } else {
          body += `<div class="small text-muted">nav numuru — palaidiet ģenerēšanu</div>`;
        }
        body += `</div>`;

        // Names list only in names phase
        if (isNames) {
          body += `<div class="small border-top pt-2 mt-1"><span class="text-muted">Dalībnieki (${members.length})</span>`;
          if (members.length) {
            body += `<ul class="mb-0 ps-3">`;
            body += members
              .map(
                (p) =>
                  `<li>${escapeHtml(p.name)} <span class="text-muted">(${classLabel(
                    p
                  )})</span>${
                    p.isDestructor
                      ? ' <span class="text-danger">★</span>'
                      : ""
                  }${
                    p.number ? ` <code>${escapeHtml(p.number)}</code>` : ""
                  }</li>`
              )
              .join("");
            body += `</ul>`;
          } else {
            body += `<div class="text-muted">vēl nav piešķirtu vārdu</div>`;
          }
          body += `</div>`;
        }

        return `<div class="col-md-6 col-lg-4">
          <div class="card team-card h-100 shadow-sm">
            <div class="card-body">
              <h3 class="h6 mb-1">${escapeHtml(teamLabel(t))}</h3>
              <p class="small text-muted mb-2">Kapitāni: ${
                captains.length
                  ? captains.map((c) => escapeHtml(c.name)).join(", ")
                  : "—"
              }</p>
              ${body}
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  /** Infer class key from a number slot (prefix scheme 2A01 → 2.a; legacy 001 → unknown). */
  function classKeyFromSlot(slot) {
    if (!slot) return null;
    if (slot.personId) {
      const p = peopleCache.find((x) => x.id === slot.personId);
      if (p && p.type === "participant") return classKey(p);
    }
    if (slot.classKey) return slot.classKey;
    const code = String(slot.code || "");
    // prefix: 2A01, 3B12
    const m = code.match(/^([2-4])([ABC])(\d{2})$/i);
    if (m) return `${m[1]}.${m[2].toLowerCase()}`;
    return null;
  }

  // ---------- Carousel ----------
  function parseTimeToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== "string") return null;
    const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  function minutesToTime(total) {
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function normalizeStation(s) {
    if (!s || typeof s !== "object") return { room: "", organizerIds: [] };
    let ids = [];
    if (Array.isArray(s.organizerIds)) {
      ids = s.organizerIds.map(String).filter(Boolean);
    } else if (s.organizerId) {
      ids = [String(s.organizerId)];
    }
    return {
      room: s.room != null ? String(s.room) : "",
      organizerIds: ids,
    };
  }

  /** Ensure stations array length matches team count; preserve existing room/organizers. */
  function syncCarouselStations() {
    const y = teamsCache.length;
    const prev = Array.isArray(carouselCache.stations)
      ? carouselCache.stations.map(normalizeStation)
      : [];
    const next = [];
    for (let i = 0; i < y; i++) {
      next.push(
        prev[i]
          ? normalizeStation(prev[i])
          : { room: "", organizerIds: [] }
      );
    }
    carouselCache.stations = next;
  }

  function normalizeTimeInput(val) {
    if (!val) return null;
    let s = String(val).trim().replace(/\./g, ":");
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  /**
   * Build schedule rows.
   * slotMin = floor((end-start) / y)
   * stationMin = slotMin - transitionMin
   * Station i starts at start + i*slotMin, ends at start + stationMin
   * Transition row after each station except the last.
   */
  function buildCarouselSchedule() {
    const y = teamsCache.length;
    const startM = parseTimeToMinutes(carouselCache.startTime);
    const endM = parseTimeToMinutes(carouselCache.endTime);
    const trans = Math.max(0, parseInt(carouselCache.transitionMin, 10) || 0);

    if (!y || startM == null || endM == null || endM <= startM) {
      return { ok: false, rows: [], slotMin: 0, stationMin: 0, totalMin: 0 };
    }

    const totalMin = endM - startM;
    const slotMin = Math.floor(totalMin / y);
    const stationMin = Math.max(0, slotMin - trans);

    if (slotMin <= 0) {
      return { ok: false, rows: [], slotMin: 0, stationMin: 0, totalMin };
    }

    const rows = [];
    for (let i = 0; i < y; i++) {
      const sStart = startM + i * slotMin;
      const sEnd = sStart + stationMin;
      rows.push({
        type: "station",
        index: i + 1,
        start: minutesToTime(sStart),
        end: minutesToTime(sEnd),
        minutes: stationMin,
      });
      if (i < y - 1 && trans > 0) {
        rows.push({
          type: "transition",
          index: null,
          start: minutesToTime(sEnd),
          end: minutesToTime(sEnd + trans),
          minutes: trans,
        });
      }
    }
    return { ok: true, rows, slotMin, stationMin, totalMin, y };
  }

  function readCarouselForm() {
    const startEl = $("#car-start");
    const endEl = $("#car-end");
    const transEl = $("#car-transition");
    if (startEl) {
      const n = normalizeTimeInput(startEl.value);
      if (n) {
        carouselCache.startTime = n;
        startEl.value = n;
      }
    }
    if (endEl) {
      const n = normalizeTimeInput(endEl.value);
      if (n) {
        carouselCache.endTime = n;
        endEl.value = n;
      }
    }
    if (transEl) {
      const v = parseInt(transEl.value, 10);
      carouselCache.transitionMin = isNaN(v) ? 0 : Math.max(0, v);
    }
  }

  function renderCarousel() {
    syncCarouselStations();

    const startEl = $("#car-start");
    const endEl = $("#car-end");
    const transEl = $("#car-transition");
    if (startEl) startEl.value = carouselCache.startTime || "11:45";
    if (endEl) endEl.value = carouselCache.endTime || "13:25";
    if (transEl) transEl.value = String(carouselCache.transitionMin ?? 2);

    const sched = buildCarouselSchedule();
    const summary = $("#car-summary");
    if (summary) {
      if (!teamsCache.length) {
        summary.textContent = "Komandu skaits: 0";
      } else if (!sched.ok) {
        summary.innerHTML =
          '<span class="text-danger">Pārbaudiet laikus (beigas > sākums).</span>';
      } else {
        const th = Math.floor(sched.totalMin / 60);
        const tm = sched.totalMin % 60;
        summary.innerHTML =
          `<strong>${sched.y}</strong> stacijas · kopā ${th}h ${tm}min · ` +
          `slots <strong>${sched.slotMin} min</strong> · ` +
          `stacija <strong>${sched.stationMin} min</strong> · ` +
          `pāreja ${carouselCache.transitionMin} min`;
      }
    }

    const tbody = $("#car-schedule-tbody");
    if (tbody) {
      if (!sched.ok || !sched.rows.length) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="text-muted text-center">' +
          (teamsCache.length
            ? "Neizdevās aprēķināt — pārbaudiet laikus."
            : "Nav komandu — izveidojiet tās vispirms.") +
          "</td></tr>";
      } else {
        tbody.innerHTML = sched.rows
          .map((r) => {
            if (r.type === "transition") {
              return `<tr class="table-secondary">
                <td class="text-muted small">Pāreja</td>
                <td>${escapeHtml(r.start)}</td>
                <td>${escapeHtml(r.end)}</td>
                <td>${r.minutes}</td>
              </tr>`;
            }
            return `<tr>
              <td><strong>${r.index}</strong></td>
              <td>${escapeHtml(r.start)}</td>
              <td>${escapeHtml(r.end)}</td>
              <td>${r.minutes}</td>
            </tr>`;
          })
          .join("");
      }
    }

    const stBody = $("#car-stations-tbody");
    if (stBody) {
      if (!carouselCache.stations.length) {
        stBody.innerHTML =
          '<tr><td colspan="3" class="text-muted text-center">Nav staciju.</td></tr>';
      } else {
        const orgOpts = usersCache
          .map((u) => {
            const label =
              (u.name || u.username || u.id) +
              (u.role === "helper" ? " (palīgs)" : "");
            return { id: u.id, label };
          })
          .sort((a, b) => a.label.localeCompare(b.label, "lv"));

        stBody.innerHTML = carouselCache.stations
          .map((s, i) => {
            const selected = new Set(s.organizerIds || []);
            const opts = orgOpts
              .map(
                (o) =>
                  `<option value="${escapeHtml(o.id)}" ${
                    selected.has(o.id) ? "selected" : ""
                  }>${escapeHtml(o.label)}</option>`
              )
              .join("");
            const size = Math.min(6, Math.max(3, orgOpts.length || 3));
            return `<tr>
              <td><strong>${i + 1}</strong></td>
              <td><input type="text" class="form-control form-control-sm car-room" data-idx="${i}" value="${escapeHtml(
              s.room || ""
            )}" placeholder="Piem. 201"></td>
              <td>
                <select class="form-select form-select-sm car-org" data-idx="${i}" multiple size="${size}">
                  ${opts}
                </select>
              </td>
            </tr>`;
          })
          .join("");
      }
    }

    renderCarouselRoutes(sched);
  }

  /** Team routes: team t at period p → station (t + p) % n */
  function renderCarouselRoutes(sched) {
    const thead = $("#car-routes-thead");
    const tbody = $("#car-routes-tbody");
    if (!thead || !tbody) return;

    const y = teamsCache.length;
    if (!y || !sched || !sched.ok) {
      thead.innerHTML = "";
      tbody.innerHTML =
        '<tr><td class="text-muted text-center">Nav datu maršrutiem.</td></tr>';
      return;
    }

    const teams = [...teamsCache].sort(
      (a, b) => (a.number || 0) - (b.number || 0)
    );
    const stationRows = (sched.rows || []).filter((r) => r.type === "station");

    // Header: Komanda | 1. posms (11:45–11:52) | 2. posms | ...
    let head =
      "<tr><th>Komanda</th>";
    for (let p = 0; p < y; p++) {
      const sr = stationRows[p];
      const timeLabel = sr
        ? `${sr.start}–${sr.end}`
        : `posms ${p + 1}`;
      head += `<th class="text-center small">#${p + 1}<br><span class="text-muted fw-normal">${escapeHtml(
        timeLabel
      )}</span></th>`;
    }
    head += "<th>Maršruts</th></tr>";
    thead.innerHTML = head;

    tbody.innerHTML = teams
      .map((team, tIdx) => {
        const cells = [];
        const routeRooms = [];
        for (let p = 0; p < y; p++) {
          const stIdx = (tIdx + p) % y;
          const st = carouselCache.stations[stIdx] || {};
          const room = (st.room || "").trim() || `st. ${stIdx + 1}`;
          routeRooms.push(room);
          cells.push(
            `<td class="text-center"><strong>${escapeHtml(room)}</strong><div class="text-muted small">st. ${
              stIdx + 1
            }</div></td>`
          );
        }
        return `<tr>
          <td class="text-nowrap"><strong>${escapeHtml(teamLabel(team))}</strong></td>
          ${cells.join("")}
          <td class="small text-nowrap">${routeRooms
            .map((r) => escapeHtml(r))
            .join(" → ")}</td>
        </tr>`;
      })
      .join("");
  }

  function saveCarouselFromForm() {
    readCarouselForm();
    syncCarouselStations();
    document.querySelectorAll(".car-room").forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      if (!isNaN(idx) && carouselCache.stations[idx]) {
        carouselCache.stations[idx].room = (el.value || "").trim();
      }
    });
    document.querySelectorAll(".car-org").forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      if (!isNaN(idx) && carouselCache.stations[idx]) {
        const selected = [...el.selectedOptions].map((o) => o.value).filter(Boolean);
        carouselCache.stations[idx].organizerIds = selected;
      }
    });
    addLog("edit_team", "karuselis saglabāts");
    scheduleSave();
    renderCarousel();
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
  function updatePersonFormByType() {
    const type = $("#person-type").value || "participant";
    const classFields = $("#person-class-fields");
    const teamGroup = $("#person-team-group");
    const teamHint = $("#person-team-hint");
    if (type === "captain") {
      if (classFields) classFields.classList.add("d-none");
      // Captains are assigned via team edit (exactly 2); hide free team picker or keep for convenience
      if (teamHint) teamHint.classList.remove("d-none");
    } else {
      if (classFields) classFields.classList.remove("d-none");
      if (teamHint) teamHint.classList.add("d-none");
    }
  }

  function openPersonModal(person) {
    $("#modal-person-title").textContent = person ? "Labot personu" : "Pievienot personu";
    $("#person-edit-id").value = person ? person.id : "";
    $("#person-name").value = person ? person.name : "";
    $("#person-type").value = person ? person.type : "participant";
    $("#person-grade").value = person && person.grade != null ? String(person.grade) : "3";
    $("#person-letter").value = person && person.letter ? person.letter : "a";
    fillTeamSelect($("#person-team"), person ? person.teamId : "");
    updatePersonFormByType();
    bootstrap.Modal.getOrCreateInstance($("#modal-person")).show();
  }

  function savePerson() {
    const id = $("#person-edit-id").value;
    const name = ($("#person-name").value || "").trim();
    const type = $("#person-type").value || "participant";
    const teamId = $("#person-team").value || null;
    let grade = null;
    let letter = null;

    if (!name) {
      alert("Ievadiet vārdu.");
      return;
    }

    if (type === "participant") {
      grade = parseInt($("#person-grade").value, 10) || 3;
      letter = ($("#person-letter").value || "a").toLowerCase();
      if (!["a", "b", "c"].includes(letter)) letter = "a";
    }

    // If assigning a captain to a team that already has 2, block
    if (type === "captain" && teamId) {
      const team = teamsCache.find((t) => t.id === teamId);
      if (team) {
        const existing = (team.captainIds || []).filter((cid) => cid !== id);
        if (existing.length >= 2) {
          alert("Šai komandai jau ir 2 kapitāni. Izvēlieties citu komandu vai mainiet kapitānus komandas rediģēšanā.");
          return;
        }
      }
    }

    if (id) {
      const p = peopleCache.find((x) => x.id === id);
      if (!p) return;
      const wasCaptain = p.type === "captain";
      p.name = name;
      p.type = type;
      p.grade = grade;
      p.letter = letter;
      p.teamId = teamId;
      if (type === "captain") {
        p.grade = null;
        p.letter = null;
        p.isDestructor = false;
        p.number = null;
      }
      // If changed from captain to participant, remove from captainIds
      if (wasCaptain && type !== "captain") {
        for (const t of teamsCache) {
          t.captainIds = (t.captainIds || []).filter((cid) => cid !== p.id);
        }
      }
      syncPersonToTeams(p);
      addLog("edit_person", name);
    } else {
      const p = {
        id: uid("p"),
        name,
        type,
        grade,
        letter,
        teamId,
        isDestructor: false,
        number: null,
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
  function fillCaptainSelects(team) {
    const sel1 = $("#team-captain1");
    const sel2 = $("#team-captain2");
    const currentIds = team ? (team.captainIds || []).slice() : [];
    const c1 = currentIds[0] || "";
    const c2 = currentIds[1] || "";
    const captains = peopleCache.filter((p) => p.type === "captain");

    function fillOne(sel, selectedId) {
      sel.innerHTML = '<option value="">— Izvēlēties —</option>';
      for (const p of captains) {
        const onTeamId = p.teamId || getPersonTeamId(p.id);
        const opt = document.createElement("option");
        opt.value = p.id;
        let label = p.name;
        if (onTeamId && team && onTeamId === team.id) {
          label += " (šī komanda)";
        } else if (onTeamId) {
          const other = teamsCache.find((t) => t.id === onTeamId);
          label += other ? ` (${teamLabel(other)})` : " (cita komanda)";
        } else {
          label += " (brīvs)";
        }
        opt.textContent = label;
        if (p.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
      }
    }

    fillOne(sel1, c1);
    fillOne(sel2, c2);
  }

  function openTeamModal(team) {
    $("#modal-team-title").textContent = team ? "Rediģēt komandu" : "Jauna komanda";
    $("#team-edit-id").value = team ? team.id : "";
    $("#team-number").value = team ? team.number : nextTeamNumber();
    $("#team-name").value = team ? team.name || "" : "";
    fillMentorSelect($("#team-mentor"), team ? team.mentorId : "");
    fillCaptainSelects(team || null);
    const err = $("#team-captain-error");
    if (err) {
      err.classList.add("d-none");
      err.textContent = "";
    }
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
    const cap1 = $("#team-captain1").value || "";
    const cap2 = $("#team-captain2").value || "";
    const err = $("#team-captain-error");

    if (!cap1 || !cap2) {
      if (err) {
        err.textContent = "Jāizvēlas abi kapitāni (2).";
        err.classList.remove("d-none");
      } else {
        alert("Jāizvēlas abi kapitāni (2).");
      }
      return;
    }
    if (cap1 === cap2) {
      if (err) {
        err.textContent = "Kapitāniem jābūt diviem dažādiem cilvēkiem.";
        err.classList.remove("d-none");
      } else {
        alert("Kapitāniem jābūt diviem dažādiem cilvēkiem.");
      }
      return;
    }

    // Validate both are captains
    for (const cid of [cap1, cap2]) {
      const p = peopleCache.find((x) => x.id === cid);
      if (!p || p.type !== "captain") {
        if (err) {
          err.textContent = "Izvēlētajai personai jābūt kapitānam. Vispirms pievienojiet kapitānus sadaļā «Dalībnieki».";
          err.classList.remove("d-none");
        }
        return;
      }
    }

    if (id) {
      const t = teamsCache.find((x) => x.id === id);
      if (!t) return;
      t.number = number;
      t.name = name;
      t.mentorId = mentorId;
      setTeamCaptains(t, cap1, cap2);
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
      setTeamCaptains(t, cap1, cap2);
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

    $("#btn-add-person").addEventListener("click", () => {
      openPersonModal(null);
      const typeSel = $("#person-type");
      if (typeSel) {
        typeSel.value = "participant";
        updatePersonFormByType();
      }
    });
    if ($("#btn-add-captain")) {
      $("#btn-add-captain").addEventListener("click", () => {
        openPersonModal(null);
        const typeSel = $("#person-type");
        if (typeSel) {
          typeSel.value = "captain";
          updatePersonFormByType();
        }
      });
    }
    $("#btn-person-save").addEventListener("click", savePerson);
    $("#people-search").addEventListener("input", renderPeople);
    if ($("#people-sort")) {
      $("#people-sort").addEventListener("change", renderPeople);
    }
    if ($("#person-type")) {
      $("#person-type").addEventListener("change", updatePersonFormByType);
    }
    if ($("#btn-delete-selected")) {
      $("#btn-delete-selected").addEventListener("click", deleteSelectedPeople);
    }
    if ($("#people-select-all")) {
      $("#people-select-all").addEventListener("change", (e) => {
        document.querySelectorAll(".person-select").forEach((cb) => {
          cb.checked = e.target.checked;
        });
        updateDeleteSelectedBtn();
      });
    }
    if ($("#btn-import-people")) {
      $("#btn-import-people").addEventListener("click", () => {
        const inp = $("#import-file-input");
        if (inp) inp.click();
      });
    }
    if ($("#import-file-input")) {
      $("#import-file-input").addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (f) await handleImportFile(f);
      });
    }
    if ($("#btn-run-numbers")) {
      $("#btn-run-numbers").addEventListener("click", () => {
        if (
          !confirm(
            "Ģenerēt un sadalīt numurus? Esošie numuri tiks pārrakstīti."
          )
        )
          return;
        runNumberDistribution();
      });
    }
    if ($("#btn-clear-numbers")) {
      $("#btn-clear-numbers").addEventListener("click", clearNumbers);
    }
    if ($("#btn-phase-numbers")) {
      $("#btn-phase-numbers").addEventListener("click", () => setPhase("numbers"));
    }
    if ($("#btn-phase-names")) {
      $("#btn-phase-names").addEventListener("click", () => setPhase("names"));
    }
    if ($("#btn-car-recalc")) {
      $("#btn-car-recalc").addEventListener("click", () => {
        readCarouselForm();
        renderCarousel();
      });
    }
    if ($("#btn-car-save")) {
      $("#btn-car-save").addEventListener("click", saveCarouselFromForm);
    }
    // Live recalc on time/transition change
    ["car-start", "car-end", "car-transition"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => {
          readCarouselForm();
          renderCarousel();
          scheduleSave();
        });
      }
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || !t.classList) return;
      if (t.classList.contains("car-room") || t.classList.contains("car-org")) {
        const idx = parseInt(t.dataset.idx, 10);
        if (isNaN(idx) || !carouselCache.stations[idx]) return;
        if (t.classList.contains("car-room")) {
          carouselCache.stations[idx].room = (t.value || "").trim();
          renderCarouselRoutes(buildCarouselSchedule());
        } else {
          carouselCache.stations[idx].organizerIds = [
            ...t.selectedOptions,
          ]
            .map((o) => o.value)
            .filter(Boolean);
        }
        scheduleSave();
      }
    });
    if ($("#number-scheme")) {
      $("#number-scheme").addEventListener("change", () => {
        settingsCache.numberScheme =
          $("#number-scheme").value === "legacy" ? "legacy" : "prefix";
        scheduleSave();
      });
    }

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

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || !t.classList) return;
      if (t.classList.contains("btn-toggle-destructor")) {
        const id = t.dataset.id;
        const p = peopleCache.find((x) => x.id === id);
        if (!p || p.type !== "participant") return;
        p.isDestructor = !!t.checked;
        addLog("toggle_destructor", p.name + (p.isDestructor ? " ✓" : " ✗"));
        scheduleSave();
        renderPeople();
        renderDistribute();
      } else if (t.classList.contains("person-select")) {
        updateDeleteSelectedBtn();
      } else if (t.classList.contains("num-move-select")) {
        const code = t.dataset.code;
        const from = t.dataset.from;
        const to = t.value;
        if (to) moveNumberToTeam(code, from, to);
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
