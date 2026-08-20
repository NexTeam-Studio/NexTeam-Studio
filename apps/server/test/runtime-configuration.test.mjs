import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { assertRequiredPersistence, assertTenantRuntimePersistence } from "../src/app/persistencePolicy.ts";
import { registerSystemRoutes } from "../src/core/systemRoutes.ts";
import { buildHealth } from "../src/health.ts";

const unavailableDurableRepositories = {
  ApprovalQueue: false,
  Content: false,
  Scheduling: false
};

function request(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    }).on("error", reject);
  });
}

test("missing TENANT_ID never bypasses customer-capable persistence safety", () => {
  assert.throws(
    () => assertTenantRuntimePersistence({ NODE_ENV: "production" }, false),
    /TENANT_ID/
  );
});

test("a named tenant without Firestore fails even when NODE_ENV is test", () => {
  assert.throws(
    () => assertTenantRuntimePersistence({ TENANT_ID: "customer-tenant", NODE_ENV: "test" }, false),
    /FIREBASE_ADMIN_PRIVATE_KEY/
  );
});

test("memory persistence requires explicit isolated opt-in and rejects normal named tenants", () => {
  assert.throws(
    () => assertRequiredPersistence({ TENANT_ID: "customer-tenant" }, unavailableDurableRepositories),
    /ALLOW_IN_MEMORY_PERSISTENCE/
  );
  assert.throws(
    () => assertTenantRuntimePersistence({ TENANT_ID: "customer-tenant", ALLOW_IN_MEMORY_PERSISTENCE: "true" }, false),
    /FIREBASE_ADMIN_PRIVATE_KEY/
  );
  assert.doesNotThrow(() => assertTenantRuntimePersistence({
    TENANT_ID: "local-runtime-proof",
    NODE_ENV: "test",
    RUNTIME_MODE: "isolated",
    ALLOW_IN_MEMORY_PERSISTENCE: "true"
  }, false));
});

test("system HTTP routes expose sanitized runtime identity and fail unhealthy configuration", async (t) => {
  const app = express();
  const secretSentinel = "runtime-secret-must-not-appear";
  registerSystemRoutes(app, {
    env: {
      TENANT_ID: "customer-tenant",
      RAILWAY_GIT_COMMIT_SHA: "runtime-proof-sha",
      BUILT_AT: "2026-08-05T00:00:00.000Z",
      FIREBASE_ADMIN_PRIVATE_KEY: secretSentinel
    },
    tenantId: "customer-tenant",
    localProfiles: () => []
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const version = await request(server, "/api/version");
  const health = await request(server, "/api/health");

  assert.equal(version.statusCode, 200);
  assert.equal(version.body.sha, "runtime-proof-sha");
  assert.equal(version.body.tenantId, "customer-tenant");
  assert.equal(version.body.crmRepositoryDriver, "memory");
  assert.equal(version.body.configurationStatus, "invalid");
  assert.deepEqual(version.body.missingRequiredVariables, [
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY"
  ]);
  assert.equal(JSON.stringify(version.body).includes(secretSentinel), false);

  assert.equal(health.statusCode, 503);
  assert.equal(health.body.ok, false);
  assert.equal(health.body.runtime.crmRepositoryDriver, "memory");
  assert.equal(health.body.runtime.tenantId, "customer-tenant");
  assert.equal(health.body.runtime.configurationStatus, "invalid");
  assert.deepEqual(health.body.runtime.missingRequiredVariables, [
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY"
  ]);
  assert.equal(JSON.stringify(health.body).includes(secretSentinel), false);
});

test("health reports the active transactional provider without exposing Resend configuration", async () => {
  const apiKeySentinel = "configured-by-secret-manager";
  const health = await buildHealth({
    TENANT_ID: "tenant-a",
    RESEND_API_KEY: apiKeySentinel,
    RESEND_FROM_EMAIL: "notifications@example.test"
  });

  assert.equal(health.rails.comms.provider, "resend");
  assert.equal(health.rails.comms.configured, true);
  assert.equal(JSON.stringify(health).includes(apiKeySentinel), false);
});

test("the composed server can serve an explicitly isolated memory runtime over local HTTP", async (t) => {
  const previous = {
    TENANT_ID: process.env.TENANT_ID,
    NODE_ENV: process.env.NODE_ENV,
    RUNTIME_MODE: process.env.RUNTIME_MODE,
    ALLOW_IN_MEMORY_PERSISTENCE: process.env.ALLOW_IN_MEMORY_PERSISTENCE
  };
  Object.assign(process.env, {
    TENANT_ID: "local-runtime-proof",
    NODE_ENV: "test",
    RUNTIME_MODE: "isolated",
    ALLOW_IN_MEMORY_PERSISTENCE: "true"
  });
  const module = await import(`../src/composeServerApp.ts?runtimeProof=${Date.now()}`);
  const server = await new Promise((resolve) => {
    const instance = module.app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(() => {
    Object.assign(process.env, previous);
    return new Promise((resolve) => server.close(resolve));
  });
  const health = await request(server, "/api/health");
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.runtime.crmRepositoryDriver, "memory");
  assert.equal(health.body.runtime.tenantId, "local-runtime-proof");
});
