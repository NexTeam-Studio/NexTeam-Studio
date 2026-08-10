import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus,
  mediaSchema
} from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { NexDocsService } from "../dist/fielddocs/nexDocsService.js";
import { createFieldReportRecord } from "../dist/fielddocs/reportService.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";
import { InMemoryNotificationStateRepository } from "../dist/crm/notificationStateRepository.js";
import { OperationsHubService } from "../dist/crm/operationsHub.js";
import { InMemoryPortalHubRepository } from "../dist/crm/portalHubRepository.js";
import { PortalHubService } from "../dist/crm/portalHubService.js";
import { InMemoryReviewSequenceRepository } from "../dist/crm/reviewSequenceRepository.js";
import { ReviewSequenceService } from "../dist/crm/reviewSequenceService.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function access(role, tenantUserId) {
  return {
    tenantId: "aquatrace",
    tenantUserId,
    role,
    accessKind: "internal"
  };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function lineItems(items) {
  return items.map((item, index) => ({
    id: item.id ?? `line_${index + 1}`,
    source: item.source ?? "custom",
    code: item.code ?? `CODE-${index + 1}`,
    name: item.name,
    description: item.description ?? `${item.name} description`,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: Number((item.quantity * item.unitPrice).toFixed(2))
  }));
}

function totals(total, tax = 0) {
  return {
    subtotal: Number((total - tax).toFixed(2)),
    tax,
    total
  };
}

function clientRecord(overrides = {}) {
  return {
    id: "client_1",
    tenantId: "aquatrace",
    name: "Deborah Justice",
    company: "Justice Pools",
    emails: ["deborah@example.test"],
    phones: ["8645551212"],
    tags: [],
    consent: { email: true, sms: true },
    billingAddress: {
      street1: "51 North Merrimon Avenue Suite 101",
      city: "Woodfin",
      province: "NC",
      postalCode: "28804",
      country: "US"
    },
    communicationSettings: {
      quotesAndInvoices: "both",
      jobReminders: "both",
      jobClosureFollowUps: "email",
      reviewRequests: "email",
      smsDefaultMode: "one_way"
    },
    ...overrides
  };
}

function propertyRecord(id, label, street1, overrides = {}) {
  return {
    id,
    tenantId: "aquatrace",
    clientId: "client_1",
    label,
    address: {
      street1,
      city: "Fair Play",
      province: "SC",
      postalCode: "29643",
      country: "US"
    },
    access: {
      gateCode: id === "property_1" ? "4421" : "9988",
      accessNotes: id === "property_1" ? "Use the side gate by the equipment pad." : "Call before entering the dock gate."
    },
    assets: [],
    ...overrides
  };
}

function quoteRecord(overrides = {}) {
  return {
    id: overrides.id ?? "quote_1",
    tenantId: "aquatrace",
    number: overrides.number ?? "Q-1001",
    clientId: "client_1",
    status: overrides.status ?? "sent",
    title: overrides.title ?? "Leak detection quote",
    lineItems: overrides.lineItems ?? lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 795, code: "LEAK" }]),
    totals: overrides.totals ?? totals(795),
    approvalRules: overrides.approvalRules ?? {
      requireSignature: true,
      requireDeposit: false,
      requireCardOnFile: false
    },
    portal: overrides.portal ?? {
      tokenHash: hashToken("portal_quote_token"),
      tokenIssuedAt: "2026-07-16T12:00:00.000Z"
    },
    createdAt: overrides.createdAt ?? "2026-07-16T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-16T12:00:00.000Z",
    ...overrides
  };
}

function invoiceRecord(overrides = {}) {
  return {
    id: overrides.id ?? "invoice_1",
    tenantId: "aquatrace",
    number: overrides.number ?? "INV-1001",
    clientId: "client_1",
    status: overrides.status ?? "awaiting_payment",
    title: overrides.title ?? "Leak detection invoice",
    lineItems: overrides.lineItems ?? lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 795, code: "LEAK" }]),
    totals: overrides.totals ?? totals(795),
    ledger: overrides.ledger ?? {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: overrides.totals?.total ?? 795,
      overdue: false
    },
    portal: overrides.portal ?? {
      tokenHash: hashToken("portal_invoice_token"),
      tokenIssuedAt: "2026-07-16T12:15:00.000Z"
    },
    createdAt: overrides.createdAt ?? "2026-07-16T12:15:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-16T12:15:00.000Z",
    ...overrides
  };
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function simplePdfBuffer(text) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream\nendobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function createStubNexDocsService(fixture) {
  return new NexDocsService({
    mediaRepository: fixture.fieldDocsRepository,
    crmRepository: fixture.repository,
    ledgerService: fixture.ledgerService,
    storeUpload: async ({ documentId, fileName, fileBase64 }) => {
      const bytes = Buffer.from(fileBase64, "base64");
      return {
        storageRef: `gs://test-bucket/tenants/aquatrace/nexdocs/${documentId}/${fileName}`,
        sizeBytes: bytes.byteLength,
        bytes
      };
    }
  });
}

function createFixture(records = {}) {
  const repository = new MemoryNativeCrmRepository({
    clients: [clientRecord()],
    properties: [
      propertyRecord("property_1", "Main residence", "181 Isbell Road"),
      propertyRecord("property_2", "Lake house", "25 Cove Point")
    ],
    ...records
  });
  const schedulingRepository = new InMemorySchedulingRepository();
  const lifecycleRepository = new MemoryJobLifecycleRepository();
  const ledgerRepository = new MemoryLedgerRepository();
  const fieldDocsRepository = records.fieldDocsRepository ?? new MemoryMediaRepository();
  const notificationStateRepository = new InMemoryNotificationStateRepository();
  const portalHubRepository = new InMemoryPortalHubRepository();
  const reviewSequenceRepository = new InMemoryReviewSequenceRepository();
  const sentEmails = [];
  const sentSms = [];
  const eventBus = new InMemoryEventBus();
  const platformRepository = {
    async listTenantUsers() {
      return [
        { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" },
        { id: "office_1", tenantId: "aquatrace", displayName: "Catherine", role: "OFFICE_ADMIN", active: true, email: "office@example.test" },
        { id: "tech_1", tenantId: "aquatrace", displayName: "Logan", role: "TECHNICIAN", active: true, email: "logan@example.test" }
      ];
    },
    async getTenantBranding() {
      return {
        displayName: "Aquatrace",
        logo: {},
        colors: {
          accent: "#09d9e7",
          accentText: "#072d34",
          text: "#102027",
          mutedText: "#56747c",
          surface: "#ffffff",
          background: "#eef9f7"
        }
      };
    }
  };
  const commsRail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi",
      async sendEmail(message) {
        sentEmails.push(message);
        return { provider: "test", id: `email_${sentEmails.length}`, acceptedAt: "2026-07-17T00:00:00.000Z" };
      }
    },
    async sendSms(message) {
      sentSms.push(message);
      return { provider: "test", id: `sms_${sentSms.length}`, acceptedAt: "2026-07-17T00:00:00.000Z" };
    }
  };
  const reviewSequenceService = new ReviewSequenceService({
    crmRepository: repository,
    ledgerRepository,
    repository: reviewSequenceRepository,
    eventBus,
    commsRail,
    publicBaseUrl: "http://127.0.0.1:4175"
  });
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    fieldDocsRepository,
    commsRail,
    eventBus,
    reviewSequenceService
  });
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository,
    lifecycleRepository,
    platformRepository,
    commsRail,
    eventBus,
    ledgerService
  });
  const portalHubService = new PortalHubService({
    crmRepository: repository,
    ledgerRepository,
    schedulingRepository,
    repository: portalHubRepository,
    fieldDocsRepository,
    eventBus,
    platformRepository,
    commsRail,
    publicBaseUrl: "http://127.0.0.1:4175"
  });
  const operationsHubService = new OperationsHubService({
    crmRepository: repository,
    schedulingRepository,
    lifecycleRepository,
    jobLifecycleService,
    eventBus,
    notificationStateRepository,
    platformRepository
  });
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, jobLifecycleService, ledgerService)
  );
  return {
    repository,
    schedulingRepository,
    lifecycleRepository,
    ledgerRepository,
    fieldDocsRepository,
    portalHubRepository,
    reviewSequenceRepository,
    notificationStateRepository,
    platformRepository,
    commsRail,
    sentEmails,
    sentSms,
    eventBus,
    reviewSequenceService,
    ledgerService,
    jobLifecycleService,
    portalHubService,
    operationsHubService,
    provider,
    approvalQueue
  };
}

async function listen(app) {
  return new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
}

function appForFixture(fixture, overrides = {}) {
  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: fixture.fieldDocsRepository,
    crmRepository: fixture.repository,
    eventBus: fixture.eventBus,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  registerCrmRoutes(app, {
    approvalQueue: fixture.approvalQueue,
    eventBus: fixture.eventBus,
    memoryRepository: fixture.repository,
    fieldDocsRepository: fixture.fieldDocsRepository,
    platformRepository: fixture.platformRepository,
    commsRail: fixture.commsRail,
    jobLifecycleService: fixture.jobLifecycleService,
    ledgerService: fixture.ledgerService,
    portalHubService: fixture.portalHubService,
    reviewSequenceService: fixture.reviewSequenceService,
    operationsHubService: fixture.operationsHubService,
    ...(overrides.nexDocsService ? { nexDocsService: overrides.nexDocsService } : {}),
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  return app;
}

async function createJob(fixture, input) {
  return fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    propertyId: input.propertyId,
    title: input.title,
    lineItems: lineItems([{ name: input.title, quantity: 1, unitPrice: input.amount ?? 250, code: input.code ?? "WORK" }]),
    createdBy: input.createdBy ?? "owner_1"
  });
}

async function createClosedPaidJob(fixture, suffix) {
  const job = await createJob(fixture, {
    propertyId: "property_1",
    title: `Review job ${suffix}`,
    amount: 250 + suffix.length
  });
  const closedAt = `2026-07-17T0${suffix.length}:00:00.000Z`;
  await fixture.repository.updateJob(job.id, {
    closedAt,
    updatedAt: closedAt
  });
  const invoice = await fixture.repository.createInvoice(invoiceRecord({
    id: `invoice_${suffix}`,
    number: `INV-${suffix.toUpperCase()}`,
    jobId: job.id,
    status: "paid",
    paidAt: closedAt,
    createdAt: closedAt,
    updatedAt: closedAt,
    totals: totals(300),
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 300,
      refundedAmount: 0,
      balanceDue: 0,
      overdue: false
    }
  }));
  return { job, invoice };
}

function parseOptOutToken(bodyText) {
  const match = bodyText.match(/token=([a-f0-9]+)/i);
  assert.ok(match, "Expected the review message to include an opt-out token.");
  return match[1];
}

test("client hub sessions authenticate, reverify after 14 days, and keep property-scoped viewers isolated", async () => {
  const fixture = createFixture({
    clients: [clientRecord({ archivedAt: "2026-07-01T00:00:00.000Z", archivedBy: "owner_1" })]
  });
  const mainJob = await createJob(fixture, { propertyId: "property_1", title: "Main residence leak", amount: 795, code: "MAIN" });
  const lakeJob = await createJob(fixture, { propertyId: "property_2", title: "Lake house leak", amount: 650, code: "LAKE" });
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_main",
    number: "Q-2001",
    title: "Main residence quote",
    jobId: mainJob.id
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_lake",
    number: "Q-2002",
    title: "Lake house quote",
    jobId: lakeJob.id,
    portal: {
      tokenHash: hashToken("standalone_quote_token"),
      tokenIssuedAt: "2026-07-17T09:00:00.000Z"
    }
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_internal_draft",
    number: "Q-2003",
    title: "Internal draft quote",
    jobId: mainJob.id,
    status: "draft"
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_main",
    number: "INV-2001",
    title: "Main residence invoice",
    jobId: mainJob.id,
    totals: totals(250)
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_lake",
    number: "INV-2002",
    title: "Lake house invoice",
    jobId: lakeJob.id,
    totals: totals(180)
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_internal_draft",
    number: "INV-2003",
    title: "Internal draft invoice",
    jobId: mainJob.id,
    status: "draft"
  }));

  const app = appForFixture(fixture);
  const server = await listen(app);

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const clientLink = await fixture.portalHubService.issueMagicLink({
      tenantId: "aquatrace",
      clientId: "client_1",
      target: "deborah@example.test"
    });
    const propertyLink = await fixture.portalHubService.issueMagicLink({
      tenantId: "aquatrace",
      clientId: "client_1",
      propertyId: "property_1",
      target: "deborah@example.test"
    });

    const clientSessionResponse = await fetch(`${base}/nexportal/session/${clientLink.session.id}?tenantId=aquatrace&token=${clientLink.token}`, {
      redirect: "manual"
    });
    assert.equal(clientSessionResponse.status, 303);
    assert.equal(clientSessionResponse.headers.get("location"), "/nexportal?tenantId=aquatrace");
    const clientCookie = clientSessionResponse.headers.get("set-cookie");
    assert.ok(clientCookie);

    const homeResponse = await fetch(`${base}/nexportal?tenantId=aquatrace`, {
      headers: { cookie: clientCookie }
    });
    const homeHtml = await homeResponse.text();
    assert.equal(homeResponse.status, 200);
    assert.match(homeHtml, /Quotes/i);
    assert.match(homeHtml, /Invoices/i);
    assert.match(homeHtml, /Appointments/i);
    assert.match(homeHtml, /Documents/i);
    assert.doesNotMatch(homeHtml, /Archived client/i);
    assert.doesNotMatch(homeHtml, /Internal draft quote/i);
    assert.doesNotMatch(homeHtml, /Internal draft invoice/i);

    const draftSearchResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace&q=internal+draft`, {
      headers: { cookie: clientCookie }
    });
    const draftSearchHtml = await draftSearchResponse.text();
    assert.equal(draftSearchResponse.status, 200);
    assert.doesNotMatch(draftSearchHtml, /Internal draft quote/i);
    assert.doesNotMatch(draftSearchHtml, /Internal draft invoice/i);
    assert.match(draftSearchHtml, /No unified document matches were found/i);

    const wrongTenantResponse = await fetch(`${base}/nexportal?tenantId=another_tenant`, {
      headers: { cookie: clientCookie }
    });
    assert.equal(wrongTenantResponse.status, 401);

    const staleClientSession = await fixture.portalHubRepository.getPortalSession("aquatrace", clientLink.session.id);
    await fixture.portalHubRepository.upsertPortalSession({
      ...staleClientSession,
      lastVerifiedAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z"
    });

    const staleHomeResponse = await fetch(`${base}/nexportal?tenantId=aquatrace`, {
      redirect: "manual",
      headers: { cookie: clientCookie }
    });
    assert.equal(staleHomeResponse.status, 303);
    assert.match(staleHomeResponse.headers.get("location"), /^\/nexportal\/reverify\?/);

    const reverifyResponse = await fetch(`${base}/api/nexportal/reverify/phone`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        cookie: clientCookie
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        sessionId: clientLink.session.id,
        last4: "1212",
        returnPath: "/nexportal?tenantId=aquatrace"
      })
    });
    assert.equal(reverifyResponse.status, 303);
    assert.equal(reverifyResponse.headers.get("location"), "/nexportal?tenantId=aquatrace");

    const restoredHomeResponse = await fetch(`${base}/nexportal?tenantId=aquatrace`, {
      headers: { cookie: clientCookie }
    });
    assert.equal(restoredHomeResponse.status, 200);

    const propertySessionResponse = await fetch(`${base}/nexportal/session/${propertyLink.session.id}?tenantId=aquatrace&token=${propertyLink.token}`, {
      redirect: "manual"
    });
    const propertyCookie = propertySessionResponse.headers.get("set-cookie");
    assert.ok(propertyCookie);

    const documentsResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace`, {
      headers: { cookie: propertyCookie }
    });
    const documentsHtml = await documentsResponse.text();
    assert.equal(documentsResponse.status, 200);
    assert.match(documentsHtml, /Main residence/i);
    assert.doesNotMatch(documentsHtml, /Lake house/i);
    assert.doesNotMatch(documentsHtml, /Client statement/i);
    assert.doesNotMatch(documentsHtml, /Woodfin/i);

    const standaloneQuoteResponse = await fetch(`${base}/portal/quotes/quote_lake?tenantId=aquatrace&token=standalone_quote_token`);
    const standaloneQuoteHtml = await standaloneQuoteResponse.text();
    assert.equal(standaloneQuoteResponse.status, 200);
    assert.match(standaloneQuoteHtml, /Approve quote/i);
    assert.doesNotMatch(standaloneQuoteHtml, /Overview/i);
    assert.doesNotMatch(standaloneQuoteHtml, /Appointments/i);
    assert.doesNotMatch(standaloneQuoteHtml, /Documents/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("client hub shows NexCam visit documents by default and removes them when the job rail is opted out", async () => {
  const fixture = createFixture();
  const job = await createJob(fixture, {
    propertyId: "property_1",
    title: "Portal-visible leak job",
    amount: 510,
    code: "PORTAL"
  });
  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "Leak detection visit",
    start: "2026-07-18T15:00:00.000Z",
    end: "2026-07-18T17:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  const photo = await fixture.fieldDocsRepository.saveMedia(mediaSchema.parse({
    id: "media_portal_visit_photo",
    tenantId: "aquatrace",
    jobId: job.id,
    visitId: visit.id,
    propertyId: "property_1",
    type: "photo",
    storageRef: "native://tenants/aquatrace/media/media_portal_visit_photo/skimmer.jpg",
    thumbRef: "native://tenants/aquatrace/media/media_portal_visit_photo/thumb_skimmer.jpg",
    aiTags: ["skimmer", "visit"],
    aiCaption: "Skimmer throat leak photo.",
    exif: {
      ts: "2026-07-18T15:22:00.000Z",
      gps: { lat: 34.1001, lng: -82.1002 }
    }
  }));
  const report = await fixture.fieldDocsRepository.saveReport(createFieldReportRecord({
    tenantId: "aquatrace",
    jobId: job.id,
    propertyId: "property_1",
    visitId: visit.id,
    title: "Leak detection field report",
    findings: ["Skimmer throat crack confirmed."],
    mediaIds: [photo.id],
    status: "posted"
  }));
  const signedDocument = await fixture.fieldDocsRepository.saveSignedDocument({
    id: "signed_doc_portal_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    jobId: job.id,
    propertyId: "property_1",
    visitId: visit.id,
    kind: "completion_signoff",
    title: "Leak detection completion signoff",
    bodyText: "Client acknowledged the visit findings on site.",
    status: "signed",
    signature: {
      mode: "typed",
      typedName: "Deborah Justice",
      signedAt: "2026-07-18T15:30:00.000Z",
      ipAddress: "127.0.0.1"
    },
    createdAt: "2026-07-18T15:30:00.000Z",
    updatedAt: "2026-07-18T15:30:00.000Z",
    signedAt: "2026-07-18T15:30:00.000Z"
  });

  const app = appForFixture(fixture);
  const server = await listen(app);

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const clientLink = await fixture.portalHubService.issueMagicLink({
      tenantId: "aquatrace",
      clientId: "client_1",
      target: "deborah@example.test"
    });
    const sessionResponse = await fetch(`${base}/nexportal/session/${clientLink.session.id}?tenantId=aquatrace&token=${clientLink.token}`, {
      redirect: "manual"
    });
    const cookie = sessionResponse.headers.get("set-cookie");
    assert.ok(cookie);

    const appointmentsResponse = await fetch(`${base}/nexportal/appointments?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const appointmentsHtml = await appointmentsResponse.text();
    assert.equal(appointmentsResponse.status, 200);
    assert.match(appointmentsHtml, /shared field items are already attached to this visit/i);
    assert.match(appointmentsHtml, /Open photo/i);
    assert.match(appointmentsHtml, /Open report/i);

    const documentsResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const documentsHtml = await documentsResponse.text();
    assert.equal(documentsResponse.status, 200);
    assert.match(documentsHtml, /Leak detection field report/i);
    assert.match(documentsHtml, /Leak detection completion signoff/i);
    assert.match(documentsHtml, /Skimmer throat leak photo\./i);
    assert.match(documentsHtml, new RegExp(`/api/fielddocs/reports/${report.id}/pdf\\?tenantId=aquatrace`));
    assert.match(documentsHtml, new RegExp(`/api/fielddocs/signed-documents/${signedDocument.id}/pdf\\?tenantId=aquatrace`));
    assert.match(documentsHtml, new RegExp(`/api/media/${photo.id}\\?tenantId=aquatrace`));
    assert.doesNotMatch(documentsHtml, /34\.1001/);
    assert.doesNotMatch(documentsHtml, /82\.1002/);

    const reportPdfResponse = await fetch(`${base}/api/fielddocs/reports/${report.id}/pdf?tenantId=aquatrace`);
    assert.equal(reportPdfResponse.status, 200);
    assert.equal(reportPdfResponse.headers.get("content-type"), "application/pdf");
    const pdfBuffer = Buffer.from(await reportPdfResponse.arrayBuffer());
    assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");

    const hideResponse = await fetch(`${base}/api/crm/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        clientVisibility: {
          hideFieldDocsFromPortal: true
        }
      })
    });
    assert.equal(hideResponse.status, 200);
    const hiddenBody = await hideResponse.json();
    assert.equal(hiddenBody.job?.clientVisibility?.hideFieldDocsFromPortal, true);

    const hiddenAppointmentsResponse = await fetch(`${base}/nexportal/appointments?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const hiddenAppointmentsHtml = await hiddenAppointmentsResponse.text();
    assert.equal(hiddenAppointmentsResponse.status, 200);
    assert.doesNotMatch(hiddenAppointmentsHtml, /Open photo/i);
    assert.doesNotMatch(hiddenAppointmentsHtml, /Open report/i);
    assert.doesNotMatch(hiddenAppointmentsHtml, /shared field items are already attached to this visit/i);

    const hiddenDocumentsResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const hiddenDocumentsHtml = await hiddenDocumentsResponse.text();
    assert.equal(hiddenDocumentsResponse.status, 200);
    assert.doesNotMatch(hiddenDocumentsHtml, /Leak detection field report/i);
    assert.doesNotMatch(hiddenDocumentsHtml, /Leak detection completion signoff/i);
    assert.doesNotMatch(hiddenDocumentsHtml, /Skimmer throat leak photo\./i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("portal client uploads land directly, stay visible to staff immediately, and absorb office records into the unified NexDocs rail", async () => {
  const fixture = createFixture();
  const job = await createJob(fixture, {
    propertyId: "property_1",
    title: "Pool permit job",
    amount: 795,
    code: "PERMIT"
  });
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_permit",
    number: "Q-PERMIT",
    title: "Pool permit quote",
    jobId: job.id
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_permit",
    number: "INV-PERMIT",
    title: "Pool permit invoice",
    jobId: job.id,
    totals: totals(240)
  }));
  const nexDocsService = createStubNexDocsService(fixture);
  const folder = await nexDocsService.createFolder({
    tenantId: "aquatrace",
    clientId: "client_1",
    label: "Permit packet",
    createdBy: "owner_1"
  });

  const app = appForFixture(fixture, { nexDocsService });
  const server = await listen(app);

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const clientLink = await fixture.portalHubService.issueMagicLink({
      tenantId: "aquatrace",
      clientId: "client_1",
      target: "deborah@example.test"
    });
    const sessionResponse = await fetch(`${base}/nexportal/session/${clientLink.session.id}?tenantId=aquatrace&token=${clientLink.token}`, {
      redirect: "manual"
    });
    const cookie = sessionResponse.headers.get("set-cookie");
    assert.ok(cookie);

    const permitPdf = simplePdfBuffer("Pool permit for Deborah Justice with service access instructions.");
    const uploadResponse = await fetch(`${base}/api/nexportal/documents/upload`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        folderId: folder.id,
        label: "Client permit upload",
        fileName: "scan-1.pdf",
        mimeType: "application/pdf",
        fileBase64: permitPdf.toString("base64")
      })
    });
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadBody.ok, true);
    assert.equal(uploadBody.document.source, "client_upload");

    const staffLibrary = await nexDocsService.listClientLibrary({
      tenantId: "aquatrace",
      clientId: "client_1",
      viewer: "staff",
      q: "permit"
    });
    assert.ok(staffLibrary.searchResults.some((hit) => hit.entry.id === uploadBody.document.id));
    assert.equal(staffLibrary.folders.find((entry) => entry.folder.id === folder.id)?.documents.some((entry) => entry.id === uploadBody.document.id), true);

    const documentsResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const documentsHtml = await documentsResponse.text();
    assert.equal(documentsResponse.status, 200);
    assert.match(documentsHtml, /Client permit upload/i);
    assert.match(documentsHtml, /Permit packet/i);
    assert.match(documentsHtml, /Pool permit quote/i);
    assert.match(documentsHtml, /Pool permit invoice/i);
    assert.match(documentsHtml, /Client statement/i);
    assert.match(documentsHtml, /NexCam field rail/i);

    await nexDocsService.updateUploadedDocument({
      tenantId: "aquatrace",
      clientId: "client_1",
      documentId: uploadBody.document.id,
      hiddenFromClient: true
    });

    const hiddenDocumentsResponse = await fetch(`${base}/nexportal/documents?tenantId=aquatrace`, {
      headers: { cookie }
    });
    const hiddenDocumentsHtml = await hiddenDocumentsResponse.text();
    assert.equal(hiddenDocumentsResponse.status, 200);
    assert.doesNotMatch(hiddenDocumentsHtml, /Client permit upload/i);
    assert.match(hiddenDocumentsHtml, /Pool permit quote/i);
    assert.match(hiddenDocumentsHtml, /Pool permit invoice/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("portal appointment confirmation stamps the visit and surfaces the event to client and staff rails", async () => {
  const fixture = createFixture();
  const job = await createJob(fixture, {
    propertyId: "property_1",
    title: "Appointment confirm job",
    amount: 420
  });
  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "Leak investigation visit",
    start: "2026-07-18T14:00:00.000Z",
    end: "2026-07-18T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  const app = appForFixture(fixture);
  const server = await listen(app);

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const propertyLink = await fixture.portalHubService.issueMagicLink({
      tenantId: "aquatrace",
      clientId: "client_1",
      propertyId: "property_1",
      target: "deborah@example.test"
    });
    const propertySessionResponse = await fetch(`${base}/nexportal/session/${propertyLink.session.id}?tenantId=aquatrace&token=${propertyLink.token}`, {
      redirect: "manual"
    });
    const propertyCookie = propertySessionResponse.headers.get("set-cookie");
    assert.ok(propertyCookie);

    const confirmResponse = await fetch(`${base}/api/nexportal/visits/${visit.id}/confirm?tenantId=aquatrace`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: propertyCookie }
    });
    assert.equal(confirmResponse.status, 303);
    assert.match(confirmResponse.headers.get("location"), new RegExp(`confirmedVisitId=${visit.id}`));

    const savedVisit = await fixture.schedulingRepository.getVisit("aquatrace", visit.id);
    assert.equal(savedVisit.confirmedBy, "client_1");
    assert.equal(savedVisit.confirmedVia, "portal");
    assert.ok(savedVisit.confirmedAt);

    const portalActivity = await fixture.portalHubService.listPortalActivity({
      tenantId: "aquatrace",
      clientId: "client_1",
      propertyId: "property_1"
    });
    assert.equal(portalActivity.some((entry) => entry.title === "Appointment confirmed"), true);

    const notifications = await fixture.operationsHubService.getNotifications({
      access: access("OWNER", "owner_1"),
      limit: 20,
      referenceTime: "2026-07-18T17:00:00.000Z"
    });
    assert.equal(notifications.notifications.some((entry) => entry.title === "Appointment confirmed"), true);

    const feed = await fixture.operationsHubService.getActivityFeed({
      access: access("OWNER", "owner_1"),
      limit: 20,
      referenceTime: "2026-07-18T17:00:00.000Z"
    });
    assert.equal(feed.some((entry) => entry.type === "visit.confirmed"), true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("client statements keep tips separate from invoice balance and can be delivered from the hub", async () => {
  const fixture = createFixture();
  const job = await createJob(fixture, {
    propertyId: "property_1",
    title: "Statement ledger job",
    amount: 100
  });
  const invoice = await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_statement",
    number: "INV-STATEMENT",
    title: "Statement invoice",
    jobId: job.id,
    totals: totals(100),
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 100,
      overdue: false
    },
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z"
  }));
  const paid = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    amount: 120,
    tipAmount: 20,
    provider: "manual",
    method: "card",
    actorId: "owner_1",
    note: "Collected at closeout."
  });
  assert.equal(paid.payment.tipAmount, 20);
  assert.equal(paid.payment.appliedAmount, 100);
  const statementWindowEnd = new Date(paid.payment.createdAt);
  statementWindowEnd.setUTCHours(23, 59, 59, 999);

  const statement = await fixture.portalHubService.generateStatementSnapshot({
    tenantId: "aquatrace",
    clientId: "client_1",
    from: "2026-07-17T00:00:00.000Z",
    to: statementWindowEnd.toISOString()
  });
  assert.equal(statement.lines.length, 2);
  assert.equal(statement.lines[0].kind, "invoice");
  assert.equal(statement.lines[0].runningBalance, 100);
  assert.equal(statement.lines[1].kind, "payment");
  assert.equal(statement.lines[1].credit, 100);
  assert.match(statement.lines[1].detail ?? "", /Tip 20\.00 kept separate/i);
  assert.equal(statement.runningBalance, 0);

  const sendResult = await fixture.portalHubService.sendStatement({
    tenantId: "aquatrace",
    clientId: "client_1",
    from: "2026-07-17T00:00:00.000Z",
    to: statementWindowEnd.toISOString(),
    target: "deborah@example.test",
    actorId: "owner_1"
  });
  assert.match(sendResult.url, /nexportal\/statements\/client_1\.pdf/i);
  assert.equal(fixture.sentEmails.length, 1);
  assert.equal(fixture.sentEmails[0].attachments.length, 1);
  assert.equal(fixture.sentEmails[0].attachments[0].filename, "statement-client_1.pdf");

  const clientLink = await fixture.portalHubService.issueMagicLink({
    tenantId: "aquatrace",
    clientId: "client_1",
    target: "deborah@example.test"
  });
  const app = appForFixture(fixture);
  const server = await listen(app);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const sessionResponse = await fetch(`${base}/nexportal/session/${clientLink.session.id}?tenantId=aquatrace&token=${clientLink.token}`, {
      redirect: "manual"
    });
    const cookie = sessionResponse.headers.get("set-cookie");
    assert.ok(cookie);
    const statementPdfResponse = await fetch(`${base}/nexportal/statements/client_1.pdf?tenantId=aquatrace&from=2026-07-17T00:00:00.000Z&to=${encodeURIComponent(statementWindowEnd.toISOString())}`, {
      headers: { cookie }
    });
    assert.equal(statementPdfResponse.status, 200);
    assert.equal(statementPdfResponse.headers.get("content-type"), "application/pdf");
    const pdfBuffer = Buffer.from(await statementPdfResponse.arrayBuffer());
    assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  const portalActivity = await fixture.portalHubService.listPortalActivity({
    tenantId: "aquatrace",
    clientId: "client_1"
  });
  assert.equal(portalActivity.some((entry) => entry.title === "Statement sent"), true);
});

test("review sequences honor exhaustion, opt-out, and manual stop without auto-restarting closed jobs", async () => {
  const fixture = createFixture();
  const exhausted = await createClosedPaidJob(fixture, "exhausted");
  const optOut = await createClosedPaidJob(fixture, "optout");
  const manual = await createClosedPaidJob(fixture, "manual");

  const exhaustedSequence = await fixture.reviewSequenceService.maybeStartForJob({
    tenantId: "aquatrace",
    jobId: exhausted.job.id
  });
  assert.ok(exhaustedSequence);
  let progressed = await fixture.reviewSequenceService.syncDueSequences({
    tenantId: "aquatrace",
    at: exhaustedSequence.steps[0].dueAt
  });
  assert.equal(progressed.find((record) => record.id === exhaustedSequence.id)?.steps[0].status, "sent");
  progressed = await fixture.reviewSequenceService.syncDueSequences({
    tenantId: "aquatrace",
    at: exhaustedSequence.steps[1].dueAt
  });
  assert.equal(progressed.find((record) => record.id === exhaustedSequence.id)?.steps[1].status, "sent");
  progressed = await fixture.reviewSequenceService.syncDueSequences({
    tenantId: "aquatrace",
    at: exhaustedSequence.steps[2].dueAt
  });
  const exhaustedDone = progressed.find((record) => record.id === exhaustedSequence.id);
  assert.equal(exhaustedDone?.status, "completed");
  assert.equal(exhaustedDone?.stopReason, "exhausted");
  assert.equal(fixture.sentEmails.length >= 3, true);
  assert.equal(fixture.sentSms.length >= 3, true);

  const optOutSequence = await fixture.reviewSequenceService.maybeStartForJob({
    tenantId: "aquatrace",
    jobId: optOut.job.id
  });
  assert.ok(optOutSequence);
  await fixture.reviewSequenceService.syncDueSequences({
    tenantId: "aquatrace",
    at: optOutSequence.steps[0].dueAt
  });
  const optOutToken = parseOptOutToken(fixture.sentEmails.at(-1).bodyText);
  const optedOut = await fixture.reviewSequenceService.optOut({
    tenantId: "aquatrace",
    reviewSequenceId: optOutSequence.id,
    token: optOutToken
  });
  assert.equal(optedOut.status, "stopped");
  assert.equal(optedOut.stopReason, "opt_out");

  const manualSequence = await fixture.reviewSequenceService.maybeStartForJob({
    tenantId: "aquatrace",
    jobId: manual.job.id
  });
  assert.ok(manualSequence);
  const stoppedManual = await fixture.reviewSequenceService.stopSequence({
    tenantId: "aquatrace",
    reviewSequenceId: manualSequence.id,
    reason: "manual"
  });
  assert.equal(stoppedManual.status, "stopped");
  assert.equal(stoppedManual.stopReason, "manual");

  const shouldNotRestart = await fixture.reviewSequenceService.maybeStartForJob({
    tenantId: "aquatrace",
    jobId: manual.job.id
  });
  assert.equal(shouldNotRestart, null);

  const feed = await fixture.operationsHubService.getActivityFeed({
    access: access("OWNER", "owner_1"),
    limit: 50,
    referenceTime: "2026-07-30T12:00:00.000Z"
  });
  assert.equal(feed.some((entry) => entry.type === "review.sequence_step_sent"), true);
  assert.equal(feed.some((entry) => entry.type === "review.sequence_stopped"), true);
});

test("Nexi client-hub and review tools send portal links, read activity, generate statements, and restart then complete review rails", async () => {
  const fixture = createFixture();
  const { job } = await createClosedPaidJob(fixture, "tooling");
  const tools = createCrmToolsWithOptions(fixture.provider, fixture.approvalQueue, {
    requestRepository: fixture.repository,
    platformRepository: fixture.platformRepository,
    jobLifecycleService: fixture.jobLifecycleService,
    ledgerService: fixture.ledgerService,
    operationsHubService: fixture.operationsHubService,
    portalHubService: fixture.portalHubService,
    reviewSequenceService: fixture.reviewSequenceService
  });
  const toolByName = (name) => {
    const found = tools.find((tool) => tool.name === name);
    assert.ok(found, `Expected tool ${name} to exist.`);
    return found;
  };

  const sendPortalLink = toolByName("sendPortalLink");
  const getClientPortalActivity = toolByName("getClientPortalActivity");
  const generateStatement = toolByName("generateStatement");
  const sendStatement = toolByName("sendStatement");
  const getReviewSequenceStatus = toolByName("getReviewSequenceStatus");
  const stopReviewSequence = toolByName("stopReviewSequence");
  const markReviewed = toolByName("markReviewed");
  const startReviewSequence = toolByName("startReviewSequence");

  const linkResult = await sendPortalLink.handler(tenant(), {
    clientQuery: "Deborah Justice",
    preferredChannel: "email"
  });
  assert.match(linkResult.result.url, /nexportal\/session\//i);
  assert.equal(linkResult.result.delivery, "email");

  const statementPreview = await generateStatement.handler(tenant(), {
    clientQuery: "Deborah Justice"
  });
  assert.equal(statementPreview.result.statement.clientName, "Deborah Justice");

  const statementSend = await sendStatement.handler(tenant(), {
    clientQuery: "Deborah Justice",
    target: "deborah@example.test"
  });
  assert.match(statementSend.result.url, /nexportal\/statements\/client_1\.pdf/i);
  assert.equal(fixture.sentEmails.some((message) => message.subject.includes("statement")), true);

  const started = await startReviewSequence.handler(tenant(), {
    jobId: job.id
  });
  assert.equal(started.result.started, true);
  assert.equal(started.result.sequence.status, "active");

  const statusAfterStart = await getReviewSequenceStatus.handler(tenant(), {
    jobId: job.id
  });
  assert.equal(statusAfterStart.result.activeCount, 1);
  assert.equal(statusAfterStart.result.sequences.length, 1);

  const stopped = await stopReviewSequence.handler(tenant(), {
    jobId: job.id
  });
  assert.equal(stopped.result.sequence.stopReason, "manual");

  const restarted = await startReviewSequence.handler(tenant(), {
    jobId: job.id
  });
  assert.equal(restarted.result.started, true);
  assert.equal(restarted.result.sequence.status, "active");

  const reviewed = await markReviewed.handler(tenant(), {
    jobId: job.id
  });
  assert.equal(reviewed.result.sequence.stopReason, "reviewed");
  assert.equal(reviewed.result.sequence.status, "completed");

  const statusAfterReview = await getReviewSequenceStatus.handler(tenant(), {
    clientQuery: "Deborah Justice"
  });
  assert.equal(statusAfterReview.result.activeCount, 0);
  assert.equal(statusAfterReview.result.sequences.some((sequence) => sequence.stopReason === "reviewed"), true);

  const portalActivity = await getClientPortalActivity.handler(tenant(), {
    clientQuery: "Deborah Justice"
  });
  assert.equal(portalActivity.result.activity.some((entry) => entry.title === "Portal link sent"), true);
  assert.equal(portalActivity.result.activity.some((entry) => entry.title === "Statement sent"), true);
  assert.equal(portalActivity.result.activity.some((entry) => entry.title === "Review marked complete"), true);
});

test("local Nexi chat routes portal and review intents through the new client-hub tools", async () => {
  const fixture = createFixture();
  const { job } = await createClosedPaidJob(fixture, "chat");
  const tools = createCrmToolsWithOptions(fixture.provider, fixture.approvalQueue, {
    requestRepository: fixture.repository,
    platformRepository: fixture.platformRepository,
    jobLifecycleService: fixture.jobLifecycleService,
    ledgerService: fixture.ledgerService,
    operationsHubService: fixture.operationsHubService,
    portalHubService: fixture.portalHubService,
    reviewSequenceService: fixture.reviewSequenceService
  });

  const portalTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "send Deborah Justice a portal link by email" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(portalTurn.toolRuns[0].name, "sendPortalLink");
  assert.match(portalTurn.answer, /NexPortal link/i);

  const activityTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "show Deborah Justice portal activity" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(activityTurn.toolRuns[0].name, "getClientPortalActivity");
  assert.match(activityTurn.answer, /Portal link sent/i);

  const statementTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "generate a statement for Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(statementTurn.toolRuns[0].name, "generateStatement");
  assert.match(statementTurn.answer, /running balance/i);

  const sendStatementTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "send Deborah Justice a statement to deborah@example.test" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(sendStatementTurn.toolRuns[0].name, "sendStatement");
  assert.match(sendStatementTurn.answer, /client statement/i);

  const startTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `start a review sequence for ${job.id}` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(startTurn.toolRuns[0].name, "startReviewSequence");
  assert.match(startTurn.answer, /started the review follow-up sequence/i);

  const statusTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `what is the review sequence status for ${job.id}` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(statusTurn.toolRuns[0].name, "getReviewSequenceStatus");
  assert.match(statusTurn.answer, /active review follow-up sequence/i);

  const stopTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `stop the review sequence for ${job.id}` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(stopTurn.toolRuns[0].name, "stopReviewSequence");
  assert.match(stopTurn.answer, /manual/i);

  const restartTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `start a review sequence for ${job.id} again` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(restartTurn.toolRuns[0].name, "startReviewSequence");
  assert.match(restartTurn.answer, /started the review follow-up sequence/i);

  const markReviewedTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `mark the review sequence for ${job.id} reviewed` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(markReviewedTurn.toolRuns[0].name, "markReviewed");
  assert.match(markReviewedTurn.answer, /Current status: completed/i);
});
