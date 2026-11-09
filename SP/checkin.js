(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  function hasRemote() {
    return typeof REMOTE_URL === "string" && REMOTE_URL.trim().length > 10;
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatLatvianDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function isMemberActiveOn(m, dateStr) {
    if (!m) return false;
    if (!m.joinedOn) return true;
    return m.joinedOn <= dateStr;
  }

  function show(id) {
    ["state-loading", "state-closed", "state-error", "state-open", "state-done"].forEach(
      (s) => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle("d-none", s !== id);
      }
    );
  }

  function apiUrl(path) {
    return REMOTE_URL.trim().replace(/\/+$/, "") + path;
  }

  async function fetchRemote() {
    const res = await fetch(apiUrl("/public"), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function postCheckIn(dateStr, memberId, code) {
    const res = await fetch(apiUrl("/checkin"), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ memberId, code }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || "save failed");
    return json;
  }

  function renderOpen(data) {
    const session = data.publicSession || {};
    const dateStr = session.date;
    const members = Array.isArray(data.members) ? data.members : [];
    const day = (data.attendance && data.attendance[dateStr]) || {};

    $("#checkin-date").textContent = formatLatvianDate(dateStr);

    const active = members
      .filter((m) => m && m.name && isMemberActiveOn(m, dateStr))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "lv"));

    const list = $("#member-list");
    list.innerHTML = "";

    if (!active.length) {
      list.innerHTML = '<p class="text-muted">Nav aktīvu dalībnieku šim datumam.</p>';
      return;
    }

    let pending = 0;
    active.forEach((m) => {
      const already = day[m.id] === "present";
      if (!already) pending++;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "btn member-btn " +
        (already ? "btn-outline-success already" : "btn-outline-primary");
      btn.textContent = already ? "✓ " + m.name + " (jau klāt)" : m.name;
      btn.disabled = already;
      if (!already) {
        btn.addEventListener("click", async () => {
          const code = prompt("Ievadi savu personīgo kodu, " + m.name + ":");
          if (!code) return;
          btn.disabled = true;
          btn.textContent = "Saglabā…";
          try {
            const fresh = await fetchRemote();
            const s = fresh.publicSession || {};
            if (!s.open || s.date !== dateStr) {
              show("state-closed");
              return;
            }
            await postCheckIn(dateStr, m.id, code);
            $("#done-name").textContent = m.name;
            show("state-done");
          } catch (err) {
            console.warn(err);
            alert(err.message || "Neizdevās saglabāt. Mēģini vēlreiz.");
            btn.disabled = false;
            btn.textContent = m.name;
          }
        });
      }
      list.appendChild(btn);
    });

    $("#checkin-hint").textContent =
      pending === 0
        ? "Visi jau ir atzīmējušies kā klāt."
        : "Vēl nav apstiprinājuši: " + pending;
  }

  async function load() {
    show("state-loading");
    if (!hasRemote()) {
      $("#error-text").textContent =
        "Kopīgā glabātuvē nav iestatīta (REMOTE_URL). Publiskā lapa bez tās nedarbojas.";
      show("state-error");
      return;
    }
    try {
      const data = await fetchRemote();
      const session = data.publicSession || {};
      const today = toISODate(new Date());
      // Open only if flagged open and date is today (stale sessions for other days don't count)
      if (session.open && session.date === today) {
        renderOpen(data);
        show("state-open");
      } else {
        show("state-closed");
      }
    } catch (err) {
      console.warn(err);
      $("#error-text").textContent =
        "Neizdevās savienoties ar serveri. Pārbaudi internetu.";
      show("state-error");
    }
  }

  function init() {
    $("#btn-retry").addEventListener("click", load);
    $("#btn-back-list").addEventListener("click", load);
    load();
    // Light polling so page reacts when moderator closes session
    setInterval(async () => {
      if (!hasRemote()) return;
      const openEl = $("#state-open");
      const doneEl = $("#state-done");
      if (!openEl || (openEl.classList.contains("d-none") && doneEl.classList.contains("d-none"))) {
        return;
      }
      try {
        const data = await fetchRemote();
        const session = data.publicSession || {};
        const today = toISODate(new Date());
        if (!session.open || session.date !== today) {
          show("state-closed");
        }
      } catch (_) {
        /* ignore */
      }
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
