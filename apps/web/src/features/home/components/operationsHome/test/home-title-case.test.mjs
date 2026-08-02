import test from "node:test";
import assert from "node:assert/strict";

import { titleCaseInterfaceName } from "../interfaceTitleCase.ts";

test("Home labels use title capitalization while keeping small joining words lowercase", () => {
  assert.equal(titleCaseInterfaceName("Job value this week"), "Job Value This Week");
  assert.equal(titleCaseInterfaceName("Handle the next few hours"), "Handle the Next Few Hours");
  assert.equal(titleCaseInterfaceName("Approved quotes not yet converted"), "Approved Quotes Not Yet Converted");
  assert.equal(titleCaseInterfaceName("Action required jobs"), "Action Required Jobs");
});

test("Home labels preserve acronyms and title-case the final joining word", () => {
  assert.equal(titleCaseInterfaceName("Open API for"), "Open API For");
});
