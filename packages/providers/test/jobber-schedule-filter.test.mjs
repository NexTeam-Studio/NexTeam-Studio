import test from "node:test";
import assert from "node:assert/strict";
import { JobberAdapter, filterJobsByScheduleRange } from "../dist/jobber/JobberAdapter.js";

const jobs = [
  {
    id: "job_monday",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "scheduled",
    title: "Rachel Payne leak detection",
    startAt: "2026-07-06T04:00:00.000Z",
    endAt: "2026-07-07T03:59:59.000Z",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  },
  {
    id: "job_tuesday",
    tenantId: "aquatrace",
    clientId: "client_2",
    status: "scheduled",
    title: "Tuesday leak detection",
    startAt: "2026-07-07T04:00:00.000Z",
    endAt: "2026-07-08T03:59:59.000Z",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  },
  {
    id: "job_undated",
    tenantId: "aquatrace",
    clientId: "client_3",
    status: "lead",
    title: "Undated lead",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  }
];

test("Jobber schedule filter returns only jobs overlapping the requested day", () => {
  const filtered = filterJobsByScheduleRange(jobs, {
    from: "2026-07-06T04:00:00.000Z",
    to: "2026-07-07T04:00:00.000Z"
  });
  assert.deepEqual(filtered.map((job) => job.id), ["job_monday"]);
});

test("Jobber full-archive import ranges preserve undated records", () => {
  const filtered = filterJobsByScheduleRange(jobs, {
    from: "1970-01-01T00:00:00.000Z",
    to: "2100-01-01T00:00:00.000Z"
  });
  assert.deepEqual(filtered.map((job) => job.id), ["job_monday", "job_tuesday", "job_undated"]);
});

test("Jobber client lookup paginates beyond the old 25-page ceiling", async () => {
  const adapter = new JobberAdapter({
    tenantId: "aquatrace",
    accessToken: "test-access-token",
    clientId: undefined,
    clientSecret: undefined,
    refreshToken: undefined,
    accessTokenExpiresAt: Date.now() + 60_000,
    graphqlVersion: undefined,
    maxPages: 30
  });
  adapter.graphql = async (_query, variables) => {
    const page = variables.after ? Number(String(variables.after).replace("page-", "")) + 1 : 1;
    const isTargetPage = page === 26;
    return {
      data: {
        clients: {
          nodes: [{
            id: `client_${page}`,
            name: isTargetPage ? "Kristi King" : `Client ${page}`,
            firstName: isTargetPage ? "Kristi" : "Client",
            lastName: isTargetPage ? "King" : String(page),
            companyName: ""
          }],
          pageInfo: {
            hasNextPage: page < 26,
            endCursor: `page-${page}`
          }
        }
      }
    };
  };

  const matches = await adapter.getClients("Kristi King");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Kristi King");
});
