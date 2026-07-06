import test from "node:test";
import assert from "node:assert/strict";
import { CompanyCamAdapter } from "../dist/companycam/CompanyCamAdapter.js";

test("CompanyCam health uses the configured lightweight project query", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const adapter = CompanyCamAdapter.fromEnv({
      COMPANYCAM_API_TOKEN: "test-token",
      COMPANYCAM_HEALTH_QUERY: "Known Active Project",
      TENANT_ID: "tenant_test"
    });
    const health = await adapter.health();

    assert.equal(health.ok, true);
    assert.equal(requestedUrls.length, 1);
    const requestUrl = new URL(requestedUrls[0]);
    assert.equal(requestUrl.searchParams.get("query"), "Known Active Project");
    assert.equal(requestUrl.searchParams.get("per_page"), "10");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
