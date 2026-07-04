import { spawnSync } from "node:child_process";

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const stagingBaseUrl = (process.env.STAGING_BASE_URL?.trim() || "https://nexteam-studio-staging.up.railway.app").replace(/\/$/, "");

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

if (!stripeKey) {
  fail("STRIPE_SECRET_KEY is not visible in this process. Run through Railway staging env injection.");
}
if (stripeKey.startsWith("sk_live_")) {
  fail("Refusing to use a live-mode Stripe key.");
}
if (!stripeKey.startsWith("sk_test_")) {
  fail("STRIPE_SECRET_KEY must be a test-mode key.");
}

const body = new URLSearchParams({
  url: `${stagingBaseUrl}/api/stripe/webhook`,
  description: "NexTeam M2 staging invoice.paid webhook",
  "enabled_events[0]": "checkout.session.completed"
});

const response = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
  method: "POST",
  headers: {
    authorization: `Bearer ${stripeKey}`,
    "content-type": "application/x-www-form-urlencoded"
  },
  body
});

const webhook = await response.json() as {
  id?: string;
  url?: string;
  status?: string;
  livemode?: boolean;
  enabled_events?: string[];
  secret?: string;
  error?: { message?: string };
};

if (!response.ok) {
  fail(webhook.error?.message ?? "Stripe webhook endpoint creation failed.");
}
if (webhook.livemode) {
  fail("Stripe returned a live-mode webhook endpoint; refusing to continue.");
}
if (!webhook.secret?.startsWith("whsec_")) {
  fail("Stripe did not return a webhook signing secret.");
}

const setResult = spawnSync(
  "railway",
  ["variable", "set", "--service", "NexTeam-Studio", "--environment", "staging", "--skip-deploys", "--stdin", "STRIPE_WEBHOOK_SECRET"],
  { input: webhook.secret, encoding: "utf8" }
);

if (setResult.status !== 0) {
  fail(`Railway variable set failed: ${setResult.stderr || setResult.stdout || "unknown error"}`);
}

console.log(JSON.stringify({
  ok: true,
  stripeWebhookEndpoint: {
    id: webhook.id,
    url: webhook.url,
    status: webhook.status,
    livemode: webhook.livemode,
    enabledEvents: webhook.enabled_events
  },
  railway: {
    environment: "staging",
    service: "NexTeam-Studio",
    variableStored: "STRIPE_WEBHOOK_SECRET",
    secretPrinted: false,
    deployTriggered: false
  }
}, null, 2));
