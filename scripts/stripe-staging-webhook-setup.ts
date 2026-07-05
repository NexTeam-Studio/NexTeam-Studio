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

const webhookUrl = `${stagingBaseUrl}/api/stripe/webhook`;
const webhookDescription = "NexTeam M2 staging invoice.paid webhook";

async function stripeRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${stripeKey}`,
      ...init.headers
    }
  });
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    fail(payload.error?.message ?? `Stripe request ${path} failed.`);
  }
  return payload as T;
}

const existing = await stripeRequest<{
  data?: Array<{ id?: string; url?: string; description?: string; livemode?: boolean }>;
}>("/webhook_endpoints?limit=100", { method: "GET" });
const deletedEndpointIds: string[] = [];
for (const endpoint of existing.data ?? []) {
  if (endpoint.id && endpoint.url === webhookUrl && endpoint.description === webhookDescription && endpoint.livemode === false) {
    await stripeRequest(`/webhook_endpoints/${encodeURIComponent(endpoint.id)}`, { method: "DELETE" });
    deletedEndpointIds.push(endpoint.id);
  }
}

const body = new URLSearchParams({
  url: webhookUrl,
  description: webhookDescription,
  "enabled_events[0]": "checkout.session.completed"
});

const webhook = await stripeRequest<{
  id?: string;
  url?: string;
  status?: string;
  livemode?: boolean;
  enabled_events?: string[];
  secret?: string;
}>("/webhook_endpoints", {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded"
  },
  body
});
if (webhook.livemode) {
  fail("Stripe returned a live-mode webhook endpoint; refusing to continue.");
}
if (!webhook.secret?.startsWith("whsec_")) {
  fail("Stripe did not return a webhook signing secret.");
}

const setResult = process.platform === "win32"
  ? spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", "railway.cmd variable --service NexTeam-Studio --environment staging --skip-deploys --set-from-stdin STRIPE_WEBHOOK_SECRET"],
    { input: webhook.secret, encoding: "utf8" }
  )
  : spawnSync(
    "railway",
    ["variable", "--service", "NexTeam-Studio", "--environment", "staging", "--skip-deploys", "--set-from-stdin", "STRIPE_WEBHOOK_SECRET"],
    { input: webhook.secret, encoding: "utf8" }
  );

if (setResult.status !== 0) {
  fail(`Railway variable set failed with status ${setResult.status ?? "unknown"}.`);
}

console.log(JSON.stringify({
  ok: true,
  cleanedPriorTestEndpoints: deletedEndpointIds,
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
