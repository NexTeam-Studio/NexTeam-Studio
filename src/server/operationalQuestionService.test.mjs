import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyOperationalQuestion,
  createOperationalQuestionService,
} from "./operationalQuestionService.js";

test("classifyOperationalQuestion detects fast lookup phrasing", () => {
  const result = classifyOperationalQuestion("Who's the customer at 237 Camp Mikell Court in Toccoa?");

  assert.equal(result.handled, true);
  assert.equal(result.kind, "fast_lookup");
  assert.equal(result.lane, "fast");
  assert.equal(result.reason, "simple-lookup-request");
});

test("classifyOperationalQuestion detects report lookup phrasing", () => {
  const result = classifyOperationalQuestion("Open the Camp Mikell checklist and pull the total gallons.");

  assert.equal(result.handled, true);
  assert.equal(result.kind, "report_lookup");
  assert.equal(result.lane, "work");
  assert.equal(result.reason, "heavy-companycam-report-request");
});

test("classifyOperationalQuestion detects square-footage report lookup phrasing", () => {
  const result = classifyOperationalQuestion("What was the pool square footage at Oleta Falls?");

  assert.equal(result.handled, true);
  assert.equal(result.kind, "report_lookup");
  assert.equal(result.lane, "work");
  assert.equal(result.reason, "heavy-companycam-report-request");
});

test("classifyOperationalQuestion leaves unrelated prompts unsupported", () => {
  const result = classifyOperationalQuestion("Write a homepage section about leak detection.");

  assert.equal(result.handled, false);
  assert.equal(result.kind, "unsupported");
});

test("operational service returns local fast lookup answers", async () => {
  const service = createOperationalQuestionService({
    companyCamRail: {
      async searchProjects() {
        return [
          {
            id: "camp-mikell",
            name: "Alex Mastej",
            status: "active",
            address: {
              street_address_1: "237 Camp Mikell Court",
              city: "Toccoa",
              state: "Georgia",
              postal_code: "30577",
            },
          },
        ];
      },
    },
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "Who's the customer at 237 Camp Mikell Court in Toccoa?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(result.route.kind, "companycam_fast_lookup");
  assert.match(result.response, /MISSION CONTROL FAST LOOKUP/);
});

test("operational service returns local report answers with provider metadata", async () => {
  const service = createOperationalQuestionService({
    companyCamRail: {},
    companyCamReportResolver: async () => ({
      ok: true,
      tenantId: "aquatrace",
      answer: {
        fieldLabel: "Estimated Approximate Total Gallons",
        displayValue: "24,250 Gallons",
      },
      project: {
        id: "statehouse",
        name: "L3 Campus",
        address: {
          street_address_1: "600 West Lafayette Street",
          city: "Tallahassee",
          state: "Florida",
          postal_code: "32304",
        },
      },
      sourceDocument: {
        id: "doc-1",
        name: "Checklist.pdf",
      },
      source: {
        evidenceSnippet: "Estimated Approximate Total Gallons 24,250 Gallons",
      },
      resourcePath: {
        provider: "companycam",
      },
      alternativeProjects: [],
    }),
  });

  const result = await service.answerQuestion({
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the report for Statehouse Arena in L3 Campus?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(result.route.kind, "companycam_job_data");
  assert.equal(result.route.resourceProvider, "companycam");
  assert.match(result.response, /24,250 Gallons/);
});
