import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../src/", import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), "utf8");

const requestRoutes = read("modules/nexops/areas/requests/components/requestCore/server/routes.ts");
const requestFoundation = read("modules/nexops/areas/requests/components/requestCore/server/requestFoundation.ts");
const workspaceSchema = read("../../../packages/core/src/schemas.ts");
const provider = read("../../../packages/providers/src/native/NativeAdapter.ts");
const portalHub = read("modules/nexportal/components/portalCore/server/portalHubService.ts");
const settingsUi = read("../../web/src/features/settings/components/tenantConfig/RemainingSettingsSections.tsx");
const quoteUi = read("../../web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx");
const jobUi = read("../../web/src/features/jobs/components/jobCore/NexOpsJobsPage.tsx");
const visitUi = read("../../web/src/features/visits/components/visitCore/NexOpsSchedulePage.tsx");
const invoiceUi = read("../../web/src/features/invoices/components/invoiceStructure/NexOpsInvoicesPage.tsx");
const requestUi = read("../../web/src/features/requests/components/requestCore/NexOpsRequestsPage.tsx");

test("Request lifecycle preserves one original request reference across Quote, Job, Visit, and Invoice without materializing intake as line items", () => {
  for (const source of [quoteUi, jobUi, visitUi, invoiceUi]) {
    assert.match(source, /Open original request/);
  }
  assert.match(requestRoutes, /requestId: converted\.request\.id/);
  assert.match(requestFoundation, /requestId: request\.id/);
  assert.match(requestRoutes, /deletedAt/);
  assert.doesNotMatch(requestRoutes, /lineItems:\s*request\.intake/);
  assert.doesNotMatch(requestFoundation, /lineItems:\s*request\.intake/);
});

test("Request lifecycle uses the tenant-configured internal notification recipient instead of the fallback", () => {
  assert.match(requestFoundation, /const configuredRecipient = settings\?\.workspaceSettings\.requestsBooking\.internalNotificationRecipient/);
  assert.match(requestFoundation, /configuredRecipient\s*\?\s*\[configuredRecipient\.trim\(\)\.toLowerCase\(\)\]/);
  assert.match(requestFoundation, /:\s*notificationRecipients\(users, automation\.commsRail\?\.operatorEmail\)/);
  assert.match(provider, /internalNotificationRecipient: "service@aquatraceleak\.com"/);
});

test("Request lifecycle defaults public booking slot picker off and persists the tenant setting schema", () => {
  assert.match(workspaceSchema, /publicSlotPickerEnabled: z\.boolean\(\)\.default\(false\)/);
  assert.match(workspaceSchema, /requestsBooking: \{ bufferMinutes: 0, requireApproval: true, serviceAreas: \[\], publicSlotPickerEnabled: false \}/);
  assert.match(settingsUi, /Enable public date\/time slot picker/);
});

test("Request lifecycle stores per-note visibility and exposes only client-facing request notes in NexPortal", () => {
  assert.match(requestRoutes, /visibility: input\.visibility/);
  assert.match(requestUi, /Note visibility: type Internal or Client-facing/);
  assert.match(portalHub, /\.filter\(\(note\) => note\.visibility === "client"\)/);
});

test("Request lifecycle delete confirmation preserves the independently-created client, contact, and property", () => {
  assert.match(requestUi, /Permanently delete this Request\? Its linked Client, contact details, and property will remain unchanged\./);
  assert.match(requestRoutes, /Preserve source evidence for every downstream requestId/);
  assert.match(requestRoutes, /preservedClientId: request\.selectedClientId \?\? request\.match\.matchedClientId \?\? null/);
  assert.doesNotMatch(requestRoutes, /deleteClient\(/);
  assert.doesNotMatch(requestRoutes, /deleteProperty\(/);
});

test("Request lifecycle exposes exactly the locked status filters", () => {
  const exact = requestUi.match(/const REQUEST_FILTERS:[\s\S]*?\n\];/);
  assert.ok(exact, "REQUEST_FILTERS declaration must exist");
  assert.deepEqual([...exact[0].matchAll(/^\s*\{ value: "([^"]+)"/gm)].map((match) => match[1]), ["all", "new", "archived", "converted_to_quote", "converted_to_job"]);
});
