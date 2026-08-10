import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLiveBuildStatus } from "../dist/platform/liveBuildStatus.js";

test("live build status is IDLE without a controller document and fails closed for stale state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexcommand-status-"));
  const file = join(directory, "status.json");
  try {
    assert.equal((await readLiveBuildStatus({ NEXCOMMAND_LIVE_BUILD_STATUS_FILE: file })).actualState, "IDLE");
    await writeFile(file, JSON.stringify({ runId: "run-stale", pid: 123, lastHeartbeat: "2026-08-10T00:00:00.000Z" }));
    assert.equal((await readLiveBuildStatus({ NEXCOMMAND_LIVE_BUILD_STATUS_FILE: file }, Date.parse("2026-08-10T00:03:00.000Z"))).actualState, "IDLE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("live build status exposes only a fresh controller document", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexcommand-status-"));
  const file = join(directory, "status.json");
  try {
    await writeFile(file, JSON.stringify({
      currentBuild: "P0 validation",
      currentTask: "Run staging matrix",
      runId: "run-123",
      pid: 4242,
      lastHeartbeat: "2026-08-10T12:00:00.000Z",
      progress: "2/4",
      completedTasks: ["Inspect"],
      remainingTasks: ["Verify"],
      blocker: null,
      lastActivity: "Matrix started"
    }));
    const status = await readLiveBuildStatus({ NEXCOMMAND_LIVE_BUILD_STATUS_FILE: file }, Date.parse("2026-08-10T12:01:00.000Z"));
    assert.deepEqual(status, {
      currentBuild: "P0 validation", currentTask: "Run staging matrix", actualState: "ACTIVE", runId: "run-123", pid: 4242,
      lastHeartbeat: "2026-08-10T12:00:00.000Z", progress: "2/4", completedTasks: ["Inspect"], remainingTasks: ["Verify"], blocker: null, lastActivity: "Matrix started"
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
