import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalQueueService, InMemoryApprovalQueueRepository, InMemoryEventBus } from "@nexteam/core";
import { MemoryNativeCrmRepository, defaultCrmSettings } from "@nexteam/providers";
import { registerTenantAutomationRuntime } from "../dist/modules/nexops/areas/settings/components/tenantConfig/server/automationRuntime.js";

test("configured tenant automation fires from a real CRM event into the approval rail", async () => {
  const settings = defaultCrmSettings("automation_tenant");
  settings.workspaceSettings.automations = [{
    id: "automation_quote_sent", title: "Quote follow-up", active: true,
    trigger: "quote.sent", delayMinutes: 0, condition: "", action: "prepare_message",
    messageTemplateCategory: "new_quote", stopConditions: []
  }];
  const repository = new MemoryNativeCrmRepository({ crmSettings: [settings] });
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const eventBus = new InMemoryEventBus();
  registerTenantAutomationRuntime({ eventBus, repository, approvalQueue });

  await eventBus.emit({ tenantId: "automation_tenant", type: "quote.sent", payload: { quoteId: "quote_1" } });
  const approvals = await approvalQueue.listByTenant("automation_tenant");
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].status, "pending");
  assert.equal(approvals[0].execute.service, "automation");
  assert.match(approvals[0].preview.body, /new_quote/);
});
