// Sākotnējie dalībnieki (ja kopīgajā glabātuvē vēl nav saraksta).
const SEED_MEMBERS = [
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
  { id: "m11", name: "Sofija Zariņa", canVote: false },
  { id: "m12", name: "Nikola Balode", canVote: false },
  { id: "m13", name: "Daniels Ozols", canVote: false },
  { id: "m14", name: "Emma Liepa", canVote: false },
];

/*
 * Lietotāji (lietotājvārds + parole). Reģistrācijas no klienta nav —
 * administratoru kontus var ielikt šeit kā SEED, vai izveidot paneļī (tikai admin).
 * isAdmin: true → var pārvaldīt lietotājus un redzēt žurnālu.
 *
 * PIEZĪME: paroles glabājas skaidrā tekstā kopīgajā JSON (statiskā vietne).
 * Tas nav bankas līmeņa drošība — piemērots iekšējai skolai.
 */
const SEED_USERS = [
  { id: "u_admin", username: "admin", password: "sp2026", isAdmin: true },
];

/*
 * KOPĪGA DATU GLABĀTUVĒ
 * Pēc google-apps-script.js izmaiņām: Manage deployments → Edit → New version → Deploy
 */
const REMOTE_URL = "https://script.google.com/macros/s/AKfycbwHxP5UYQaU26B5QzPRsHlCAoM2BMlk9-JAVwJZyUI4rs2_oYFR0QoJannO6kDC1w/exec";
