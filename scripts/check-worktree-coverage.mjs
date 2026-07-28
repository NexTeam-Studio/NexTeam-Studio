import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(path.join(root, "worktree-lanes.json"), "utf8"));
const lanes = registry.lanes.filter((lane) => !lane.ownedPaths.includes("**"));
const temporaryMigrationRoots = ["apps/server/src/crm/"];

function matches(filePath, pattern) {
  if (pattern.endsWith("/**")) return filePath.startsWith(pattern.slice(0, -3));
  return filePath === pattern;
}

const files = execFileSync("git", ["ls-files", "apps", "packages"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .map((file) => file.trim().replaceAll("\\", "/"))
  .filter(Boolean)
  .filter((file) => /\.(css|js|jsx|ts|tsx)$/.test(file))
  .filter((file) => !/(^|\/)(browser-tests|test|tests)\//.test(file))
  .filter((file) => !/\.test\.[^.]+$/.test(file));

const unowned = [];
const multiplyOwned = [];
for (const file of files) {
  const owners = lanes.filter((lane) => lane.ownedPaths.some((pattern) => matches(file, pattern)));
  if (owners.length === 0) unowned.push(file);
  if (owners.length > 1) multiplyOwned.push([file, owners.map((owner) => owner.slug)]);
}

const unexpectedUnowned = unowned.filter((file) => !temporaryMigrationRoots.some((rootPath) => file.startsWith(rootPath)));
const knownMigrationDebt = unowned.filter((file) => temporaryMigrationRoots.some((rootPath) => file.startsWith(rootPath)));

if (unexpectedUnowned.length || multiplyOwned.length) {
  console.error("Worktree coverage check failed.");
  for (const file of unexpectedUnowned) console.error(`- unowned: ${file}`);
  for (const [file, owners] of multiplyOwned) console.error(`- multiple owners (${owners.join(", ")}): ${file}`);
  process.exit(1);
}

console.log(`Worktree coverage check passed: ${files.length - knownMigrationDebt.length}/${files.length} implementation files have exactly one owner.`);
console.log(`Known migration debt: ${knownMigrationDebt.length} legacy CRM file(s) under ${temporaryMigrationRoots.join(", ")}.`);
