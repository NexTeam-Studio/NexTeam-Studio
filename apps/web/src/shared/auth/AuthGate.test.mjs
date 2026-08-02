import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AuthGate.tsx", import.meta.url), "utf8");

test("both branded sign-in screens provide a password visibility control", () => {
  assert.match(source, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(source, /aria-label=\{passwordVisible \? "Hide password" : "Show password"\}/);
  assert.match(source, /<EyeIcon hidden=\{passwordVisible\}/);
});
