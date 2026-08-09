import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NexCommandRoute.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/nexCommand.css", import.meta.url), "utf8");

test("NexCommand provides the required platform-console areas and canonical routes", () => {
  for (const label of ["Dashboard", "Tenants", "Prospects", "Blueprints", "Subscriptions", "Onboarding", "Migrations", "Support", "Modules", "Integrations", "Code & System", "Releases", "Usage", "Billing", "Security & Audit", "Settings"]) {
    assert.match(source, new RegExp(`"${label}"`));
  }
  assert.match(source, /nexstage\.nexteam\.studio/);
  assert.match(source, /nexapp\.nexteam\.studio/);
  assert.match(styles, /\/assets\/brand\/nexcommand-logo\.png/);
  assert.match(source, /Support access is not active/);
  assert.match(source, /time limit, revocation, and audit history/);
});

test("NexCommand only displays a sanitized operator error", () => {
  assert.match(source, /Data query needs attention\. NexTeam has logged the issue\./);
  assert.doesNotMatch(source, /error\.message/);
});

test("NexCommand keeps one clean header lockup and removes the duplicate sidebar brand", () => {
  assert.match(styles, /\.nexcommand__brand \.platform-mark \{ flex:0 0 auto; width:36px; height:36px/);
  assert.match(styles, /\.nexcommand__brand span \{ width:144px; height:27px/);
  assert.match(styles, /\.nexcommand__nav-title \{ display:none; \}/);
  assert.doesNotMatch(styles, /nexcommand__brand[^\n]*filter:(?!none)/);
});
