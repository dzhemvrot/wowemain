(() => {
  "use strict";

  const SESS_KEY = "msaieti-captain-session";
  const $ = (sel) => document.querySelector(sel);

  let phase = "numbers";
  let teams = [];
  let kids = [];
  let selectedTeamId = null;
  let teamCode = null;
  let restored = false;

  const apiUrl = (p) => REMOTE_URL.trim().replace(/\/+$/, "") + p;

  async function get(path) {
    const res = await fetch(apiUrl(path), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!json || json.ok === false) throw new Error((json && json.error) || "HTTP " + res.status);
    return json;
  }

  function saveSess() {
    try {
      if (selectedTeamId && teamCode) {
        sessionStorage.setItem(SESS_KEY, JSON.stringify({ teamId: selectedTeamId, code: teamCode }));
      } else sessionStorage.removeItem(SESS_KEY);
    } catch (_) {}
  }

  function setBadge(cls, text) {
    const el = $("#sync-badge");
    if (!el) return;
    el.className = "badge sync-badge " + cls;
    el.textContent = text;
  }

  function showState(id) {
    ["state-loading", "state-closed", "state-error", "state-open"].forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle("d-none", s !== id);
    });
  }

  function firstName(full) {
    const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return parts.length >= 2 ? parts[parts.length - 1] : parts[0];
  }

  function teamLabel(t) {
    if (!t) return "—";
    const n = t.number != null ? t.number : "?";
    if (t.name && String(t.name).trim()) return `${n}. ${String(t.name).trim()}`;
    const c = (t.captains || []).map(firstName);
    if (c.length >= 2) return `Komanda ${c[0]} un ${c[1]}`;
    if (c.length === 1) return `Komanda ${c[0]}`;
    return `Komanda ${n}`;
  }

  const classLabel = (p) => `${p.grade != null ? p.grade : "?"}.${p.letter || "a"}`;

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fillTeams() {
    const sel = $("#team-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Izvēlies komandu —</option>';
    for (const t of teams) {
      const opt = document.createElement("option");
      opt.value = t.id;
      const caps = (t.captains || []).join(", ");
      opt.textContent = teamLabel(t) + (caps ? ` (${caps})` : "");
      sel.appendChild(opt);
    }
    if (selectedTeamId && teams.some((t) => t.id === selectedTeamId)) sel.value = selectedTeamId;
  }

  function renderKids() {
    const panel = $("#team-panel");
    const list = $("#kid-list");
    if (!selectedTeamId || !teamCode) {
      if (panel) panel.classList.add("d-none");
      return;
    }
    panel.classList.remove("d-none");

    const q = ($("#kid-search").value || "").trim().toLowerCase();
    const classFilter = $("#class-filter").value || "";
    let shown = kids.slice();
    if (q) shown = shown.filter((p) => (p.name || "").toLowerCase().includes(q));
    if (classFilter) shown = shown.filter((p) => classLabel(p) === classFilter);
    shown.sort((a, b) => {
      const ca = classLabel(a).localeCompare(classLabel(b), "lv");
      if (ca !== 0) return ca;
      const ia = a.teamId === selectedTeamId ? 0 : 1;
      const ib = b.teamId === selectedTeamId ? 0 : 1;
      if (ia !== ib) return ia - ib;
      return (a.name || "").localeCompare(b.name || "", "lv");
    });

    $("#count-in-team").textContent = kids.filter((p) => p.teamId === selectedTeamId).length + " komandā";
    $("#count-total").textContent = "no " + kids.length;

    const team = teams.find((t) => t.id === selectedTeamId);
    const caps = team ? (team.captains || []) : [];
    $("#team-meta").textContent = caps.length ? "Kapitāni: " + caps.join(", ") : "Kapitāni nav norādīti";

    const cf = $("#class-filter");
    if (cf.options.length <= 1) {
      [...new Set(kids.map(classLabel))].sort((a, b) => a.localeCompare(b, "lv")).forEach((ck) => {
        const opt = document.createElement("option");
        opt.value = ck;
        opt.textContent = ck;
        cf.appendChild(opt);
      });
    }

    let html = "";
    let lastClass = null;
    for (const p of shown) {
      const ck = classLabel(p);
      if (ck !== lastClass) {
        lastClass = ck;
        const inClass = shown.filter((x) => classLabel(x) === ck).length;
        const mineInClass = shown.filter((x) => classLabel(x) === ck && x.teamId === selectedTeamId).length;
        html += `<div class="class-header mt-2 mb-1"><strong>${escapeHtml(ck)}</strong> <span class="text-muted small">(${mineInClass}/${inClass})</span></div>`;
      }
      const mine = p.teamId === selectedTeamId;
      const other = p.teamId && !mine ? teams.find((t) => t.id === p.teamId) : null;
      const cls = mine ? "kid-row in-team" : other ? "kid-row other-team" : "kid-row";
      html += `<label class="${cls}">
          <input type="checkbox" class="form-check-input kid-check" data-id="${escapeHtml(p.id)}" ${mine ? "checked" : ""}>
          <span class="flex-grow-1">
            <span>${escapeHtml(p.name)}</span>
            <span class="meta">${p.isDestructor ? " · ★" : ""}${other ? " · tagad: " + escapeHtml(teamLabel(other)) : ""}</span>
          </span>
        </label>`;
    }
    list.innerHTML = html || '<p class="text-muted small">Nav rezultātu.</p>';
  }

  async function openTeam(code) {
    const r = await post("/captain/open", { teamId: selectedTeamId, code });
    teamCode = code;
    kids = r.kids || [];
    saveSess();
    renderKids();
  }

  async function toggleKid(personId, checked) {
    try {
      const r = await post("/captain/toggle", { teamId: selectedTeamId, code: teamCode, personId, checked });
      kids = r.kids || kids;
      setBadge("bg-success", "Saglabāts");
    } catch (err) {
      alert(err.message);
      setBadge("bg-danger", "Kļūda");
    }
    renderKids();
  }

  async function load() {
    showState("state-loading");
    setBadge("bg-info", "Ielādē…");
    try {
      const r = await get("/captain");
      phase = r.phase;
      teams = r.teams || [];
    } catch (err) {
      console.warn(err);
      $("#error-text").textContent = "Neizdevās savienoties ar serveri. Pārbaudiet internetu.";
      showState("state-error");
      setBadge("bg-danger", "Kļūda");
      return;
    }
    if (phase !== "names") {
      showState("state-closed");
      setBadge("bg-secondary", "Slēgts");
      return;
    }
    showState("state-open");
    setBadge("bg-success", "Sinhronizēts");

    if (!restored) {
      restored = true;
      try {
        const s = JSON.parse(sessionStorage.getItem(SESS_KEY) || "null");
        if (s && teams.some((t) => t.id === s.teamId)) {
          selectedTeamId = s.teamId;
          await openTeam(s.code);
        }
      } catch (_) {
        selectedTeamId = null;
        teamCode = null;
        saveSess();
      }
    }
    fillTeams();
    renderKids();
  }

  function bind() {
    $("#team-select").addEventListener("change", async (e) => {
      const sel = e.target;
      const id = sel.value || null;
      selectedTeamId = null;
      teamCode = null;
      kids = [];
      saveSess();
      $("#class-filter").innerHTML = '<option value="">Visas klases</option>';
      renderKids();
      if (!id) return;
      const code = prompt("Ievadi savas komandas kodu:");
      if (!code) { sel.value = ""; return; }
      try {
        selectedTeamId = id;
        await openTeam(code);
      } catch (err) {
        alert(err.message);
        selectedTeamId = null;
        sel.value = "";
        renderKids();
      }
    });
    $("#kid-search").addEventListener("input", renderKids);
    $("#class-filter").addEventListener("change", renderKids);
    $("#btn-retry-closed").addEventListener("click", load);
    $("#btn-retry-error").addEventListener("click", load);

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("kid-check")) toggleKid(t.dataset.id, t.checked);
    });

    setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await get("/captain");
        const wasOpen = phase === "names";
        phase = r.phase;
        if (phase !== "names") { showState("state-closed"); return; }
        if (!wasOpen) { load(); return; }
        teams = r.teams || teams;
        if (selectedTeamId && teamCode) {
          const o = await post("/captain/open", { teamId: selectedTeamId, code: teamCode });
          kids = o.kids || kids;
          renderKids();
        }
        setBadge("bg-success", "Sinhronizēts");
      } catch (_) { /* ignore */ }
    }, 15000);
  }

  bind();
  load();
})();