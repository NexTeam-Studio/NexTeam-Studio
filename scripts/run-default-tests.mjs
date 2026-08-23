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

const testFiles = testRoots.flatMap(collectTests).sort();
const requestedCount = process.env.NEXTEAM_TEST_FILE_SLICE_COUNT;
const testSliceCount = requestedCount === undefined ? undefined : Number.parseInt(requestedCount, 10);
const testTimeoutMs = Number.parseInt(process.env.NEXTEAM_DEFAULT_TEST_TIMEOUT_MS ?? "", 10);

if (requestedCount !== undefined && (!Number.isInteger(testSliceCount) || testSliceCount < 1 || testSliceCount > testFiles.length)) {
  console.error(`NEXTEAM_TEST_FILE_SLICE_COUNT must be an integer from 1 to ${testFiles.length}; received: ${requestedCount}.`);
  process.exit(1);
}

const selectedTestFiles = testSliceCount === undefined ? testFiles : testFiles.slice(0, testSliceCount);

if (testFiles.length === 0) {
  console.error("No default test files found.");
  process.exit(1);
}

const testArgs = [
    "--import",
    "./tests/setup.mjs",
    "--import",
    "tsx",
    "--test-reporter",
    "dot",
    "--test",
    ...selectedTestFiles,
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
