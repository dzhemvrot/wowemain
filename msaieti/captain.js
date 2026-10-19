(() => {
  "use strict";

  const STORAGE_DATA = "msaieti-data-v2";
  const SAVE_DEBOUNCE_MS = 500;
  const $ = (sel) => document.querySelector(sel);

  let peopleCache = [];
  let teamsCache = [];
  let settingsCache = { phase: "numbers", numberScheme: "prefix" };
  let saveTimer = null;
  let selectedTeamId = null;

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
    const prev = loadLocal();
    const payload = {
      users: prev.users || [],
      people: peopleCache,
      teams: teamsCache,
      logs: prev.logs || [],
      settings: settingsCache,
    };
    localStorage.setItem(STORAGE_DATA, JSON.stringify(payload));
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.people)) peopleCache = data.people;
    if (Array.isArray(data.teams)) teamsCache = data.teams;
    if (data.settings && typeof data.settings === "object") {
      settingsCache = {
        phase: data.settings.phase === "names" ? "names" : "numbers",
        numberScheme:
          data.settings.numberScheme === "legacy" ? "legacy" : "prefix",
      };
    }
  }

  async function fetchRemote() {
    const res = await fetch(REMOTE_URL, { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok === false)
      throw new Error((data && data.error) || "Remote error");
    return data;
  }

  async function pushRemote() {
    // Merge with latest remote to avoid wiping users/logs
    let base = {};
    try {
      base = await fetchRemote();
    } catch (_) {
      base = loadLocal();
    }
    const body = {
      users: base.users || [],
      people: peopleCache,
      teams: teamsCache,
      logs: base.logs || [],
      settings: base.settings || settingsCache,
    };
    const res = await fetch(REMOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok === false)
      throw new Error((data && data.error) || "Remote error");
    return data;
  }

  function setBadge(cls, text) {
    const el = $("#sync-badge");
    if (!el) return;
    el.className = "badge sync-badge " + cls;
    el.textContent = text;
  }

  function showState(id) {
    ["state-loading", "state-closed", "state-error", "state-open"].forEach(
      (s) => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle("d-none", s !== id);
      }
    );
  }

  function teamLabel(t) {
    if (!t) return "—";
    const n = t.number != null ? t.number : "?";
    return t.name ? `${n}. ${t.name}` : `Komanda ${n}`;
  }

  function classLabel(p) {
    if (!p || p.type === "captain") return "—";
    return `${p.grade != null ? p.grade : "?"}.${p.letter || "a"}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function participants() {
    return peopleCache.filter((p) => p.type === "participant");
  }

  function fillTeams() {
    const sel = $("#team-select");
    if (!sel) return;
    const prev = selectedTeamId || sel.value;
    const sorted = [...teamsCache].sort(
      (a, b) => (a.number || 0) - (b.number || 0)
    );
    sel.innerHTML = '<option value="">— Izvēlies komandu —</option>';
    for (const t of sorted) {
      const opt = document.createElement("option");
      opt.value = t.id;
      const captains = (t.captainIds || [])
        .map((id) => peopleCache.find((p) => p.id === id))
        .filter(Boolean)
        .map((c) => c.name)
        .join(", ");
      opt.textContent = teamLabel(t) + (captains ? ` (${captains})` : "");
      sel.appendChild(opt);
    }
    if (prev && sorted.some((t) => t.id === prev)) {
      sel.value = prev;
      selectedTeamId = prev;
    }
  }

  function renderKids() {
    const panel = $("#team-panel");
    const list = $("#kid-list");
    if (!selectedTeamId) {
      if (panel) panel.classList.add("d-none");
      return;
    }
    if (panel) panel.classList.remove("d-none");

    const q = ($("#kid-search") && $("#kid-search").value.trim().toLowerCase()) || "";
    let kids = participants();
    if (q) {
      kids = kids.filter((p) => (p.name || "").toLowerCase().includes(q));
    }
    kids.sort((a, b) => {
      const inA = a.teamId === selectedTeamId ? 0 : 1;
      const inB = b.teamId === selectedTeamId ? 0 : 1;
      if (inA !== inB) return inA - inB;
      const ca = classLabel(a).localeCompare(classLabel(b), "lv");
      if (ca !== 0) return ca;
      return (a.name || "").localeCompare(b.name || "", "lv");
    });

    const inTeam = participants().filter((p) => p.teamId === selectedTeamId).length;
    const total = participants().length;
    const cIn = $("#count-in-team");
    const cTot = $("#count-total");
    if (cIn) cIn.textContent = inTeam + " komandā";
    if (cTot) cTot.textContent = "no " + total;

    const team = teamsCache.find((t) => t.id === selectedTeamId);
    const meta = $("#team-meta");
    if (meta && team) {
      const caps = (team.captainIds || [])
        .map((id) => peopleCache.find((p) => p.id === id))
        .filter(Boolean)
        .map((c) => c.name);
      meta.textContent = caps.length
        ? "Kapitāni: " + caps.join(", ")
        : "Kapitāni nav norādīti";
    }

    if (!list) return;
    list.innerHTML = kids
      .map((p) => {
        const mine = p.teamId === selectedTeamId;
        const other =
          p.teamId && p.teamId !== selectedTeamId
            ? teamsCache.find((t) => t.id === p.teamId)
            : null;
        const cls = mine
          ? "kid-row in-team"
          : other
          ? "kid-row other-team"
          : "kid-row";
        return `<label class="${cls}">
          <input type="checkbox" class="form-check-input kid-check" data-id="${p.id}" ${
          mine ? "checked" : ""
        }>
          <span class="flex-grow-1">
            <span>${escapeHtml(p.name)}</span>
            <span class="meta"> · ${escapeHtml(classLabel(p))}${
          p.isDestructor ? " · ★" : ""
        }${other ? " · tagad: " + escapeHtml(teamLabel(other)) : ""}</span>
          </span>
        </label>`;
      })
      .join("");
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
  }

  async function doSave() {
    saveTimer = null;
    saveLocal();
    if (!hasRemote()) {
      setBadge("bg-secondary", "Lokāli");
      return;
    }
    setBadge("bg-info", "Saglabā…");
    try {
      await pushRemote();
      setBadge("bg-success", "Saglabāts");
    } catch (err) {
      console.warn(err);
      setBadge("bg-danger", "Kļūda saglabājot");
    }
  }

  function toggleKid(personId, checked) {
    const p = peopleCache.find((x) => x.id === personId);
    if (!p || p.type !== "participant" || !selectedTeamId) return;

    if (checked) {
      // Remove from previous team's participantIds if any
      if (p.teamId && p.teamId !== selectedTeamId) {
        const prev = teamsCache.find((t) => t.id === p.teamId);
        if (prev) {
          prev.participantIds = (prev.participantIds || []).filter(
            (id) => id !== p.id
          );
        }
      }
      p.teamId = selectedTeamId;
      const team = teamsCache.find((t) => t.id === selectedTeamId);
      if (team) {
        if (!team.participantIds) team.participantIds = [];
        if (!team.participantIds.includes(p.id)) team.participantIds.push(p.id);
      }
    } else {
      if (p.teamId === selectedTeamId) {
        p.teamId = null;
        const team = teamsCache.find((t) => t.id === selectedTeamId);
        if (team) {
          team.participantIds = (team.participantIds || []).filter(
            (id) => id !== p.id
          );
        }
      }
    }
    scheduleSave();
    renderKids();
  }

  async function load() {
    showState("state-loading");
    setBadge("bg-info", "Ielādē…");
    try {
      if (hasRemote()) {
        const data = await fetchRemote();
        applyPayload(data);
        saveLocal();
        setBadge("bg-success", "Sinhronizēts");
      } else {
        applyPayload(loadLocal());
        setBadge("bg-secondary", "Lokāli");
      }
    } catch (err) {
      console.warn(err);
      applyPayload(loadLocal());
      if (!peopleCache.length && !teamsCache.length) {
        $("#error-text").textContent = String(err.message || err);
        showState("state-error");
        setBadge("bg-danger", "Kļūda");
        return;
      }
      setBadge("bg-warning", "Lokālā kopija");
    }

    if (settingsCache.phase !== "names") {
      showState("state-closed");
      return;
    }

    showState("state-open");
    fillTeams();
    renderKids();
  }

  function bind() {
    $("#team-select") &&
      $("#team-select").addEventListener("change", (e) => {
        selectedTeamId = e.target.value || null;
        renderKids();
      });
    $("#kid-search") &&
      $("#kid-search").addEventListener("input", renderKids);
    $("#btn-retry-closed") &&
      $("#btn-retry-closed").addEventListener("click", load);
    $("#btn-retry-error") &&
      $("#btn-retry-error").addEventListener("click", load);

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("kid-check")) {
        toggleKid(t.dataset.id, t.checked);
      }
    });

    // Periodic refresh to see other captains' changes
    setInterval(async () => {
      if (settingsCache.phase !== "names") return;
      if (document.hidden) return;
      try {
        if (hasRemote()) {
          const data = await fetchRemote();
          applyPayload(data);
          if (settingsCache.phase !== "names") {
            showState("state-closed");
            return;
          }
          fillTeams();
          renderKids();
          setBadge("bg-success", "Sinhronizēts");
        }
      } catch (_) {
        /* ignore */
      }
    }, 15000);
  }

  bind();
  load();
})();
