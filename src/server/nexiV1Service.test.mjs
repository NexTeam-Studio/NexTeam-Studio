import test from "node:test";
import assert from "node:assert/strict";
import { createNexiV1Service } from "./nexiV1Service.js";

function createRepositoryDouble() {
  const conversationEntries = [];
  const failureEntries = [];

  return {
    conversationEntries,
    failureEntries,
    async getTenantContext(tenantId) {
      return {
        tenantId,
        root: { brandName: "Aquatrace", avatarName: "Nexi", industry: "pool leak detection" },
        config: {
          businessRules: {
            serviceCatalog: ["Leak detection"],
            serviceArea: { territories: ["SC", "GA"] },
          },
          dashboard: { ownerGoals: ["Answer faster"] },
          channels: {
            companycam: { status: "connected" },
            jobber: { status: "not-needed" },
          },
          profile: {
            publicAgentName: "Nexi",
            brandName: "Aquatrace",
            industry: "pool leak detection",
          },
        },
        summary: {
          brandName: "Aquatrace",
          publicAgentName: "Nexi",
          industry: "pool leak detection",
          connectivity: { companycam: "connected", jobber: "not-needed" },
        },
      };
    },
    async listConversationHistory() {
      return [];
    },
    async appendConversationLog(payload) {
      conversationEntries.push(payload);
      return {
        id: `conv-log-${conversationEntries.length}`,
        path: `tenants/aquatrace/nexiConversationLog/conv-log-${conversationEntries.length}`,
        conversationId: payload.conversationId || "conv-1",
      };
    },
    async appendFailureLog(payload) {
      failureEntries.push(payload);
      return {
        id: `failure-${failureEntries.length}`,
        path: `tenants/aquatrace/nexiFailureLog/failure-${failureEntries.length}`,
      };
    },
  };
}

test("nexi v1 service answers CompanyCam report questions through the direct operational lane", async () => {
  const repository = createRepositoryDouble();
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion() {
        return {
          ok: true,
          handled: true,
          response: "Camp Mikell total gallons: 101,000 Gallons",
          route: { kind: "companycam_job_data", lane: "work", resourceProvider: "companycam" },
        };
      },
    },
    env: {},
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What is the pool gallonage for Camp Mikell?",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-1",
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /101,000 Gallons/);
  assert.equal(repository.failureEntries.length, 0);
  assert.equal(repository.conversationEntries.length, 1);
});

test("nexi v1 service logs blocked Jobber schedule questions", async () => {
  const repository = createRepositoryDouble();
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion() {
        return { ok: false, handled: false };
      },
    },
    env: {},
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What jobs do I have today?",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-2",
  });

  assert.equal(result.ok, false);
  assert.match(result.answer, /Jobber read-only connection is not configured/i);
  assert.equal(repository.failureEntries.length, 1);
});

test("nexi v1 service answers Jobber schedule questions through the direct Jobber lane", async () => {
  const repository = createRepositoryDouble();
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion() {
        return { ok: false, handled: false };
      },
    },
    jobberService: {
      async answerScheduleQuestion() {
        return {
          ok: true,
          handled: true,
          answerText: "Jobber schedule for today: 1 job.\n- #2022626 Deborah Justice - Swimming Pool Leak Detection Service (archived)",
          route: { kind: "jobber_schedule", lane: "fast", resourceProvider: "jobber" },
          source: "jobber",
        };
      },
      async answerJobDetailQuestion() {
        throw new Error("not used");
      },
    },
    env: {
      JOBBER_CLIENT_ID: "client-id",
      JOBBER_CLIENT_SECRET: "client-secret",
      JOBBER_REFRESH_TOKEN: "refresh-token",
    },
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What jobs do I have today?",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-4",
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /Deborah Justice/);
  assert.equal(repository.failureEntries.length, 0);
  assert.equal(repository.conversationEntries.length, 1);
});

test("nexi v1 service answers named Jobber job-detail questions", async () => {
  const repository = createRepositoryDouble();
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion() {
        return { ok: false, handled: false };
      },
    },
    jobberService: {
      async answerScheduleQuestion() {
        throw new Error("not used");
      },
      async answerJobDetailQuestion() {
        return {
          ok: true,
          handled: true,
          answerText: "Jobber match: Deborah Justice.\n- address: 123 Test Lane, Fair Play, South Carolina",
          route: { kind: "jobber_job_detail", lane: "work", resourceProvider: "jobber" },
          source: "jobber",
        };
      },
    },
    env: {
      JOBBER_CLIENT_ID: "client-id",
      JOBBER_CLIENT_SECRET: "client-secret",
      JOBBER_REFRESH_TOKEN: "refresh-token",
    },
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "Show me the Deborah Justice job.",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-5",
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /123 Test Lane/);
  assert.equal(repository.failureEntries.length, 0);
  assert.equal(repository.conversationEntries.length, 1);
});

test("nexi v1 service logs out-of-scope requests", async () => {
  const repository = createRepositoryDouble();
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion() {
        return { ok: false, handled: false };
      },
    },
    env: {},
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "Write me a blog post.",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-3",
  });

  assert.equal(result.ok, false);
  assert.match(result.answer, /outside Nexi v1's current scope/i);
  assert.equal(repository.failureEntries.length, 1);
});

test("nexi v1 service carries the last CompanyCam project forward for generic follow-up questions", async () => {
  const repository = createRepositoryDouble();
  repository.listConversationHistory = async () => [
    { role: "user", content: "What is the pool gallonage for Camp Mikell in Toccoa GA?" },
    { role: "assistant", content: "Camp Mikell total gallons: 101,000 gallons." },
  ];

  let receivedQuestion = "";
  const service = createNexiV1Service({
    repository,
    companyCamRail: {},
    operationalQuestionService: {
      async answerQuestion({ question }) {
        receivedQuestion = question;
        return {
          ok: true,
          handled: true,
          response: "The report noted dye-response findings at the skimmer line.",
          route: { kind: "companycam_job_data", lane: "work", resourceProvider: "companycam" },
        };
      },
    },
    env: {},
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What issues were present?",
    actor: { uid: "owner-1", email: "owner@aquatrace.com", tenantId: "aquatrace", roles: ["platform_operator"] },
    conversationId: "conv-6",
  });

  assert.equal(result.ok, true);
  assert.match(receivedQuestion, /Camp Mikell/i);
  assert.match(result.answer, /skimmer line/i);
});
