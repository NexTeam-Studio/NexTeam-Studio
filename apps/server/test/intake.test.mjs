import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { IntakeApprovalExecutor } from "../dist/intake/approvalExecutor.js";
import { intakeStateAfter } from "../dist/intake/machine.js";
import { createIntakeNexiTools } from "../dist/intake/nexiTools.js";
import { InMemoryIntakeRepository } from "../dist/intake/repository.js";
import { registerIntakeRoutes } from "../dist/intake/routes.js";
import { IntakeService } from "../dist/intake/service.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { InMemoryPlatformRepository } from "../dist/platform/repository.js";
import { runNexiToolLoop } from "@nexteam/nexi";

async function withServer(app, run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.notEqual(typeof address, "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function makeService() {
  const intakeRepository = new InMemoryIntakeRepository();
  const platformRepository = new InMemoryPlatformRepository([tenant()]);
  const service = new IntakeService(intakeRepository, platformRepository);
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new IntakeApprovalExecutor(service)
  );
  return { intakeRepository, platformRepository, service, approvalQueue };
}

test("M10 XState intake interview reaches approval and provisioned states", () => {
  assert.equal(intakeStateAfter([]), "business");
  assert.equal(intakeStateAfter(["ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER"]), "plan");
  assert.equal(intakeStateAfter(["ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER", "FINALIZE"]), "approval");
  assert.equal(intakeStateAfter(["ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER", "ANSWER", "FINALIZE", "EXECUTE"]), "provisioned");
});

test("M10 service drafts Demo Pool Co blueprint, queues approval, and provisions native tenant only after approval", async () => {
  const { platformRepository, service, approvalQueue } = makeService();
  const started = await service.start({
    businessName: "Demo Pool Co",
    industryPack: "pool_leak",
    plan: "suite",
    timezone: "America/New_York"
  }, "aquatrace");

  let session = await service.answer({ sessionId: started.id, field: "services", value: "Leak detection, VGB compliance" }, "aquatrace");
  session = await service.answer({ sessionId: session.id, field: "serviceArea", value: "Fair Play, Seneca, Bryson City" }, "aquatrace");
  session = await service.answer({ sessionId: session.id, field: "pricingNotes", value: "Owner confirms all quotes before sending." }, "aquatrace");
  session = await service.answer({ sessionId: session.id, field: "brandVoice", value: "Plain-spoken, fast, and practical." }, "aquatrace");
  session = await service.answer({
    sessionId: session.id,
    field: "appStack",
    value: [
      { category: "crm", currentTool: "Jobber", decision: "COEXIST", notes: "Import read-only first." },
      { category: "photos", currentTool: "CompanyCam", decision: "REPLACE_LATER", notes: "Keep until mobile is proven." }
    ]
  }, "aquatrace");

  const finalized = await service.finalize({ sessionId: session.id }, "aquatrace", approvalQueue, "internal:owner_chris");
  assert.equal(finalized.session.status, "approval_queued");
  assert.equal(finalized.session.provisioningPlan.tenant.id, "demo-pool-co");
  assert.equal(finalized.session.nexiBlueprint.services.length, 2);
  assert.equal(finalized.session.provisioningPlan.oauthSteps[0].status, "needs_owner");

  assert.equal(await platformRepository.getTenant("demo-pool-co"), null);
  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].kind, "tenant_provisioning");
  assert.equal(pending[0].execute.args.externalProvisioningDeferred, true);

  await approvalQueue.approve(finalized.approvalId);
  const executed = await approvalQueue.executeApproved(finalized.approvalId);
  assert.equal(executed.result.nativeWritesOnly, true);
  assert.equal(executed.result.externalProvisioningDeferred, true);
  const tenantRecord = await platformRepository.getTenant("demo-pool-co");
  assert.equal(tenantRecord.name, "Demo Pool Co");
  assert.equal(tenantRecord.plan, "suite");
});

test("M10 routes are owner/admin gated and queue tenant provisioning approval", async () => {
  const app = express();
  app.use(express.json());
  const { service, approvalQueue } = makeService();
  registerIntakeRoutes(app, {
    service,
    approvalQueue,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  await withServer(app, async (baseUrl) => {
    const startResponse = await fetch(`${baseUrl}/api/intake/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", businessName: "Demo Pool Co" })
    });
    assert.equal(startResponse.status, 201);
    const started = await startResponse.json();
    assert.equal(started.ok, true);
    assert.equal(started.actorId, "internal:local-owner");

    const answerResponse = await fetch(`${baseUrl}/api/intake/${started.session.id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", field: "services", value: "Leak detection" })
    });
    assert.equal(answerResponse.status, 200);

    const finalizeResponse = await fetch(`${baseUrl}/api/intake/${started.session.id}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    assert.equal(finalizeResponse.status, 200);
    const finalized = await finalizeResponse.json();
    assert.equal(finalized.approvalQueuedOnly, true);
    assert.match(finalized.approvalId, /^appr_/);
  });
});

test("M10 Nexi tools start intake and finalize to ApprovalQueue with actor attribution", async () => {
  const { service, approvalQueue } = makeService();
  const tools = createIntakeNexiTools({
    service,
    approvalQueue,
    access: {
      tenantId: "aquatrace",
      tenantUserId: "owner_chris",
      role: "OWNER",
      accessKind: "internal"
    }
  });
  const startIntake = tools.find((tool) => tool.name === "startIntake");
  const answerIntake = tools.find((tool) => tool.name === "answerIntake");
  const finalizeIntake = tools.find((tool) => tool.name === "finalizeIntake");
  assert.ok(startIntake);
  assert.ok(answerIntake);
  assert.ok(finalizeIntake);

  const started = await startIntake.handler(tenant(), { businessName: "Demo Pool Co" });
  const sessionId = started.result.session.id;
  await answerIntake.handler(tenant(), { sessionId, field: "services", value: "Leak detection" });
  const finalized = await finalizeIntake.handler(tenant(), { sessionId });
  assert.equal(finalized.result.approvalQueuedOnly, true);
  assert.equal(finalized.result.session.provisioningPlan.tenant.id, "demo-pool-co");

  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending[0].execute.args.actorId, "internal:owner_chris");
});

test("M10 chat router sends onboarding language to intake tools instead of job lookup", async () => {
  const { service, approvalQueue } = makeService();
  const tools = createIntakeNexiTools({
    service,
    approvalQueue,
    access: {
      tenantId: "aquatrace",
      tenantUserId: "owner_chris",
      role: "OWNER",
      accessKind: "internal"
    }
  });

  const started = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "test",
    messages: [{ role: "user", content: "Onboard Demo Pool Co as a new tenant" }],
    tools,
    cachedToolRuns: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });
  assert.equal(started.toolRuns[0].name, "startIntake");
  assert.match(started.answer, /started the onboarding interview/i);
  const sessionId = started.toolRuns[0].result.session.id;

  await service.answer({ sessionId, field: "services", value: "Leak detection" }, "aquatrace");
  await service.answer({ sessionId, field: "serviceArea", value: "Fair Play" }, "aquatrace");
  await service.answer({ sessionId, field: "pricingNotes", value: "Owner approves quotes." }, "aquatrace");
  await service.answer({ sessionId, field: "brandVoice", value: "Plain and practical." }, "aquatrace");
  await service.answer({ sessionId, field: "appStack", value: "Jobber, CompanyCam" }, "aquatrace");

  const finalized = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "test",
    messages: [{ role: "user", content: `Finalize intake ${sessionId} and park the tenant plan for approval` }],
    tools,
    cachedToolRuns: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });
  assert.equal(finalized.toolRuns[0].name, "finalizeIntake");
  assert.match(finalized.answer, /approval queue/i);
  assert.equal(finalized.toolRuns[0].result.approvalQueuedOnly, true);
});

test("M10 gateway saves intake answer turns with deterministic answerIntake args", async () => {
  const { service, approvalQueue } = makeService();
  const tools = createIntakeNexiTools({
    service,
    approvalQueue,
    access: {
      tenantId: "aquatrace",
      tenantUserId: "owner_chris",
      role: "OWNER",
      accessKind: "internal"
    }
  });
  const session = await service.start({ businessName: "Demo Pool Co" }, "aquatrace");
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "test",
    messages: [{ role: "user", content: `For ${session.id}, services are leak detection, weekly pool maintenance, and equipment repair.` }],
    tools,
    cachedToolRuns: [{ name: "startIntake", result: { session }, sources: [{ rail: "native", ref: session.id, label: "Tenant intake Demo Pool Co" }] }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    fetchFn: async () => {
      throw new Error("deterministic intake answers should not call the model");
    }
  });

  assert.deepEqual(result.toolRuns.map((run) => run.name), ["answerIntake"]);
  assert.match(result.answer, /saved that onboarding answer/i);
  const saved = await service.getSession("aquatrace", session.id);
  assert.equal(saved?.answers.services, "leak detection, weekly pool maintenance, and equipment repair");
});
