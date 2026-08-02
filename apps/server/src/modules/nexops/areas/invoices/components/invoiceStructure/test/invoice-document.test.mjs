import test from "node:test";
import assert from "node:assert/strict";

import { renderInvoicePortalHtml } from "../server/invoiceDocument.ts";

test("Invoice Structure owns the customer portal document and payment schedule wording", () => {
  const html = renderInvoicePortalHtml({
    id: "invoice_1",
    tenantId: "tenant_1",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Service invoice",
    lineItems: [{ id: "line_1", code: "SERVICE", name: "Service", quantity: 1, unitPrice: 250, total: 250 }],
    totals: { subtotal: 250, tax: 0, total: 250 },
    ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 250, overdue: false },
    paymentSchedule: {
      enabled: true,
      milestones: [{ id: "milestone_1", label: "Final", trigger: "on_job_close", amountKind: "percent", amount: 100 }]
    },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  }, "portal-token");

  assert.match(html, /NexPortal invoice/);
  assert.match(html, /Payment schedule/);
  assert.match(html, /Final/);
  assert.match(html, /Pay by card/);
});

test("customer payment return states clearly distinguish a completed payment from a cancellation", () => {
  const invoice = {
    id: "invoice_return_1",
    tenantId: "tenant_1",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Service invoice",
    lineItems: [],
    totals: { subtotal: 250, tax: 0, total: 250 },
    ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 250, overdue: false },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  };

  assert.match(renderInvoicePortalHtml(invoice, "portal-token", undefined, { paymentRecorded: true }), /Payment recorded\./);
  assert.match(renderInvoicePortalHtml(invoice, "portal-token", undefined, { paymentCancelled: true }), /Payment was not completed\./);
});
