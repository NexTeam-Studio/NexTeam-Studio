import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { ApprovalQueueService, clientSchema, InMemoryApprovalQueueRepository, invoiceSchema, quoteSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { buildQuoteDraft } from "../dist/crm/quoteBuilder.js";
import { renderInvoicePdf, renderQuotePdf } from "../dist/crm/quotePdf.js";
import { materializeQuoteRecord } from "../dist/crm/quoteFoundation.js";
import { createCrmReadTools, createCrmReadToolsWithOptions, createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "../dist/crm/stripe.js";
import { assertAccessRole } from "../dist/auth/accessContext.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

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
    totals: { subtotal: 0, tax: 0, total: 0 },
    approvalRules: {
      requireSignature: false,
      requireDeposit: false,
      requireCardOnFile: false
    }
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
  const jobs = await adapter.getJobs({ from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "Unscheduled");
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
  assert.equal(quote.status, "draft");
  assert.match(quote.number, /^Q-/);
  assert.equal(quote.totals.total, 250);
  const updated = await adapter.updateQuote(quote.id, { portal: { tokenHash: "safe-test-token-123456", tokenIssuedAt: "2026-07-12T12:00:00.000Z" } });
  assert.equal(updated.portal.tokenHash, "safe-test-token-123456");

  const pdf = renderQuotePdf(updated, created);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("NexOps 3.2 client records preserve display, billing, and one-way SMS settings", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const created = await adapter.createClient({
    tenantId: "aquatrace",
    name: "Medallion Pool Company",
    company: "Medallion Pool Company",
    personName: { firstName: "Dallas", lastName: "Bodkin" },
    displayNamePreference: "company",
    billingSameAsPrimaryProperty: false,
    billingAddress: {
      street1: "51 North Merrimon Avenue Suite 101",
      city: "Woodfin",
      province: "NC",
      postalCode: "28804",
      country: "US"
    },
    contacts: [{
      id: "contact_dallas",
      personName: { firstName: "Dallas", lastName: "Bodkin" },
      role: "Billing contact",
      billingContact: true,
      correspondenceContact: true,
      channelPreference: "both",
      phones: [{
        label: "Mobile",
        value: "8282030625",
        normalized: "+18282030625",
        primary: true,
        receivesMessages: true,
        smsCapability: "mobile",
        smsMode: "one_way"
      }],
      emails: [{
        label: "Main",
        value: "dallas@example.test",
        primary: true
      }]
    }],
    communicationSettings: {
      quotesAndInvoices: "both",
      jobReminders: "both",
      jobClosureFollowUps: "email",
      reviewRequests: "email",
      smsDefaultMode: "one_way"
    },
    emails: ["dallas@example.test"],
    phones: ["8282030625"],
    consent: { email: true, sms: true }
  });

  clientSchema.parse(created);
  assert.equal(created.displayNamePreference, "company");
  assert.equal(created.contacts?.[0]?.channelPreference, "both");
  assert.equal(created.contacts?.[0]?.phones?.[0]?.smsMode, "one_way");
  assert.equal(created.billingSameAsPrimaryProperty, false);
  assert.equal((await adapter.getClients("Dallas Bodkin")).length, 1);
  assert.equal((await adapter.getClients("8282030625")).length, 1);
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
  assert.equal(pipeline.result.counts.Unscheduled, 1);
});

test("CRM clientLookup falls back to live Jobber when native CRM has no matching client", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  const fallbackClient = {
    id: "jobber_client_kristi",
    tenantId: "aquatrace",
    name: "Kristi King",
    emails: [],
    phones: [],
    tags: [],
    consent: { email: false, sms: false },
    externalIds: { jobber: "jobber_client_kristi" }
  };
  const tools = createCrmReadToolsWithOptions(adapter, {
    fallbackClientProvider: {
      getClients: async (q) => q === "Kristi King" ? [fallbackClient] : []
    }
  });
  const clientLookup = tools.find((tool) => tool.name === "clientLookup");
  assert.ok(clientLookup);

  const result = await clientLookup.handler(tenant, { q: "Kristi King" });

  assert.equal(result.result.nativeCount, 0);
  assert.equal(result.result.jobberFallbackCount, 1);
  assert.equal(result.result.fallbackUsed, true);
  assert.equal(result.result.clients[0].name, "Kristi King");
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
});

test("CRM write nexi-tools create clients, queue quotes through ApprovalQueue, and read invoices", async () => {
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
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [job], invoices: [invoice] });
  const toolAdapter = new NativeAdapter(repository, "aquatrace");
  const toolApprovalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(toolAdapter));
  const tools = createCrmToolsWithOptions(toolAdapter, toolApprovalQueue, { requestRepository: repository });
  const createClient = tools.find((tool) => tool.name === "createClient");
  const createQuote = tools.find((tool) => tool.name === "createQuote");
  const listQuotes = tools.find((tool) => tool.name === "listQuotes");
  const getQuoteDetail = tools.find((tool) => tool.name === "getQuoteDetail");
  const invoiceStatus = tools.find((tool) => tool.name === "invoiceStatus");
  assert.ok(createClient);
  assert.ok(createQuote);
  assert.ok(listQuotes);
  assert.ok(getQuoteDetail);
  assert.ok(invoiceStatus);

  const queued = await createClient.handler(tenant, {
    name: "Portal Client",
    company: "Portal Client LLC",
    personName: { firstName: "Pat", lastName: "Portal" },
    displayNamePreference: "person",
    address: "123 Test Lane, Fair Play, SC",
    billingSameAsPrimaryProperty: true,
    contacts: [{
      personName: { firstName: "Pat", lastName: "Portal" },
      billingContact: true,
      correspondenceContact: true,
      channelPreference: "both",
      phones: [{
        label: "Mobile",
        value: "555-0100",
        primary: true,
        receivesMessages: true,
        smsCapability: "unknown",
        smsMode: "one_way"
      }],
      emails: [{
        label: "Main",
        value: "portal@example.test",
        primary: true
      }]
    }],
    communicationSettings: {
      quotesAndInvoices: "both",
      jobReminders: "sms",
      jobClosureFollowUps: "email",
      reviewRequests: "email",
      smsDefaultMode: "one_way"
    },
    emails: ["portal@example.test"],
    phones: ["555-0100"],
    consent: { email: true, sms: true }
  });
  assert.equal(queued.result.approval.kind, "client");
  assert.equal(queued.result.writesAreApprovalQueuedOnly, true);
  assert.equal((await toolAdapter.getClients("Portal Client")).length, 0);
  await toolApprovalQueue.approve(queued.result.approval.id);
  const executed = await toolApprovalQueue.executeApproved(queued.result.approval.id);
  assert.equal(executed.result.client.tenantId, "aquatrace");
  assert.equal(executed.result.client.displayNamePreference, "person");
  assert.equal(executed.result.client.contacts[0].channelPreference, "both");
  assert.equal(executed.result.client.communicationSettings.smsDefaultMode, "one_way");
  assert.equal((await toolAdapter.getClients("Portal Client")).length, 1);

  const drafted = await createQuote.handler(tenant, {
    clientId: "client_1",
    title: "Approval-gated VGB quote",
    items: [{ kind: "catalog", catalogCode: "VGB-002", quantity: 1, unitPrice: 995 }],
    approvalRules: {
      requireSignature: true,
      requireDeposit: false,
      requireCardOnFile: false
    }
  });
  assert.equal(drafted.result.pendingQuote.approvalId, drafted.result.approval.id);
  assert.equal(drafted.result.approval.kind, "quote");
  assert.equal(drafted.sources.some((source) => source.ref === "native-quote-config"), true);
  await toolApprovalQueue.approve(drafted.result.approval.id);
  await toolApprovalQueue.executeApproved(drafted.result.approval.id);

  const listed = await listQuotes.handler(tenant, { q: "Approval-gated" });
  assert.equal(listed.result.quotes.length, 1);
  assert.equal(listed.result.quotes[0].title, "Approval-gated VGB quote");

  const detail = await getQuoteDetail.handler(tenant, { query: "Approval-gated" });
  assert.equal(detail.result.quote.title, "Approval-gated VGB quote");
  assert.equal(detail.result.client.name, "Deborah Justice");

  const status = await invoiceStatus.handler(tenant, { clientId: "client_1" });
  assert.equal(status.result.invoices[0].status, "sent");
  assert.equal(status.sources[0].rail, "native");
});

test("CRM createClient tool blocks approval when telephone is missing", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [], properties: [], jobs: [], invoices: [] });
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const tools = createCrmToolsWithOptions(adapter, approvalQueue);
  const createClient = tools.find((tool) => tool.name === "createClient");
  assert.ok(createClient);

  const blocked = await createClient.handler(tenant, {
    name: "Logan Sears",
    address: "6020 Frest Dr, Seneca, SC 29672",
    emails: ["4lbsears@gmail.com"],
    phones: [],
    consent: { email: true, sms: false }
  });

  assert.equal(blocked.result.saveBlocked, true);
  assert.deepEqual(blocked.result.missingFields, ["telephone"]);
  assert.match(blocked.result.needsClarification, /still need telephone/i);
  assert.deepEqual(await approvalQueue.listPending("aquatrace"), []);
});

test("CRM client route rejects incomplete saves before a client record is created", async () => {
  const repository = new MemoryNativeCrmRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/crm/clients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        name: "Blocked Client",
        emails: ["blocked@example.test"],
        phones: [],
        consent: { email: true, sms: false }
      })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /address is required|telephone is required/i);
    assert.equal((await repository.listClients("aquatrace")).length, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM routes read clients created by ApprovalQueue execution from the shared native repository", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const approval = await approvalQueue.create({
    tenantId: "aquatrace",
    kind: "client",
    preview: {
      title: "Create client: Chris Sears",
      body: "Local route/read-model regression proof."
    },
    execute: {
      service: "crm",
      op: "createClient",
      args: {
        tenantId: "aquatrace",
        client: {
          tenantId: "aquatrace",
          name: "Chris Sears",
          personName: { firstName: "Chris", lastName: "Sears" },
          displayNamePreference: "person",
          billingSameAsPrimaryProperty: true,
          contacts: [{
            personName: { firstName: "Chris", lastName: "Sears" },
            correspondenceContact: true,
            billingContact: true,
            phones: [],
            emails: [],
            channelPreference: "email"
          }],
          communicationSettings: {
            quotesAndInvoices: "email",
            jobReminders: "email",
            jobClosureFollowUps: "email",
            reviewRequests: "email",
            smsDefaultMode: "one_way"
          },
          emails: [],
          phones: [],
          consent: { email: false, sms: false }
        },
        addressNote: "102 Kate Lane, Fair Play, SC 29643"
      }
    },
    createdBy: "user"
  });

  await approvalQueue.approve(approval.id);
  await approvalQueue.executeApproved(approval.id);

  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/crm/clients?tenantId=aquatrace`);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.clients.length, 1);
    assert.equal(body.clients[0].name, "Chris Sears");
    assert.equal(body.clients[0].displayNamePreference, "person");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM quote routes create, send, approve, convert, invoice, and renew quotes", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [] });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository: new InMemorySchedulingRepository(),
    lifecycleRepository: new MemoryJobLifecycleRepository(),
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    }
  });
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter, jobLifecycleService));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    jobLifecycleService,
    commsRail: {
      sendAdapter: {
        mailbox: "nexi",
        sendEmail: async () => ({ provider: "gmail_relay", id: "email_receipt_1", acceptedAt: "2026-07-12T12:00:00.000Z", mailbox: "nexi" })
      },
      sendSms: async () => ({ provider: "twilio", id: "sms_receipt_1", acceptedAt: "2026-07-12T12:01:00.000Z" })
    },
    env: { TENANT_ID: "aquatrace" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const settingsResponse = await fetch(`${base}/api/crm/settings?tenantId=aquatrace`);
    const settingsBody = await settingsResponse.json();
    assert.equal(settingsBody.ok, true);
    assert.deepEqual(Object.keys(settingsBody.settings.documentNumbering).sort(), ["invoice", "job", "quote", "request"]);

    const templatesResponse = await fetch(`${base}/api/crm/quote-templates?tenantId=aquatrace`);
    const templatesBody = await templatesResponse.json();
    assert.equal(templatesBody.ok, true);
    assert.equal(templatesBody.templates.some((template) => template.id === "quote_template_standard_aquatrace"), true);

    const createResponse = await fetch(`${base}/api/crm/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        clientId: "client_1",
        title: "Zone 2 approval quote",
        items: [
          { kind: "catalog", catalogCode: "VGB-002", quantity: 1 },
          { kind: "custom", code: "TRAVEL", name: "Travel prep", quantity: 1, unitPrice: 45 }
        ],
        discount: { kind: "percent", value: 10 },
        taxRate: 7,
        approvalRules: {
          requireSignature: true,
          requireDeposit: true,
          requireCardOnFile: true,
          depositKind: "percent",
          depositValue: 25
        },
        terms: "Client approval keeps the quote locked.",
        delivery: { mode: "draft" }
      })
    });
    const createBody = await createResponse.json();
    assert.equal(createBody.ok, true);
    assert.equal(createBody.quote.status, "draft");
    assert.match(createBody.quote.number, /^Q-/);
    assert.equal(createBody.quote.deposit.amount > 0, true);
    assert.equal(createBody.quote.discount.kind, "percent");
    assert.equal(createBody.quote.discount.value, 10);
    assert.equal(createBody.quote.totals.subtotal, 1195);
    assert.equal(createBody.quote.totals.discount, 119.5);
    assert.equal(createBody.quote.totals.tax, 75.29);
    assert.equal(createBody.quote.totals.total, 1150.79);

    const sendResponse = await fetch(`${base}/api/crm/quotes/${createBody.quote.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", mode: "email", target: "deborah@example.test" })
    });
    const sendBody = await sendResponse.json();
    assert.equal(sendBody.ok, true);
    assert.equal(sendBody.quote.status, "sent");
    assert.equal(sendBody.delivery.mode, "email");
    assert.match(sendBody.portalUrl, /^\/portal\/quotes\//);

    const portalUrl = new URL(`${base}${sendBody.portalUrl}`);
    const portalResponse = await fetch(portalUrl);
    const portalHtml = await portalResponse.text();
    assert.equal(portalResponse.status, 200);
    assert.match(portalHtml, /NexPortal/i);
    assert.match(portalHtml, /Approve quote/i);
    assert.match(portalHtml, /value="drawn" checked/);
    assert.match(portalHtml, /value="typed"/);

    const token = portalUrl.searchParams.get("token");
    assert.ok(token);

    const approveResponse = await fetch(`${base}/api/portal/quotes/${createBody.quote.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        token,
        customerName: "Deborah Justice",
        signatureMode: "typed",
        typedName: "Deborah Justice",
        deposit: {
          cardholderName: "Deborah Justice",
          cardBrand: "Visa",
          cardLast4: "4242",
          cardOnFileAuthorized: true
        }
      })
    });
    const approveBody = await approveResponse.json();
    assert.equal(approveBody.ok, true);
    assert.equal(approveBody.quote.status, "approved");
    assert.equal(approveBody.quote.signature.typedName, "Deborah Justice");
    assert.equal(approveBody.quote.deposit.cardOnFileAuthorized, true);

    const jobResponse = await fetch(`${base}/api/crm/quotes/${createBody.quote.id}/convert-to-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const jobBody = await jobResponse.json();
    assert.equal(jobBody.ok, true);
    assert.match(jobBody.job.number, /^JOB-/);

    const secondJobResponse = await fetch(`${base}/api/crm/quotes/${createBody.quote.id}/convert-to-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const secondJobBody = await secondJobResponse.json();
    assert.equal(secondJobBody.ok, true);
    assert.equal(secondJobBody.reused, true);
    assert.equal(secondJobBody.job.id, jobBody.job.id);

    const invoiceResponse = await fetch(`${base}/api/crm/quotes/${createBody.quote.id}/invoice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const invoiceBody = await invoiceResponse.json();
    assert.equal(invoiceBody.ok, true);
    assert.match(invoiceBody.invoice.number, /^INV-/);

    const expiredCreateResponse = await fetch(`${base}/api/crm/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        clientId: "client_1",
        title: "Expired quote",
        items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }],
        expiresAt: "2026-07-01T00:00:00.000Z",
        delivery: { mode: "mark_sent" }
      })
    });
    const expiredCreateBody = await expiredCreateResponse.json();
    assert.equal(expiredCreateBody.ok, true);
    assert.equal(expiredCreateBody.quote.status, "sent");
    assert.equal(expiredCreateBody.delivery.mode, "mark_sent");
    assert.match(expiredCreateBody.portalUrl, /^\/portal\/quotes\//);

    const quotesResponse = await fetch(`${base}/api/crm/quotes?tenantId=aquatrace`);
    const quotesBody = await quotesResponse.json();
    const expiredQuote = quotesBody.quotes.find((quote) => quote.id === expiredCreateBody.quote.id);
    assert.equal(expiredQuote.status, "expired");
    const priorTokenHash = expiredQuote.portal.tokenHash;

    const renewResponse = await fetch(`${base}/api/crm/quotes/${expiredQuote.id}/renew`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", expiryDays: 45 })
    });
    const renewBody = await renewResponse.json();
    assert.equal(renewBody.ok, true);
    assert.equal(renewBody.quote.status, "sent");
    assert.equal(renewBody.quote.version, 2);
    assert.equal(renewBody.quote.versions.length, 1);
    assert.equal(renewBody.quote.versions[0].reason, "renewed");
    assert.equal(renewBody.quote.versions[0].status, "expired");
    assert.equal(renewBody.quote.versions[0].title, "Expired quote");
    assert.notEqual(renewBody.quote.portal.tokenHash, priorTokenHash);
    assert.match(renewBody.portalUrl, /^\/portal\/quotes\//);

    const smsCreateResponse = await fetch(`${base}/api/crm/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        clientId: "client_1",
        title: "SMS quote",
        items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }],
        delivery: { mode: "sms", target: "8645550100" }
      })
    });
    const smsCreateBody = await smsCreateResponse.json();
    assert.equal(smsCreateBody.ok, true);
    assert.equal(smsCreateBody.quote.status, "sent");
    assert.equal(smsCreateBody.delivery.mode, "sms");
    assert.equal(smsCreateBody.delivery.target, "8645550100");
    assert.equal(smsCreateBody.delivery.receiptId, "sms_receipt_1");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM quote change requests store per-line comments plus a freeform note", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [] });
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${base}/api/crm/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        clientId: "client_1",
        title: "Portal change-request quote",
        items: [
          { kind: "catalog", catalogCode: "VGB-010", quantity: 1 },
          { kind: "custom", code: "PREP", name: "Prep", quantity: 1, unitPrice: 25 }
        ],
        delivery: { mode: "mark_sent" }
      })
    });
    const createBody = await createResponse.json();
    assert.equal(createBody.ok, true);

    const portalUrl = new URL(`${base}${createBody.portalUrl}`);
    const token = portalUrl.searchParams.get("token");
    assert.ok(token);

    const firstLineId = createBody.quote.lineItems[0].id;
    const changeResponse = await fetch(`${base}/api/portal/quotes/${createBody.quote.id}/change-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        token,
        customerName: "Deborah Justice",
        note: "Please revise the overall timing.",
        lineComments: [{ lineItemId: firstLineId, comment: "Need a lower quantity on this line." }]
      })
    });
    const changeBody = await changeResponse.json();
    assert.equal(changeBody.ok, true);
    assert.equal(changeBody.quote.status, "change_requested");
    assert.equal(changeBody.quote.changeRequests.length, 1);
    assert.equal(changeBody.quote.changeRequests[0].note, "Please revise the overall timing.");
    assert.equal(changeBody.quote.changeRequests[0].lineComments.length, 1);
    assert.equal(changeBody.quote.changeRequests[0].lineComments[0].lineItemId, firstLineId);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Quote materialization preserves custom lines and future client-selectable fields", async () => {
  const repository = new MemoryNativeCrmRepository();
  const quote = await materializeQuoteRecord(repository, {
    tenantId: "aquatrace",
    clientId: "client_1",
    title: "Extensible line item quote",
    items: [{
      kind: "custom",
      code: "CUSTOM-UPSELL",
      name: "Custom upsell",
      description: "Manual line ready for future add-on surfacing.",
      quantity: 2,
      unitPrice: 125,
      clientSelectable: true,
      defaultSelected: false
    }]
  });

  assert.equal(quote.lineItems[0].name, "Custom upsell");
  assert.equal(quote.lineItems[0].clientSelectable, true);
  assert.equal(quote.lineItems[0].defaultSelected, false);
});

test("Quote terms resolve tenant default, then template override, then per-quote override", async () => {
  const repository = new MemoryNativeCrmRepository();
  const current = await repository.getCrmSettings("aquatrace");
  await repository.saveCrmSettings({
    ...current,
    quoteDefaults: {
      ...current.quoteDefaults,
      terms: "Tenant default terms"
    }
  });
  await repository.upsertQuoteTemplate({
    id: "quote_template_override_aquatrace",
    tenantId: "aquatrace",
    name: "Template override",
    description: "Template-specific terms override.",
    titlePrefix: "Override",
    defaultApprovalRules: current.quoteDefaults.approvalRules,
    expiryDays: 45,
    terms: "Template override terms",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  });

  const tenantDefaultQuote = await materializeQuoteRecord(repository, {
    tenantId: "aquatrace",
    clientId: "client_1",
    title: "Tenant default terms quote",
    items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }]
  });
  const templateOverrideQuote = await materializeQuoteRecord(repository, {
    tenantId: "aquatrace",
    clientId: "client_1",
    templateId: "quote_template_override_aquatrace",
    title: "Template override terms quote",
    items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }]
  });
  const perQuoteOverride = await materializeQuoteRecord(repository, {
    tenantId: "aquatrace",
    clientId: "client_1",
    templateId: "quote_template_override_aquatrace",
    title: "Per quote terms quote",
    items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }],
    terms: "Per quote override terms"
  });

  assert.equal(tenantDefaultQuote.terms, "Tenant default terms");
  assert.equal(templateOverrideQuote.terms, "Template override terms");
  assert.equal(perQuoteOverride.terms, "Per quote override terms");
});

test("TECHNICIAN role is blocked from manual quote approval authority", () => {
  assert.throws(() => assertAccessRole({
    tenantId: "aquatrace",
    tenantUserId: "tech_1",
    role: "TECHNICIAN",
    accessKind: "internal"
  }, ["OWNER", "OFFICE_ADMIN"], "manualApproveQuote"), /role cannot perform/i);
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
