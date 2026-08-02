import assert from "node:assert/strict";
import test from "node:test";

import { applyPortalSecurityHeaders } from "./securityHeaders.ts";

test("portal responses prohibit caching, framing, and referrer leakage", () => {
  const headers = new Map();
  applyPortalSecurityHeaders({
    setHeader(name, value) {
      headers.set(name, value);
    }
  });

  assert.equal(headers.get("cache-control"), "no-store, private");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
});
