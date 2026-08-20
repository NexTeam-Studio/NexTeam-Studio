import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { evaluateSecretOperation } from "./secretOutputPolicy.ts";
import { splinterLifecycleController } from "./lifecycleController.ts";
import { redactSecrets } from "@nexteam/core";

test("secret-name and provider-status inspection is allowed without payload access", () => {
  const decision = splinterLifecycleController.authorizeSecretOperation({
    store: "GCP_SECRET_MANAGER",
    kind: "METADATA_INSPECTION",
    outputMode: "METADATA_ONLY",
    command: ["gcloud", "secrets", "describe", "transactional-email"]
  });
  assert.equal(decision.allowed, true);
});

test("Railway variable listing and raw environment dumps are denied before execution", () => {
  for (const command of [
    ["railway", "variable", "list"],
    ["railway", "run", "--", "env"],
    ["Get-ChildItem", "Env:"]
  ]) {
    const decision = evaluateSecretOperation({ store: "RAILWAY", kind: "COMMAND_EXECUTION", outputMode: "REDACTED", command });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /secret values/i);
  }
});

test("generic credential-shaped environment output is redacted without retaining its payload", () => {
  const result = String(redactSecrets('{"RESEND_API_KEY":"fixture-value","NORMAL":"visible"}'));
  assert.match(result, /RESEND_API_KEY/);
  assert.match(result, /\[REDACTED\]/);
  assert.doesNotMatch(result, /fixture-value/);
});

test("Secret Manager metadata is allowed while payload version access is denied", () => {
  assert.equal(evaluateSecretOperation({
    store: "GCP_SECRET_MANAGER", kind: "METADATA_INSPECTION", outputMode: "METADATA_ONLY",
    command: ["gcloud", "secrets", "list"]
  }).allowed, true);
  assert.equal(evaluateSecretOperation({
    store: "GCP_SECRET_MANAGER", kind: "COMMAND_EXECUTION", outputMode: "SILENT",
    command: ["gcloud", "secrets", "versions", "access", "latest"]
  }).allowed, false);
});

test("narrow runtime injection remains allowed without exposing a credential", () => {
  const decision = evaluateSecretOperation({
    store: "PROVIDER", kind: "RUNTIME_INJECTION", outputMode: "SILENT", requiresSecretValue: true,
    command: ["transactional-adapter", "send"]
  });
  assert.equal(decision.allowed, true);
});

test("denial is secret-safe and credential rotation never makes a value dump acceptable", () => {
  const decision = evaluateSecretOperation({
    store: "RAILWAY", kind: "COMMAND_EXECUTION", outputMode: "METADATA_ONLY",
    command: ["railway", "variable", "list"], credentialsRotated: true
  });
  assert.equal(decision.allowed, false);
  assert.doesNotMatch(`${decision.reason} ${decision.safeAlternative}`, /fixture-value|api key value/i);
});

test("the approved Railway wrapper rejects variable listing before reading its credential vault", () => {
  let output = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-RailwayArgs", "variable,list"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    });
    assert.fail("The Railway value-listing request should have been denied.");
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(output, /variable enumeration is denied/i);
  assert.doesNotMatch(output, /RAILWAY_TOKEN=|API_KEY=|SECRET=/i);
});
