import test from "node:test";
import assert from "node:assert/strict";

import {
  quoteCanConvertToJob,
  quoteCanCreateInvoice,
  quoteCanManualApprove,
  quoteCanSend,
  quoteConvertToJobBlockedReason,
  quoteDominantAction,
  quoteInvoiceBlockedReason,
  lineDraftFromQuoteItem,
  quoteManualApproveBlockedReason,
  quoteSendBlockedReason
} from "../NexOpsQuotesPage.tsx";
import fs from "node:fs";
import path from "node:path";

function makeQuote(overrides = {}) {
  return {
    id: "quote_1",
    tenantId: "tenant_aquatrace",
    clientId: "client_1",
    status: "draft",
    title: "Leak detection quote",
    lineItems: [],
    totals: { subtotal: 250, tax: 0, total: 250 },
    approvalRules: {
      requireSignature: true,
      requireDeposit: true,
      requireCardOnFile: true,
      depositKind: "percent",
      depositValue: 50
    },
    ...overrides
  };
}

test("quote dominant action changes across core pre-approval states", () => {
  const draft = quoteDominantAction(makeQuote({ status: "draft" }));
  const sent = quoteDominantAction(makeQuote({ status: "sent" }));
  const changeRequested = quoteDominantAction(makeQuote({ status: "change_requested" }));
  const expired = quoteDominantAction(makeQuote({ status: "expired" }));

  assert.deepEqual(
    [draft.action, sent.action, changeRequested.action, expired.action],
    ["send", "send", "edit", "renew"]
  );
  assert.equal(draft.label, "Send Quote");
  assert.equal(sent.label, "Resend Quote");
  assert.equal(changeRequested.label, "Edit and Resend");
  assert.equal(expired.label, "Renew Quote");
});

test("quote dominant action changes after approval based on whether a job snapshot already exists", () => {
  const approvedReadyForJob = makeQuote({ status: "approved" });
  const approvedAlreadyConverted = makeQuote({ status: "approved_internal", convertedJobId: "job_42" });

  const firstAction = quoteDominantAction(approvedReadyForJob);
  const convertedAction = quoteDominantAction(approvedAlreadyConverted);

  assert.equal(firstAction.action, "convert-to-job");
  assert.equal(firstAction.label, "Convert to Job");
  assert.equal(convertedAction.action, "invoice");
  assert.equal(convertedAction.label, "Create Invoice");
});

test("legacy signed quotes remain locked and can enter the downstream lifecycle", () => {
  const signed = makeQuote({ status: "signed" });

  assert.equal(quoteDominantAction(signed).action, "convert-to-job");
  assert.equal(quoteCanSend(signed), false);
  assert.equal(quoteCanConvertToJob(signed), true);
  assert.equal(quoteCanCreateInvoice(signed), true);
});

test("blocked delivery state disables send and exposes the reason on approved quotes", () => {
  const approved = makeQuote({ status: "approved" });

  assert.equal(quoteCanSend(approved), false);
  assert.equal(
    quoteSendBlockedReason(approved),
    "Approved quotes are locked and no longer need a fresh send step."
  );
});

test("downstream buttons stay gated with explicit reasons", () => {
  const expired = makeQuote({ status: "expired", expiresAt: "2026-07-01T00:00:00.000Z" });
  const converted = makeQuote({ status: "approved_internal", convertedJobId: "job_99" });
  const draft = makeQuote({ status: "draft" });

  assert.equal(quoteCanManualApprove(expired), false);
  assert.equal(
    quoteManualApproveBlockedReason(expired),
    "Expired quotes cannot be approved until they are renewed."
  );

  assert.equal(quoteCanConvertToJob(converted), false);
  assert.equal(
    quoteConvertToJobBlockedReason(converted),
    "This quote already converted into job job_99."
  );

  assert.equal(quoteCanCreateInvoice(draft), false);
  assert.equal(
    quoteInvoiceBlockedReason(draft),
    "Quote must be approved before an invoice is created."
  );
});

test("quote workspace uses the shared business templates and retains the inline client/property choice flow", () => {
  const source = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx"), "utf8");
  assert.match(source, /NexOpsRosterTemplate/);
  assert.match(source, /NexOpsDetailTemplate/);
  assert.match(source, /Select Client/);
  assert.match(source, /Existing Property/);
  assert.match(source, /Save New Property/);
  assert.match(source, /Gate code needed/);
  assert.match(source, /propertyId: composer\.propertyId/);
  assert.match(source, /Find Existing Client/);
  assert.match(source, /Type a client name, email, or phone/);
  assert.match(source, /Save as New Line Item\?/);
  assert.match(source, /Yes, Save New Line Item/);
  assert.match(source, /Quote Name/);
  assert.match(source, /Search products and services/);
  assert.match(source, /Quote Builder/);
  assert.match(source, /From Template/);
  assert.match(source, /Choose a Template/);
  assert.match(source, /quoteBuilderMode \? <>/);
  assert.match(source, /nexops-mobile-profile-summary/);
  assert.match(source, /MobileClientSummaryGlyph kind="phone"/);
  assert.match(source, /MobileClientSummaryGlyph kind="email"/);
  assert.match(source, /MobileClientSummaryGlyph kind="directions"/);
  assert.match(source, /Edit Client/);
});

test("Create Quote uses the editable curated rotating helper-copy list", () => {
  const source = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx"), "utf8");
  const copy = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/quoteCreationCopy.ts"), "utf8");

  assert.match(source, /title=\{workspaceView === "builder" \? "Create Quote" : "Quotes"\}/);
  assert.match(source, /detail=\{workspaceView === "builder" \? quoteCreationLine/);
  assert.match(source, /QUOTE_CREATION_ROTATING_LINES/);
  assert.match(source, /module-hero-card--quote/);
  assert.equal((copy.match(/^  ".*",?$/gm) ?? []).length, 25);
  assert.match(copy, /This form has strong opinions about your typing speed\./);
  assert.match(copy, /The checkbox has never once been checked with confidence\./);
});

test("quote builder keeps office defaults available without mixing configuration into the primary quote flow", () => {
  const source = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx"), "utf8");

  assert.match(source, /Quote defaults and templates/);
  assert.match(source, /Office configuration stays available without interrupting this quote\./);
  assert.match(source, /nexops-quote-builder-settings/);
});

test("legacy template line without a catalog identifier remains saveable as an editable manual line", () => {
  const draft = lineDraftFromQuoteItem({
    id: "legacy_line",
    code: "VGB-001",
    name: "Legacy documentation line",
    quantity: 1,
    unitPrice: 950,
    total: 950,
    source: "catalog"
  });

  assert.equal(draft.kind, "custom");
  assert.equal(draft.catalogItemId, "");
  assert.equal(draft.name, "Legacy documentation line");
});
