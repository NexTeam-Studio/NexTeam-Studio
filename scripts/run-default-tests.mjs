import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testRoots = ["apps", "packages"];

function collectTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTests(path));
    if (entry.isFile() && entry.name.endsWith(".test.mjs")) files.push(path);
  }
  return files;
}

const allTestFiles = testRoots.flatMap(collectTests).sort();
const testSlice = process.env.NEXTEAM_TEST_FILE_SLICE ?? "all";
const midpoint = Math.ceil(allTestFiles.length / 2);
const firstQuarterEnd = Math.ceil(midpoint / 2);
const testFiles = testSlice === "first"
  ? allTestFiles.slice(0, midpoint)
  : testSlice === "second"
    ? allTestFiles.slice(midpoint)
    : testSlice === "first-quarter"
      ? allTestFiles.slice(0, firstQuarterEnd)
      : testSlice === "second-quarter"
        ? allTestFiles.slice(firstQuarterEnd, midpoint)
    : testSlice === "all"
      ? allTestFiles
      : [];
const testTimeoutMs = Number.parseInt(process.env.NEXTEAM_DEFAULT_TEST_TIMEOUT_MS ?? "", 10);

if (testFiles.length === 0) {
  console.error(`No default test files found for slice: ${testSlice}.`);
  process.exit(1);
}

console.log(`NEXTEAM_TEST_FILE_SLICE=${testSlice} (${testFiles.length}/${allTestFiles.length} files)`);

const testArgs = [
    "--import",
    "./tests/setup.mjs",
    "--import",
    "tsx",
    "--test-reporter",
    "dot",
    "--test",
    ...testFiles,
];

if (Number.isFinite(testTimeoutMs) && testTimeoutMs > 0) {
  testArgs.splice(testArgs.indexOf("--test"), 0, `--test-timeout=${testTimeoutMs}`);
}

const result = spawnSync(
  process.execPath,
  testArgs,
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
