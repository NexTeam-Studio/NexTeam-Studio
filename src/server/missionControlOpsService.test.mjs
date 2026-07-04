import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMissionControlRequest,
  createMissionControlOpsService,
} from "./missionControlOpsService.js";

test("classifyMissionControlRequest keeps customer lookups on the fast lane", () => {
  const result = classifyMissionControlRequest("Who's the customer at 237 Camp Mikell Court in Toccoa?");
  assert.equal(result.lane, "fast");
  assert.equal(result.reason, "simple-lookup-request");
});

test("classifyMissionControlRequest handles varied plain-English lookup phrasing", () => {
  const cases = [
    "Can you tell me who the client is at 237 Camp Mikell Court in Toccoa, Georgia?",
    "Pull up the job at 237 Camp Mikell Court.",
    "I need the homeowner for Camp Mikell in Toccoa.",
    "What's the status on the Camp Mikell project?",
  ];

  for (const question of cases) {
    const result = classifyMissionControlRequest(question);
    assert.equal(result.lane, "fast", `expected fast lane for "${question}"`);
  }
});

test("classifyMissionControlRequest pushes report/gallons questions to the work lane", () => {
  const result = classifyMissionControlRequest("What are the total gallons in the Camp Mikell report PDF?");
  assert.equal(result.lane, "work");
  assert.equal(result.reason, "heavy-companycam-report-request");
});

test("classifyMissionControlRequest handles varied plain-English heavy-task phrasing", () => {
  const cases = [
    "Open the Camp Mikell checklist and pull the total gallons.",
    "Read the PDF for Camp Mikell and tell me the pool volume.",
    "Extract the measurements from the Camp Mikell report.",
    "Can you summarize the Camp Mikell exported report for me?",
  ];

  for (const question of cases) {
    const result = classifyMissionControlRequest(question);
    assert.equal(result.lane, "work", `expected work lane for "${question}"`);
  }
});

test("dispatch returns immediate fast-lane results", async () => {
  const service = createMissionControlOpsService({
    fastLookupResolver: async ({ question }) => ({
      ok: true,
      handled: true,
      answerText: `fast:${question}`,
    }),
    workResolver: async () => ({ ok: true }),
    idFactory: () => "work-fixed",
    now: () => "2026-06-30T12:00:00.000Z",
  });

  const result = await service.dispatch({
    tenantId: "aquatrace",
    question: "Who's the customer at 237 Camp Mikell Court?",
  });

  assert.equal(result.lane, "fast");
  assert.equal(result.result.answerText, "fast:Who's the customer at 237 Camp Mikell Court?");
});

test("dispatch acknowledges work-lane requests immediately and completes them asynchronously", async () => {
  let resolveWork;
  const workPromise = new Promise((resolve) => {
    resolveWork = resolve;
  });

  const service = createMissionControlOpsService({
    fastLookupResolver: async () => ({ ok: true }),
    workResolver: async () => {
      await workPromise;
      return {
        ok: true,
        answerText: "COMPANYCAM JOB DATA",
      };
    },
    idFactory: () => "work-fixed",
    now: () => "2026-06-30T12:00:00.000Z",
  });

  const queued = await service.dispatch({
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the Camp Mikell report?",
  });

  assert.equal(queued.lane, "work");
  assert.equal(queued.acknowledged, true);
  assert.equal(queued.workItemId, "work-fixed");

  const running = service.getWorkItem("work-fixed");
  assert.ok(running);
  assert.ok(
    running.status === "queued" || running.status === "running",
    `expected queued or running immediately after ack, got "${running?.status}"`
  );

  resolveWork();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = service.getWorkItem("work-fixed");
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.answerText, "COMPANYCAM JOB DATA");
});
