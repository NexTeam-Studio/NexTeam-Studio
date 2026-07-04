import test from "node:test";
import assert from "node:assert/strict";

import {
  createNexiOperatorQueryService,
  isNexiOperationalQuestion,
} from "./nexiOperatorQueryService.js";

test("isNexiOperationalQuestion recognizes fast and report job-data prompts", () => {
  assert.equal(isNexiOperationalQuestion("Who's the customer at 237 Camp Mikell Court?"), true);
  assert.equal(isNexiOperationalQuestion("Open the Camp Mikell checklist and pull the total gallons."), true);
  assert.equal(isNexiOperationalQuestion("Write a better homepage title."), false);
});

test("Nexi operator query service resolves locally before falling back to Clawdia", async () => {
  let fallbackCalled = false;
  const service = createNexiOperatorQueryService({
    operationalQuestionService: {
      async answerQuestion() {
        return {
          ok: true,
          handled: true,
          response: "COMPANYCAM JOB DATA\n- answer: Estimated Approximate Total Gallons = 101,000 Gallons",
          route: {
            kind: "companycam_job_data",
            lane: "work",
            delivery: "product-local",
            sourcePlan: ["companycam", "dropbox_customer_exports"],
            resourceProvider: "companycam",
          },
          classification: {
            kind: "report_lookup",
            lane: "work",
          },
          result: {
            answer: {
              displayValue: "101,000 Gallons",
            },
          },
        };
      },
    },
    fetchImpl: async () => {
      fallbackCalled = true;
      throw new Error("fallback should not be called");
    },
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(fallbackCalled, false);
  assert.equal(result.payload.route.kind, "companycam_job_data");
  assert.equal(result.payload.route.delivery, "product-local");
  assert.match(result.response, /101,000 Gallons/);
});

test("Nexi operator query service falls back to Clawdia when local sources cannot handle the question", async () => {
  const service = createNexiOperatorQueryService({
    operationalQuestionService: {
      async answerQuestion() {
        return {
          ok: false,
          handled: false,
          reason: "no_connected_source",
        };
      },
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          ok: true,
          handled: true,
          response: "COMPANYCAM JOB DATA\n- answer: Estimated Approximate Total Gallons = 24,250 Gallons",
          route: {
            kind: "companycam_job_data",
          },
        };
      },
    }),
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the report for Statehouse Arena in L3 Campus?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.match(result.response, /24,250 Gallons/);
});

test("Nexi operator query service creates the local operational service lazily at answer time", async () => {
  let factoryCalls = 0;

  const service = createNexiOperatorQueryService({
    operationalQuestionServiceFactory: () => {
      factoryCalls += 1;
      return {
        async answerQuestion() {
          return {
            ok: true,
            handled: true,
            response: "MISSION CONTROL FAST LOOKUP\n- project: Alex Mastej",
            route: {
              kind: "companycam_fast_lookup",
              lane: "fast",
              delivery: "product-local",
              sourcePlan: ["companycam"],
              resourceProvider: "companycam",
            },
            classification: {
              kind: "fast_lookup",
              lane: "fast",
            },
            result: {
              project: {
                name: "Alex Mastej",
              },
            },
          };
        },
      };
    },
    fetchImpl: async () => {
      throw new Error("fallback should not be called");
    },
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "Who's the customer at 237 Camp Mikell Court in Toccoa Georgia?",
  });

  assert.equal(factoryCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(result.payload.route.kind, "companycam_fast_lookup");
  assert.match(result.response, /Alex Mastej/);
});
