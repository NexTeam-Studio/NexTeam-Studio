import test from "node:test";
import assert from "node:assert/strict";
import {
  createStripeConnectExpressAccount,
  createStripeConnectOnboardingLink,
  retrieveStripeConnectAccount
} from "./stripe.js";

test("Stripe Connect Express account creation keeps processing fees with the tenant account", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "acct_aquatrace", type: "express", email: "billing@aquatrace.test" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => { global.fetch = originalFetch; });

  const account = await createStripeConnectExpressAccount({ STRIPE_SECRET_KEY: "sk_test_connect_piece" }, {
    tenantId: "aquatrace",
    email: "billing@aquatrace.test"
  });

  assert.equal(account.id, "acct_aquatrace");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/accounts");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk_test_connect_piece");
  assert.equal(calls[0].init.headers["Stripe-Account"], undefined);
  const body = calls[0].init.body.toString();
  assert.match(body, /type=express/);
  assert.match(body, /metadata%5BtenantId%5D=aquatrace/);
  assert.doesNotMatch(body, /application_fee_amount|application_fee_percent/);
});

test("Stripe Connect onboarding links accept local sandbox callbacks and are issued for the connected account", async (t) => {
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, init) => {
    call = { url, init };
    return new Response(JSON.stringify({ object: "account_link", url: "https://connect.stripe.test/setup", expires_at: 123 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => { global.fetch = originalFetch; });

  const link = await createStripeConnectOnboardingLink({ STRIPE_SECRET_KEY: "sk_test_connect_piece" }, {
    accountId: "acct_aquatrace",
    refreshUrl: "http://localhost:3000/api/stripe/connect/onboarding/refresh?tenantId=aquatrace",
    returnUrl: "http://localhost:3000/api/stripe/connect/onboarding/return?tenantId=aquatrace"
  });

  assert.equal(link.url, "https://connect.stripe.test/setup");
  assert.equal(call.url, "https://api.stripe.com/v1/account_links");
  const body = call.init.body.toString();
  assert.match(body, /account=acct_aquatrace/);
  assert.match(body, /type=account_onboarding/);
});

test("Stripe Connect account status is retrieved instead of inferred from onboarding return", async (t) => {
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, init) => {
    call = { url, init };
    return new Response(JSON.stringify({
      id: "acct_aquatrace",
      type: "express",
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const account = await retrieveStripeConnectAccount({ STRIPE_SECRET_KEY: "sk_test_connect_piece" }, {
    accountId: "acct_aquatrace"
  });

  assert.equal(call.url, "https://api.stripe.com/v1/accounts/acct_aquatrace");
  assert.equal(call.init.method, "GET");
  assert.equal(account.details_submitted, false);
  assert.equal(account.charges_enabled, false);
});
