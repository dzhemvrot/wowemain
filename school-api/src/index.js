import { Alliance } from "./alliance.js";
import { Sp } from "./sp.js";
import { Msaieti } from "./msaieti.js";
export { Alliance, Sp, Msaieti };

const CORS = {
  "Access-Control-Allow-Origin": "https://wowe-main.eu",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const reply = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const name = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "");
    if (name.includes("__")) return reply({ ok: false, error: "not found" }, 404); // internal paths

    const top = name.split("/")[0];
    const ns =
      top === "alliance" ? env.ALLIANCE :
      top === "sp" ? env.SP :
      top === "msaieti" ? env.MSAIETI : null;
    if (!ns) return reply({ ok: false, error: "not found" }, 404);

    return ns.get(ns.idFromName("main")).fetch(request);
  },

  // nightly backup to R2 (does nothing if you skipped Step 1)
  async scheduled(event, env) {
    if (!env.BACKUPS) return;
    const day = new Date().toISOString().slice(0, 10);
    for (const [name, ns] of [["sp", env.SP], ["msaieti", env.MSAIETI]]) {
      const r = await ns.get(ns.idFromName("main")).fetch(new Request("https://internal/" + name + "/__cron"));
      await env.BACKUPS.put(name + "/" + day + ".json", await r.text());
    }
  },
};