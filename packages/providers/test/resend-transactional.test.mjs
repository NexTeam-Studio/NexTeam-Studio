import test from "node:test";
import assert from "node:assert/strict";
import { ResendTransactionalAdapter } from "../dist/resend/ResendAdapter.js";
import { RailError } from "@nexteam/core";

function adapter() {
  return new ResendTransactionalAdapter({
    tenantId: "tenant_1",
    apiKey: "test-transactional-key",
    from: "NexTeam Test <staging@example.test>",
    mailbox: "TRANSACTIONAL"
  });
}

test("Resend transactional adapter preserves prepared content, attachment metadata, and retry idempotency", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    if (calls.length === 1) return new Response(JSON.stringify({ message: "temporary upstream issue" }), { status: 503, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "resend_message_1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const receipt = await adapter().sendEmail({
      tenantId: "tenant_1",
      mailbox: "TRANSACTIONAL",
      to: ["safe-recipient@example.test"],
      cc: ["office@example.test"],
      subject: "Prepared subject",
      bodyText: "Prepared text",
      bodyHtml: "<p>Prepared text</p>",
      attachments: [{ filename: "report.pdf", mime: "application/pdf", contentBase64: "cGRm" }]
    });
    assert.equal(receipt.provider, "resend");
    assert.equal(receipt.id, "resend_message_1");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers["idempotency-key"], calls[1].headers["idempotency-key"]);
    const payload = JSON.parse(calls[1].body);
    assert.deepEqual(payload, {
      from: "NexTeam Test <staging@example.test>",
      to: ["safe-recipient@example.test"],
      cc: ["office@example.test"],
      subject: "Prepared subject",
      text: "Prepared text",
      html: "<p>Prepared text</p>",
      attachments: [{ filename: "report.pdf", content: "cGRm" }]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Resend transactional adapter fails without exposing its API key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "sender rejected" }), { status: 422, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(
      () => adapter().sendEmail({ tenantId: "tenant_1", to: ["safe-recipient@example.test"], subject: "Subject", bodyText: "Body" }),
      (error) => {
        assert.ok(error instanceof RailError);
        assert.equal(error.provider, "resend");
        assert.equal(error.status, 422);
        assert.doesNotMatch(JSON.stringify(error), /test-transactional-key/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
