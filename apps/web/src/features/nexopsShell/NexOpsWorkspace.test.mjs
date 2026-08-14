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
  assert.match(source, /presentation=\{createMenuPresentation\(window\.innerWidth\)\}/);
});

test("builders accept only an existing client ID and reuse their current client fields", () => {
  assert.match(requestSource, /props\.clients\.some\(\(client\) => client\.id === props\.initialClientId\)/);
  assert.match(requestSource, /useState<"new_client" \| "existing_client">\(initialClientId \? "existing_client" : "new_client"\)/);
  assert.match(quoteSource, /clients\.find\(\(candidate\) => candidate\.id === initialClientId\) \?\? clients\[0\]/);
  assert.match(jobSource, /props\.clients\.some\(\(client\) => client\.id === props\.initialClientId\)/);
  assert.match(invoiceSource, /initialClientId\?: string/);
  assert.match(invoiceSource, /const clientContext = props\.clients\.find\(\(client\) => client\.id === props\.initialClientId\)/);
  assert.match(invoiceSource, /clientContext && invoice\.clientId !== clientContext\.id/);
  assert.match(invoiceSource, /!clientContext \|\| job\.clientId === clientContext\.id/);
});
