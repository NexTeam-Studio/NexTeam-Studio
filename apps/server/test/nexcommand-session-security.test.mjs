import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../src/platform/repository.ts";
import { registerPlatformRoutes } from "../src/platform/routes.ts";
import { NEXCOMMAND_IDLE_TIMEOUT_MS, hashSessionToken } from "../src/platform/sessionSecurity.ts";

test("NexCommand sessions expire, cannot reopen without fresh authentication, sign out, and retain immutable redacted audit history", async () => {
  const repository = new InMemoryPlatformRepository();
  const app = express(); app.use(express.json());
  registerPlatformRoutes(app, { repository, storage: null, env: { NEXI_FIREBASE_AUTH_REQUIRED: "true", NEXCOMMAND_STRICT_SESSION: "true" }, platformOperatorAuth: { async verifyIdToken(token) { return token === "operator" ? { uid: "operator", platform_operator: true } : { uid: "tenant-owner" }; } } });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const create = async (bearer = "operator") => fetch(`${base}/api/platform/admin/session`, { method: "POST", headers: { authorization: `Bearer ${bearer}` } });
    assert.equal((await create("tenant-owner")).status, 403, "tenant authentication cannot create a platform session");
    assert.equal((await fetch(`${base}/api/platform/admin/summary`, { headers: { authorization: "Bearer operator" } })).status, 401, "a reopened browser has no NexCommand session");
    const first = await create(); assert.equal(first.status, 201); const firstToken = (await first.json()).token;
    const firstHeaders = { authorization: `Bearer ${firstToken}` };
    assert.equal((await fetch(`${base}/api/platform/admin/summary`, { headers: firstHeaders })).status, 200);
    assert.equal((await fetch(`${base}/api/platform/admin/session/sign-out`, { method: "POST", headers: firstHeaders })).status, 200);
    assert.equal((await fetch(`${base}/api/platform/admin/summary`, { headers: firstHeaders })).status, 401, "explicit sign-out invalidates the session");
    const second = await create(); const secondToken = (await second.json()).token;
    const secondSession = await repository.getPlatformSessionByTokenHash(hashSessionToken(secondToken));
    await repository.savePlatformSession({ ...secondSession, lastActivityAt: new Date(Date.now() - NEXCOMMAND_IDLE_TIMEOUT_MS - 1).toISOString() });
    assert.equal((await fetch(`${base}/api/platform/admin/summary`, { headers: { authorization: `Bearer ${secondToken}` } })).status, 401, "idle session expires at 15 minutes");
    assert.equal((await fetch(`${base}/api/platform/admin/audit`, { method: "DELETE", headers: { authorization: `Bearer ${secondToken}` } })).status, 405, "audit history cannot be deleted");
    const audits = await repository.listPlatformSecurityAudits();
    assert.deepEqual(audits.map((audit) => audit.action), ["platform_session.failed_sign_in", "platform_session.created", "platform_session.signed_out", "platform_session.created", "platform_session.idle_expired"]);
    assert.equal(audits.some((audit) => JSON.stringify(audit).includes(firstToken)), false, "audit records never retain bearer tokens");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
