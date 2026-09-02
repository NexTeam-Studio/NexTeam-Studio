import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const protectedCollections = [
  "events",
  "jobLifecycleEvents",
  "clients",
  "properties",
  "jobs",
  "timePayEvents",
  "serviceAgreementEvents",
  "jobCostFacts",
  "jobCostFactEvents"
];

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

const failures = [];
for (const root of ["apps", "packages"]) {
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, "utf8");
    for (const collection of protectedCollections) {
      const collectionPattern = new RegExp(`collection\\(\\"${collection}\\"\\)\\s*\\.where`, "g");
      for (const match of source.matchAll(collectionPattern)) {
        const query = source.slice(match.index, (match.index ?? 0) + 900);
        const getIndex = query.indexOf(".get()");
        if (getIndex < 0) continue;
        const readExpression = query.slice(0, getIndex);
        if (!readExpression.includes(".limit(")) {
          const line = source.slice(0, match.index).split("\n").length;
          failures.push(`${relative(process.cwd(), path)}:${line} queries protected collection '${collection}' without an explicit limit.`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error("Firestore read-bounds check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Firestore read-bounds check passed (${protectedCollections.length} protected collections).`);
