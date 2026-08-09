import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets } from "./src/redaction.ts";

test("redactSecrets removes credential-shaped diagnostic values", () => {
  const result = redactSecrets({
    detail: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN=1//example-value Authorization: Bearer example",
    apiKey: "example",
  });

  assert.equal(result.apiKey, "[REDACTED]");
  assert.match(result.detail, /GMAIL_SEND_MAILBOX_REFRESH_TOKEN=\[REDACTED\]/);
  assert.doesNotMatch(result.detail, /1\/\//);
});
