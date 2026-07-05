import test from "node:test";
import assert from "node:assert/strict";
import {
  createJobberService,
  hasUsableJobberConfig,
  jobberServiceInternals,
} from "./jobberService.js";

test("hasUsableJobberConfig requires a usable access token or refresh-token bundle", () => {
  assert.equal(hasUsableJobberConfig({}), false);
  assert.equal(
    hasUsableJobberConfig({
      JOBBER_CLIENT_ID: "client-id",
      JOBBER_CLIENT_SECRET: "client-secret",
    }),
    false
  );
  assert.equal(
    hasUsableJobberConfig({
      JOBBER_CLIENT_ID: "client-id",
      JOBBER_CLIENT_SECRET: "client-secret",
      JOBBER_REFRESH_TOKEN: "refresh-token",
    }),
    true
  );
  assert.equal(
    hasUsableJobberConfig({
      JOBBER_ACCESS_TOKEN: "access-token",
    }),
    true
  );
});

test("jobber service answers a schedule question through the refresh-token lane", async () => {
  const now = new Date("2026-07-02T12:00:00Z");
  const fetchCalls = [];
  const fetchImpl = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (url.includes("/oauth/token")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            access_token: "fresh-access-token",
            refresh_token: "rotated-refresh-token",
            expires_in: 3600,
          };
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            jobs: {
              nodes: [
                {
                  id: "job-1",
                  jobNumber: 2022626,
                  title: "Swimming Pool Leak Detection Service",
                  jobStatus: "archived",
                  startAt: "2026-07-02T04:00:00Z",
                  client: { name: "Deborah Justice" },
                  property: { city: "Fair Play", province: "South Carolina" },
                },
                {
                  id: "job-2",
                  jobNumber: 2022625,
                  title: "Swimming Pool Leak Detection",
                  jobStatus: "upcoming",
                  startAt: "2026-07-06T04:00:00Z",
                  client: { name: "Rachel Payne" },
                  property: { city: "Bryson City", province: "North Carolina" },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        };
      },
    };
  };

  const service = createJobberService({
    env: {
      JOBBER_CLIENT_ID: "client-id",
      JOBBER_CLIENT_SECRET: "client-secret",
      JOBBER_REFRESH_TOKEN: "refresh-token",
    },
    fetchImpl,
  });

  const originalDateNow = Date.now;
  Date.now = () => now.getTime();
  try {
    const result = await service.answerScheduleQuestion({
      tenantId: "aquatrace",
      question: "What jobs do I have today?",
    });

    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.match(result.answerText, /Deborah Justice/);
    assert.match(result.answerText, /source: Jobber GraphQL jobs query/);
    assert.equal(fetchCalls.length, 2);
  } finally {
    Date.now = originalDateNow;
  }
});

test("jobber service answers a named job-detail question and reports quote visibility honestly", async () => {
  const service = createJobberService({
    env: {
      JOBBER_ACCESS_TOKEN: "access-token",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            jobs: {
              nodes: [
                {
                  id: "job-1",
                  jobNumber: 2022626,
                  title: "Swimming Pool Leak Detection Service",
                  jobStatus: "archived",
                  startAt: "2026-07-02T04:00:00Z",
                  instructions: "Check suspected liner leak and confirm fittings.",
                  jobberWebUri: "https://example.getjobber.com/jobs/2022626",
                  client: { name: "Deborah Justice" },
                  property: {
                    street1: "123 Test Lane",
                    city: "Fair Play",
                    province: "South Carolina",
                    postalCode: "29643",
                    country: "USA",
                  },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        };
      },
    }),
  });

  const result = await service.answerJobDetailQuestion({
    tenantId: "aquatrace",
    question: "Show me the Deborah Justice job and its address.",
  });

  assert.equal(result.ok, true);
  assert.match(result.answerText, /Deborah Justice/);
  assert.match(result.answerText, /123 Test Lane/);
  assert.match(result.answerText, /not exposed by the current Jobber read-only permissions/i);
});

test("resolveScheduleWindow returns the current Monday-Sunday week", () => {
  const window = jobberServiceInternals.resolveScheduleWindow("What jobs do I have this week?", new Date("2026-07-02T12:00:00Z"));
  assert.equal(window.kind, "this_week");
  assert.equal(window.start.toISOString(), "2026-06-29T04:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-07-06T03:59:59.999Z");
});
