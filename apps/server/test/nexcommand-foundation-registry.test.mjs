import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const registry = JSON.parse(readFileSync(path.join(root, "worktree-lanes.json"), "utf8"));
const nexCommand = registry.componentRegistry.find((component) => component.id === "nexcommand-foundation");

test("NexCommand has one authoritative lane and no duplicate worktree", () => {
  assert.ok(nexCommand);
  assert.equal(nexCommand.authoritativeLane, "platform-tenants");
  assert.equal(nexCommand.dedicatedWorktree, null);
  assert.equal(registry.lanes.filter((lane) => lane.slug === "nexcommand").length, 0);
  assert.deepEqual(nexCommand.permittedPaths, [
    "apps/web/src/features/platform/**",
    "apps/web/src/features/platformOverview/**",
    "apps/server/src/platform/**"
  ]);
});

test("NexCommand routing is read-only and shares global contracts without a second registry", () => {
  assert.deepEqual(nexCommand.routing, {
    canonicalWebRoute: "/nexcommand",
    compatibilityWebRoute: "/platform",
    statusReadRoute: "GET /api/platform/admin/live-build-status",
    writeRoutes: []
  });
  assert.equal(nexCommand.sharedDependencies.length, 1);
  assert.equal(nexCommand.sharedDependencies[0].lane, "nexteam-global");
  assert.match(nexCommand.conflicts[0].resolution, /do not duplicate a NexCommand auth, router, or module registry/i);
  assert.ok(nexCommand.tests.includes("apps/server/test/live-build-status.test.mjs"));
  assert.ok(nexCommand.tests.includes("apps/server/test/platform.test.mjs"));
});
