import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Locator } from "playwright";
import { getAdminDb } from "../apps/server/src/firebase.js";

const baseUrl = (process.env.STAGING_BASE_URL?.trim() || "https://nexteam-studio-staging.up.railway.app").replace(/\/$/, "");
const receiptPath = "receipts/m2/stripe-payment-receipt.json";

async function fetchJson(path: string, init?: RequestInit): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const headers = Object.fromEntries(response.headers.entries());
  const contentType = response.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json") ? await response.json() as unknown : { text: await response.text() };
  return { status: response.status, json, headers };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} was not returned.`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fillFirst(candidates: Locator[], value: string, label: string): Promise<void> {
  for (const candidate of candidates) {
    try {
      const locator = candidate.first();
      await locator.waitFor({ state: "visible", timeout: 7_500 });
      await locator.fill(value, { timeout: 7_500 });
      return;
    } catch {
      // Try the next selector shape; Stripe Checkout changes labels between releases.
    }
  }
  throw new Error(`Could not find Stripe Checkout field: ${label}`);
}

async function clickFirst(candidates: Locator[]): Promise<boolean> {
  for (const candidate of candidates) {
    try {
      const locator = candidate.first();
      await locator.waitFor({ state: "visible", timeout: 5_000 });
      await locator.click({ timeout: 5_000, force: true });
      return true;
    } catch {
      // Try the next selector shape; Stripe Checkout markup varies by account.
    }
  }
  return false;
}

async function uncheckIfChecked(locator: Locator): Promise<void> {
  try {
    const target = locator.first();
    await target.waitFor({ state: "visible", timeout: 2_500 });
    if (await target.isChecked()) {
      await target.uncheck({ force: true, timeout: 2_500 });
    }
  } catch {
    // Link save is account/locale dependent; absence is fine for this receipt.
  }
}

async function clickEnabledSubmit(pageLocator: Locator): Promise<void> {
  const submit = pageLocator.first();
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await submit.isEnabled()) {
      await submit.click({ timeout: 30_000 });
      return;
    }
    await sleep(1_000);
  }
  throw new Error("Stripe Checkout submit button never became enabled.");
}

async function waitForPaidReceipt(invoiceId: string): Promise<Record<string, unknown>> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firebase Admin is required to verify invoice.paid receipt.");
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const invoiceSnapshot = await db.collection("invoices").doc(invoiceId).get();
    const invoice = invoiceSnapshot.data() as { status?: string; paidAt?: string; externalIds?: { stripe?: string } } | undefined;
    const eventsSnapshot = await db.collection("events")
      .where("tenantId", "==", "aquatrace")
      .where("type", "==", "invoice.paid")
      .get();
    const event = eventsSnapshot.docs
      .map((doc) => doc.data() as { id?: string; payload?: { invoiceId?: string; stripeSessionId?: string }; ts?: string })
      .find((candidate) => candidate.payload?.invoiceId === invoiceId);
    if (invoice?.status === "paid" && event) {
      return {
        invoiceStatus: invoice.status,
        paidAt: invoice.paidAt ?? null,
        stripeSessionIdStored: Boolean(invoice.externalIds?.stripe),
        eventId: event.id ?? null,
        eventTs: event.ts ?? null,
        eventType: "invoice.paid",
        eventStripeSessionIdStored: Boolean(event.payload?.stripeSessionId)
      };
    }
    await sleep(2_000);
  }
  throw new Error(`Timed out waiting for invoice.paid event for ${invoiceId}.`);
}

const version = await fetchJson("/api/version");
const clientCreate = await fetchJson("/api/crm/clients", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tenantId: "aquatrace",
    name: "Stripe Receipt Test Client",
    emails: ["stripe-receipt@example.test"],
    phones: [],
    consent: { email: false, sms: false }
  })
});
const client = asRecord(asRecord(clientCreate.json).client);
const clientId = requireString(client.id, "client.id");

const quoteDraft = await fetchJson("/api/crm/quotes/draft", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tenantId: "aquatrace",
    clientId,
    title: "M2 Stripe test-card receipt quote",
    items: [{ catalogCode: "VGB-001", quantity: 1, unitPriceCents: 100 }]
  })
});
const quote = asRecord(asRecord(quoteDraft.json).quote);
const approval = asRecord(asRecord(quoteDraft.json).approval);
const quoteId = requireString(quote.id, "quote.id");
const approvalId = requireString(approval.id, "approval.id");
const portalUrl = requireString(asRecord(quoteDraft.json).portalUrl, "portalUrl");

const approvalResult = await fetchJson(`/api/approval-queue/${encodeURIComponent(approvalId)}/approve`, { method: "POST" });
const signUrl = new URL(portalUrl, baseUrl);
const signResult = await fetchJson(`/api/portal/quotes/${encodeURIComponent(quoteId)}/sign`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    tenantId: signUrl.searchParams.get("tenantId") ?? "aquatrace",
    token: signUrl.searchParams.get("token") ?? "",
    typedName: "Stripe Test Receipt"
  })
});

const invoiceCreate = await fetchJson(`/api/crm/quotes/${encodeURIComponent(quoteId)}/invoice`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tenantId: "aquatrace" })
});
const invoice = asRecord(asRecord(invoiceCreate.json).invoice);
const invoiceId = requireString(invoice.id, "invoice.id");

const invoicePdf = await fetch(`${baseUrl}/api/crm/invoices/${encodeURIComponent(invoiceId)}/pdf?tenantId=aquatrace`);
const checkout = await fetchJson(`/api/crm/invoices/${encodeURIComponent(invoiceId)}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tenantId: "aquatrace" })
});
const checkoutUrl = requireString(asRecord(asRecord(checkout.json).checkout).url, "checkout.url");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await fillFirst([
  page.getByLabel(/email/i),
  page.locator("input[type='email']"),
  page.locator("input[name='email']")
], "stripe-receipt@example.test", "email");
await clickFirst([
  page.locator("#payment-method-accordion-item-title-card"),
  page.getByRole("radio", { name: /card/i }),
  page.getByLabel(/card/i)
]);
await uncheckIfChecked(page.locator("#enableStripePass"));
await fillFirst([
  page.getByLabel(/card number/i),
  page.getByPlaceholder(/1234|card number/i),
  page.locator("input[name='cardNumber']")
], "4242424242424242", "card number");
await fillFirst([
  page.getByLabel(/expiration|expiry/i),
  page.getByPlaceholder(/MM\s*\/\s*YY|MM \/ YY/i),
  page.locator("input[name='cardExpiry']")
], "1235", "expiration");
await fillFirst([
  page.getByLabel(/cvc|security/i),
  page.getByPlaceholder(/CVC|CVV/i),
  page.locator("input[name='cardCvc']")
], "123", "cvc");
await fillFirst([
  page.getByLabel(/cardholder name|name on card|full name/i),
  page.locator("input[name='billingName']"),
  page.locator("input[name='name']")
], "Stripe Receipt Test", "cardholder name");
await fillFirst([
  page.getByLabel(/zip|postal/i),
  page.getByPlaceholder(/12345|zip|postal/i),
  page.locator("input[name='billingPostalCode']")
], "32084", "billing postal code").catch(() => {
  // Postal code is not always rendered for test-mode Checkout sessions.
});
await clickEnabledSubmit(page.locator("[data-testid='hosted-payment-submit-button'], button[type='submit']"));
const redirectResult = await page.waitForURL(/\/portal\/invoices\/.*\/paid/, { timeout: 30_000 })
  .then(() => ({ redirected: true, error: null as string | null }))
  .catch((error: unknown) => ({ redirected: false, error: error instanceof Error ? error.message : String(error) }));
const finalUrl = page.url();
const paidReceipt = await waitForPaidReceipt(invoiceId);
await browser.close();

await mkdir("receipts/m2", { recursive: true });
const receipt = {
  ok: true,
  baseUrl,
  version,
  clientCreate,
  quoteDraft,
  approvalResult,
  signResult,
  invoiceCreate,
  invoicePdf: {
    status: invoicePdf.status,
    contentType: invoicePdf.headers.get("content-type"),
    startsWithPdf: Buffer.from(await invoicePdf.arrayBuffer()).subarray(0, 5).toString("utf8") === "%PDF-"
  },
  checkout,
  stripeTestCard: "4242",
  redirectResult,
  finalUrl,
  paidReceipt
};

await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, receiptPath, invoiceId, quoteId, eventType: paidReceipt.eventType }, null, 2));
