import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("Phase R Chris package is fixed-url, isolated, and presents only explicit local test identities", async () => {
  // accessContext imports Firebase-admin accessors. Load it only when this
  // local-profile assertion executes so importing the test file cannot attach
  // the ambient staging Firebase runtime to the default suite.
  const { listLocalDevWebProfiles } = await import("../dist/auth/accessContext.js");
  const [launcher, handoff] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/run-chris-test-package.mjs"), "utf8"),
    readFile(path.join(repoRoot, "docs/handoffs/PHASE-R-CHRIS-TEST-PACKAGE.md"), "utf8")
  ]);

  assert.match(launcher, /const apiPort = 4301/);
  assert.match(launcher, /const webPort = 4300/);
  assert.match(launcher, /TENANT_ID: "local-chris-test"/);
  assert.match(launcher, /RUNTIME_MODE: "isolated"/);
  assert.match(launcher, /ALLOW_IN_MEMORY_PERSISTENCE: "true"/);
  assert.match(launcher, /NEXI_FIREBASE_AUTH_REQUIRED: "false"/);
  assert.match(launcher, /FIREBASE_SERVICE_ACCOUNT/);
  assert.match(launcher, /ANTHROPIC_API_KEY/);
  assert.match(launcher, /RESEND_API_KEY/);

  const profiles = listLocalDevWebProfiles("local-chris-test", { NEXI_FIREBASE_AUTH_REQUIRED: "false" });
  assert.deepEqual(profiles.map(({ email, role, tenantId }) => ({ email, role, tenantId })), [
    { email: "owner@local.dev", role: "OWNER", tenantId: "local-chris-test" },
    { email: "office@local.dev", role: "OFFICE_ADMIN", tenantId: "local-chris-test" },
    { email: "technician@local.dev", role: "TECHNICIAN", tenantId: "local-chris-test" },
    { email: "technician2@local.dev", role: "TECHNICIAN", tenantId: "local-chris-test" }
  ]);

  for (const expected of [
    "http://127.0.0.1:4300/nexops/sign-in",
    "http://127.0.0.1:4301/api/health",
    "Reset instructions",
    "Acceptance checklist",
    "Known limitations and handoff boundary",
    "READY FOR CHRIS END-USER TESTING"
  ]) assert.match(handoff, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
