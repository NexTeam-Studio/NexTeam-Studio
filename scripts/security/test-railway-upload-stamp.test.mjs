import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrapper = path.join(root, "scripts", "security", "invoke-railway-staging.ps1");
const stamp = path.join(root, "nexteam-build-sha.txt");
const buildInfo = path.join(root, "apps", "server", "src", "buildInfo.ts");

test("a failed staging vault preflight removes the temporary upload identity stamp", async (t) => {
  assert.equal(existsSync(stamp), false, "test requires no pre-existing upload stamp");
  const originalBuildInfo = await readFile(buildInfo, "utf8");
  t.after(async () => {
    await rm(stamp, { force: true });
    await writeFile(buildInfo, originalBuildInfo, "utf8");
  });
  const missingVault = path.join(root, "runtime", "missing-railway-vault-for-test.dpapi");
  const command = `& '${wrapper.replaceAll("'", "''")}' -VaultPath '${missingVault.replaceAll("'", "''")}' -RailwayArgs @('up','--service','NexTeam-Studio','--environment','staging','--detach'); exit $LASTEXITCODE`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd: root, encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.equal(existsSync(stamp), false);
  assert.equal(await readFile(buildInfo, "utf8"), originalBuildInfo);
});
