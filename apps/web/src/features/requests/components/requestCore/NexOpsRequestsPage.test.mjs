import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexOpsRequestsPage.tsx", import.meta.url), "utf8");

test("Requests opens with the shared icon page title", () => {
  assert.match(source, /import \{ NexOpsPageTitle \} from "\.\.\/\.\.\/\.\.\/nexopsShell\/components\/NexOpsPageTitle"/);
  assert.match(source, /<NexOpsPageTitle module="requests">Requests<\/NexOpsPageTitle>/);
  assert.doesNotMatch(source, /<h1>Requests<\/h1>/);
});
