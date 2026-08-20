import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { getBuildInfo } from "../src/buildInfo.ts";

const stampPath = new URL("../../../nexteam-build-sha.txt", import.meta.url);

test("a fresh upload build stamp wins over Railway's retained linked-source SHA", async (t) => {
  let priorStamp;
  try {
    priorStamp = await readFile(stampPath, "utf8");
  } catch {
    priorStamp = null;
  }
  t.after(async () => {
    if (priorStamp === null) {
      await rm(stampPath, { force: true });
    } else {
      await writeFile(stampPath, priorStamp);
    }
  });

  await writeFile(stampPath, "upload-proof-sha");
  assert.equal(getBuildInfo({ RAILWAY_GIT_COMMIT_SHA: "retained-linked-source-sha" }).sha, "upload-proof-sha");
});
