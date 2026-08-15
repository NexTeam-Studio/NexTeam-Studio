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

test("quote workspace uses the shared business templates and retains client/property context in the focused builder", () => {
  const source = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx"), "utf8");
  assert.match(source, /NexOpsRosterTemplate/);
  assert.match(source, /NexOpsDetailTemplate/);
  assert.match(source, /Service Location/);
  assert.match(source, /Create New Client/);
  assert.match(source, /propertyId: composer\.propertyId/);
});

test("quote builder keeps office defaults available without mixing configuration into the primary quote flow", () => {
  const source = fs.readFileSync(path.resolve("apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx"), "utf8");

  assert.match(source, /Quote defaults and templates/);
  assert.match(source, /Office configuration stays available without interrupting this quote\./);
  assert.match(source, /nexops-quote-builder-settings/);
});
