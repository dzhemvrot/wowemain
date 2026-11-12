import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("nominations Worker routing", () => {
  it("routes nominations API calls to the handler and reports missing D1 binding", async () => {
    const response = await worker.fetch(new Request("https://school-api.wmcoeu.workers.dev/nominations/auth/me"), {}, {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Nominations D1 database binding is missing." });
  });

  it("rejects requests from an unapproved origin", async () => {
    const response = await worker.fetch(new Request("https://school-api.wmcoeu.workers.dev/nominations/auth/me", {
      headers: { Origin: "https://attacker.example" },
    }), { ...env, nominations_db: {} }, {});
    expect(response.status).toBe(403);
  });
});
