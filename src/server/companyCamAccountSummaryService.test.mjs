import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanyCamAccountSummaryQuestion } from "./companyCamAccountSummaryService.js";

test("companycam account summary counts paginated current projects", async () => {
  const seenPages = [];
  const companyCamRail = {
    async searchProjects({ page, perPage }) {
      seenPages.push({ page, perPage });
      if (page === 1) {
        return Array.from({ length: 100 }, (_, index) => ({ id: `p-${index + 1}` }));
      }
      if (page === 2) {
        return Array.from({ length: 35 }, (_, index) => ({ id: `p-${index + 101}` }));
      }
      return [];
    },
  };

  const result = await resolveCompanyCamAccountSummaryQuestion({
    companyCamRail,
    forceRefresh: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.currentProjects, 135);
  assert.match(result.answerText, /135/);
  assert.deepEqual(
    seenPages.map((entry) => entry.page),
    [1, 2]
  );
});
