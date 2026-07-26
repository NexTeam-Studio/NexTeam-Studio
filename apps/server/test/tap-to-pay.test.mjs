import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { InMemoryPlatformRepository } from "../dist/platform/repository.js";
import { InMemoryMobileRepository } from "../dist/mobile/repository.js";
import { registerMobileRoutes } from "../dist/mobile/routes.js";

function clientRecord() {
  return {
    id: "client_1",
    tenantId: "aquatrace",
    name: "Deborah Justice",
    emails: ["deborah@example.test"],
    phones: ["8645551212"],
    tags: [],
    consent: { email: true, sms: true },
    communicationSettings: {
      quotesAndInvoices: "both",
      jobReminders: "both",
      jobClosureFollowUps: "email",
      reviewRequests: "email",
      smsDefaultMode: "one_way"
    }
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function makeFixture(envOverrides = {}) {
  const repository = new MemoryNativeCrmRepository({ clients: [clientRecord()] });
  const ledgerRepository = new MemoryLedgerRepository();
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository
  });
  const app = express();
  app.use(express.json());
  registerMobileRoutes(app, {
    repository: new InMemoryMobileRepository(),
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    ledgerService,
    platformRepository: new InMemoryPlatformRepository(),
    env: {
      TENANT_ID: "aquatrace",
      NEXI_FIREBASE_AUTH_REQUIRED: "false",
      STRIPE_SECRET_KEY: "sk_test_terminal_piece",
      STRIPE_CONNECTED_ACCOUNT_AQUATRACE: "acct_terminal_piece",
      STRIPE_TERMINAL_LOCATION_AQUATRACE: "tml_piece_terminal",
      STRIPE_TERMINAL_SIMULATED_AQUATRACE: "true",
      ...envOverrides
    }
  });
  return { app, repository, ledgerService };
}

async function createInvoice(repository, overrides = {}) {
  return repository.createInvoice({
    id: overrides.id ?? "invoice_tap_to_pay",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Tap to Pay field invoice",
    lineItems: [{
      id: "line_tap",
      code: "LEAK-TEST",
      name: "Leak detection",
      quantity: 1,
      unitPrice: 100,
      total: 100
    }],
    totals: { subtotal: 100, tax: 0, total: 100 },
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 100,
      overdue: false
    },
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    ...overrides
  });
}

test("Tap to Pay token and payment-intent routes reuse the tenant Connect account and card_present intent model", async (t) => {
  const { app, repository } = makeFixture();
  await createInvoice(repository, { id: "invoice_tap_start" });
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    calls.push({ url, init });
    if (String(url).includes("/terminal/connection_tokens")) {
      return new Response(JSON.stringify({ secret: "pst_test_terminal_secret" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      id: "pi_tap_start",
      client_secret: "pi_tap_start_secret",
      amount: 10000,
      currency: "usd",
      metadata: {
        tenantId: "aquatrace",
        invoiceId: "invoice_tap_start",
        tipAmount: "0.00"
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  await withServer(app, async (base) => {
    const tokenResponse = await fetch(`${base}/api/mobile/tap-to-pay/connection-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const tokenBody = await tokenResponse.json();
    assert.equal(tokenResponse.status, 201);
    assert.equal(tokenBody.secret, "pst_test_terminal_secret");

    const sessionResponse = await fetch(`${base}/api/mobile/tap-to-pay/payment-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", invoiceId: "invoice_tap_start" })
    });
    const sessionBody = await sessionResponse.json();
    assert.equal(sessionResponse.status, 201);
    assert.equal(sessionBody.paymentIntentId, "pi_tap_start");
    assert.equal(sessionBody.locationId, "tml_piece_terminal");
    assert.equal(sessionBody.simulated, true);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.headers["Stripe-Account"], "acct_terminal_piece");
    assert.equal(calls[1].init.headers["Stripe-Account"], "acct_terminal_piece");
    const encodedIntent = calls[1].init.body.toString();
    assert.match(encodedIntent, /payment_method_types%5B0%5D=card_present/);
    assert.match(encodedIntent, /capture_method=automatic/);
    assert.match(encodedIntent, /metadata%5BinvoiceId%5D=invoice_tap_start/);
    assert.doesNotMatch(encodedIntent, /application_fee_amount|application_fee_percent/);
  });
});

test("Tap to Pay completion writes the same ledger payment object used by every other Stripe payment path", async (t) => {
  const { app, repository, ledgerService } = makeFixture();
  await createInvoice(repository, { id: "invoice_tap_success" });
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    assert.equal(init.headers["Stripe-Account"], "acct_terminal_piece");
    return new Response(JSON.stringify({
      id: "pi_tap_success",
      amount: 10000,
      currency: "usd",
      status: "succeeded",
      metadata: {
        tenantId: "aquatrace",
        invoiceId: "invoice_tap_success",
        tipAmount: "0.00"
      },
      latest_charge: {
        id: "ch_tap_success",
        payment_method_details: {
          type: "card_present",
          card_present: {
            brand: "visa",
            last4: "4242",
            cardholder_name: "Deborah Justice"
          }
        }
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/tap-to-pay/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        invoiceId: "invoice_tap_success",
        paymentIntentId: "pi_tap_success",
        deviceLabel: "Tap to Pay on iPhone",
        devicePlatform: "ios/18.1"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.payment.provider, "stripe");
    assert.equal(body.payment.method, "card");
    assert.equal(body.payment.methodDetails.collectionChannel, "tap_to_pay");
    assert.equal(body.payment.methodDetails.deviceLabel, "Tap to Pay on iPhone");
    assert.equal(body.payment.externalIds.stripePaymentIntentId, "pi_tap_success");
    assert.equal(body.payment.cardSummary.brand, "visa");
    assert.equal(body.payment.cardSummary.last4, "4242");
    assert.equal(body.invoice.status, "paid");
    assert.equal(body.receiptReview.status, "draft");

    const payments = await ledgerService.listPayments("aquatrace");
    assert.equal(payments.length, 1);
    assert.equal(payments[0].externalIds?.stripePaymentIntentId, "pi_tap_success");
  });
});

test("Tap to Pay failure records a failed Stripe payment without settling the invoice", async (t) => {
  const { app, repository } = makeFixture();
  await createInvoice(repository, { id: "invoice_tap_failure" });
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    return new Response(JSON.stringify({
      id: "pi_tap_failure",
      amount: 10000,
      currency: "usd",
      status: "requires_payment_method",
      metadata: {
        tenantId: "aquatrace",
        invoiceId: "invoice_tap_failure",
        tipAmount: "0.00"
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/tap-to-pay/failure`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        invoiceId: "invoice_tap_failure",
        paymentIntentId: "pi_tap_failure",
        failureMessage: "Card declined: insufficient funds",
        deviceLabel: "Tap to Pay on Android",
        devicePlatform: "android/14"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.payment.status, "failed");
    assert.equal(body.payment.methodDetails.collectionChannel, "tap_to_pay");
    assert.match(body.payment.methodDetails.failureMessage, /insufficient funds/i);
    assert.equal(body.invoice.status, "awaiting_payment");
    assert.equal(body.invoice.ledger.paymentApplied, 0);
    assert.equal(body.receiptReview, undefined);
  });
});
