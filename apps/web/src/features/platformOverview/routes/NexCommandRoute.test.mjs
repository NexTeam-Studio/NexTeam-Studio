import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NexCommandRoute.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/nexCommand.css", import.meta.url), "utf8");
const templates = fs.readFileSync(new URL("../components/TemplatesRoster.tsx", import.meta.url), "utf8");
const sidebar = fs.readFileSync(new URL("../components/NexCommandSidebar.tsx", import.meta.url), "utf8");
const brandAsset = new URL("../../../../public/assets/brand/nexcommand-wordmark.png", import.meta.url);

test("NexCommand provides the required platform-console areas and canonical routes", () => {
  for (const label of ["Dashboard", "Tenants", "Prospects", "Blueprints", "Subscriptions", "Onboarding", "Migrations", "Support", "Modules", "Integrations", "Code & System", "Releases", "Usage", "Billing", "Security & Audit", "Settings"]) {
    assert.match(`${source}\n${sidebar}`, new RegExp(`"${label}"`));
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

test("NexCommand opens Templates as successive configuration-driven roster pages", () => {
  for (const label of ["Templates", "Design", "NexSuite", "Global", "NexOps", "Header", "Sidebar", "Application Shell", "Quote Search and Filter", "Quote Results Roster", "Expandable Quote Roster Record", "Footer"]) assert.match(templates, new RegExp(`label: "${label}"`));
  assert.match(templates, /href: "\/design-system\/layout-parts\/header"/);
  assert.match(templates, /href: "\/design-system\/layout-parts\/sidebar"/);
  assert.match(templates, /href: "\/nexops\/quotes#quote-search-filter"/);
  assert.match(templates, /href: "\/nexops\/quotes#quote-results-roster"/);
  assert.match(templates, /href: "\/nexops\/quotes#expandable-quote-roster-record"/);
  assert.match(templates, /rosterHref: "\/nexcommand\?area=templates&template=design"/);
  assert.match(sidebar, /\["templates", "Templates", "▤"\]/);
  assert.match(source, /<TemplatesRoster rosterId=/);
  assert.match(templates, /function findNode/);
  assert.match(styles, /nexcommand__template-roster-list/);
  assert.doesNotMatch(source, /nexcommand__template-navigation/);
});
