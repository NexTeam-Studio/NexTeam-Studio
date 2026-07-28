import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(path.join(root, "worktree-lanes.json"), "utf8"));

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function normalize(filePath) {
  return filePath.replaceAll("\\", "/");
}

function matches(filePath, pattern) {
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) return filePath.startsWith(pattern.slice(0, -3));
  return filePath === pattern;
}

const branch = git(["branch", "--show-current"]);
const lane = registry.lanes.find((candidate) => candidate.branch === branch);

if (!lane) {
  console.error(`Worktree scope check failed: branch ${branch || "(detached)"} is not registered in worktree-lanes.json.`);
  process.exit(1);
}

if (lane.ownedPaths.includes("**")) {
  console.log(`Worktree scope check passed: ${lane.slug} is the integration lane.`);
  process.exit(0);
}

const mergeBase = git(["merge-base", "HEAD", registry.baselineBranch]);
const committed = git(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
const status = git(["status", "--porcelain"]);
const changed = new Set(committed ? committed.split(/\r?\n/) : []);

for (const line of status ? status.split(/\r?\n/) : []) {
  const statusPath = line.slice(3).trim();
  const renamedPath = statusPath.includes(" -> ") ? statusPath.split(" -> ").at(-1) : statusPath;
  if (renamedPath) changed.add(renamedPath.replace(/^"|"$/g, ""));
}

const alwaysAllowed = [
  `docs/worktrees/lanes/${lane.slug}.md`,
  `receipts/worktrees/${lane.slug}/**`
];
const allowed = [...lane.ownedPaths, ...alwaysAllowed];
const violations = [...changed]
  .map(normalize)
  .filter((filePath) => !allowed.some((pattern) => matches(filePath, pattern)));

if (violations.length > 0) {
  console.error(`Worktree scope check failed for ${lane.slug}. Files outside this lane:`);
  for (const filePath of violations) console.error(`- ${filePath}`);
  console.error("Move cross-lane work to the integration lane or coordinate an explicit contract change.");
  process.exit(1);
}

console.log(`Worktree scope check passed for ${lane.slug}: ${changed.size} changed file(s), all within its assigned paths.`);
