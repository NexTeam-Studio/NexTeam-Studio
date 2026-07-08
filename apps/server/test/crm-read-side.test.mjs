import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ApprovalQueueService, InMemoryApprovalQueueRepository, invoiceSchema, quoteSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { buildQuoteDraft } from "../dist/crm/quoteBuilder.js";
import { renderInvoicePdf, renderQuotePdf } from "../dist/crm/quotePdf.js";
import { createCrmReadTools, createCrmTools } from "../dist/crm/nexiTools.js";
import { hashPortalToken } from "../dist/crm/routes.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "../dist/crm/stripe.js";

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

const client = {
  id: "client_1",
  tenantId: "aquatrace",
  name: "Deborah Justice",
  emails: ["deborah@example.test"],
  phones: [],
  tags: [],
  consent: { email: false, sms: false },
  externalIds: { jobber: "jobber_client_1" }
};

const property = {
  id: "property_1",
  tenantId: "aquatrace",
  clientId: "client_1",
  address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
  assets: [],
  externalIds: { jobber: "jobber_property_1" }
};

const job = {
  id: "job_1",
  tenantId: "aquatrace",
  clientId: "client_1",
  propertyId: "property_1",
  status: "lead",
  title: "Swimming Pool Leak Detection",
  lineItems: [],
  totals: { subtotal: 795, tax: 0, total: 795 },
  externalIds: { jobber: "jobber_job_1" }
};

test("CRM quote and invoice native schemas parse", () => {
  quoteSchema.parse({
    id: "quote_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "draft",
    title: "Leak detection quote",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  });
  invoiceSchema.parse({
    id: "invoice_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "sent",
    title: "Leak detection invoice",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  });
});

test("NativeAdapter exposes CRM read methods", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  assert.equal((await adapter.getClients("Deborah")).length, 1);
  assert.equal((await adapter.getJobs({ from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).length, 1);
  const detail = await adapter.getJobDetail({ nameQuery: "Swimming Pool" });
  assert.equal(detail.client?.name, "Deborah Justice");
  assert.equal(detail.property?.address.street1, "181 Isbell Road");
  assert.equal(detail.property?.externalIds?.jobber, "jobber_property_1");
});

test("native import upserts remain idempotent by Jobber external ids", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [job] });
  await repository.upsertClient({ ...client, id: "client_duplicate_native", name: "Deborah Justice Updated" });
  await repository.upsertProperty({
    ...property,
    id: "property_duplicate_native",
    address: { ...property.address, street1: "181 Isbell Road Updated" }
  });
  await repository.upsertJob({ ...job, id: "job_duplicate_native", title: "Updated Swimming Pool Leak Detection" });
  const clients = await repository.listClients("aquatrace");
  const properties = await repository.listProperties("aquatrace");
  const jobs = await repository.listJobs("aquatrace");
  assert.equal(clients.length, 1);
  assert.equal(properties.length, 1);
  assert.equal(jobs.length, 1);
  assert.equal(clients[0].name, "Deborah Justice Updated");
  assert.equal(properties[0].address.street1, "181 Isbell Road Updated");
  assert.equal(jobs[0].title, "Updated Swimming Pool Leak Detection");
});

test("NativeAdapter writes native clients and approval-gated quote drafts", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [job] });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const created = await adapter.createClient({
    tenantId: "aquatrace",
    name: "Hotel GM",
    emails: ["gm@example.test"],
    phones: ["555-0100"],
    consent: { email: true, sms: false }
  });
  assert.equal(created.tenantId, "aquatrace");
  assert.match(created.id, /^client_/);

  const draft = buildQuoteDraft({
    tenantId: "aquatrace",
    clientId: created.id,
    title: "VGB compliance quote",
    items: [{ catalogCode: "VGB-001", quantity: 2, unitPriceCents: 12500 }]
  });
  const quote = await adapter.draftQuote(draft);
  assert.equal(quote.status, "pending_approval");
  assert.equal(quote.totals.total, 250);
  const updated = await adapter.updateQuote(quote.id, { portalTokenHash: hashPortalToken("safe-test-token-123456") });
  assert.equal(updated.portalTokenHash, hashPortalToken("safe-test-token-123456"));

  const pdf = renderQuotePdf(updated, created);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("CRM read nexi-tools expose pipeline and client lookup", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  const tools = createCrmReadTools(adapter);
  const clientLookup = tools.find((tool) => tool.name === "clientLookup");
  const getPipeline = tools.find((tool) => tool.name === "getPipeline");
  assert.ok(clientLookup);
  assert.ok(getPipeline);
  const clients = await clientLookup.handler(tenant, { q: "Deborah" });
  const pipeline = await getPipeline.handler(tenant, {});
  assert.equal(clients.sources[0].rail, "native");
  assert.equal(pipeline.result.counts.lead, 1);
});

test("CRM write nexi-tools create clients, draft quotes through ApprovalQueue, and read invoices", async () => {
  const invoice = {
    id: "invoice_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "sent",
    title: "Leak detection invoice",
    lineItems: [],
    totals: { subtotal: 795, tax: 0, total: 795 }
  };
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job], invoices: [invoice] });
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const tools = createCrmTools(adapter, approvalQueue);
  const createClient = tools.find((tool) => tool.name === "createClient");
  const draftQuote = tools.find((tool) => tool.name === "draftQuote");
  const invoiceStatus = tools.find((tool) => tool.name === "invoiceStatus");
  assert.ok(createClient);
  assert.ok(draftQuote);
  assert.ok(invoiceStatus);

  const queued = await createClient.handler(tenant, {
    name: "Portal Client",
    address: "123 Test Lane, Fair Play, SC",
    emails: ["portal@example.test"],
    phones: [],
    consent: { email: true, sms: false }
  });
  assert.equal(queued.result.approval.kind, "client");
  assert.equal(queued.result.writesAreApprovalQueuedOnly, true);
  assert.equal((await adapter.getClients("Portal Client")).length, 0);
  await approvalQueue.approve(queued.result.approval.id);
  const executed = await approvalQueue.executeApproved(queued.result.approval.id);
  assert.equal(executed.result.client.tenantId, "aquatrace");
  assert.equal((await adapter.getClients("Portal Client")).length, 1);

  const drafted = await draftQuote.handler(tenant, {
    clientId: "client_1",
    title: "Approval-gated VGB quote",
    items: [{ catalogCode: "VGB-002", quantity: 1, unitPriceCents: 99500 }]
  });
  assert.equal(drafted.result.quote.approvalId, drafted.result.approval.id);
  assert.equal(drafted.result.approval.kind, "quote");
  assert.equal(drafted.sources.some((source) => source.ref === "jobber-products-services"), true);

  const status = await invoiceStatus.handler(tenant, { clientId: "client_1" });
  assert.equal(status.result.invoices[0].status, "sent");
  assert.equal(status.sources[0].rail, "native");
});

test("NativeAdapter writes invoices and renders invoice PDFs", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [job] });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const invoice = await adapter.createInvoice({
    id: "invoice_native_write_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    jobId: "job_1",
    status: "sent",
    title: "Stripe test invoice",
    lineItems: [{ id: "line_1", code: "VGB-001", name: "VGB Zone 1", quantity: 1, unitPrice: 9.5, total: 9.5 }],
    totals: { subtotal: 9.5, tax: 0, total: 9.5 }
  });
  assert.equal(invoice.status, "sent");
  const paid = await adapter.updateInvoice(invoice.id, { status: "paid", paidAt: "2026-07-04T20:00:00.000Z", externalIds: { stripe: "cs_test_receipt" } });
  assert.equal(paid.status, "paid");
  assert.equal(paid.externalIds.stripe, "cs_test_receipt");
  const pdf = renderInvoicePdf(paid, client);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("Stripe rail refuses live keys and verifies webhook signatures", async () => {
  await assert.rejects(
    () => createStripeCheckoutSession(
      { STRIPE_SECRET_KEY: `sk_${"live"}_disallowed` },
      {
        id: "invoice_1",
        tenantId: "aquatrace",
        clientId: "client_1",
        status: "sent",
        title: "Live key refusal",
        lineItems: [],
        totals: { subtotal: 1, tax: 0, total: 1 }
      },
      { protocol: "https", get: () => "example.test", headers: {} }
    ),
    /Live-mode Stripe keys/
  );

  const raw = Buffer.from(JSON.stringify({
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_receipt",
        payment_status: "paid",
        metadata: { invoiceId: "invoice_1", tenantId: "aquatrace" }
      }
    }
  }));
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "whsec_test_receipt";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw.toString("utf8")}`).digest("hex");
  const event = verifyStripeWebhookEvent({ STRIPE_WEBHOOK_SECRET: secret }, raw, `t=${timestamp},v1=${signature}`);
  assert.equal(event.type, "checkout.session.completed");
  assert.equal(event.data.object.id, "cs_test_receipt");
});
