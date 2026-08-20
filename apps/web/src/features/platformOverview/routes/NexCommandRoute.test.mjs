import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NexCommandRoute.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/nexCommand.css", import.meta.url), "utf8");
const brandAsset = new URL("../../../../public/assets/brand/nexcommand-wordmark.png", import.meta.url);

test("NexCommand provides the required platform-console areas and canonical routes", () => {
  for (const label of ["Dashboard", "Tenants", "Prospects", "Blueprints", "Subscriptions", "Onboarding", "Migrations", "Support", "Modules", "Integrations", "Code & System", "Releases", "Usage", "Billing", "Security & Audit", "Settings"]) {
    assert.match(source, new RegExp(`"${label}"`));
  }
  assert.match(source, /nexstage\.nexteam\.studio/);
  assert.match(source, /nexapp\.nexteam\.studio/);
  assert.match(styles, /\/assets\/brand\/nexcommand-wordmark\.png/);
  assert.equal(fs.existsSync(brandAsset), true, "the required NexCommand wordmark asset must ship with the web build");
  assert.match(source, /Support access is not active/);
  assert.match(source, /time limit, revocation, and audit history/);
});

test("NexCommand only displays a sanitized operator error", () => {
  assert.match(source, /Data query needs attention\. NexTeam has logged the issue\./);
  assert.doesNotMatch(source, /error\.message/);
});

test("NexCommand exposes managed platform settings, profiles, and roles without treating them as tenant users", () => {
  assert.match(source, /PlatformSettingsPanel/);
  assert.match(source, /Open Team/);
  const settings = fs.readFileSync(new URL("../components/PlatformSettingsPanel.tsx", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../api/nexCommandAdminApi.ts", import.meta.url), "utf8");
  assert.match(settings, /Platform profiles are isolated from tenant users/);
  assert.match(settings, /Role access guide/);
  assert.match(api, /\/api\/platform\/admin\/team/);
});

test("NexCommand exposes only sanitized staging Gmail provider identity and health", () => {
  assert.match(source, /Credentials &amp; Provider Management/);
  assert.match(source, /\/api\/platform\/admin\/providers\/gmail\/staging-owner-invitation/);
  assert.match(source, /Sender identity/);
  assert.match(source, /Required scope/);
  assert.match(source, /Secret health/);
  assert.match(source, /Credentials are never shown/);
  assert.doesNotMatch(source, /GMAIL_SEND_MAILBOX_REFRESH_TOKEN\s*=/);
});

test("NexCommand live build status is durable, refreshes, and exposes controller evidence", () => {
  assert.match(source, /\/api\/platform\/admin\/live-build-status/);
  assert.match(source, /setInterval\(\(\) => void refresh\(\), 30_000\)/);
  assert.match(source, /Durable controller state, run records, event ledger, and live deployment evidence only/);
  for (const label of ["Current Build", "Current Task", "Actual State", "Control State", "Run ID", "PID", "Last Heartbeat", "Progress", "Completed Tasks", "Remaining Tasks", "Blocker", "Last Activity", "No-progress warning"]) assert.match(source, new RegExp(`"${label}"`));
  for (const label of ["Live deployment SHA", "Deployment verified", "Last 10 controller events"]) assert.match(source, new RegExp(label));
  assert.match(source, /noProgressWarning/);
  assert.match(source, /deploymentEvidence/);
});

test("NexCommand keeps one clean header lockup and removes the duplicate sidebar brand", () => {
  assert.match(styles, /\.nexcommand__brand \.platform-mark \{ flex:0 0 auto; width:36px; height:36px/);
  assert.match(styles, /\.nexcommand__brand span \{ width:144px; height:27px/);
  assert.match(styles, /\.nexcommand__nav-title \{ display:none; \}/);
  assert.doesNotMatch(styles, /nexcommand__brand[^\n]*filter:(?!none)/);
});

test("NexCommand uses the shared NexTeam application shell", () => {
  assert.match(source, /NexTeamApplicationShell/);
  assert.match(source, /navigationLabel="NexCommand navigation"/);
  assert.match(source, /mobileNavigationMode="drawer"/);
  assert.match(styles, /@media \(max-width:880px\).*nexcommand__menu \{ display:block; \}/s);
});

test("NexCommand opens Templates as a roster with a recursively expandable configuration tree", () => {
  assert.match(source, /type TemplateTreeNode/);
  assert.match(source, /const templateTree: TemplateTreeNode\[\]/);
  for (const label of ["Templates", "Design", "NexSuite", "Global", "Header"]) assert.match(source, new RegExp(`label: "${label}"`));
  assert.match(source, /href: "\/design-system\/layout-parts\/header"/);
  assert.match(source, /\["templates", "Templates", "▤"\]/);
  assert.match(source, /function TemplatesRoster/);
  assert.match(source, /function TemplateRosterTree/);
  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(styles, /nexcommand__template-tree/);
  assert.doesNotMatch(source, /nexcommand__template-navigation/);
});
