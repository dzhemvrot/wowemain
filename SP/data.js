const SEED_MEMBERS = [
  { id: "m01", name: "Something wrong with the database. Contact admin now.", canVote: true },
];

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

// Contact shown on the login screen (change as needed)
const CONTACT_EMAIL = "sp@r22vsk.lv";

const REMOTE_URL = "https://script.google.com/macros/s/AKfycbwebjahgC1523770gHgCiAVEAS0Jt1Bx6G-d2kbClhuznbt51jv7oUXGWyXP0a433Jo/exec";
