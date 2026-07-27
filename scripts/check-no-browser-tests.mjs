import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const defaultTestRoots = ["apps", "packages"];
const browserMarkers = [
  /from\s+["'](?:@playwright\/test|playwright|puppeteer|selenium-webdriver)["']/,
  /require\(\s*["'](?:@playwright\/test|playwright|puppeteer|selenium-webdriver)["']\s*\)/,
  /\b(?:chromium|firefox|webkit|browserType)\.launch\s*\(/
];

function collectDefaultTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectDefaultTests(path));
    if (entry.isFile() && entry.name.endsWith(".test.mjs")) files.push(path);
  }
  return files;
}

const defaultTests = defaultTestRoots.flatMap(collectDefaultTests);
const violations = defaultTests.filter((file) => {
  const source = readFileSync(file, "utf8");
  return browserMarkers.some((marker) => marker.test(source));
});

if (violations.length > 0) {
  console.error("Default test suite contains browser-launching code:");
  for (const file of violations) console.error(`- ${relative(process.cwd(), file)}`);
  console.error("Move browser tests to a *.playwright.mjs file and run them only through npm run test:browser.");
  process.exit(1);
}

console.log(`No-browser test guard passed (${defaultTests.length} default test files checked).`);
