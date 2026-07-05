import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx)$/.test(file));

const firestoreWritePattern = /\.collection\(["']([^"']+)["']\)\.(?:add|doc|where|get|set|update)/;
const allowedCollections = new Set(["events", "usageLog"]);
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const match = text.match(firestoreWritePattern);
  if (!match) {
    continue;
  }
  const collection = match[1];
  if (!collection || allowedCollections.has(collection)) {
    continue;
  }
  if (!text.includes("tenantId")) {
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
