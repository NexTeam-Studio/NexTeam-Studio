import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexOpsWorkspace.tsx", import.meta.url), "utf8");
const requestSource = readFileSync(new URL("../requests/components/requestCore/NexOpsRequestsPage.tsx", import.meta.url), "utf8");
const quoteSource = readFileSync(new URL("../quotes/components/quoteEngine/NexOpsQuotesPage.tsx", import.meta.url), "utf8");
const jobSource = readFileSync(new URL("../jobs/components/jobCore/NexOpsJobsPage.tsx", import.meta.url), "utf8");
const invoiceSource = readFileSync(new URL("../invoices/components/invoiceStructure/NexOpsInvoicesPage.tsx", import.meta.url), "utf8");

test("selected-client Create carries validated context without requiring a profile-tab state", () => {
  assert.doesNotMatch(source, /activeClientProfileTab && selectedClient && \(option\.workflow\.module/);
  assert.match(source, /resolveClientScopedCreateId\(selectedClient\.id, clients\.map\(\(client\) => client\.id\)\)/);
  for (const builder of ["NexOpsRequestsPage", "NexOpsQuotesPage", "NexOpsJobsPage", "NexOpsInvoicesPage"]) {
    assert.match(source, new RegExp(`<${builder}[\\s\\S]*?initialClientId=\\{createClientContextId \\|\\| undefined\\}`));
  }
  assert.match(source, /option\.workflow\.module === "invoices"/);
  assert.match(source, /option\.workflow\.module === "payments"/);
  assert.match(source, /selectedClient && activeClientProfileTab && \(option\.workflow\.surface === "contact" \|\| option\.workflow\.surface === "property"\)/);
  assert.match(source, /openEditClientWorkspace\(\);/);
  assert.match(source, /presentation=\{createMenuPresentation\(window\.innerWidth\)\}/);
});

test("builders accept only an existing client ID and reuse their current client fields", () => {
  assert.match(requestSource, /props\.clients\.some\(\(client\) => client\.id === props\.initialClientId\)/);
  assert.match(requestSource, /useState<"new_client" \| "existing_client">\(initialClientId \? "existing_client" : "new_client"\)/);
  assert.match(quoteSource, /clients\.find\(\(candidate\) => candidate\.id === initialClientId\) \?\? clients\[0\]/);
  assert.match(jobSource, /props\.clients\.some\(\(client\) => client\.id === props\.initialClientId\)/);
  assert.match(invoiceSource, /initialClientId\?: string/);
  assert.match(invoiceSource, /const clientContext = props\.initialClientId \? props\.clients\.find/);
  assert.match(invoiceSource, /clientContext && invoice\.clientId !== clientContext\.id/);
  assert.match(invoiceSource, /!clientContext \|\| job\.clientId === clientContext\.id/);
});

test("NexOps uses the shared application shell while retaining product navigation", () => {
  assert.match(source, /NexTeamApplicationShell/);
  assert.match(source, /navigationLabel="NexOps navigation"/);
  assert.match(source, /header=\{nexOpsDesktopSidebarHeader\}/);
  assert.match(source, /presentation="sidebar"/);
  assert.match(source, /<NexSuiteSidebar items=\{nexOpsSidebarItems\} header=\{nexOpsDesktopSidebarHeader\}/);
});

test("NexOps sidebar follows the approved lifecycle order with only Billing and Admin / Tools grouped", () => {
  const order = ["sidebarModuleItem(\"home\")", "sidebarModuleItem(\"clients\")", "sidebarModuleItem(\"requests\")", "sidebarModuleItem(\"quotes\")", "sidebarModuleItem(\"jobs\")", "sidebarModuleItem(\"schedule\")", "label: \"NexCam\"", "label: \"Billing\"", "sidebarModuleItem(\"approvals\")", "label: \"Admin / Tools\"", "label: \"Settings\""];
  let previous = -1;
  for (const token of order) {
    const next = source.indexOf(token);
    assert.ok(next > previous, `${token} must follow the approved order`);
    previous = next;
  }
  assert.match(source, /id: \"billing\"[\s\S]*children: \[sidebarModuleItem\(\"invoices\"\), sidebarModuleItem\(\"payments\"\)\]/);
  assert.match(source, /id: \"admin-tools\"[\s\S]*children: \[sidebarModuleItem\(\"imports\"\)\]/);
  assert.doesNotMatch(source, /id: \"create\", label: \"Create\", icon: \"\+\"/);
  assert.doesNotMatch(source, /id: \"modules\", label: \"Modules\"/);
  assert.doesNotMatch(source, /id: \"notifications\", label: \"Notifications\"/);
  assert.match(source, /renderNexOpsHeaderUtilities[\s\S]*aria-label="Open create menu"[\s\S]*aria-label="Open notifications"[\s\S]*aria-label="Open modules"/);
});
