import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AuthGate.tsx", import.meta.url), "utf8");

test("both branded sign-in screens provide a password visibility control", () => {
  assert.match(source, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(source, /aria-label=\{passwordVisible \? "Hide password" : "Show password"\}/);
  assert.match(source, /<EyeIcon hidden=\{passwordVisible\}/);
});

test("NexCommand uses the platform-admin sign-in framing instead of the Nexi sign-in screen", () => {
  assert.match(source, /pathname\.startsWith\("\/platform"\) \|\| pathname\.startsWith\("\/nexcommand"\)/);
  assert.match(source, /path: "\/nexcommand"/);
  assert.match(source, /workspaceName: "NexCommand"/);
  assert.match(source, /authorized NexTeam platform account/);
  assert.match(source, /props\.product\.path === "\/nexcommand"/);
});

test("password-reset handoffs return to the matching branded product route", () => {
  assert.match(source, /\$\{window\.location\.origin\}\$\{product\.path\}\/sign-in\?passwordReset=1/);
  assert.match(source, /handleCodeInApp: false/);
});

test("owner invite handoff confirms the password reset on the branded sign-in page", () => {
  assert.match(source, /get\("ownerInvite"\) === "1"/);
  assert.match(source, /Your password is set\. Sign in to open your NexTeam workspace\./);
});
