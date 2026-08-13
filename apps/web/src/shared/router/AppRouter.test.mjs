import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppRouter.tsx", import.meta.url), "utf8");
const authGateSource = fs.readFileSync(new URL("../auth/AuthGate.tsx", import.meta.url), "utf8");
const nexOpsWorkspaceSource = fs.readFileSync(new URL("../../features/nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");

test("NexOps sign-in visibly links global operators to the supported NexCommand sign-in", () => {
  assert.match(authGateSource, /props\.product\.path === "\/nexops"\s*\? \{ path: "\/nexcommand\/sign-in", label: "Open NexCommand" \}/);
  assert.match(authGateSource, /<a className="auth-product-link" href=\{alternate\.path\}>\{alternate\.label\}<\/a>/);
});

test("NexOps tenant denial preserves denial and signs out before opening NexCommand sign-in", () => {
  assert.match(nexOpsWorkspaceSource, /if \(accessState\.status === "denied"\)/);
  assert.match(nexOpsWorkspaceSource, /NexOps access denied/);
  assert.match(nexOpsWorkspaceSource, /signOutOperator\(props\.auth, "\/nexcommand\/sign-in"\)\}>Open NexCommand<\/button>/);
});

test("NexCommand only presents profile denial after the server session endpoint is attempted", () => {
  assert.doesNotMatch(source, /if \(!hasFreshNexCommandAuthentication\(\)\) \{ setDenied\(true\); return; \}/);
  assert.match(source, /establishNexCommandSession\(user\)\.then\(\(\) => setReady\(true\)\)\.catch\(\(\) => setDenied\(true\)\)/);
});

test("NexCommand tenant denial uses the same NexCommand identity and offers a safe exit to either sign-in or NexOps", () => {
  assert.match(source, /<NexCommandMark \/>/);
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

test("NexCommand verifies the authoritative self profile before mounting tenant-capable routes", () => {
  const source = fs.readFileSync(new URL("../../features/platform/routes/PlatformRoute.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\("\/api\/platform\/admin\/team\/me"\)/);
  assert.match(source, /if \(profileGate === "checking"\) return <main className="platform-profile-gate"/);
  assert.match(source, /if \(profileGate === "incomplete"\) return <PlatformProfileCompletion/);
  assert.match(source, /if \(pathname !== "\/platform\/profile-completion"\) navigateToProfileCompletion\(\)/);
  assert.ok(source.indexOf('if (profileGate === "incomplete")') < source.indexOf("<NexCommandRoute />"));
  assert.match(source, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(source, /fetch\("\/api\/platform\/admin\/team\/me\/profile-photo"/);
  assert.doesNotMatch(source, /profilePhotoRef.*setProfilePhotoRef/);
});

test("NexCommand Settings presents protected Owner identity as read-only without a self-service identity patch", () => {
  const source = fs.readFileSync(new URL("../../features/platform/routes/platformSubroutes.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\("\/api\/platform\/admin\/team\/me"\)/);
  assert.match(source, /id="platform-owner-email"[\s\S]*disabled/);
  assert.match(source, /id="platform-owner-first-name"[\s\S]*disabled/);
  assert.match(source, /id="platform-owner-last-name"[\s\S]*disabled/);
  assert.match(source, /code-controlled[\s\S]*controlled maintenance/);
  assert.doesNotMatch(source, /<form|twoFactor|2FA/);
  assert.doesNotMatch(source, /method:\s*"PATCH"/);
});
