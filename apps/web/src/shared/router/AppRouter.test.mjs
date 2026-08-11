import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppRouter.tsx", import.meta.url), "utf8");

test("NexCommand only presents profile denial after the server session endpoint is attempted", () => {
  assert.doesNotMatch(source, /if \(!hasFreshNexCommandAuthentication\(\)\) \{ setDenied\(true\); return; \}/);
  assert.match(source, /establishNexCommandSession\(user\)\.then\(\(\) => setReady\(true\)\)\.catch\(\(\) => setDenied\(true\)\)/);
});

test("NexCommand tenant denial is NexTeam-branded and offers a safe exit to either sign-in or NexOps", () => {
  assert.match(source, /<PlatformMark className="auth-card-brand" alt="NexTeam" \/>/);
  assert.match(source, /This account is not authorized to access NexCommand/);
  assert.match(source, /Sign in with a different account/);
  assert.match(source, /signOutOperator\(auth, "\/nexcommand\/sign-in"\)/);
  assert.match(source, /Open NexOps/);
  assert.match(source, /signOutOperator\(auth, "\/nexops\/sign-in"\)/);
});

test("NexCommand's request bridge covers every internal platform route, including dashboard tenant data", () => {
  const source = fs.readFileSync(new URL("../auth/authBootstrap.ts", import.meta.url), "utf8");
  assert.match(source, /function isNexCommandApiRequest/);
  assert.match(source, /requestUrl\.includes\("\/api\/platform\/"\)/);
  assert.match(source, /const nexCommandToken = isNexCommandApiRequest\(requestUrl\)/);
});
