import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppRouter.tsx", import.meta.url), "utf8");

test("NexCommand only presents profile denial after the server session endpoint is attempted", () => {
  assert.doesNotMatch(source, /if \(!hasFreshNexCommandAuthentication\(\)\) \{ setDenied\(true\); return; \}/);
  assert.match(source, /establishNexCommandSession\(user\)\.then\(\(\) => setReady\(true\)\)\.catch\(\(\) => setDenied\(true\)\)/);
});
