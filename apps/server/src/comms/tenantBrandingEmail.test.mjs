import assert from "node:assert/strict";
import test from "node:test";
import { PlatformSecurityEmailSendAdapter, TenantBrandingEmailSendAdapter, renderTenantBrandedEmail } from "./tenantBrandingEmail.ts";
import { COMMUNICATION_TEMPLATE_CATEGORIES } from "../modules/nexops/areas/settings/components/tenantConfig/server/communicationTemplates.ts";

const branding = {
  tenantId: "aquatrace",
  displayName: "Aquatrace",
  logo: { url: "https://cdn.example.test/aquatrace.png", alt: "Aquatrace mark" },
  colors: { primary: "#08776f", accent: "#98ff00", background: "#f4f7f5", surface: "#ffffff", text: "#14232d" },
  source: "manual",
  updatedBy: "owner",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

test("tenant branded email renders logo, colors, and contact block", () => {
  const html = renderTenantBrandedEmail({
    bodyText: "Hello customer",
    branding,
    contact: { email: "service@aquatrace.example", phone: "864-555-1212", website: "https://aquatrace.example" }
  });
  assert.match(html, /aquatrace\.png/);
  assert.match(html, /#08776f/);
  assert.match(html, /service@aquatrace\.example/);
  assert.match(html, /Hello customer/);
});

test("tenant operational adapter renders all 23 communication template emails without allowing a tenant setting to change the verified sender", async () => {
  const sent = [];
  const adapter = new TenantBrandingEmailSendAdapter({
    mailbox: "TRANSACTIONAL",
    async sendEmail(message) { sent.push(message); return { provider: "test", id: `sent_${sent.length}`, acceptedAt: "2026-09-02T00:00:00.000Z" }; }
  }, async () => ({ branding, contact: { email: "service@aquatrace.example" }, senderEmail: "office@aquatrace.example" }), "transactions@example.test");
  for (const category of COMMUNICATION_TEMPLATE_CATEGORIES) {
    await adapter.sendEmail({ tenantId: "aquatrace", mailbox: "TRANSACTIONAL", to: ["client@example.test"], subject: category, bodyText: `Body for ${category}` });
  }
  assert.equal(sent[0].from, "Aquatrace <transactions@example.test>");
  assert.equal(sent.length, 23);
  for (const message of sent) {
    assert.match(message.bodyHtml, /aquatrace\.png/);
    assert.match(message.bodyHtml, /#08776f/);
    assert.match(message.bodyHtml, /service@aquatrace\.example/);
  }
  await adapter.sendEmail({ tenantId: "aquatrace", mailbox: "TRANSACTIONAL", to: ["client@example.test"], subject: "sender", bodyText: "Body", from: "Aquatrace via NexOps <transactions@example.test>" });
  assert.equal(sent.at(-1).from, "Aquatrace <transactions@example.test>");
  await adapter.sendEmail({ tenantId: "aquatrace", mailbox: "TRANSACTIONAL", to: ["client@example.test"], subject: "existing", bodyText: "Body", bodyHtml: "<html><body><img src=\"https://cdn.example.test/aquatrace.png\" /></body></html>" });
  assert.match(sent.at(-1).bodyHtml, /data-nexteam-tenant-contact/);
  assert.match(sent.at(-1).bodyHtml, /service@aquatrace\.example/);
});

test("platform security adapter always uses NexTeam identity and ignores tenant sender and branding", async () => {
  const sent = [];
  const adapter = new PlatformSecurityEmailSendAdapter({
    mailbox: "TRANSACTIONAL",
    async sendEmail(message) { sent.push(message); return { provider: "test", id: "platform_security", acceptedAt: "2026-09-03T00:00:00.000Z" }; }
  }, "transactions@example.test");
  await adapter.sendEmail({
    tenantId: "aquatrace",
    mailbox: "TRANSACTIONAL",
    to: ["owner@example.test"],
    subject: "Set up your account",
    bodyText: "Use this secure link.",
    bodyHtml: "<p>Use this secure link.</p>",
    from: "Aquatrace <office@aquatrace.example>"
  });
  assert.equal(sent[0].from, "NexTeam <transactions@example.test>");
  assert.equal(sent[0].bodyHtml, "<p>Use this secure link.</p>");
  assert.doesNotMatch(sent[0].from, /aquatrace\.example/);
  assert.doesNotMatch(sent[0].bodyHtml, /aquatrace\.png/);
});

test("neither adapter forwards a workflow supplied From address when no verified sender is configured", async () => {
  const sent = [];
  const delegate = {
    mailbox: "TRANSACTIONAL",
    async sendEmail(message) { sent.push(message); return { provider: "test", id: String(sent.length), acceptedAt: "2026-09-03T00:00:00.000Z" }; }
  };
  const operational = new TenantBrandingEmailSendAdapter(delegate, async () => branding);
  const platform = new PlatformSecurityEmailSendAdapter(delegate);
  const message = { tenantId: "aquatrace", mailbox: "TRANSACTIONAL", to: ["client@example.test"], subject: "test", bodyText: "Test", from: "Aquatrace <office@aquatrace.example>" };
  await operational.sendEmail(message);
  await platform.sendEmail(message);
  assert.equal(sent[0].from, undefined);
  assert.equal(sent[1].from, undefined);
});
