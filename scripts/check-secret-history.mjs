import { execFileSync } from "node:child_process";

const maxBuffer = 1024 * 1024 * 50;

const git = (args, options = {}) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer,
    ...options
  });

const blockedPathPatterns = [
  /docs\/internal\/clawdia\/reference/i,
  /\.env$/i,
  /\.env\./i,
  /credential/i,
  /application-password/i,
  /editor-login/i,
  /private-key/i
];

const grepPatterns = [
  "-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----",
  "AIza[0-9A-Za-z_-]{20,}",
  "sk-[A-Za-z0-9]{20,}",
  "xox[baprs]-[A-Za-z0-9-]{20,}",
  "gh[pousr]_[A-Za-z0-9_]{20,}",
  "(API_KEY|CLIENT_SECRET|REFRESH_TOKEN|ACCESS_TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*[\"'][A-Za-z0-9_./+=-]{16,}[\"']"
];

const objectLines = git(["rev-list", "--all", "--objects"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const pathFailures = [];
for (const line of objectLines) {
  const [, path] = /^([0-9a-f]{40})(?:\s+(.+))?$/.exec(line) ?? [];
  if (!path) {
    continue;
  }
  const normalizedPath = path.replaceAll("\\", "/");
  if (blockedPathPatterns.some((pattern) => pattern.test(normalizedPath))) {
    pathFailures.push(normalizedPath);
  }
}

const commits = git(["rev-list", "--all"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const contentFailures = [];
for (const commit of commits) {
  for (const pattern of grepPatterns) {
    let output = "";
    try {
      output = git(["grep", "-I", "-l", "-E", "-e", pattern, commit, "--", "."], {
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      continue;
    }
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      const match = /^([^:]+):(.+)$/.exec(line);
      const file = match?.[2] ?? line;
      contentFailures.push(`${commit.slice(0, 12)}:${file}`);
    }
  }
}

const failures = [...new Set([...pathFailures, ...contentFailures])];

if (failures.length) {
  console.error("Secret history scan failed:");
  for (const failure of failures.slice(0, 50)) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Secret history scan passed (${commits.length} reachable commits, ${objectLines.length} reachable objects checked).`);
