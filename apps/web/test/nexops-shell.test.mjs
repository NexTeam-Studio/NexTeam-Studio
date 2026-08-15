import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildClientProfilePath,
  buildNewClientPath,
  buildWorkspaceSwitchPath,
  createMenuPresentation,
  isDismissKey,
  NEXOPS_CREATE_OPTIONS,
  NEXTEAM_WORKSPACE_OPTIONS,
  parseNexOpsLocation
} from "../src/features/nexopsShell/domain/nexopsNavigation.ts";
import { NexOpsCreateMenu } from "../src/features/nexopsShell/components/NexOpsCreateMenu.tsx";

test("client profile paths round-trip through the NexOps location parser", () => {
  const overviewPath = buildClientProfilePath("client_123");
  const paymentsPath = buildClientProfilePath("client_123", "payments");
  const newClientPath = buildNewClientPath();

  assert.deepEqual(parseNexOpsLocation(overviewPath), {
    module: "clients",
    clientId: "client_123",
    clientTab: "overview",
    clientDraft: null
  });
  assert.deepEqual(parseNexOpsLocation(paymentsPath), {
    module: "clients",
    clientId: "client_123",
    clientTab: "payments",
    clientDraft: null
  });
  assert.deepEqual(parseNexOpsLocation(newClientPath), {
    module: "clients",
    clientId: null,
    clientTab: null,
    clientDraft: "new"
  });
});

test("global create options stay mapped to the intended NexOps workflows", () => {
  assert.deepEqual(
    NEXOPS_CREATE_OPTIONS.map((option) => option.id),
    ["client", "request", "quote", "job", "invoice", "payment", "task", "property", "contact"]
  );
  assert.deepEqual(
    NEXOPS_CREATE_OPTIONS.find((option) => option.id === "job")?.workflow,
    { kind: "module", module: "jobs", intent: "create" }
  );
  assert.deepEqual(
    NEXOPS_CREATE_OPTIONS.find((option) => option.id === "client")?.workflow,
    { kind: "client-page" }
  );
});

test("create menu presentation and escape dismissal stay platform-aware", () => {
  assert.equal(createMenuPresentation(1440), "flyout");
  assert.equal(createMenuPresentation(480), "sheet");
  assert.equal(isDismissKey("Escape"), true);
  assert.equal(isDismissKey("Enter"), false);
});

test("create menu renders shared tile copy and keeps Job visible in the option grid", () => {
  const html = renderToStaticMarkup(
    React.createElement(NexOpsCreateMenu, {
      presentation: "flyout",
      activeContextLabel: "Start from the Quotes rail and jump into the right builder.",
      onClose: () => {},
      onSelect: () => {}
    })
  );
  assert.match(html, /nexops-create-menu-copy/);
  assert.match(html, /<strong>Client<\/strong>/);
  assert.match(html, /<strong>Job<\/strong>/);
  assert.match(html, /Add a parent client record with billing and communication defaults\./);
  assert.match(html, /Create a manual job without forcing a request or quote first\./);
});

test("workspace switch targets stay explicit across NexOps modules", () => {
  assert.deepEqual(
    NEXTEAM_WORKSPACE_OPTIONS.map((option) => option.id),
    ["nexops", "nexcam", "nexdocs", "nexportal", "nexreach"]
  );
  assert.equal(buildWorkspaceSwitchPath("nexops", "aquatrace"), "/nexops");
  assert.equal(buildWorkspaceSwitchPath("nexcam", "aquatrace"), "/nexcam");
  assert.equal(buildWorkspaceSwitchPath("nexreach", "aquatrace"), "/nexreach");
  assert.equal(buildWorkspaceSwitchPath("nexportal", "aquatrace"), "/nexportal?tenantId=aquatrace");
  assert.equal(buildWorkspaceSwitchPath("nexdocs", "aquatrace", "client_55"), "/nexops/clients/client_55/nexdocs");
  assert.equal(buildWorkspaceSwitchPath("nexdocs", "aquatrace"), "/nexops/clients");
});

test("internal operator modules reuse one local session token while NexPortal stays on its separate client route", () => {
  const sessionOwnerSource = readFileSync(new URL("../src/shared/auth/authBootstrap.ts", import.meta.url), "utf8");

  assert.match(sessionOwnerSource, /const LOCAL_SESSION_TOKEN_KEY = "nexops\.local-auth-token";/);
  assert.match(sessionOwnerSource, /window\.localStorage\.getItem\(LOCAL_SESSION_TOKEN_KEY\)/);
  assert.match(sessionOwnerSource, /window\.localStorage\.setItem\(LOCAL_SESSION_TOKEN_KEY,\s*token\)/);
  assert.match(sessionOwnerSource, /window\.localStorage\.removeItem\(LOCAL_SESSION_TOKEN_KEY\)/);
  assert.match(sessionOwnerSource, /localUser:\s*localAuthEnabled \? await restoreLocalSession\(localTenantId\) : null/);
  assert.equal(buildWorkspaceSwitchPath("nexops", "aquatrace"), "/nexops");
  assert.equal(buildWorkspaceSwitchPath("nexcam", "aquatrace"), "/nexcam");
  assert.equal(buildWorkspaceSwitchPath("nexreach", "aquatrace"), "/nexreach");
  assert.equal(buildWorkspaceSwitchPath("nexportal", "aquatrace"), "/nexportal?tenantId=aquatrace");
});

test("client workspace exposes a confirmation-backed delete action instead of leaving duplicate cleanup to raw data edits", () => {
  const workspaceSource = readFileSync(new URL("../src/features/nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");
  const clientDetailsSource = readFileSync(new URL("../src/features/clients/components/clientDetails/ClientDetailsSurface.tsx", import.meta.url), "utf8");
  const clientDetailsRailsSource = readFileSync(new URL("../src/features/clients/components/clientDetails/hooks/useClientDetailsRails.ts", import.meta.url), "utf8");

  assert.match(workspaceSource, /useClientDetailsRails/);
  assert.match(clientDetailsRailsSource, /async function deleteClientRecord\(clientId: string\): Promise<void>/);
  assert.match(clientDetailsRailsSource, /window\.confirm\(\s*`Delete \$\{clientDisplayName\(client\)\}\?/);
  assert.match(clientDetailsRailsSource, /fetch\(`\/api\/crm\/clients\/\$\{encodeURIComponent\(clientId\)\}\?tenantId=\$\{encodeURIComponent\(options\.tenantId\)\}`/);
  assert.match(clientDetailsSource, /Delete client/);
});

test("client roster and profile keep the mobile-first client workspace actions and relationships discoverable", () => {
  const rosterSource = readFileSync(new URL("../src/features/clients/components/contact/ContactRoster.tsx", import.meta.url), "utf8");
  const rosterCss = readFileSync(new URL("../src/features/clients/components/contact/contact.css", import.meta.url), "utf8");
  const clientDetailsSource = readFileSync(new URL("../src/features/clients/components/clientDetails/ClientDetailsSurface.tsx", import.meta.url), "utf8");
  const clientDetailsCss = readFileSync(new URL("../src/features/clients/components/clientDetails/clientDetails.css", import.meta.url), "utf8");
  const workspaceSource = readFileSync(new URL("../src/features/nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");
  const headerSource = readFileSync(new URL("../src/features/nexopsShell/components/NexOpsHeader.tsx", import.meta.url), "utf8");
  const headerCss = readFileSync(new URL("../src/features/nexopsShell/styles/shellHeader.css", import.meta.url), "utf8");
  const brandingSource = readFileSync(new URL("../src/shared/branding/ProductBranding.tsx", import.meta.url), "utf8");
  const createPanelSource = readFileSync(new URL("../src/features/clients/components/contact/NexOpsCreateClientPanel.tsx", import.meta.url), "utf8");
  const mobileClientCss = readFileSync(new URL("../src/features/clients/components/contact/contactMobileLegacy.css", import.meta.url), "utf8");

  assert.match(rosterSource, /NexOps Client Manager/);
  assert.match(rosterSource, /data-label="Primary address"/);
  assert.match(rosterSource, /data-label="Contact"/);
  assert.doesNotMatch(rosterCss, /min-width:\s*920px/);
  assert.match(rosterCss, /\.nexops-client-table-head\s*\{\s*display:\s*none;/);
  assert.match(clientDetailsSource, /Recent relationship history/);
  assert.match(clientDetailsSource, /See all/);
  assert.match(clientDetailsSource, /nexops-client-profile-create-action/);
  assert.match(clientDetailsSource, /nexops-client-profile-brand-header/);
  assert.match(clientDetailsSource, /nexops-client-profile-back-bubble/);
  assert.match(clientDetailsSource, /Back to Client Roster/);
  assert.match(clientDetailsSource, /nexops-mobile-profile-back-bubble/);
  assert.match(clientDetailsSource, /nexops-client-profile-tab-groups/);
  assert.match(clientDetailsSource, /mobileTabsForBucket\(bucket\)/);
  assert.match(workspaceSource, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(headerSource, /nexops-web-platform-lockup/);
  assert.match(headerCss, /linear-gradient\(135deg, #0c1118/);
  assert.match(headerCss, /min-height: 62px/);
  assert.match(brandingSource, /branding\.logo\.updatedAt/);
  assert.match(brandingSource, /tenant-branding\/logo\?tenantId=.*&v=/);
  assert.match(createPanelSource, /aria-label=\{editing \? "Back to Client Overview" : "Back to Client Roster"\}>← Back/);
  assert.doesNotMatch(createPanelSource, /Ã—|â†/);
  assert.match(clientDetailsCss, /\.nexops-client-profile-header-card\.nexops-client-profile-brand-header\s*\{/);
  assert.match(clientDetailsCss, /\.nexops-client-profile-tab-groups\s*\{/);
  assert.match(clientDetailsCss, /\.nexops-client-profile-tabs\s*\{[\s\S]*linear-gradient/);
  assert.match(clientDetailsCss, /\.nexops-mobile-profile-summary\s*\{/);
  assert.match(createPanelSource, /if \(pageLayout && mobile\)/);
  assert.match(createPanelSource, /Phone Type/);
  assert.match(createPanelSource, /Email Type/);
  assert.match(createPanelSource, /nexops-client-form-action-controls/);
  assert.match(workspaceSource, /creatingClientPage \|\| showCreateClient/);
  assert.match(rosterSource, /Open Client/);
  assert.match(rosterSource, /nexops-client-row-identity-banner/);
  assert.match(rosterCss, /Client roster identity contract/);
  assert.match(rosterCss, /nexops-client-row-identity-banner/);
  assert.match(mobileClientCss, /body:has\(\.nexops-mobile-client-form-screen\) \.nexops-mobile-create-fab/);
  assert.match(clientDetailsCss, /nexops-client-profile-section-head \{[\s\S]*linear-gradient/);
  assert.doesNotMatch(rosterSource, /Native record/);
  assert.match(rosterCss, /\.nexops-client-form-page-actions button\[type="submit"\]:disabled/);
});
