import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

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
await page.goto(checkoutUrl, { waitUntil: "networkidle" });
await page.getByLabel(/email/i).fill("stripe-receipt@example.test");
await page.getByLabel(/card number/i).fill("4242424242424242");
await page.getByLabel(/expiration/i).fill("1235");
await page.getByLabel(/cvc/i).fill("123");
await page.getByLabel(/cardholder name|name on card|full name/i).fill("Stripe Receipt Test");
await page.getByRole("button", { name: /pay|submit/i }).click();
await page.waitForURL(/\/portal\/invoices\/.*\/paid/, { timeout: 60000 });
const finalUrl = page.url();
await browser.close();

await new Promise((resolve) => setTimeout(resolve, 3000));

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
  finalUrl,
  eventExpected: "invoice.paid"
};

await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, receiptPath, invoiceId, quoteId, eventExpected: "invoice.paid" }, null, 2));
