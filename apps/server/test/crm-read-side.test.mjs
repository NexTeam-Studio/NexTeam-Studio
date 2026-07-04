import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository, invoiceSchema, quoteSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { buildQuoteDraft } from "../dist/crm/quoteBuilder.js";
import { renderQuotePdf } from "../dist/crm/quotePdf.js";
import { createCrmReadTools, createCrmTools } from "../dist/crm/nexiTools.js";
import { hashPortalToken } from "../dist/crm/routes.js";

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
  assets: []
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
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tools = createCrmTools(adapter, approvalQueue);
  const createClient = tools.find((tool) => tool.name === "createClient");
  const draftQuote = tools.find((tool) => tool.name === "draftQuote");
  const invoiceStatus = tools.find((tool) => tool.name === "invoiceStatus");
  assert.ok(createClient);
  assert.ok(draftQuote);
  assert.ok(invoiceStatus);

  const created = await createClient.handler(tenant, { name: "Portal Client", emails: ["portal@example.test"], phones: [], consent: { email: true, sms: false } });
  assert.equal(created.result.client.tenantId, "aquatrace");

  const drafted = await draftQuote.handler(tenant, {
    clientId: "client_1",
    title: "Approval-gated VGB quote",
    items: [{ catalogCode: "VGB-002", quantity: 1, unitPriceCents: 99500 }]
  });
  assert.equal(drafted.result.quote.approvalId, drafted.result.approval.id);
  assert.equal(drafted.result.approval.kind, "quote");
  assert.equal(drafted.sources.some((source) => source.ref === "VGB-001..072"), true);

  const status = await invoiceStatus.handler(tenant, { clientId: "client_1" });
  assert.equal(status.result.invoices[0].status, "sent");
  assert.equal(status.sources[0].rail, "native");
});
