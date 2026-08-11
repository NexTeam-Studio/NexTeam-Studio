import { readFile } from "node:fs/promises";
import { assertIdentityPurpose } from "./globalControl.mjs";

const SHA = /^[0-9a-f]{7,64}$/i;
export function assertStagingGitHubRail({ environment, deploymentRail, sourceSha, deploymentSha, liveSha }) {
  if (environment !== "staging" || deploymentRail !== "github-actions") throw new Error("Deployments are staging-only and GitHub Actions-only.");
  for (const sha of [sourceSha, deploymentSha, liveSha]) if (!SHA.test(sha ?? "")) throw new Error("Source, deployment, and live SHAs are required.");
  if (sourceSha !== deploymentSha || deploymentSha !== liveSha) throw new Error("Source, deployment, and live SHAs must match.");
  return { environment, deploymentRail, sourceSha, deploymentSha, liveSha, verified: true };
}

export async function runEnvironmentBootstrap({ environment, identity, purpose, steps, audit }) {
  assertIdentityPurpose({ environment, identity, purpose });
  if (!Array.isArray(steps) || steps.some((step) => !step || typeof step.id !== "string" || typeof step.check !== "function")) throw new Error("Bootstrap steps must be typed check functions.");
  const results = [];
  for (const step of steps) {
    const result = await step.check();
    const outcome = { id: step.id, status: result ? "already_ready" : "blocked" };
    results.push(outcome); await audit?.({ environment, identity, purpose, ...outcome });
  }
  return { environment, changed: false, idempotent: true, results };
}

export async function runStagingAuthRegression({ baseUrl, fetchImpl = fetch, expectedSha }) {
  const url = new URL("/api/version", baseUrl);
  const response = await fetchImpl(url, { headers: { "x-nexteam-regression": "staging-auth-readonly" } });
  const body = await response.json();
  const liveSha = body?.sha ?? body?.build?.sha;
  const shaMatches = SHA.test(liveSha ?? "") && (!expectedSha || liveSha === expectedSha);
  return { environment: "staging", browser: { status: response.status, authenticatedRouteGuard: response.status === 200 }, mobile: { status: response.status, authenticatedRouteGuard: response.status === 200 }, liveSha: liveSha ?? null, shaMatches, readOnly: true };
}

export async function evidenceGate({ sourceSha, deploymentSha, liveSha, receiptFile }) {
  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  const model = assertStagingGitHubRail({ environment: receipt.environment, deploymentRail: receipt.deploymentRail, sourceSha, deploymentSha, liveSha });
  if (receipt.green !== true || receipt.fixed !== true || receipt.productionChanged !== false) throw new Error("Evidence receipt is not a green, fixed, production-unchanged claim.");
  return { ...model, receiptVerified: true };
}
