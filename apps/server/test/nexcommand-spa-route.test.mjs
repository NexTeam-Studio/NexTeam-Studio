import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/composeServerApp.ts", import.meta.url), "utf8");

test("the server sends NexCommand deep links to the web application", () => {
  assert.match(source, /nexcommand/);
  assert.match(source, /(?:nexi\|nexops\|nexcam\|nexreach\|platform\|nexcommand)/);
});
