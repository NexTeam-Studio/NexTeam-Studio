import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CompositeApprovalExecutor } from "../dist/approval/compositeExecutor.js";
import { CommsApprovalExecutor } from "../dist/comms/approvalExecutor.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";

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

test("request routes create, update, convert, archive, and reopen while preserving intake fields", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const sentEmails = [];
  const commsRail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "TRANSACTIONAL",
      async sendEmail(outbound) {
        sentEmails.push(outbound);
        return { id: `sent_${sentEmails.length}` };
      }
    },
    senderEmail: "staging@example.test"
  };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CompositeApprovalExecutor([
    { canExecute: (item) => item.execute.service === "comms" && item.execute.op === "sendEmail", executor: new CommsApprovalExecutor(commsRail) },
    { canExecute: (item) => item.execute.service === "crm", executor: new CrmApprovalExecutor(adapter) }
  ]));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }],
      getTenantBranding: async () => ({ tenantId: "aquatrace", displayName: "Aquatrace", colors: { primary: "#08776f", secondary: "#0a2430", accent: "#98ff00", accentText: "#102333", background: "#f4f7f5", surface: "#ffffff", text: "#14232d", mutedText: "#5f6d75" } })
    },
    commsRail,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false", NEXOPS_PUBLIC_BASE_URL: "https://nexstage.example.test" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const formsResponse = await fetch(`${base}/api/crm/request-forms?tenantId=aquatrace`);
    const formsBody = await formsResponse.json();
    assert.equal(formsBody.ok, true);
    assert.equal(formsBody.forms.length >= 1, true);
    const publicFormResponse = await fetch(`${base}/request-forms/aquatrace/service-request`);
    const publicFormHtml = await publicFormResponse.text();
    assert.equal(publicFormResponse.ok, true);
    assert.match(publicFormHtml, /Contact Details/);
    assert.match(publicFormHtml, /Is your pool inground or above ground\?/);
    assert.match(publicFormHtml, /Swimming Pool \/ Spa Combo/);
    assert.match(publicFormHtml, /0\/10/);
    assert.match(publicFormHtml, /aquatraceleak\.com\/privacy-policy/);
    assert.match(publicFormHtml, /checked/);

    const publicSubmissionResponse = await fetch(`${base}/api/request-forms/aquatrace/service-request/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        first_name: "Public",
        last_name: "Intake",
        company_name: "Aquatrace Test Company",
        email: "public-intake@example.test",
        phone: "8645551212",
        marketing_email_consent: true,
        marketing_sms_consent: true,
        property_street1: "100 Test Lane",
        property_city: "Fair Play",
        property_province: "South Carolina",
        property_postal_code: "29643",
        pool_installation_type: "Inground",
        pool_type: "Residential",
        pool_construction_type: "Fiberglass",
        pool_configuration: "Swimming Pool Only",
        water_loss_rate: "1\" or less daily",
        issue_summary: "Public form regression submission.",
        referral_source: "Search"
      })
    });
    const publicSubmissionBody = await publicSubmissionResponse.json();
    assert.equal(publicSubmissionResponse.status, 201);
    assert.equal(publicSubmissionBody.request.clientName, "Public Intake");
    assert.equal(publicSubmissionBody.request.consent.marketing, true);
    assert.equal(publicSubmissionBody.request.consent.sms, true);
    assert.equal(publicSubmissionBody.request.intake.fieldIndex.company_name, "Aquatrace Test Company");
    assert.equal(publicSubmissionBody.request.intake.fieldIndex.marketing_sms_consent, true);
    assert.ok(publicSubmissionBody.request.notifications?.adminNotifiedAt, "the configured internal notification is sent through the approval rail");
    assert.ok(publicSubmissionBody.request.notifications?.clientConfirmationAt, "the email-only client confirmation is sent through the approval rail");
    assert.equal(sentEmails.length, 2, "public request submission sends one internal notification and one client confirmation");
    assert.deepEqual(sentEmails.map((email) => email.to), [["service@aquatraceleak.com"], ["public-intake@example.test"]]);
    assert.match(sentEmails[0].bodyHtml, /Open request in NexOps/);
    assert.match(sentEmails[1].bodyHtml, /Visit Aquatrace/);
    assert.match(sentEmails[0].bodyHtml, /#08776f/);
    assert.equal(sentEmails[0].from, "Aquatrace via NexOps <staging@example.test>");
    assert.equal(sentEmails[1].from, "Aquatrace <staging@example.test>");
    assert.match(sentEmails[0].bodyText, /matches an existing client on file|No matching client was found/);
    assert.doesNotMatch(sentEmails[0].bodyText, /Exact match hit/);
    assert.ok(publicSubmissionBody.request.selectedClientId, "public submission links to a saved client immediately");
    const publicClient = (await repository.listClients("aquatrace")).find((client) => client.id === publicSubmissionBody.request.selectedClientId);
    assert.ok(publicClient, "the linked client is persisted in the tenant client database");
    assert.equal(publicClient.company, "Aquatrace Test Company");
    assert.equal(publicClient.personName?.firstName, "Public");
    assert.equal(publicClient.personName?.lastName, "Intake");
    assert.deepEqual(publicClient.emails, ["public-intake@example.test"]);
    assert.deepEqual(publicClient.phones, ["8645551212"]);
    assert.equal(publicClient.contacts?.[0]?.emails[0]?.value, "public-intake@example.test");

    const archivePublicRequestResponse = await fetch(`${base}/api/crm/requests/${publicSubmissionBody.request.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal((await archivePublicRequestResponse.json()).request.status, "archived");
    assert.ok((await repository.listClients("aquatrace")).some((client) => client.id === publicSubmissionBody.request.selectedClientId), "archiving a request preserves its linked client");

    const requestResponse = await fetch(`${base}/api/crm/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        source: "office_new_client",
        formId: formsBody.forms[0].id,
        formSlug: formsBody.forms[0].slug,
        fieldValues: [
          { key: "first_name", value: "Logan" },
          { key: "last_name", value: "Sears" },
          { key: "company_name", value: "Aquatrace Test Company" },
          { key: "email", value: "logan@example.test" },
          { key: "phone", value: "8645551212" },
          { key: "marketing_consent", value: true },
          { key: "property_street1", value: "102 Kate Lane" },
          { key: "property_city", value: "Fair Play" },
          { key: "property_province", value: "SC" },
          { key: "property_postal_code", value: "29643" },
          { key: "pool_configuration", value: "pool_and_spa" },
          { key: "gate_code", value: "4421", visibility: { invoice: false } },
          { key: "pet_present", value: true },
          { key: "pet_name", value: "Scout" },
          { key: "issue_summary", value: "Water loss around the skimmer throat." }
        ]
      })
    });
    const requestBody = await requestResponse.json();
    assert.equal(requestBody.ok, true, requestBody.error);
    assert.equal(requestBody.request.clientName, "Logan Sears", "office Add New requests derive the required client name from first and last name");
    assert.equal(requestBody.request.consent.marketing, true);
    assert.equal(requestBody.request.intake.fieldIndex.gate_code, "4421");
    assert.equal(requestBody.request.intake.fieldIndex.marketing_consent, true);
    assert.equal(requestBody.request.intake.fieldValues.find((field) => field.key === "gate_code").visibility.invoice, false);

    const updatedResponse = await fetch(`${base}/api/crm/requests/${requestBody.request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        reviewedAt: "2026-07-12T12:00:00.000Z",
        fieldPatches: [{ key: "gate_code", visibility: { quote: false } }]
      })
    });
    const updatedBody = await updatedResponse.json();
    assert.equal(updatedBody.ok, true);
    assert.equal(updatedBody.request.reviewedAt, "2026-07-12T12:00:00.000Z");
    assert.equal(updatedBody.request.intake.fieldValues.find((field) => field.key === "gate_code").visibility.quote, false);

    const quoteResponse = await fetch(`${base}/api/crm/requests/${requestBody.request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const quoteBody = await quoteResponse.json();
    assert.equal(quoteBody.ok, true);
    assert.equal(quoteBody.quote.requestId, requestBody.request.id);
    assert.equal(quoteBody.quote.intake.fieldIndex.pool_configuration, "pool_and_spa");
    assert.equal(quoteBody.quote.intake.fieldIndex.marketing_consent, true);
    assert.equal(quoteBody.quote.intake.fieldValues.find((field) => field.key === "gate_code").visibility.quote, false);

    const archiveResponse = await fetch(`${base}/api/crm/requests/${requestBody.request.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const archiveBody = await archiveResponse.json();
    assert.equal(archiveBody.ok, true);
    assert.equal(archiveBody.request.archivedFromStatus, "converted_to_quote");
    assert.equal(archiveBody.request.convertedQuoteId, quoteBody.quote.id);

    const secondRequestResponse = await fetch(`${base}/api/crm/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        source: "office_new_client",
        formId: formsBody.forms[0].id,
        formSlug: formsBody.forms[0].slug,
        fieldValues: [
          { key: "client_name", value: "Catherine Sears" },
          { key: "email", value: "catherine@example.test" },
          { key: "phone", value: "8645559988" },
          { key: "property_street1", value: "104 Kate Lane" },
          { key: "property_city", value: "Fair Play" },
          { key: "property_province", value: "SC" },
          { key: "property_postal_code", value: "29643" },
          { key: "pool_configuration", value: "pool_only" },
          { key: "issue_summary", value: "Need leak detection before resurfacing." }
        ]
      })
    });
    const secondRequestBody = await secondRequestResponse.json();
    assert.equal(secondRequestBody.ok, true);
    assert.ok(secondRequestBody.request.selectedClientId, "office requests also link to a client at creation");

    const deleteResponse = await fetch(`${base}/api/crm/requests/${secondRequestBody.request.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteBody.ok, true);
    assert.equal(deleteBody.deletedRequestId, secondRequestBody.request.id);
    const deletedReference = await repository.getRequest("aquatrace", secondRequestBody.request.id);
    assert.ok(deletedReference?.deletedAt, "deleting hides the request from the roster but retains its original intake as a downstream reference");
    assert.ok((await repository.listClients("aquatrace")).some((client) => client.id === secondRequestBody.request.selectedClientId), "deleting a request preserves its linked client");

    const thirdRequestResponse = await fetch(`${base}/api/crm/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        source: "office_new_client",
        formId: formsBody.forms[0].id,
        formSlug: formsBody.forms[0].slug,
        fieldValues: [
          { key: "client_name", value: "Catherine Sears" },
          { key: "email", value: "catherine@example.test" },
          { key: "property_street1", value: "104 Kate Lane" },
          { key: "property_city", value: "Fair Play" },
          { key: "property_province", value: "SC" },
          { key: "property_postal_code", value: "29643" },
          { key: "pool_configuration", value: "pool_only" },
          { key: "issue_summary", value: "Need leak detection before resurfacing." }
        ]
      })
    });
    const thirdRequestBody = await thirdRequestResponse.json();
    assert.equal(thirdRequestBody.ok, true);

    const reviewedSecondRequestResponse = await fetch(`${base}/api/crm/requests/${thirdRequestBody.request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", reviewedAt: "2026-07-12T12:05:00.000Z" })
    });
    assert.equal((await reviewedSecondRequestResponse.json()).ok, true);

    const jobResponse = await fetch(`${base}/api/crm/requests/${thirdRequestBody.request.id}/convert-to-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const jobBody = await jobResponse.json();
    assert.equal(jobBody.ok, true);
    assert.equal(jobBody.job.requestId, thirdRequestBody.request.id);
    assert.equal(jobBody.job.intake.fieldIndex.pool_configuration, "pool_only");
    assert.equal(jobBody.job.title, secondRequestBody.request.subject);
    assert.equal(jobBody.job.status, "Unscheduled");

    const deleteConvertedRequestResponse = await fetch(`${base}/api/crm/requests/${thirdRequestBody.request.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal((await deleteConvertedRequestResponse.json()).ok, true);
    const deletedConvertedReference = await repository.getRequest("aquatrace", thirdRequestBody.request.id);
    assert.ok(deletedConvertedReference?.deletedAt, "deleting a converted request preserves the original intake for its linked downstream job");
    assert.equal(jobBody.job.requestId, deletedConvertedReference?.id, "the downstream job retains the persistent request reference after source deletion");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("local Nexi request tools clarify missing intake data, then create and recall real requests", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const tools = createCrmToolsWithOptions(adapter, approvalQueue, { requestRepository: repository });

  const firstTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "create a request for Logan Sears, phone 864-555-1212, email logan@example.test, gate code 4421, pet named Scout, skimmer leak" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(firstTurn.toolRuns[0].name, "createRequest");
  assert.match(firstTurn.answer, /full service address/i);

  const secondTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "create a request for Logan Sears, phone 864-555-1212, email logan@example.test, gate code 4421, pet named Scout, skimmer leak" },
      { role: "assistant", content: firstTurn.answer },
      { role: "user", content: "It's at 102 Kate Lane, Fair Play, SC 29643 and it's a pool and spa combo losing 2 inches daily." }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(secondTurn.toolRuns[0].name, "createRequest");
  assert.match(secondTurn.answer, /created the request/i);
  assert.equal((await repository.listRequests("aquatrace")).length, 1);

  const recallTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "is Logan Sears' pool a pool-only or pool+spa combo" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(recallTurn.toolRuns[0].name, "getRequestDetail");
  assert.match(recallTurn.answer, /spa integration: pool and spa/i);
  assert.equal(recallTurn.sources[0].rail, "native");

  const gateCodeTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what's Logan Sears' gate code" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(gateCodeTurn.toolRuns[0].name, "getRequestDetail");
  assert.match(gateCodeTurn.answer, /gate code: 4421/i);
  assert.equal(gateCodeTurn.sources[0].rail, "native");

  const listTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "list requests for Logan Sears" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(listTurn.toolRuns[0].name, "listRequests");
  assert.match(listTurn.answer, /found 1 request/i);
});

test("client record route toggles marketing consent and forwards the NexReach revocation hook", async () => {
  const repository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_marketing_toggle",
      tenantId: "aquatrace",
      name: "Rachel Payne",
      emails: ["rachel@example.test"],
      phones: ["8645551100"],
      tags: [],
      consent: { email: true, sms: true, marketing: true }
    }]
  });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const calls = [];
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    nexReachService: {
      async handleConsentChange(input) {
        calls.push(input);
        return { flaggedShowcases: [] };
      }
    },
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/api/crm/clients/client_marketing_toggle`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        consent: { marketing: false }
      })
    });
    const body = await response.json();
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.client.consent.marketing, false);
    assert.deepEqual(calls, [{
      tenantId: "aquatrace",
      clientId: "client_marketing_toggle",
      marketingConsent: false
    }]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
