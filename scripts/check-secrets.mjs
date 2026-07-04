import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => file !== ".env.example")
  .filter((file) => !file.startsWith("docs/") && !file.startsWith("tmp/") && !file.startsWith("tmp-proof/"));

const blockedNames = [
  /\.env$/i,
  /\.env\./i,
  /credential/i,
  /application-password/i,
  /editor-login/i,
  /private-key/i
];

const highRiskPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /(?<![A-Z0-9_])(?:API_KEY|CLIENT_SECRET|REFRESH_TOKEN|ACCESS_TOKEN|PASSWORD)\s*=\s*["'][A-Za-z0-9_./+=-]{16,}["']/i
];

const failures = [];
for (const file of tracked) {
  if (blockedNames.some((pattern) => pattern.test(file))) {
    failures.push(`${file}: blocked credential-like filename`);
    continue;
  }
  if (/\.(png|jpg|jpeg|gif|webp|zip|pdf|docx)$/i.test(file)) {
    continue;
  }
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (highRiskPatterns.some((pattern) => pattern.test(text))) {
    failures.push(`${file}: high-risk secret pattern`);
  }
}

if (failures.length) {
  console.error("Secret scan failed:");
  for (const failure of failures.slice(0, 50)) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${tracked.length} tracked non-doc files checked).`);
