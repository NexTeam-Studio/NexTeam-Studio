import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { invoiceWorkspaceRail } from "../NexOpsInvoicesPage.tsx";

function makeInvoice(overrides = {}) {
  return {
    id: "inv_1",
    tenantId: "tenant_aquatrace",
    clientId: "client_1",
    status: "draft",
    title: "Leak repair invoice",
    lineItems: [],
    totals: { subtotal: 350, tax: 0, total: 350 },
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 350,
      overdue: false
    },
    ...overrides
  };
}

test("draft invoices surface send as the dominant next move", () => {
  const rail = invoiceWorkspaceRail({
    invoice: makeInvoice({ status: "draft" }),
    payments: [],
    receiptReviews: []
  });

  assert.equal(rail.stage, "Finalize and send");
  assert.equal(rail.dominantAction, "send-invoice");
  assert.equal(rail.dominantLabel, "Send invoice");
});

test("open balances keep payment collection as the next move", () => {
  const rail = invoiceWorkspaceRail({
    invoice: makeInvoice({
      status: "partial_pay",
      ledger: {
        depositApplied: 0,
        creditApplied: 0,
        paymentApplied: 150,
        refundedAmount: 0,
        balanceDue: 200,
        overdue: false
      }
    }),
    payments: [{ id: "pay_1", clientId: "client_1", provider: "stripe", method: "card", status: "succeeded", amount: 150, appliedAmount: 150, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }],
    receiptReviews: []
  });

  assert.equal(rail.stage, "Collect remaining balance");
  assert.equal(rail.dominantAction, "collect-payment");
  assert.equal(rail.dominantLabel, "Collect remaining");
});

test("failed payment attempts switch the rail into recovery mode", () => {
  const rail = invoiceWorkspaceRail({
    invoice: makeInvoice({ status: "awaiting_payment" }),
    payments: [{ id: "pay_failed", clientId: "client_1", provider: "stripe", method: "card", status: "failed", amount: 350, appliedAmount: 0, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }],
    receiptReviews: []
  });

  assert.equal(rail.stage, "Payment recovery");
  assert.equal(rail.dominantAction, "collect-payment");
  assert.equal(rail.dominantLabel, "Recover payment");
});

test("paid invoices stop at receipt review until the package is sent", () => {
  const rail = invoiceWorkspaceRail({
    invoice: makeInvoice({
      status: "paid",
      ledger: {
        depositApplied: 0,
        creditApplied: 0,
        paymentApplied: 350,
        refundedAmount: 0,
        balanceDue: 0,
        overdue: false
      }
    }),
    payments: [{ id: "pay_1", clientId: "client_1", provider: "stripe", method: "card", status: "succeeded", amount: 350, appliedAmount: 350, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }],
    receiptReviews: [{
      id: "rr_1",
      invoiceId: "inv_1",
      status: "draft",
      subject: "Your receipt",
      bodyText: "Attached.",
      emailRecipients: ["client@example.com"],
      smsRecipients: [],
      sendChannels: ["email"],
      attachments: [],
      hostedLink: "https://example.test/receipt"
    }]
  });

  assert.equal(rail.stage, "Receipt review waiting");
  assert.equal(rail.dominantAction, "send-receipt");
  assert.equal(rail.dominantLabel, "Send receipt");
});

test("named invoice interface areas use Title Case", () => {
  const source = readFileSync(new URL("../NexOpsInvoicesPage.tsx", import.meta.url), "utf8");
  const scheduleSource = readFileSync(new URL("../PaymentScheduleEditor.tsx", import.meta.url), "utf8");

  for (const label of [
    "Invoice Roster",
    "Combine Ready Jobs",
    "Combined Invoice Title",
    "Payment Schedule",
    "Invoice Detail",
    "Request Carry-Forward",
    "Prepare and Send",
    "Draft Invoice Editor",
    "Add Line Item",
    "Send Invoice",
    "Receipt Review"
  ]) {
    assert.match(source, new RegExp(label));
  }

  for (const label of ["Payment Schedule", "On Approval", "On Job Close", "Amount Type", "Add Milestone"]) {
    assert.match(scheduleSource, new RegExp(label));
  }
});
