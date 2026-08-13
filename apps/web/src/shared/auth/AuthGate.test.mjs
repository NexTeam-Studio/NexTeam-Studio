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
  assert.match(source, /requiresNexCommandReauthentication/);
  assert.match(source, /sign in again to start a fresh NexCommand session/);
});

test("password-reset handoffs return to the matching branded product route", () => {
  assert.match(source, /\$\{window\.location\.origin\}\$\{product\.path\}\/sign-in\?passwordReset=1/);
  assert.match(source, /handleCodeInApp: false/);
});

test("owner invite handoff confirms the password reset on the branded sign-in page", () => {
  assert.match(source, /get\("ownerInvite"\) === "1"/);
  assert.match(source, /Your password is set\. Sign in to open your NexTeam workspace\./);
});

test("tenant access errors are distinguished from a Firebase credential failure", () => {
  const provider = fs.readFileSync(new URL("./AuthSessionProvider.tsx", import.meta.url), "utf8");
  assert.match(provider, /pathname\.startsWith\("\/platform"\).*pathname\.startsWith\("\/nexcommand"\)/s);
  assert.match(provider, /getIdToken\(true\)/);
  assert.match(provider, /Verify the email address for this account before opening NexOps\./);
  assert.match(provider, /No active workspace membership matches this sign-in\./);
  assert.match(provider, /This authenticated account is not assigned to an active NexOps workspace\./);
  assert.match(source, /Send verification email/);
  assert.match(source, /authFailureMessage\(signInError, localAuthEnabled\)/);
});
