import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../components/UsersSurface.tsx", import.meta.url);
const cssUrl = new URL("../styles/users.css", import.meta.url);

test("users surface includes the team, profile, permission, and invite workflows", async () => {
  const [source, css] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(cssUrl, "utf8")]);

  for (const label of ["Invite team member", "Assigned seats", "Personal information", "Working hours", "Role & permissions", "Email preferences", "Assign seat"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /function InviteDialog/);
  assert.match(source, /function PermissionsPanel/);
  assert.match(css, /@media\(max-width:760px\)/);
});
