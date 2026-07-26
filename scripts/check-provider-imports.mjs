import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages", "tests"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));

const failures = [];
for (const file of files) {
  if (!existsSync(file)) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  const inProviders = file.startsWith("packages/providers/");
  if (!inProviders && /from\s+["'][^"']*(getjobber|companycam|sendgrid|twilio)[^"']*["']/i.test(text)) {
    failures.push(`${file}: vendor import outside packages/providers`);
  }
  if (file.startsWith("apps/web/") && /companycam\.com|api\.getjobber\.com/i.test(text)) {
    failures.push(`${file}: raw vendor URL in frontend code`);
  }
  if ((file.startsWith("apps/server/src/") || file.startsWith("apps/web/src/") || file.startsWith("packages/nexi/src/"))
    && /\b(?:Jobber|CompanyCam)\b/.test(text)) {
    failures.push(`${file}: active runtime code still references dormant vendor brands by name`);
  }
  if (/adapters\s*:\s*\{[\s\S]{0,240}?crm\s*:\s*["']jobber["']/i.test(text)) {
    failures.push(`${file}: active tenant default or fixture still sets adapters.crm to dormant vendor rail`);
  }
  if (/adapters\s*:\s*\{[\s\S]{0,240}?media\s*:\s*["']companycam["']/i.test(text)) {
    failures.push(`${file}: active tenant default or fixture still sets adapters.media to dormant vendor rail`);
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
