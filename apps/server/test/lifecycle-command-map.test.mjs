import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_CONTRACTS,
  COMMUNICATION_TEMPLATES,
  COMMANDS_BY_ID,
  DECISION_REGISTRY,
  PERMISSION_IDS,
  deriveClientScheduleRequestDominantAction,
  deriveInvoiceDominantAction,
  deriveQuoteDominantAction,
  deriveVisitDominantAction,
  traceCommandsByDecision
} from "../dist/crm/lifecycleCommandMap.js";

test("lifecycle command map keeps the full D1-D19 decision register", () => {
  assert.equal(DECISION_REGISTRY.length, 19);
  assert.deepEqual(DECISION_REGISTRY[0], {
    decisionId: "D1",
    question: "Deposit fails after approval — does approval survive?",
    confirmedDecision: "Atomic. A failed deposit means the quote is not accepted, no QuoteAcceptance record exists, and the client must fully re-approve on retry."
  });
  assert.equal(DECISION_REGISTRY.at(-1)?.decisionId, "D19");
});

test("lifecycle command map exposes the 12 required communication templates", () => {
  assert.equal(COMMUNICATION_TEMPLATES.length, 12);
  assert.ok(COMMUNICATION_TEMPLATES.some((template) => template.templateId === "payment_receipt" && template.mode === "review_gated"));
  assert.ok(COMMUNICATION_TEMPLATES.some((template) => template.templateId === "visit_rescheduled" && template.channels.includes("sms")));
});

test("every command references valid decision ids and valid communication templates", () => {
  const decisionIds = new Set(DECISION_REGISTRY.map((record) => record.decisionId));
  const templateIds = new Set(COMMUNICATION_TEMPLATES.map((template) => template.templateId));
  for (const command of COMMAND_CONTRACTS) {
    for (const dependency of command.policyDependencies) {
      assert.ok(decisionIds.has(dependency), `${command.commandId} should point to a registered decision id.`);
    }
    for (const trigger of command.communicationTriggers) {
      assert.ok(templateIds.has(trigger.templateId), `${command.commandId} should point to a registered communication template.`);
    }
  }
});

test("permission registry stays unique and the portal commands stay on authorization profiles", () => {
  assert.equal(new Set(PERMISSION_IDS).size, PERMISSION_IDS.length);
  const portalApprove = COMMANDS_BY_ID.get("portal.quote_approve_and_pay_deposit");
  assert.ok(portalApprove);
  assert.equal(portalApprove.authorizationProfileId, "portal_customer_resource_access");
  assert.equal(portalApprove.requiredPermission, undefined);
});

test("quote archive contract is an office-only draft transition that preserves commercial history", () => {
  const command = COMMANDS_BY_ID.get("quote.archive");
  assert.ok(command);
  assert.equal(command.actorSurface, "office_web");
  assert.equal(command.requiredPermission, "quote.send");
  assert.match(command.currentConditions[0].when, /draft/i);
  assert.match(command.transitionResult, /identity, number, and commercial history/i);
  assert.equal(command.auditEvent, "quote.archived");
});

test("quote dominant action derives atomic approval and renewal states", () => {
  const expired = deriveQuoteDominantAction({
    quoteStatus: "sent",
    clientResponseStatus: "none",
    requireDeposit: true,
    expired: true
  });
  assert.equal(expired.label, "Renew quote");
  assert.equal(expired.tone, "blocked");

  const depositBlocked = deriveQuoteDominantAction({
    quoteStatus: "sent",
    clientResponseStatus: "none",
    requireDeposit: true,
    expired: false,
    missingDepositMethod: true
  });
  assert.equal(depositBlocked.label, "Approve and pay deposit");
  assert.equal(depositBlocked.blockedBy, "Deposit payment details missing");
});

test("D1 atomic portal approval contract keeps failed deposit attempts out of accepted quote state", () => {
  const command = COMMANDS_BY_ID.get("portal.quote_approve_and_pay_deposit");
  assert.ok(command);
  assert.ok(command.policyDependencies.includes("D1"));
  assert.match(command.transitionResult, /failure leaves quote_status as sent/i);
  assert.match(command.transitionResult, /QuoteAcceptance/i);
  assert.deepEqual(command.createdEntities, ["QuoteAcceptance", "Payment", "Allocation"]);
  assert.ok(command.communicationTriggers.some((trigger) => trigger.templateId === "deposit_failure"));
});

test("visit, invoice, and client-schedule dominant actions derive from orthogonal status dimensions", () => {
  const visitBlocked = deriveVisitDominantAction({
    scheduleStatus: "scheduled",
    travelStatus: "arrived",
    visitStatus: "in_progress",
    fieldDocumentationComplete: false
  });
  assert.equal(visitBlocked.label, "Complete visit");
  assert.equal(visitBlocked.tone, "blocked");

  const invoiceCollect = deriveInvoiceDominantAction({
    lifecycle: "open",
    deliveryStatus: "sent",
    balanceStatus: "partially_paid",
    paymentScheduleActive: true
  });
  assert.equal(invoiceCollect.label, "Collect scheduled payment");

  const scheduleRequest = deriveClientScheduleRequestDominantAction("pending");
  assert.equal(scheduleRequest.label, "Resolve request");
  assert.equal(scheduleRequest.nextCommandId, "client_schedule_request.accept_reschedule");
});

test("decision traces expose downstream command dependencies for auditability", () => {
  const d17Commands = traceCommandsByDecision("D17").map((command) => command.commandId).sort();
  assert.deepEqual(d17Commands, [
    "client_schedule_request.accept_cancellation",
    "client_schedule_request.accept_reschedule",
    "client_schedule_request.counter_propose",
    "client_schedule_request.decline",
    "portal.request_cancellation",
    "portal.request_reschedule"
  ]);
});
