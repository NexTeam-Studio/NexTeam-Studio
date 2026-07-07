import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { versionResponseSchema } from "@nexteam/core";

function readGitSha(): string {
  const envSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXTEAM_DEPLOY_SHA;
  if (envSha?.trim()) {
    return envSha.trim();
  }
  try {
    const stampedSha = readFileSync(".nexteam-build-sha", "utf8").trim();
    if (stampedSha) {
      return stampedSha;
    }
  } catch {
    // Local Railway uploads do not expose .git; a generated stamp restores the proof chain.
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function getBuildInfo(): { sha: string; builtAt: string } {
  return versionResponseSchema.parse({
    sha: readGitSha(),
    builtAt: process.env.BUILT_AT || new Date().toISOString()
  });
}

