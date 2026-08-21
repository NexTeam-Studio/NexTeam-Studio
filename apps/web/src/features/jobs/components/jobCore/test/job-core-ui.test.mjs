import test from "node:test";
import assert from "node:assert/strict";

import {
  closeoutArtifactKey,
  closeoutHydrationView,
  defaultManualJobPropertyId,
  followUpDraftFromHistory,
  inlineJobClientDraftCanSave,
  inlineJobClientDraftMissingFields,
  isHistoricalJob,
  isCurrentCloseoutDeliveryReviewRequest,
  matchesJobSearch,
  mergeJobClientOptions,
  parseVisitDateTime,
  selectedCloseoutArtifactRefs
} from "../NexOpsJobsPage.tsx";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pageSource = readFileSync(fileURLToPath(new URL("../NexOpsJobsPage.tsx", import.meta.url)), "utf8");

test("Jobs uses the shared roster and detail templates with explicit detail exit", () => {
  assert.match(pageSource, /import \{ NexOpsDetailTemplate, NexOpsRosterTemplate \} from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/ui\/NexOpsBusinessTemplates"/);
  assert.match(pageSource, /<NexOpsRosterTemplate/);
  assert.match(pageSource, /<NexOpsDetailTemplate/);
  assert.match(pageSource, /Back to Job Roster/);
  assert.match(pageSource, /setDetailOpen\(false\)/);
  assert.match(pageSource, /void loadDetail\(detailOpen \? selectedJobId : ""\)/);
});

test("inline job client draft requires name, telephone, and address before save", () => {
  assert.deepEqual(
    inlineJobClientDraftMissingFields({
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      email: "",
      street1: "",
      city: "",
      province: "",
      postalCode: "",
      country: "US"
    }),
    ["name", "telephone", "address"]
  );
});

test("inline job client draft can save without email once required client fields exist", () => {
  assert.equal(
    inlineJobClientDraftCanSave({
      firstName: "Nova",
      lastName: "Tester",
      company: "",
      phone: "8645550100",
      email: "",
      street1: "6020 Frest Dr",
      city: "Seneca",
      province: "SC",
      postalCode: "29672",
      country: "US"
    }),
    true
  );
});

test("inline-created clients merge into the job picker without duplicating existing records", () => {
  const existing = [
    { id: "client_1", name: "Aquatrace Existing", emails: [], phones: [] },
    { id: "client_2", name: "Legacy Client", emails: [], phones: [] }
  ];
  const created = { id: "client_3", name: "Fresh Inline Client", emails: ["fresh@example.com"], phones: ["8645550199"] };

  assert.deepEqual(
    mergeJobClientOptions(existing, created).map((client) => client.id),
    ["client_3", "client_1", "client_2"]
  );
  assert.deepEqual(
    mergeJobClientOptions(existing, existing[0]).map((client) => client.id),
    ["client_1", "client_2"]
  );
});

test("archived jobs remain historical records regardless of import source", () => {
  assert.equal(isHistoricalJob({ status: "Archived" }), true);
  assert.equal(isHistoricalJob({ status: "Upcoming", archivedAt: "2026-08-01T00:00:00.000Z" }), true);
  assert.equal(isHistoricalJob({ status: "Upcoming" }), false);
});

test("job history search finds archived records by job, client, or number", () => {
  const historicalJob = {
    id: "job_history_1",
    tenantId: "tenant_1",
    clientId: "client_1",
    title: "Annual service visit",
    number: "J-104",
    status: "Archived",
    client: { id: "client_1", name: "Northside Home" },
    visitCount: 1,
    completedVisitCount: 1,
    invoiceCount: 0
  };
  assert.equal(matchesJobSearch(historicalJob, "northside"), true);
  assert.equal(matchesJobSearch(historicalJob, "j-104"), true);
  assert.equal(matchesJobSearch(historicalJob, "annual"), true);
  assert.equal(matchesJobSearch(historicalJob, "unrelated"), false);
});

test("a historical record prepares new work for the same client without modifying history", () => {
  assert.deepEqual(
    followUpDraftFromHistory({ clientId: "client_1", propertyId: "property_1", title: "Annual service visit" }),
    { clientId: "client_1", propertyId: "property_1", title: "Follow-up: Annual service visit" }
  );
});

test("visit scheduler parses accessible text controls", () => {
  assert.equal(parseVisitDateTime("2026-08-15", "10:00") instanceof Date, true);
  assert.equal(parseVisitDateTime("08/15/2026", "10:00"), null);
  assert.equal(parseVisitDateTime("2026-08-15", "10:00 AM"), null);
  assert.equal(parseVisitDateTime("2026-02-30", "10:00"), null);
  assert.equal(parseVisitDateTime("2026-08-15", "24:00"), null);
});

test("manual Job creation keeps property selection within the selected Client", () => {
  const properties = [
    { id: "property_1", clientId: "client_1", label: "Primary location" },
    { id: "property_2", clientId: "client_2", label: "Other client location" }
  ];
  assert.equal(defaultManualJobPropertyId(properties, "client_1"), "property_1");
  assert.equal(defaultManualJobPropertyId(properties, "client_2"), "property_2");
  assert.equal(defaultManualJobPropertyId(properties, "missing_client"), "");
  assert.match(pageSource, /Property \/ service location/);
  assert.match(pageSource, /propertyId: createPropertyId/);
});

test("Closeout saves the exact mixed NexDocs and NexCam artifact selection without duplicate relationships", () => {
  const artifacts = [
    { artifactId: "document_1", source: "nexdocs", kind: "upload", label: "Inspection", fileName: "Inspection.pdf", mimeType: "application/pdf", occurredAt: "2026-08-20T12:00:00.000Z", visitId: "visit_1" },
    { artifactId: "media_1", source: "nexcam", kind: "field_report", label: "Evaporation", fileName: "Evaporation.pdf", mimeType: "application/pdf", occurredAt: "2026-08-20T12:05:00.000Z", visitId: "visit_1" }
  ];
  const selection = [closeoutArtifactKey(artifacts[0]), closeoutArtifactKey(artifacts[1]), closeoutArtifactKey(artifacts[1])];
  assert.deepEqual(selectedCloseoutArtifactRefs(artifacts, selection), [
    { artifactId: "document_1", source: "nexdocs", kind: "upload", visitId: "visit_1" },
    { artifactId: "media_1", source: "nexcam", kind: "field_report", visitId: "visit_1" }
  ]);
});

test("Closeout hydration never represents an in-flight package as zero selected or finalized", () => {
  const packageRecord = {
    id: "package_1",
    packageVersion: 2,
    manifestStatus: "draft",
    selectedArtifactRefs: [{ artifactId: "document_1", source: "nexdocs", kind: "upload", visitId: "visit_1" }]
  };
  assert.deepEqual(closeoutHydrationView({ phase: "loading", jobId: "job_1" }, "job_1", packageRecord), {
    loading: true,
    ready: false,
    selectedCount: 0,
    editable: false
  });
  assert.deepEqual(closeoutHydrationView({ phase: "ready", jobId: "job_1" }, "job_1", packageRecord), {
    loading: false,
    ready: true,
    selectedCount: 1,
    editable: true
  });
  assert.match(pageSource, /Selection changed\. Save the package before returning to Delivery Review\./);
  assert.match(pageSource, /Loading selection\.\.\./);
});

test("Closeout discards an out-of-order Delivery Review response after a selection or Job change", () => {
  const request = { loadSequence: 4, selectionGeneration: 9 };
  assert.equal(isCurrentCloseoutDeliveryReviewRequest(request, { loadSequence: 4, selectionGeneration: 9 }), true);
  assert.equal(isCurrentCloseoutDeliveryReviewRequest(request, { loadSequence: 4, selectionGeneration: 10 }), false);
  assert.equal(isCurrentCloseoutDeliveryReviewRequest(request, { loadSequence: 5, selectionGeneration: 9 }), false);
  assert.match(pageSource, /closeoutSelectionGenerationRef\.current \+= 1/);
});

test("Closeout keeps Delivery Review loading and failure state visible before a review is available", () => {
  assert.match(pageSource, /role="status" aria-live="polite">\{closeoutDeliveryStatus\}<\/p>/);
  assert.match(pageSource, /Loading the saved Closeout package for delivery review/);
  assert.match(pageSource, /Delivery review is unavailable right now/);
});
