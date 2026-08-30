import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "apps/server/src", "packages/core/src"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter((file) => file.endsWith(".ts"));

const failures = [];
let transactionalWrites = 0;
let appendOnlyWrites = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const directWrites = [
    ...source.matchAll(/\.collection\([^;]{0,240}?\)\.doc\([^;]{0,240}?\)\.(set|update|delete)\s*\(/g),
    ...source.matchAll(/\bbatch\.(set|update|delete)\s*\(/g),
    ...source.matchAll(/\.ref\.(set|update|delete)\s*\(/g),
    ...source.matchAll(/\b(?:ref|documentRef|docRef)\.(set|update|delete)\s*\(/g)
  ];
  for (const match of directWrites) {
    failures.push(`${file}: direct Admin SDK ${match[1]} bypasses the tenant-owned transaction seam`);
  }

  const adds = [...source.matchAll(/\.collection\([^;]{0,160}?\)\.add\s*\(/g)];
  for (const match of adds) {
    const isGeneratedUsageLog = file === "apps/server/src/usageLog.ts"
      && match[0].includes('collection("usageLog")')
      && source.includes("usageLogRecordSchema.parse(record)");
    if (!isGeneratedUsageLog) {
      failures.push(`${file}: unclassified Admin SDK add bypasses the tenant-owned write audit`);
    } else {
      appendOnlyWrites += 1;
    }
  }

  const transactions = [...source.matchAll(/transaction\.(set|update|delete)\s*\(/g)];
  if (transactions.length === 0) continue;
  transactionalWrites += transactions.length;
  if (source.includes("@platform-global-admin-write")) continue;
  const readsBeforeWrite = source.includes("transaction.get(");
  const checksTenantOwner = /assertTenantDocumentOwner|\.tenantId\s*!==|\.tenantId\s*===/.test(source);
  if (!readsBeforeWrite || !checksTenantOwner) {
    failures.push(`${file}: transactional Admin write lacks a transaction read and tenant-owner assertion`);
  }
}

if (failures.length > 0) {
  console.error("Admin tenant write check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Admin tenant write check passed (${files.length} source files, ${transactionalWrites} transactional writes, ${appendOnlyWrites} append-only generated-ID write).`);
