import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readGitSha(env: NodeJS.ProcessEnv): string {
  // Staging uploads receive a fresh, non-secret archive stamp before Railway
  // builds them. Prefer it over a linked-source SHA, which Railway can retain
  // from an older GitHub deployment after an upload deploy.
  try {
    const plainStamp = readFileSync("nexteam-build-sha.txt", "utf8").trim();
    if (plainStamp) {
      return plainStamp;
    }
  } catch {
    // GitHub-connected deployments do not carry the upload stamp.
  }
  try {
    const stampedSha = readFileSync(".nexteam-build-sha", "utf8").trim();
    if (stampedSha) {
      return stampedSha;
    }
  } catch {
    // Older upload archives may use the hidden stamp.
  }
  const explicitSha = env.NEXTEAM_DEPLOY_SHA;
  if (explicitSha?.trim()) {
    return explicitSha.trim();
  }
  const envSha = env.RAILWAY_GIT_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA;
  if (envSha?.trim()) {
    return envSha.trim();
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

