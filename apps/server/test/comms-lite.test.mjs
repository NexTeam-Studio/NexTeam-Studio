import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { z } from "zod";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { GmailReadOnlyAdapter, GmailSendAdapter } from "@nexteam/providers";
import { createCommsNexiTools } from "../dist/comms/nexiTools.js";
import { CommsApprovalExecutor } from "../dist/comms/approvalExecutor.js";
import { createCommsRailFromEnv } from "../dist/comms/gmailRegistry.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "jobber", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function gmailConfig(mailbox) {
  return {
    mailbox,
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    tenantId: "aquatrace"
  };
}

test("Gmail read-only adapter is structurally send-incapable", () => {
  const adapter = new GmailReadOnlyAdapter(gmailConfig("ops"));
  assert.equal(typeof adapter.searchEmail, "function");
  assert.equal(typeof adapter.getEmailThread, "function");
  assert.equal(typeof adapter.getEmailMessage, "function");
  assert.equal(typeof adapter.getEmailAttachment, "function");
  assert.equal("sendEmail" in adapter, false);
  assert.equal(typeof adapter.sendEmail, "undefined");
});

test("Gmail send adapter is isolated to the dedicated sender class", () => {
  const adapter = new GmailSendAdapter(gmailConfig("nexi-send"));
  assert.equal(typeof adapter.sendEmail, "function");
  assert.equal("searchEmail" in adapter, false);
});

test("dedicated Nexi send mailbox can opt into read tools without making legacy mailboxes send-capable", () => {
  const rail = createCommsRailFromEnv({
    TENANT_ID: "aquatrace",
    GMAIL_OAUTH_CLIENT_ID: "client-id",
    GMAIL_OAUTH_CLIENT_SECRET: "client-secret",
    GMAIL_READONLY_MAILBOX_1_EMAIL: "ops@example.test",
    GMAIL_READONLY_MAILBOX_1_ALIAS: "ops",
    GMAIL_READONLY_MAILBOX_1_REFRESH_TOKEN: "ops-refresh",
    GMAIL_SEND_MAILBOX_EMAIL: "nexi@example.test",
    GMAIL_SEND_MAILBOX_ALIAS: "nexi",
    GMAIL_SEND_MAILBOX_REFRESH_TOKEN: "nexi-refresh",
    GMAIL_SEND_MAILBOX_READ_ENABLED: "true"
  });
  assert.equal(rail.tenantId, "aquatrace");
  assert.equal(rail.readAdapters.has("ops"), true);
  assert.equal(rail.readAdapters.has("nexi"), true);
  assert.equal(typeof rail.readAdapters.get("nexi")?.searchEmail, "function");
  assert.equal("sendEmail" in rail.readAdapters.get("ops"), false);
  assert.equal(rail.sendAdapter?.mailbox, "nexi");
});

test("Comms Nexi searchEmail returns email source refs", async () => {
  const readAdapter = {
    mailbox: "ops",
    async searchEmail() {
      return [{
        id: "msg_1",
        tenantId: "aquatrace",
        mailbox: "ops",
        threadId: "thr_1",
        from: "client@example.test",
        subject: "Bryson City reply",
        receivedAt: "2026-07-05T10:00:00.000Z",
        snippet: "I replied.",
        labels: ["INBOX"]
      }];
    },
    async getEmailThread() {
      throw new Error("not used");
    },
    async getEmailMessage() {
      throw new Error("not used");
    },
    async getEmailAttachment() {
      throw new Error("not used");
    }
  };
  const rail = { tenantId: "aquatrace", readAdapters: new Map([["ops", readAdapter]]), sendAdapter: null };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tool = createCommsNexiTools(rail, approvalQueue).find((candidate) => candidate.name === "searchEmail");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { mailbox: "ops", keywords: "Bryson City" });
  assert.equal(result.result.count, 1);
  assert.equal(result.sources[0].rail, "email");
  assert.equal(result.sources[0].ref, "email:ops:msg_1");
});

test("Comms Nexi tools reject tenant contexts outside the bound email rail", async () => {
  let searched = false;
  const readAdapter = {
    mailbox: "ops",
    async searchEmail() {
      searched = true;
      return [];
    },
    async getEmailThread() {
      throw new Error("not used");
    },
    async getEmailMessage() {
      throw new Error("not used");
    },
    async getEmailAttachment() {
      throw new Error("not used");
    }
  };
  const rail = { tenantId: "aquatrace", readAdapters: new Map([["ops", readAdapter]]), sendAdapter: null };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tool = createCommsNexiTools(rail, approvalQueue).find((candidate) => candidate.name === "searchEmail");
  assert.ok(tool);
  await assert.rejects(() => tool.handler({ ...tenant(), id: "other-tenant" }, { mailbox: "ops" }), /not configured for tenant other-tenant/);
  assert.equal(searched, false);
});

test("Gmail read adapter parses full message bodies and attachment metadata", async () => {
  const adapter = new GmailReadOnlyAdapter(gmailConfig("ops"));
  adapter.gmailGet = async (_path, _op, parse) => parse({
    id: "msg_1",
    threadId: "thr_1",
    labelIds: ["INBOX"],
    snippet: "Snippet",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "client@example.test" },
        { name: "To", value: "ops@example.test" },
        { name: "Subject", value: "Leak report" },
        { name: "Date", value: "Sun, 05 Jul 2026 09:00:00 -0400" }
      ],
      parts: [{
        mimeType: "text/plain",
        body: { data: Buffer.from("Plain body", "utf8").toString("base64url"), size: 10 }
      }, {
        mimeType: "text/html",
        body: { data: Buffer.from("<p>HTML body</p>", "utf8").toString("base64url"), size: 16 }
      }, {
        mimeType: "application/pdf",
        filename: "report.pdf",
        headers: [{ name: "Content-Disposition", value: "attachment; filename=report.pdf" }],
        body: { attachmentId: "att_1", size: 1234 }
      }]
    }
  });
  const message = await adapter.getEmailMessage("msg_1");
  assert.equal(message.bodyText, "Plain body");
  assert.equal(message.bodyHtml, "<p>HTML body</p>");
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0].id, "att_1");
  assert.equal(message.attachments[0].filename, "report.pdf");
  assert.equal(message.attachments[0].inline, false);
});

test("Gmail read adapter retrieves attachment binaries without adding send capability", async () => {
  const adapter = new GmailReadOnlyAdapter(gmailConfig("ops"));
  adapter.gmailGet = async (path, _op, parse) => {
    if (path.includes("/attachments/")) {
      return parse({ data: Buffer.from("PDF", "utf8").toString("base64url"), size: 3 });
    }
    return parse({
      id: "msg_1",
      threadId: "thr_1",
      labelIds: ["INBOX"],
      snippet: "",
      payload: {
        headers: [],
        parts: [{
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: "att_1", size: 3 }
        }]
      }
    });
  };
  const binary = await adapter.getEmailAttachment("msg_1", "att_1");
  const chunks = [];
  for await (const chunk of binary.stream) {
    chunks.push(Buffer.from(chunk));
  }
  assert.equal(Buffer.concat(chunks).toString("utf8"), "PDF");
  assert.equal(binary.filename, "report.pdf");
  assert.equal(binary.mime, "application/pdf");
  assert.equal("sendEmail" in adapter, false);
});

test("Comms Nexi getEmailMessage returns body and attachment listing with email source", async () => {
  const readAdapter = {
    mailbox: "ops",
    async searchEmail() {
      throw new Error("not used");
    },
    async getEmailThread() {
      throw new Error("not used");
    },
    async getEmailMessage() {
      return {
        id: "msg_1",
        tenantId: "aquatrace",
        mailbox: "ops",
        threadId: "thr_1",
        subject: "Leak report",
        bodyText: "Client says the pool is leaking.",
        labels: ["INBOX"],
        attachments: [{ id: "att_1", tenantId: "aquatrace", mailbox: "ops", messageId: "msg_1", filename: "report.pdf", mime: "application/pdf", byteSize: 42, inline: false }]
      };
    },
    async getEmailAttachment() {
      throw new Error("not used");
    }
  };
  const rail = { tenantId: "aquatrace", readAdapters: new Map([["ops", readAdapter]]), sendAdapter: null };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tool = createCommsNexiTools(rail, approvalQueue).find((candidate) => candidate.name === "getEmailMessage");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { mailbox: "ops", messageId: "msg_1" });
  assert.equal(result.result.message.bodyText, "Client says the pool is leaking.");
  assert.equal(result.result.message.attachments[0].filename, "report.pdf");
  assert.equal(result.sources[0].ref, "email:ops:msg_1");
});

test("Comms Nexi getEmailAttachment retrieves bytes but returns metadata only", async () => {
  const readAdapter = {
    mailbox: "ops",
    async searchEmail() {
      throw new Error("not used");
    },
    async getEmailThread() {
      throw new Error("not used");
    },
    async getEmailMessage() {
      throw new Error("not used");
    },
    async getEmailAttachment() {
      return { stream: Readable.from([Buffer.from("secret-pdf")]), mime: "application/pdf", filename: "report.pdf" };
    }
  };
  const rail = { tenantId: "aquatrace", readAdapters: new Map([["ops", readAdapter]]), sendAdapter: null };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tool = createCommsNexiTools(rail, approvalQueue).find((candidate) => candidate.name === "getEmailAttachment");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { mailbox: "ops", messageId: "msg_1", attachmentId: "att_1" });
  assert.equal(result.result.attachment.filename, "report.pdf");
  assert.equal(result.result.attachment.byteSize, 10);
  assert.equal(result.result.attachment.content, "[binary-not-returned]");
  assert.equal(result.sources[0].ref, "email:ops:msg_1:att_1");
});

test("draftEmail parks email in ApprovalQueue without sending", async () => {
  let sent = false;
  const rail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi-send",
      async sendEmail() {
        sent = true;
        return { provider: "gmail", id: "sent_1", acceptedAt: new Date().toISOString(), mailbox: "nexi-send" };
      }
    }
  };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CommsApprovalExecutor(rail));
  const tool = createCommsNexiTools(rail, approvalQueue).find((candidate) => candidate.name === "draftEmail");
  assert.ok(tool);
  const result = await tool.handler(tenant(), {
    to: ["owner@example.test"],
    subject: "Draft only",
    bodyText: "Queued for approval."
  });
  assert.equal(sent, false);
  assert.equal(result.result.approval.status, "pending");
  assert.equal(result.result.approval.execute.service, "comms");
  assert.equal(result.result.approval.execute.op, "sendEmail");
  assert.equal((await approvalQueue.listPending("aquatrace")).length, 1);
});

test("CommsApprovalExecutor sends only approved dedicated-mailbox artifacts", async () => {
  const sentMessages = [];
  const rail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi-send",
      async sendEmail(message) {
        sentMessages.push(message);
        return { provider: "gmail", id: "sent_1", acceptedAt: "2026-07-05T12:00:00.000Z", mailbox: "nexi-send" };
      }
    }
  };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CommsApprovalExecutor(rail));
  const item = await approvalQueue.create({
    tenantId: "aquatrace",
    kind: "email",
    preview: { title: "Approved send", body: "Send after approval." },
    execute: {
      service: "comms",
      op: "sendEmail",
      args: {
        mailbox: "nexi-send",
        outbound: {
          tenantId: "aquatrace",
          mailbox: "nexi-send",
          to: ["owner@example.test"],
          subject: "Approved send",
          bodyText: "Send after approval."
        }
      }
    },
    createdBy: "nexi"
  });
  await approvalQueue.approve(item.id);
  const executed = await approvalQueue.executeApproved(item.id);
  assert.equal(executed.item.status, "executed");
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].mailbox, "nexi-send");
});

test("CommsApprovalExecutor rejects artifacts targeting read-only mailbox aliases", async () => {
  const rail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi-send",
      async sendEmail() {
        throw new Error("should not send");
      }
    }
  };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CommsApprovalExecutor(rail));
  const item = await approvalQueue.create({
    tenantId: "aquatrace",
    kind: "email",
    preview: { title: "Wrong mailbox", body: "Blocked." },
    execute: {
      service: "comms",
      op: "sendEmail",
      args: {
        mailbox: "ops",
        outbound: {
          tenantId: "aquatrace",
          mailbox: "ops",
          to: ["owner@example.test"],
          subject: "Wrong mailbox",
          bodyText: "Blocked."
        }
      }
    },
    createdBy: "nexi"
  });
  await approvalQueue.approve(item.id);
  await assert.rejects(() => approvalQueue.executeApproved(item.id), /not the dedicated send mailbox/);
});

test("CommsApprovalExecutor rejects approved email artifacts from unbound tenants", async () => {
  let sent = false;
  const rail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi-send",
      async sendEmail() {
        sent = true;
        return { provider: "gmail", id: "sent_1", acceptedAt: "2026-07-05T12:00:00.000Z", mailbox: "nexi-send" };
      }
    }
  };
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CommsApprovalExecutor(rail));
  const item = await approvalQueue.create({
    tenantId: "other-tenant",
    kind: "email",
    preview: { title: "Wrong tenant", body: "Blocked." },
    execute: {
      service: "comms",
      op: "sendEmail",
      args: {
        mailbox: "nexi-send",
        outbound: {
          tenantId: "other-tenant",
          mailbox: "nexi-send",
          to: ["owner@example.test"],
          subject: "Wrong tenant",
          bodyText: "Blocked."
        }
      }
    },
    createdBy: "nexi"
  });
  await approvalQueue.approve(item.id);
  await assert.rejects(() => approvalQueue.executeApproved(item.id), /tenant that is not bound/);
  assert.equal(sent, false);
});

test("Comms tools expose zod schemas for Nexi registry", () => {
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tools = createCommsNexiTools({ tenantId: "aquatrace", readAdapters: new Map(), sendAdapter: null }, approvalQueue);
  assert.equal(tools.every((tool) => tool.inputSchema instanceof z.ZodType), true);
});
