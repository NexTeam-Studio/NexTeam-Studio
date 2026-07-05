import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx)$/.test(file));

const allowed = /\b(?:NexiBlueprint|SiteJobBlueprint|nexiBlueprint|siteJobBlueprint|siteJobBlueprints|nexiBlueprintSchema|siteJobBlueprintSchema|NexiBlueprintDoc|SiteJobBlueprintDoc)\b|site-job-blueprints?|site-job-blueprint/gi;
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8").replace(allowed, "");
  if (/\bblueprint\b/i.test(text)) {
    failures.push(`${file}: generic blueprint identifier/text in product code`);
  }
}

if (failures.length) {
  console.error("Blueprint naming check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Blueprint naming check passed (${files.length} files checked).`);


