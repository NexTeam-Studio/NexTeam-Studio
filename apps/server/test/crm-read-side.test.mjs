import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import express from "express";
import { ApprovalQueueService, clientSchema, InMemoryApprovalQueueRepository, invoiceSchema, quoteSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { buildQuoteDraft } from "../dist/crm/quoteBuilder.js";
import { renderInvoicePdf, renderQuotePdf } from "../dist/crm/quotePdf.js";
import { materializeQuoteRecord } from "../dist/crm/quoteFoundation.js";
import { createCrmReadTools, createCrmReadToolsWithOptions, createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "../dist/crm/stripe.js";
import { assertAccessRole, createLocalDevSession } from "../dist/auth/accessContext.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

const LEGACY_CRM_KEY = String.fromCharCode(106, 111, 98, 98, 101, 114);

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "native", media: "native", email: "gmail_relay" },
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
  externalIds: { [LEGACY_CRM_KEY]: "legacy_client_1" }
};

const property = {
  id: "property_1",
  tenantId: "aquatrace",
  clientId: "client_1",
  address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
  assets: [],
  externalIds: { [LEGACY_CRM_KEY]: "legacy_property_1" }
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
  externalIds: { [LEGACY_CRM_KEY]: "legacy_job_1" }
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
  assert.equal(detail.property?.externalIds?.[LEGACY_CRM_KEY], "legacy_property_1");
});

test("native import upserts remain idempotent by legacy CRM external ids", async () => {
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
    catalogItems: [{ id: "catalog_vgb_001", tenantId: "aquatrace", code: "VGB-001", name: "VGB compliance", price: 125 }],
    items: [{ catalogItemId: "catalog_vgb_001", quantity: 2, unitPriceCents: 12500 }]
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

test("CRM clientLookup stays unmatched and never calls a dormant fallback on native misses", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  let fallbackCalls = 0;
  const tools = createCrmReadToolsWithOptions(adapter, {
    fallbackClientProvider: {
      getClients: async () => {
        fallbackCalls += 1;
        return [];
      }
    }
  });
  const clientLookup = tools.find((tool) => tool.name === "clientLookup");
  assert.ok(clientLookup);

  const result = await clientLookup.handler(tenant, { q: "Kristi King" });

  assert.equal(fallbackCalls, 0);
  assert.equal(result.result.nativeCount, 0);
  assert.equal(result.result.clients.length, 0);
  assert.equal("fallbackUsed" in result.result, false);
  assert.deepEqual(result.sources, [{ rail: "native", ref: "clients", label: "Native CRM clients" }]);
});

test("CRM write nexi-tools cover client create, quote draft, catalog/template settings, and invoice reads", async () => {
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
  const platformRepository = {
    async listTenantUsers() {
      return [
        { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" },
        { id: "office_1", tenantId: "aquatrace", displayName: "Catherine", role: "OFFICE_ADMIN", active: true, email: "office@example.test" },
        { id: "tech_1", tenantId: "aquatrace", displayName: "Logan", role: "TECHNICIAN", active: true, email: "tech@example.test" }
      ];
    }
  };
  const tools = createCrmToolsWithOptions(toolAdapter, toolApprovalQueue, {
    requestRepository: repository,
    platformRepository
  });
  const createClient = tools.find((tool) => tool.name === "createClient");
  const createQuote = tools.find((tool) => tool.name === "createQuote");
  const listQuotes = tools.find((tool) => tool.name === "listQuotes");
  const getQuoteDetail = tools.find((tool) => tool.name === "getQuoteDetail");
  const invoiceStatus = tools.find((tool) => tool.name === "invoiceStatus");
  const listQuoteTemplates = tools.find((tool) => tool.name === "listQuoteTemplates");
  const listCatalogItems = tools.find((tool) => tool.name === "listCatalogItems");
  const saveCatalogItem = tools.find((tool) => tool.name === "saveCatalogItem");
  const listCommunicationTemplates = tools.find((tool) => tool.name === "listCommunicationTemplates");
  const saveCommunicationTemplate = tools.find((tool) => tool.name === "saveCommunicationTemplate");
  const listTeamMembers = tools.find((tool) => tool.name === "listTeamMembers");
  assert.ok(createClient);
  assert.ok(createQuote);
  assert.ok(listQuotes);
  assert.ok(getQuoteDetail);
  assert.ok(invoiceStatus);
  assert.ok(listQuoteTemplates);
  assert.ok(listCatalogItems);
  assert.ok(saveCatalogItem);
  assert.ok(listCommunicationTemplates);
  assert.ok(saveCommunicationTemplate);
  assert.ok(listTeamMembers);

  const teamMembers = await listTeamMembers.handler(tenant, { role: "OFFICE_ADMIN" });
  assert.equal(teamMembers.result.users.length, 1);
  assert.equal(teamMembers.result.users[0].id, "office_1");

  const templateLibrary = await listQuoteTemplates.handler(tenant, { q: "" });
  assert.equal(templateLibrary.result.templates.length > 0, true);
  const standardTemplate = templateLibrary.result.templates[0];

  const seededCatalog = await listCatalogItems.handler(tenant, { q: "VGB-002" });
  assert.equal(seededCatalog.result.items.some((item) => item.code === "VGB-002"), true);

  const savedCatalog = await saveCatalogItem.handler(tenant, {
    name: "Pool Patch Kit",
    description: "Shared patch kit stocked on leak visits.",
    price: 125,
    tag: "Product",
    taxable: true,
    visible: true
  });
  assert.equal(savedCatalog.result.created, true);
  const updatedCatalog = await listCatalogItems.handler(tenant, { q: "Pool Patch Kit" });
  assert.equal(updatedCatalog.result.items.length, 1);
  assert.equal(updatedCatalog.result.items[0].tag, "Product");

  const templateSettings = await listCommunicationTemplates.handler(tenant, { category: "quote_send" });
  assert.equal(templateSettings.result.templates.length, 1);
  const updatedTemplate = await saveCommunicationTemplate.handler(tenant, {
    category: "quote_send",
    label: templateSettings.result.templates[0].label,
    description: templateSettings.result.templates[0].description,
    emailEnabled: true,
    smsEnabled: true,
    emailSubject: "Updated quote subject",
    emailBody: "Hello {{CLIENT_NAME}}, your quote is ready.",
    smsBody: "Quote ready for {{CLIENT_NAME}}."
  });
  assert.equal(updatedTemplate.result.created, false);
  const refreshedTemplate = await listCommunicationTemplates.handler(tenant, { category: "quote_send" });
  assert.equal(refreshedTemplate.result.templates[0].emailSubject, "Updated quote subject");
  assert.equal(refreshedTemplate.result.templates[0].smsEnabled, true);

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
  await toolApprovalQueue.approve("aquatrace", queued.result.approval.id);
  const executed = await toolApprovalQueue.executeApproved("aquatrace", queued.result.approval.id);
  assert.equal(executed.result.client.tenantId, "aquatrace");
  assert.equal(executed.result.client.displayNamePreference, "person");
  assert.equal(executed.result.client.contacts[0].channelPreference, "both");
  assert.equal(executed.result.client.communicationSettings.smsDefaultMode, "one_way");
  assert.equal((await toolAdapter.getClients("Portal Client")).length, 1);

  const drafted = await createQuote.handler(tenant, {
    clientId: "client_1",
    templateId: standardTemplate.id,
    salespersonUserId: "office_1",
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
  assert.equal(drafted.result.pendingQuote.templateId, standardTemplate.id);
  assert.equal(drafted.result.pendingQuote.salespersonUserId, "office_1");
  await toolApprovalQueue.approve("aquatrace", drafted.result.approval.id);
  await toolApprovalQueue.executeApproved("aquatrace", drafted.result.approval.id);

  const listed = await listQuotes.handler(tenant, { q: "Approval-gated" });
  assert.equal(listed.result.quotes.length, 1);
  assert.equal(listed.result.quotes[0].title, "Approval-gated VGB quote");

  const detail = await getQuoteDetail.handler(tenant, { query: "Approval-gated" });
  assert.equal(detail.result.quote.title, "Approval-gated VGB quote");
  assert.equal(detail.result.client.name, "Deborah Justice");
  assert.equal(detail.result.quote.templateId, standardTemplate.id);
  assert.equal(detail.result.quote.salespersonUserId, "office_1");

  const status = await invoiceStatus.handler(tenant, { clientId: "client_1" });
  assert.equal(status.result.invoices[0].status, "sent");
  assert.equal(status.sources[0].rail, "native");
});

test("seeded catalog UTF-8 punctuation survives native settings round-trip", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const tools = createCrmToolsWithOptions(adapter, new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter)), {
    requestRepository: repository
  });
  const listCatalogItems = tools.find((tool) => tool.name === "listCatalogItems");
  assert.ok(listCatalogItems);
  const emDash = String.fromCodePoint(0x2014);
  const mojibakeDash = String.fromCodePoint(0x00E2, 0x20AC, 0x201D);
  const mojibakePrefix = String.fromCodePoint(0x00C3);

  const before = await listCatalogItems.handler(tenant, { q: "VGB-002" });
  const seeded = before.result.items.find((item) => item.code === "VGB-002");
  assert.ok(seeded);
  assert.equal(seeded.name.includes(`${emDash} Zone 2`), true);
  assert.equal(seeded.name.includes(mojibakeDash), false);
  assert.equal(seeded.name.includes(mojibakePrefix), false);
  assert.equal(seeded.description.includes(`VGB Service Line ${emDash} Main Drain Cover`), true);
  assert.equal(seeded.description.includes(mojibakeDash), false);
  assert.equal(seeded.description.includes(mojibakePrefix), false);

  const currentSettings = await repository.getCrmSettings("aquatrace");
  await repository.saveCrmSettings({
    ...currentSettings,
    updatedAt: "2026-07-16T12:00:00.000Z"
  });

  const after = await listCatalogItems.handler(tenant, { q: "VGB-002" });
  const roundTrip = after.result.items.find((item) => item.code === "VGB-002");
  assert.ok(roundTrip);
  assert.equal(roundTrip.name.includes(`${emDash} Zone 2`), true);
  assert.equal(roundTrip.name.includes(mojibakeDash), false);
  assert.equal(roundTrip.name.includes(mojibakePrefix), false);
  assert.equal(roundTrip.description.includes(`VGB Service Line ${emDash} Main Drain Cover`), true);
  assert.equal(roundTrip.description.includes(mojibakeDash), false);
  assert.equal(roundTrip.description.includes(mojibakePrefix), false);
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
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
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

  await approvalQueue.approve("aquatrace", approval.id);
  await approvalQueue.executeApproved("aquatrace", approval.id);

  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
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

test("CRM client delete route removes property-only duplicates and blocks clients with linked work", async () => {
  const duplicateClient = {
    id: "client_duplicate",
    tenantId: "aquatrace",
    name: "Catherine Sears",
    emails: ["catherine@example.test"],
    phones: ["8646171838"],
    tags: [],
    consent: { email: false, sms: false }
  };
  const duplicateProperty = {
    id: "property_duplicate",
    tenantId: "aquatrace",
    clientId: "client_duplicate",
    address: { street1: "102 Kate Lane", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
    assets: []
  };
  const protectedClient = {
    id: "client_protected",
    tenantId: "aquatrace",
    name: "Deborah Justice",
    emails: ["deborah@example.test"],
    phones: ["8645581725"],
    tags: [],
    consent: { email: false, sms: false }
  };
  const protectedProperty = {
    id: "property_protected",
    tenantId: "aquatrace",
    clientId: "client_protected",
    address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
    assets: []
  };
  const protectedJob = {
    id: "job_protected",
    tenantId: "aquatrace",
    clientId: "client_protected",
    propertyId: "property_protected",
    status: "lead",
    title: "Protected job",
    lineItems: [],
    totals: { subtotal: 250, tax: 0, total: 250 }
  };
  const repository = new MemoryNativeCrmRepository({
    clients: [duplicateClient, protectedClient],
    properties: [duplicateProperty, protectedProperty],
    jobs: [protectedJob]
  });
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const deleteDuplicate = await fetch(`${base}/api/crm/clients/client_duplicate?tenantId=aquatrace`, {
      method: "DELETE"
    });
    const deleteDuplicateBody = await deleteDuplicate.json();
    assert.equal(deleteDuplicate.status, 200);
    assert.equal(deleteDuplicateBody.ok, true);
    assert.deepEqual(deleteDuplicateBody.deletedPropertyIds, ["property_duplicate"]);
    assert.deepEqual((await repository.listClients("aquatrace")).map((entry) => entry.id), ["client_protected"]);
    assert.deepEqual((await repository.listProperties("aquatrace")).map((entry) => entry.id), ["property_protected"]);

    const deleteProtected = await fetch(`${base}/api/crm/clients/client_protected?tenantId=aquatrace`, {
      method: "DELETE"
    });
    const deleteProtectedBody = await deleteProtected.json();
    assert.equal(deleteProtected.status, 409);
    assert.equal(deleteProtectedBody.ok, false);
    assert.match(deleteProtectedBody.error, /linked work or billing history/i);
    assert.deepEqual((await repository.listClients("aquatrace")).map((entry) => entry.id), ["client_protected"]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM quick payment request routes create minimal ledger-backed invoices from job and client fast paths", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [job] });
  const ledgerRepository = new MemoryLedgerRepository();
  const commsRail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi",
      async sendEmail() {
        return { provider: "test", id: "email_quick_request_1", acceptedAt: "2026-07-18T12:00:00.000Z" };
      }
    },
    async sendSms() {
      return { provider: "test", id: "sms_quick_request_1", acceptedAt: "2026-07-18T12:00:00.000Z" };
    }
  };
  const platformRepository = {
    listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }],
    getTenantUser: async (tenantId, userId) => tenantId === "aquatrace" && userId === "owner_1"
      ? { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }
      : null
  };
  const eventBus = { async emit() {} };
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    commsRail,
    eventBus
  });
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository: new InMemorySchedulingRepository(),
    lifecycleRepository: new MemoryJobLifecycleRepository(),
    commsRail,
    eventBus,
    ledgerService,
    platformRepository
  });
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    memoryRepository: repository,
    jobLifecycleService,
    ledgerService,
    platformRepository,
    commsRail,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const settings = await repository.getCrmSettings("aquatrace");

    const jobResponse = await fetch(`${base}/api/crm/jobs/job_1/quick-payment-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        title: "Skimmer deposit",
        amount: 125,
        memo: "Customer-approved same-day add-on.",
        delivery: { mode: "draft" }
      })
    });
    const jobBody = await jobResponse.json();
    assert.equal(jobResponse.status, 201);
    assert.equal(jobBody.ok, true);
    assert.equal(jobBody.invoice.status, "draft");
    assert.equal(jobBody.invoice.lineItems.length, 1);
    assert.equal(jobBody.invoice.lineItems[0].code, "quick-request");
    assert.equal(jobBody.invoice.lineItems[0].name, "Skimmer deposit");
    assert.equal(jobBody.invoice.lineItems[0].description, "Customer-approved same-day add-on.");
    assert.equal(jobBody.invoice.totals.total, 125);
    assert.equal(jobBody.invoice.ledger.balanceDue, 125);
    assert.equal(jobBody.invoice.jobId, "job_1");
    assert.deepEqual(jobBody.invoice.jobIds, ["job_1"]);
    assert.equal(jobBody.invoice.terms, settings.invoiceDefaults.terms);

    const paidJobInvoice = await ledgerService.recordInvoicePayment({
      tenantId: "aquatrace",
      invoiceId: jobBody.invoice.id,
      amount: 125,
      provider: "manual",
      method: "cash",
      actorId: "owner_1",
      note: "Collected on site."
    });
    assert.equal(paidJobInvoice.invoice.status, "paid");

    const clientResponse = await fetch(`${base}/api/crm/clients/client_1/quick-payment-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        title: "Deck reimbursement",
        amount: 42.5,
        memo: "Office-issued reimbursement request.",
        delivery: { mode: "draft" }
      })
    });
    const clientBody = await clientResponse.json();
    assert.equal(clientResponse.status, 201);
    assert.equal(clientBody.ok, true);
    assert.equal(clientBody.invoice.status, "draft");
    assert.equal(clientBody.invoice.lineItems.length, 1);
    assert.equal(clientBody.invoice.lineItems[0].code, "quick-request");
    assert.equal(clientBody.invoice.lineItems[0].name, "Deck reimbursement");
    assert.equal(clientBody.invoice.totals.total, 42.5);
    assert.equal(clientBody.invoice.ledger.balanceDue, 42.5);
    assert.equal("jobId" in clientBody.invoice, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM quote routes create, send, approve, convert, invoice, and renew quotes", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [] });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const ledgerRepository = new MemoryLedgerRepository();
  const sentEmails = [];
  const platformRepository = {
    getTenant: async (tenantId) => tenantId === "aquatrace" ? { id: "aquatrace", name: "Aquatrace", plan: "nexi", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } : null,
    listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }],
    getTenantUser: async (tenantId, userId) => tenantId === "aquatrace" && userId === "owner_1"
      ? { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }
      : null
  };
  const commsRail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi",
      async sendEmail(message) {
        sentEmails.push(message);
        return { provider: "test", id: "email_receipt_1", acceptedAt: "2026-07-12T12:00:00.000Z", mailbox: "nexi" };
      }
    },
    async sendSms() {
      return { provider: "test", id: "sms_receipt_1", acceptedAt: "2026-07-12T12:01:00.000Z" };
    }
  };
  const eventBus = { async emit() {} };
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    commsRail,
    eventBus
  });
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository: new InMemorySchedulingRepository(),
    lifecycleRepository: new MemoryJobLifecycleRepository(),
    commsRail,
    eventBus,
    ledgerService,
    platformRepository
  });
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter, jobLifecycleService, ledgerService));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    jobLifecycleService,
    ledgerService,
    platformRepository,
    commsRail,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
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
    assert.deepEqual(Object.keys(settingsBody.settings.documentNumbering).sort(), ["invoice", "job", "quote", "receipt", "request"]);
    assert.equal(settingsBody.settings.operatingProfile.onboarding.checklist.tasks.filter((task) => task.required).length, 6);

    const claimOnboardingTask = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", onboardingCommand: { action: "claim", taskId: "subscription-confirmation" } })
    });
    const claimOnboardingTaskBody = await claimOnboardingTask.json();
    assert.equal(claimOnboardingTaskBody.ok, true);
    assert.equal(claimOnboardingTaskBody.settings.operatingProfile.onboarding.checklist.tasks.find((task) => task.id === "subscription-confirmation").ownerUserId, "local-owner");
    assert.equal(claimOnboardingTaskBody.settings.operatingProfile.onboarding.checklist.auditHistory.at(-1).action, "task.claimed");

    const reassignOnboardingTask = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", onboardingCommand: { action: "reassign", taskId: "subscription-confirmation", ownerUserId: "owner_1" } })
    });
    const reassignOnboardingTaskBody = await reassignOnboardingTask.json();
    assert.equal(reassignOnboardingTaskBody.ok, true);
    assert.equal(reassignOnboardingTaskBody.settings.operatingProfile.onboarding.checklist.tasks.find((task) => task.id === "subscription-confirmation").ownerUserId, "owner_1");
    assert.equal(reassignOnboardingTaskBody.settings.operatingProfile.onboarding.checklist.auditHistory.at(-1).action, "task.reassigned");

    const skipRequiredOnboardingTask = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", onboardingCommand: { action: "set-status", taskId: "subscription-confirmation", status: "skipped" } })
    });
    assert.equal(skipRequiredOnboardingTask.status, 400);

    const outOfPlanModule = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", operatingProfile: { onboarding: { selectedModules: ["scheduling"] } } })
    });
    assert.equal(outOfPlanModule.status, 400);

    const prematureLaunch = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", operatingProfile: { onboarding: { selectedModules: ["nexi"], completedSteps: ["company-profile", "module-selection", "office-defaults", "launch-review"], launchReviewedAt: "2026-08-08T21:00:00.000Z" } } })
    });
    assert.equal(prematureLaunch.status, 400);

    for (const taskId of ["subscription-confirmation", "owner-introduction", "business-profile", "module-selection", "office-defaults", "team-handoff"]) {
      const completeTask = await fetch(`${base}/api/crm/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "aquatrace", onboardingCommand: { action: "set-status", taskId, status: "complete" } })
      });
      assert.equal(completeTask.status, 200);
    }

    const operatingProfileResponse = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        operatingProfile: {
          company: { publicName: "Northwind Service", industry: "field-service", timezone: "America/Chicago" },
          locations: [{
            id: "location_main",
            label: "Main Office",
            address: { street1: "100 Main Street", city: "Springfield", province: "IL", postalCode: "62701", country: "US" },
            active: true
          }],
          tax: { enabled: true, defaultRate: 8.25 },
          communicationIdentity: { replyToEmail: "office@example.test", replyToName: "Northwind Office" },
          securityAudit: { auditEventsEnabled: true, requireApprovalForExternalSend: true },
          onboarding: {
            completedSteps: ["company-profile", "module-selection", "office-defaults", "launch-review"],
            selectedModules: ["nexi", "crm", "fielddocs"],
            launchReviewedAt: "2026-08-08T22:00:00.000Z"
          }
        }
      })
    });
    const operatingProfileBody = await operatingProfileResponse.json();
    assert.equal(operatingProfileBody.ok, true);
    assert.equal(operatingProfileBody.settings.operatingProfile.company.publicName, "Northwind Service");
    assert.equal(operatingProfileBody.settings.operatingProfile.locations[0].address.street1, "100 Main Street");
    assert.equal(operatingProfileBody.settings.operatingProfile.tax.defaultRate, 8.25);

    const rereadSettingsResponse = await fetch(`${base}/api/crm/settings?tenantId=aquatrace`);
    const rereadSettingsBody = await rereadSettingsResponse.json();
    assert.equal(rereadSettingsBody.settings.operatingProfile.company.timezone, "America/Chicago");
    assert.deepEqual(rereadSettingsBody.settings.operatingProfile.onboarding.completedSteps, ["company-profile", "module-selection", "office-defaults", "launch-review"]);
    assert.deepEqual(rereadSettingsBody.settings.operatingProfile.onboarding.selectedModules, ["nexi", "crm", "fielddocs"]);
    assert.equal(rereadSettingsBody.settings.operatingProfile.onboarding.launchReviewedAt, "2026-08-08T22:00:00.000Z");
    assert.equal(rereadSettingsBody.onboardingLaunch.ready, true);
    assert.equal(rereadSettingsBody.settings.operatingProfile.onboarding.checklist.tasks.find((task) => task.id === "subscription-confirmation").ownerUserId, "owner_1");
    assert.equal(rereadSettingsBody.settings.operatingProfile.onboarding.checklist.auditHistory.length, 8);

    const technicianUpdate = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        operatingProfile: { onboarding: { selectedModules: ["nexi"] } }
      })
    });
    assert.equal(technicianUpdate.status, 403);
    const afterDeniedUpdate = await (await fetch(`${base}/api/crm/settings?tenantId=aquatrace`)).json();
    assert.deepEqual(afterDeniedUpdate.settings.operatingProfile.onboarding.selectedModules, ["nexi", "crm", "fielddocs"]);

    const technicianOnboardingUpdate = await fetch(`${base}/api/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" },
      body: JSON.stringify({ tenantId: "aquatrace", onboardingCommand: { action: "set-status", taskId: "subscription-confirmation", status: "complete" } })
    });
    assert.equal(technicianOnboardingUpdate.status, 403);
    const afterDeniedOnboardingUpdate = await (await fetch(`${base}/api/crm/settings?tenantId=aquatrace`)).json();
    assert.equal(afterDeniedOnboardingUpdate.settings.operatingProfile.onboarding.checklist.tasks.find((task) => task.id === "subscription-confirmation").status, "complete");

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
    assert.match(portalHtml, /\/assets\/brand\/nexportal-logo\.png/i);
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
    const depositPaidEmail = sentEmails.find((message) =>
      Array.isArray(message.to)
      && message.to.includes("owner@example.test")
      && message.subject === `Deposit paid for ${approveBody.quote.number}`
    );
    assert.ok(depositPaidEmail);
    assert.match(depositPaidEmail.bodyText, /Deposit received\./);
    assert.match(depositPaidEmail.bodyText, new RegExp(approveBody.quote.deposit.amount.toFixed(2).replace(".", "\\.")));
    assert.match(depositPaidEmail.bodyText, /Deborah Justice/);

    const receiptReviews = await ledgerService.listReceiptReviews("aquatrace");
    assert.equal(receiptReviews.length, 1);
    assert.equal(receiptReviews[0].quoteId, createBody.quote.id);

    const approvedPortalResponse = await fetch(portalUrl);
    const approvedPortalHtml = await approvedPortalResponse.text();
    assert.equal(approvedPortalResponse.status, 200);
    assert.match(approvedPortalHtml, /Approved summary/i);
    assert.match(approvedPortalHtml, /Download PDF/i);
    assert.match(approvedPortalHtml, /Receipt history/i);
    assert.match(approvedPortalHtml, /Deborah Justice/i);
    assert.doesNotMatch(approvedPortalHtml, /<form id="approve-form">/i);

    const portalPdfResponse = await fetch(`${base}/portal/quotes/${createBody.quote.id}/pdf?tenantId=aquatrace&token=${token}`);
    assert.equal(portalPdfResponse.status, 200);
    assert.equal(portalPdfResponse.headers.get("content-type"), "application/pdf");
    const portalPdfBuffer = Buffer.from(await portalPdfResponse.arrayBuffer());
    assert.equal(portalPdfBuffer.subarray(0, 5).toString(), "%PDF-");

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
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
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

test("office quote archive is tenant-bound, draft-only, and blocks stale approval", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: [client], properties: [property], jobs: [] });
  const app = express();
  app.use(express.json());
  const env = { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" };
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    memoryRepository: repository,
    env
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const officeToken = createLocalDevSession("office@local.dev", undefined, "aquatrace", env).token;
    const officeHeaders = { "content-type": "application/json", authorization: `Bearer ${officeToken}` };
    const createDraft = async (title) => {
      const response = await fetch(`${base}/api/crm/quotes`, {
        method: "POST",
        headers: officeHeaders,
        body: JSON.stringify({
          tenantId: "aquatrace",
          clientId: "client_1",
          title,
          items: [{ kind: "catalog", catalogCode: "VGB-010", quantity: 1 }],
          delivery: { mode: "draft" }
        })
      });
      assert.equal(response.status, 201);
      return (await response.json()).quote;
    };

    const draft = await createDraft("Archive-safe draft quote");
    const stalePortalToken = "stale-portal-token";
    await repository.updateQuote(draft.id, {
      portal: { tokenHash: createHash("sha256").update(stalePortalToken).digest("hex") }
    });

    const unauthenticated = await fetch(`${base}/api/crm/quotes/${draft.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer localdev.invalid" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal(unauthenticated.status, 401);

    const otherTenantToken = createLocalDevSession("owner@local.dev", undefined, "other-tenant", env).token;
    const crossTenant = await fetch(`${base}/api/crm/quotes/${draft.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${otherTenantToken}` },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal(crossTenant.status, 403);

    const archivedResponse = await fetch(`${base}/api/crm/quotes/${draft.id}/archive`, {
      method: "POST",
      headers: officeHeaders,
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const archivedBody = await archivedResponse.json();
    assert.equal(archivedResponse.status, 200);
    assert.equal(archivedBody.quote.status, "archived");
    assert.equal(archivedBody.quote.id, draft.id);
    assert.equal(archivedBody.quote.number, draft.number);
    assert.deepEqual(archivedBody.quote.lineItems, draft.lineItems);
    assert.deepEqual(archivedBody.quote.totals, draft.totals);

    const manualApproval = await fetch(`${base}/api/crm/quotes/${draft.id}/manual-approve`, {
      method: "POST",
      headers: officeHeaders,
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal(manualApproval.status, 409);

    const stalePortalApproval = await fetch(`${base}/api/portal/quotes/${draft.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", token: stalePortalToken, customerName: "Deborah Justice" })
    });
    assert.equal(stalePortalApproval.status, 409);

    const sentDraft = await createDraft("Sent quote cannot archive");
    const sentResponse = await fetch(`${base}/api/crm/quotes/${sentDraft.id}/send`, {
      method: "POST",
      headers: officeHeaders,
      body: JSON.stringify({ tenantId: "aquatrace", mode: "mark_sent" })
    });
    assert.equal(sentResponse.status, 200);
    const sentArchive = await fetch(`${base}/api/crm/quotes/${sentDraft.id}/archive`, {
      method: "POST",
      headers: officeHeaders,
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal(sentArchive.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
