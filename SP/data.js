// Sākotnējie dalībnieki (tiek izmantoti, ja kopīgajā glabātuvē vēl nav saraksta).
// Jaunie dalībnieki tiek pievienoti caur vietni un saglabājas kopā ar apmeklējumu.
const SEED_MEMBERS = [
  // --- Ar balsstiesībām (balsojošie) ---
  { id: "m01", name: "Anna Bērziņa", canVote: true },
  { id: "m02", name: "Jānis Kalniņš", canVote: true },
  { id: "m03", name: "Elīna Ozola", canVote: true },
  { id: "m04", name: "Mārtiņš Liepiņš", canVote: true },
  { id: "m05", name: "Kristīne Eglīte", canVote: true },
  { id: "m06", name: "Roberts Jansons", canVote: true },
  { id: "m07", name: "Laura Siliņa", canVote: true },
  { id: "m08", name: "Artūrs Vītoliņš", canVote: true },
  { id: "m09", name: "Madara Pētersone", canVote: true },
  { id: "m10", name: "Edgars Krūmiņš", canVote: true },

  // --- Bez balsstiesībām ---
  { id: "m11", name: "Sofija Zariņa", canVote: false },
  { id: "m12", name: "Nikola Balode", canVote: false },
  { id: "m13", name: "Daniels Ozols", canVote: false },
  { id: "m14", name: "Emma Liepa", canVote: false },
];

// Vienkārša parole (maināma šeit).
const APP_PASSWORD = "sp2026";

/*
 * KOPĪGA DATU GLABĀTUVĒ
 * 1. script.google.com → projekts ar sp/google-apps-script.js
 * 2. Deploy Web app (Anyone)
 * 3. Ielīmē URL zemāk
 * Pēc google-apps-script.js izmaiņām: Manage deployments → Edit → New version
 */
const REMOTE_URL = "https://script.google.com/macros/s/AKfycbwHxP5UYQaU26B5QzPRsHlCAoM2BMlk9-JAVwJZyUI4rs2_oYFR0QoJannO6kDC1w/exec";
