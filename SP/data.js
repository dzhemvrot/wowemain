// Sākotnējie dalībnieki (ja kopīgajā glabātuvē vēl nav saraksta).
const SEED_MEMBERS = [
  { id: "m01", name: "Something wrong with the database. Contact admin now.", canVote: true },
];

/*
 * Sākotnējie lietotāji — TIKAI hash + salt, nekādu paroļu skaidrā tekstā.
 * Noklusējuma admin: lietotājvārds "admin".
 * passwordHash = SHA-256(salt + parole) hex (sākotnēji parole bija sp2026 — nomaini uzreiz).
 */
const SEED_USERS = [
  {
    id: "u_admin",
    username: "admin",
    salt: "sp-seed-admin-v1",
    passwordHash:
      "98b7286f7f5c44ee1510c021d1f2931c0ed61b1a51381be3280faea6915aa6e4",
    isAdmin: true,
  },
];

/*
 * KOPĪGA DATU GLABĀTUVĒ
 * Pēc google-apps-script.js izmaiņām: Manage deployments → Edit → New version → Deploy
 */
const REMOTE_URL = "https://script.google.com/macros/s/AKfycbwHxP5UYQaU26B5QzPRsHlCAoM2BMlk9-JAVwJZyUI4rs2_oYFR0QoJannO6kDC1w/exec";
