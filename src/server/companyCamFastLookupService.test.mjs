import test from "node:test";
import assert from "node:assert/strict";
import { companyCamFastLookupServiceInternals } from "./companyCamFastLookupService.js";

test("buildCandidateQueries keeps an address-only variant for conversational lookups", () => {
  const candidates = companyCamFastLookupServiceInternals.buildCandidateQueries(
    "Who's the customer at 237 Camp Mikell Court in Toccoa Georgia?"
  );

  assert.ok(candidates.includes("237 Camp Mikell Court"));
  assert.ok(candidates[0].includes("237 Camp Mikell Court"));
});

test("buildCandidateQueries strips conversational filler from client-at lookups", () => {
  const candidates = companyCamFastLookupServiceInternals.buildCandidateQueries(
    "Can you tell me who the client is at 237 Camp Mikell Court in Toccoa, Georgia?"
  );

  assert.ok(candidates.includes("237 Camp Mikell Court"));
  assert.ok(candidates.some((entry) => entry.includes("237 Camp Mikell Court in Toccoa")));
  assert.equal(candidates[0], "237 Camp Mikell Court in Toccoa, Georgia");
});

test("buildCandidateQueries filters out low-signal conversational filler fragments", () => {
  const candidates = companyCamFastLookupServiceInternals.buildCandidateQueries(
    "Can you tell me who the client is at 237 Camp Mikell Court in Toccoa, Georgia?"
  );

  assert.equal(candidates.includes("can you me who"), false);
  assert.equal(candidates.includes("can you"), false);
  assert.equal(candidates.includes("the client is at 237 Camp Mikell Court in Toccoa, Georgia"), false);
});
