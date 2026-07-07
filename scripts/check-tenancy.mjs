import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const explicitFiles = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const files = explicitFiles.length
  ? explicitFiles
  : execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => /\.(ts|tsx)$/.test(file));

const collectionPattern = /\.collection\(["']([^"']+)["']\)([\s\S]{0,260})/g;
const platformAdminCollections = new Set(["tenants"]);
const tenantEvidencePattern = /tenantId|\.where\(["']tenantId["']\s*,/;
const operationPattern = /\.(?:add|get|set|update|delete|doc|batch)\s*\(/;
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(collectionPattern)) {
    const collection = match[1];
    const chain = match[2] ?? "";
    if (!collection || !operationPattern.test(chain)) {
      continue;
    }
    if (platformAdminCollections.has(collection) && text.includes("@platform-admin-read")) {
      continue;
    }
    if (text.includes(`@tenant-doc:${collection}`)) {
      continue;
    }
    if (tenantEvidencePattern.test(chain) || text.includes(`tenantId: ${collection}`) || text.includes("tenantId")) {
      continue;
    }
    failures.push(`${file}: Firestore collection "${collection}" lacks tenantId evidence`);
  }
}

if (failures.length) {
  console.error("Tenancy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Tenancy check passed (${files.length} files checked).`);
