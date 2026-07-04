import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages", "tests"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));

const failures = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const inProviders = file.startsWith("packages/providers/");
  if (!inProviders && /from\s+["'][^"']*(getjobber|companycam|sendgrid|twilio)[^"']*["']/i.test(text)) {
    failures.push(`${file}: vendor import outside packages/providers`);
  }
  if (file.startsWith("apps/web/") && /companycam\.com|api\.getjobber\.com/i.test(text)) {
    failures.push(`${file}: raw vendor URL in frontend code`);
  }
}

if (failures.length) {
  console.error("Provider boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Provider boundary check passed (${files.length} files checked).`);
