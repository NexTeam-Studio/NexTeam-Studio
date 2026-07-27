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
import { NexOpsCreateMenu } from "../src/nexopsDeferredUi.tsx";

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
  const contactSource = readFileSync(new URL("../src/features/clients/components/contact/ContactProfileSurface.tsx", import.meta.url), "utf8");

  assert.match(workspaceSource, /async function deleteClientRecord\(clientId: string\): Promise<void>/);
  assert.match(workspaceSource, /window\.confirm\(\s*`Delete \$\{clientDisplayName\(client\)\}\?/);
  assert.match(workspaceSource, /fetch\(`\/api\/crm\/clients\/\$\{encodeURIComponent\(clientId\)\}\?tenantId=\$\{encodeURIComponent\(operatorContext\.tenantId\)\}`,\s*\{\s*method:\s*"DELETE"/);
  assert.match(contactSource, /Delete client/);
});
