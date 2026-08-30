import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../components/UsersSurface.tsx", import.meta.url);
const cssUrl = new URL("../styles/users.css", import.meta.url);

test("users surface includes the team, profile, permission, and invite workflows", async () => {
  const [source, css] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(cssUrl, "utf8")]);

  for (const label of ["Invite team member", "Assigned seats", "Personal Information", "Zip Code", "Role & access", "Email preferences", "Assign seat"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /function InviteDialog/);
  assert.match(source, /function PermissionsPanel/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test("users surface exports the signed-in-user contract and own-profile view", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /export interface NexOpsSignedInUser/);
  assert.match(source, /avatarUrl\?: string/);
  assert.match(source, /initialView\?: UsersSurfaceView/);
  assert.match(source, /"own-profile"/);
  assert.match(source, /title\?: string/);
  assert.match(source, /First Name/);
  assert.match(source, /Middle Name/);
  assert.match(source, /Last Name/);
  assert.match(source, /Zip Code/);
  assert.match(source, /users-profile-identity/);
  assert.match(source, /users-avatar--placeholder/);
  assert.match(source, /function nameParts/);
  assert.match(source, /users-profile-save/);
  assert.match(source, /Add Photo/);
  assert.match(source, /Change Photo/);
  assert.match(source, /selectProfilePhoto/);
  assert.match(source, /props\.canManageTeam/);
  assert.match(source, /notificationPreferences/);
  assert.match(source, /function toTeamMember/);
  assert.match(source, /function Avatar/);
});

test("team controls use the persisted permission grid and profile preferences are saved", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /canManageTeam=\{canManageTeam\}/);
  assert.match(source, /action=\{canManageTeam \? \{ label: "Assign seat"/);
  assert.match(source, /permissionAreas/);
  assert.match(source, /permissionLevels/);
  assert.match(source, /permissionOverrides/);
  assert.match(source, /Change .* resets their individual permission overrides/);
  assert.match(source, /\/api\/platform\/tenants/);
  assert.match(source, /Create pending invite/);
  assert.match(source, /notificationPreferences: \{ \.\.\.current\.notificationPreferences/);
});

test("team and own-profile opening headers use the shared title treatment with matching icons", async () => {
  const [source, css] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(cssUrl, "utf8")]);

  assert.match(source, /users-page-title.*Team/);
  assert.match(source, /users-page-title.*My Profile/);
  assert.match(source, /function TeamTitleIcon/);
  assert.match(source, /function PersonTitleIcon/);
  assert.match(css, /\.users-page-title \{ display:flex/);
});
