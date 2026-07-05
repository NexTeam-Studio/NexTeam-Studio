import test from "node:test";
import assert from "node:assert/strict";
import { classifyNexiV1Question } from "./nexiV1QuestionClassifier.js";

test("classifyNexiV1Question detects photo requests", () => {
  const result = classifyNexiV1Question("Show me photos from Camp Mikell.");
  assert.equal(result.kind, "companycam_photos");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects CompanyCam report questions", () => {
  const result = classifyNexiV1Question("What is the pool gallonage for Camp Mikell in Toccoa GA?");
  assert.equal(result.kind, "companycam_report_question");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects CompanyCam square-footage report questions", () => {
  const result = classifyNexiV1Question("What was the pool square footage at Oleta Falls?");
  assert.equal(result.kind, "companycam_report_question");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects CompanyCam project-detail questions", () => {
  const result = classifyNexiV1Question("Who was the technician on Statehouse Arena pool for L3 Campus?");
  assert.equal(result.kind, "companycam_project_detail");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects CompanyCam account summary questions", () => {
  const result = classifyNexiV1Question("How many projects are there in CompanyCam?");
  assert.equal(result.kind, "companycam_account_summary");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects paraphrased CompanyCam account summary questions", () => {
  const result = classifyNexiV1Question("Count the current projects visible in CompanyCam.");
  assert.equal(result.kind, "companycam_account_summary");
  assert.equal(result.route, "companycam");
});

test("classifyNexiV1Question detects schedule requests", () => {
  const result = classifyNexiV1Question("What jobs do I have today?");
  assert.equal(result.kind, "jobber_schedule");
  assert.equal(result.route, "jobber");
});

test("classifyNexiV1Question detects named job detail requests", () => {
  const result = classifyNexiV1Question("Show me the Deborah Justice job.");
  assert.equal(result.kind, "jobber_job_detail");
  assert.equal(result.route, "jobber");
});

test("classifyNexiV1Question leaves unrelated questions out of scope", () => {
  const result = classifyNexiV1Question("Can you write me a marketing article?");
  assert.equal(result.inScope, false);
});
