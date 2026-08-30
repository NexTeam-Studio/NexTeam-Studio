import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../dist/platform/repository.js";
import { registerPlatformRoutes } from "../dist/platform/routes.js";
import { createOwnerInviteSender } from "../dist/platform/tenantOwnerInvite.js";
import { registerWorkspaceLinkRoutes } from "../dist/auth/workspaceLinkRoutes.js";
import { MemoryStorageWriter } from "../dist/platform/backup.js";

const tenantId = "tenant_demo";
const staffEmail = "safe-staff@example.test";

async function startFixture() {
  const app = express();
  app.use(express.json());
  const repository = new InMemoryPlatformRepository();
  const firebaseUsers = new Map();
  const claimsByUid = new Map();
  const decodedByToken = new Map();
  const generatedSetupLinks = [];
  const deliveries = [];
  const auth = {
    async getUserByEmail(email) {
      const user = firebaseUsers.get(email);
      if (user) return user;
      const error = new Error("Firebase user not found");
      error.code = "auth/user-not-found";
      throw error;
    },
    async createUser(input) {
      const user = { uid: `firebase_staff_${firebaseUsers.size + 1}`, email: input.email };
      firebaseUsers.set(input.email, user);
      return user;
    },
    async setCustomUserClaims(uid, claims) { claimsByUid.set(uid, claims); },
    async generatePasswordResetLink(email, settings) {
      const link = `https://safe-test.example/password-setup/${encodeURIComponent(email)}`;
      generatedSetupLinks.push({ email, settings, link });
      return link;
    },
    async verifyIdToken(token) {
      const decoded = decodedByToken.get(token);
      if (!decoded) throw new Error("Unknown safe Firebase token");
      return decoded;
    }
  };
  const sender = createOwnerInviteSender({
    auth,
    email: {
      mailbox: "safe-test-mailbox",
      async sendEmail(message) {
        deliveries.push(message);
        return { provider: "safe-test", id: `safe-message-${deliveries.length}`, acceptedAt: "2026-08-30T00:00:00.000Z" };
      }
    },
    continueUrl: "https://safe-test.example/nexops/sign-in?teamInvite=1"
  });
  const env = { TENANT_ID: tenantId, NEXI_FIREBASE_AUTH_REQUIRED: "false" };
  registerPlatformRoutes(app, { repository, storage: new MemoryStorageWriter(), env, firebaseOwnerActivation: auth, ownerInviteSender: sender });
  registerWorkspaceLinkRoutes(app, { env, platformRepository: repository, auth });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address.port}`;
  const invite = async () => {
    const response = await fetch(`${base}/api/platform/tenants/${tenantId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-office" },
      body: JSON.stringify({ email: staffEmail, role: "TECHNICIAN" })
    });
    assert.equal(response.status, 201);
    return response.json();
  };
  return { server, base, repository, firebaseUsers, claimsByUid, decodedByToken, generatedSetupLinks, deliveries, invite };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("staff invite creates a Firebase Auth user and binds its authUid to the pending membership", async () => {
  const fixture = await startFixture();
  try {
    const body = await fixture.invite();
    const firebaseUser = fixture.firebaseUsers.get(staffEmail);
    const membership = await fixture.repository.getTenantUser(tenantId, body.invite.id);
    assert.ok(firebaseUser);
    assert.equal(membership.authUid, firebaseUser.uid);
    assert.equal(membership.active, false);
    assert.equal(body.invite.status, "PENDING");
  } finally { await close(fixture.server); }
});

test("staff invite applies Firebase custom claims that match the selected role", async () => {
  const fixture = await startFixture();
  try {
    const body = await fixture.invite();
    const firebaseUser = fixture.firebaseUsers.get(staffEmail);
    assert.deepEqual(fixture.claimsByUid.get(firebaseUser.uid), {
      tenantId,
      tenantRole: "TECHNICIAN",
      tenantUserId: body.invite.id,
      tenantCapabilities: [],
      tenantPermissionOverrides: {},
      roles: ["technician"]
    });
  } finally { await close(fixture.server); }
});

test("staff invite generates and sends a password-setup link through the safe transactional mail seam", async () => {
  const fixture = await startFixture();
  try {
    const body = await fixture.invite();
    assert.equal(body.delivery.status, "SENT_TO_PROVIDER");
    assert.equal(fixture.generatedSetupLinks.length, 1);
    assert.equal(fixture.generatedSetupLinks[0].email, staffEmail);
    assert.equal(fixture.deliveries.length, 1);
    assert.deepEqual(fixture.deliveries[0].to, [staffEmail]);
    assert.match(fixture.deliveries[0].bodyText, new RegExp(fixture.generatedSetupLinks[0].link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally { await close(fixture.server); }
});

test("pending staff membership activates only at verified first sign-in", async () => {
  const fixture = await startFixture();
  try {
    const body = await fixture.invite();
    const firebaseUser = fixture.firebaseUsers.get(staffEmail);
    fixture.decodedByToken.set("unverified", { uid: firebaseUser.uid, email: staffEmail, email_verified: false });
    const denied = await fetch(`${fixture.base}/api/auth/workspace-link`, { method: "POST", headers: { authorization: "Bearer unverified" } });
    assert.equal(denied.status, 403);
    assert.equal((await fixture.repository.getTenantUser(tenantId, body.invite.id)).active, false);
    fixture.decodedByToken.set("verified", { uid: firebaseUser.uid, email: staffEmail, email_verified: true });
    const accepted = await fetch(`${fixture.base}/api/auth/workspace-link`, { method: "POST", headers: { authorization: "Bearer verified" } });
    assert.equal(accepted.status, 200);
    assert.equal((await fixture.repository.getTenantUser(tenantId, body.invite.id)).active, true);
  } finally { await close(fixture.server); }
});

test("staff invite completes end to end: Firebase identity authenticates as the invited tenant user", async () => {
  const fixture = await startFixture();
  try {
    const body = await fixture.invite();
    const firebaseUser = fixture.firebaseUsers.get(staffEmail);
    fixture.decodedByToken.set("verified-staff", { uid: firebaseUser.uid, email: staffEmail, email_verified: true });
    const response = await fetch(`${fixture.base}/api/auth/workspace-link`, { method: "POST", headers: { authorization: "Bearer verified-staff" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, linked: true, tenantId, tenantUserId: body.invite.id, role: "TECHNICIAN" });
    const membership = await fixture.repository.getTenantUser(tenantId, body.invite.id);
    assert.deepEqual({ authUid: membership.authUid, active: membership.active, email: membership.email }, { authUid: firebaseUser.uid, active: true, email: staffEmail });
  } finally { await close(fixture.server); }
});
