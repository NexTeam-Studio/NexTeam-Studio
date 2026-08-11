import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readGitSha(env: NodeJS.ProcessEnv): string {
  // GitHub-connected Railway deploys provide the authoritative source commit.
  // Check it before a local upload stamp: Railway build caches can retain a
  // stale untracked stamp even when the connected GitHub revision changed.
  const envSha = env.RAILWAY_GIT_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA;
  if (envSha?.trim()) {
    return envSha.trim();
  }
  const explicitSha = env.NEXTEAM_DEPLOY_SHA;
  if (explicitSha?.trim()) {
    return explicitSha.trim();
  }
  try {
    const plainStamp = readFileSync("nexteam-build-sha.txt", "utf8").trim();
    if (plainStamp) {
      return plainStamp;
    }
  } catch {
    // Railway's archive path can drop hidden files; keep a non-hidden stamp too.
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

export function getBuildInfo(env: NodeJS.ProcessEnv = process.env): { sha: string; builtAt: string } {
  return {
    sha: readGitSha(env),
    builtAt: env.BUILT_AT || new Date().toISOString()
  };
}

