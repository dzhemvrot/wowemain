(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const CHOICE_LV = { for: "Par", against: "Pret", abstain: "Atturas" };

  let dataCache = null;
  let selectedMemberId = null;
  let pendingChoice = null;

  function hasRemote() {
    return typeof REMOTE_URL === "string" && REMOTE_URL.trim().length > 10;
  }

  function show(id) {
    ["state-loading", "state-closed", "state-error", "state-open", "state-ballot", "state-done"].forEach(
      (s) => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle("d-none", s !== id);
      }
    );
  }

  async function fetchRemote() {
    const res = await fetch(REMOTE_URL.trim(), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function fetchClientIp() {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      return j.ip || null;
    } catch {
      return null;
    }
  }

  function memberName(id) {
    const m = (dataCache.members || []).find((x) => x.id === id);
    return m ? m.name : id;
  }

  function countProgress(vote) {
    const eligible = vote.eligible || [];
    const ballots = vote.ballots || {};
    let voted = 0;
    eligible.forEach((id) => {
      if (ballots[id] && ballots[id].choice) voted++;
    });
    return { voted, total: eligible.length };
  }

  function renderOpen(data) {
    const vote = data.activeVote;
    if (!vote || !vote.open) {
      show("state-closed");
      return;
    }
    dataCache = data;
    $("#vote-title").textContent = vote.title || "Balsošana";
    const desc = (vote.description || "").trim();
    $("#vote-desc").textContent = desc;
    $("#vote-desc").classList.toggle("d-none", !desc);

    const meta = [];
    meta.push(
      "<li><strong>Vairākums:</strong> " +
        (vote.majority === "two_thirds" ? "> 2/3 no tiesīgajiem" : "> 50% no tiesīgajiem") +
        "</li>"
    );
    meta.push(
      "<li><strong>Varianti:</strong> " +
        (vote.ballot === "faa" ? "Par / Pret / Atturas" : "Par / Pret") +
        "</li>"
    );
    if (vote.ballot === "faa") {
      meta.push(
        "<li><strong>Atturēšanās:</strong> " +
          (vote.abstainAs === "against" ? "skaitās kā pret" : "netiek ņemta vērā (ignorēta)") +
          "</li>"
      );
    }
    meta.push(
      "<li><strong>Režīms:</strong> " +
        (vote.secret ? "slēgta balsošana (rezultāti pēc slēgšanas)" : "atvērta (redzami starprezultāti)") +
        "</li>"
    );
    meta.push(
      '<li class="text-muted">Balso tikai par sevi. Līdz slēgšanai balsi var mainīt.</li>'
    );
    $("#vote-meta").innerHTML = meta.join("");

    const prog = countProgress(vote);
    $("#vote-progress").textContent =
      "Nobalsējuši: " + prog.voted + " / " + prog.total;

    const tallies = $("#open-tallies");
    if (!vote.secret) {
      const t = computeTallies(vote);
      tallies.classList.remove("d-none");
      tallies.innerHTML =
        '<div class="small border rounded p-2 bg-light">' +
        "<div>Par: <strong>" +
        t.forCount +
        "</strong> · Pret: <strong>" +
        t.againstCount +
        "</strong>" +
        (vote.ballot === "faa"
          ? " · Atturas / nav balsojuši: <strong>" + t.abstainCount + "</strong>"
          : " · Nav balsojuši: <strong>" + t.didNotVote + "</strong>") +
        "</div></div>";
    } else {
      tallies.classList.add("d-none");
      tallies.innerHTML = "";
    }

    const list = $("#member-list");
    list.innerHTML = "";
    const eligible = vote.eligible || [];
    const members = (data.members || [])
      .filter((m) => eligible.indexOf(m.id) >= 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "lv"));

    members.forEach((m) => {
      const b = (vote.ballots || {})[m.id];
      const has = b && b.choice;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "btn member-btn " + (has ? "btn-outline-success" : "btn-outline-primary");
      btn.textContent = has
        ? m.name + " ✓ (" + (CHOICE_LV[b.choice] || b.choice) + ")"
        : m.name;
      btn.addEventListener("click", () => openBallot(m.id));
      list.appendChild(btn);
    });
  }

  function computeTallies(vote) {
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
    // Didn't vote counts as abstention
    const abstainCount = abstainExplicit + didNotVote;
    return { forCount, againstCount, abstainCount, abstainExplicit, didNotVote };
  }

  function openBallot(memberId) {
    selectedMemberId = memberId;
    pendingChoice = null;
    const vote = dataCache.activeVote;
    const b = (vote.ballots || {})[memberId];
    $("#ballot-name").textContent = memberName(memberId);
    $("#ballot-current").textContent =
      b && b.choice
        ? "Pašreizējā balss: " + (CHOICE_LV[b.choice] || b.choice)
        : "Vēl nav nobalsots.";
    $("#ballot-error").classList.add("d-none");
    $("#btn-confirm-vote").disabled = true;

    const box = $("#ballot-choices");
    box.innerHTML = "";
    const choices =
      vote.ballot === "faa" ? ["for", "against", "abstain"] : ["for", "against"];
    choices.forEach((ch) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline-dark choice-btn";
      btn.textContent = CHOICE_LV[ch];
      btn.addEventListener("click", () => {
        pendingChoice = ch;
        box.querySelectorAll("button").forEach((x) => {
          x.classList.remove("btn-dark");
          x.classList.add("btn-outline-dark");
        });
        btn.classList.remove("btn-outline-dark");
        btn.classList.add("btn-dark");
        $("#btn-confirm-vote").disabled = false;
      });
      if (b && b.choice === ch) {
        pendingChoice = ch;
        btn.classList.remove("btn-outline-dark");
        btn.classList.add("btn-dark");
        $("#btn-confirm-vote").disabled = false;
      }
      box.appendChild(btn);
    });
    show("state-ballot");
  }

  async function submitVote() {
    const err = $("#ballot-error");
    err.classList.add("d-none");
    if (!selectedMemberId || !pendingChoice) return;
    $("#btn-confirm-vote").disabled = true;
    try {
      const fresh = await fetchRemote();
      const vote = fresh.activeVote;
      if (!vote || !vote.open) {
        show("state-closed");
        return;
      }
      if ((vote.eligible || []).indexOf(selectedMemberId) < 0) {
        err.textContent = "Tu neesi tiesīgo sarakstā.";
        err.classList.remove("d-none");
        return;
      }
      const ip = await fetchClientIp();
      const ts = new Date().toISOString();
      const logs = Array.isArray(fresh.logs) ? fresh.logs.slice() : [];
      logs.push({
        ts,
        username: "publisks",
        action: "cast_vote",
        details:
          memberName(selectedMemberId) +
          " · " +
          (CHOICE_LV[pendingChoice] || pendingChoice) +
          (ip ? " · IP: " + ip : ""),
      });

      const res = await fetch(REMOTE_URL.trim(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          _voteBallot: {
            voteId: vote.id,
            memberId: selectedMemberId,
            choice: pendingChoice,
            ts,
          },
          logs,
        }),
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json().catch(() => ({}));
      if (json && json.ok === false) throw new Error(json.error || "fail");

      $("#done-text").textContent =
        memberName(selectedMemberId) +
        ": " +
        (CHOICE_LV[pendingChoice] || pendingChoice);
      show("state-done");
    } catch (e) {
      console.warn(e);
      err.textContent = "Neizdevās nosūtīt. Mēģini vēlreiz.";
      err.classList.remove("d-none");
      $("#btn-confirm-vote").disabled = false;
    }
  }

  async function load() {
    show("state-loading");
    if (!hasRemote()) {
      $("#error-text").textContent = "REMOTE_URL nav iestatīts.";
      show("state-error");
      return;
    }
    try {
      const data = await fetchRemote();
      if (data.activeVote && data.activeVote.open) {
        renderOpen(data);
        show("state-open");
      } else {
        show("state-closed");
      }
    } catch (e) {
      console.warn(e);
      show("state-error");
    }
  }

  function init() {
    $("#btn-retry").addEventListener("click", load);
    $("#btn-ballot-back").addEventListener("click", () => {
      if (dataCache) {
        renderOpen(dataCache);
        show("state-open");
      } else load();
    });
    $("#btn-done-back").addEventListener("click", load);
    $("#btn-confirm-vote").addEventListener("click", submitVote);
    load();
    setInterval(async () => {
      if (!hasRemote()) return;
      const open = $("#state-open");
      const ballot = $("#state-ballot");
      if (
        open.classList.contains("d-none") &&
        ballot.classList.contains("d-none")
      )
        return;
      try {
        const data = await fetchRemote();
        if (!data.activeVote || !data.activeVote.open) show("state-closed");
      } catch (_) {}
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
