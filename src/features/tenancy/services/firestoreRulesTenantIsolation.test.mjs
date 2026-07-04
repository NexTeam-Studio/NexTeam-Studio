import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rulesPath = join(process.cwd(), "firestore.rules");
const rules = readFileSync(rulesPath, "utf8");

test("firestore rules use tenant-scoped auth instead of tenant allow-lists for tenant foundation collections", () => {
  assert.doesNotMatch(rules, /return tenantId in \[/);
  assert.match(rules, /function canAccessTenant\(tenantId\)/);
  assert.match(rules, /request\.auth\.token\.tenantId == tenantId/);
});

test("firestore rules include dedicated paths for intake, config, runtime summary, and subagents", () => {
  assert.match(rules, /match \/tenants\/\{tenantId\}\/intakePackets\/\{packetId\}/);
  assert.match(rules, /match \/tenants\/\{tenantId\}\/config\/\{configId\}/);
  assert.match(rules, /match \/tenants\/\{tenantId\}\/runtimeSummary\/\{summaryId\}/);
  assert.match(rules, /match \/tenants\/\{tenantId\}\/subagents\/\{subagentId\}/);
});

test("firestore rules gate agentSessions to the signed-in owner or a platform operator", () => {
  assert.match(rules, /match \/agentSessions\/\{sessionId\}/);
  assert.match(rules, /allow read: if isPlatformOperator\(\) \|\| isAgentSessionOwner\(resource\.data\)/);
  assert.match(rules, /function canWriteOwnAgentSession\(data\)/);
  assert.match(rules, /data\.ownerUid == request\.auth\.uid/);
});

test("public session claims are excluded from tenant foundation access", () => {
  assert.match(rules, /function isPublicSession\(\)/);
  assert.match(rules, /&& !isPublicSession\(\)/);
});
