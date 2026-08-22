import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateSecretOperation } from "./secretOutputPolicy.ts";
import { splinterLifecycleController } from "./lifecycleController.ts";
import { redactSecrets } from "@nexteam/core";

const {
  NODE_OPTIONS: _nodeOptions,
  NODE_TEST_CONTEXT: _nodeTestContext,
  NODE_CHANNEL_FD: _nodeChannelFd,
  NODE_UNIQUE_ID: _nodeUniqueId,
  ...cleanWrapperEnv
} = process.env;

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
    ["railway", "run", "--", "powershell", "-Command", "Get-Item", "Env:*"],
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

test("the approved Railway wrapper uses the controller policy and rejects secret-output bypasses before reading its vault", { skip: process.platform !== "win32" }, () => {
  for (const args of ["variable,list", "run,--,powershell,-Command,Get-Item,Env:*", "logs"]) {
    let output = "";
    try {
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-RailwayArgs", args], {
        cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
      });
      assert.fail("The Railway secret-output request should have been denied.");
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    assert.match(output, /denied/i);
    assert.doesNotMatch(output, /RAILWAY_TOKEN=|API_KEY=|SECRET=/i);
  }
});

test("the approved Railway wrapper admits only the documented staging deployment shape", { skip: process.platform !== "win32" }, () => {
  let safeOutput = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-VaultPath", "C:\\nonexistent\\secret-vault.dpapi", "-RailwayArgs", "up,--service,NexTeam-Studio,--environment,staging,--detach"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
    });
  } catch (error) {
    safeOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(safeOutput, /token vault not found|policy.*denied/i);
  assert.doesNotMatch(safeOutput, /allowlist|API_KEY=|SECRET=/i);

  let deniedOutput = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-RailwayArgs", "up,--service,other-service,--environment,staging,--detach"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
    });
  } catch (error) {
    deniedOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(deniedOutput, /allowlist/i);

  let redeployOutput = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-RailwayArgs", "deployment,redeploy,--service,NexTeam-Studio,--yes"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
    });
  } catch (error) {
    redeployOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(redeployOutput, /allowlist/i);
});

test("the one scoped staging Shadow Mode writer is silent while generic variable writes remain denied", () => {
  assert.equal(evaluateSecretOperation({
    store: "RAILWAY", kind: "COMMAND_EXECUTION", outputMode: "SILENT",
    command: ["railway", "shadow-mode", "configure", "--email", "approved-staging@example.test"]
  }).allowed, true);
  assert.equal(evaluateSecretOperation({
    store: "RAILWAY", kind: "COMMAND_EXECUTION", outputMode: "REDACTED",
    command: ["railway", "shadow-mode", "configure", "--email", "approved-staging@example.test"]
  }).allowed, false);
  assert.equal(evaluateSecretOperation({
    store: "RAILWAY", kind: "COMMAND_EXECUTION", outputMode: "SILENT",
    command: ["railway", "variable", "set", "NEXTEAM_SHADOW_MODE=true"]
  }).allowed, false);
});

test("the guarded Railway wrapper permits only its scoped Shadow Mode configuration action", { skip: process.platform !== "win32" }, () => {
  let safeOutput = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-VaultPath", "C:\\nonexistent\\secret-vault.dpapi", "-RailwayArgs", "shadow-mode,configure,--email,approved-staging@example.test"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
    });
  } catch (error) {
    safeOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(safeOutput, /token vault not found|policy.*denied/i);
  assert.doesNotMatch(safeOutput, /api[_-]?key|secret=|railway_token/i);

  let directVariableOutput = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/security/invoke-railway-staging.ps1", "-RailwayArgs", "variable,set,NEXTEAM_SHADOW_MODE=true,--service,NexTeam-Studio,--environment,staging"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: cleanWrapperEnv
    });
  } catch (error) {
    directVariableOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.match(directVariableOutput, /denied/i);
  assert.doesNotMatch(directVariableOutput, /NEXTEAM_SHADOW_MODE=true/i);
});

test("the guarded Railway wrapper tokenizes its documented comma-safe invocation before execution", () => {
  const source = readFileSync("scripts/security/invoke-railway-staging.ps1", "utf8");
  assert.match(source, /\$normalizedRailwayArgs\s*=.*-split\s+","/);
  assert.match(source, /&\s+\$railway\.Source\s+@normalizedRailwayArgs/);
  assert.match(source, /node_modules\\tsx\\dist\\loader\.mjs/);
  assert.match(source, /NEXTEAM_SHADOW_MODE=true/);
  assert.match(source, /NEXTEAM_SHADOW_EMAIL_RECIPIENTS=\$shadowModeEmail/);
});
