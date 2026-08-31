import type { ApprovalQueueService, BusEvent, EventBus, EventType } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";

/**
 * Executes tenant-configured automations at the event boundary.  Outbound work
 * is deliberately parked in ApprovalQueue: a setting may react automatically,
 * but it can never bypass NexTeam's existing send approval rail.
 */
export function registerTenantAutomationRuntime(input: {
  eventBus: EventBus;
  repository: NativeCrmRepository;
  approvalQueue: ApprovalQueueService;
}): void {
  const eventTypes: EventType[] = ["request.created", "quote.sent", "quote.approved", "job.completed", "invoice.sent", "invoice.paid", "review.received"];
  for (const eventType of eventTypes) {
    input.eventBus.subscribe(eventType, `tenant-automation:${eventType}`, async (event: BusEvent) => {
      const settings = await input.repository.getCrmSettings(event.tenantId);
      const matches = settings.workspaceSettings.automations.filter((automation) =>
        automation.active && automation.trigger === event.type && automation.delayMinutes === 0
      );
      for (const automation of matches) {
        await input.approvalQueue.create({
          tenantId: event.tenantId,
          kind: "email",
          preview: {
            title: automation.title,
            body: automation.messageTemplateCategory
              ? `Automation ${automation.title} fired for ${event.type}; template ${automation.messageTemplateCategory} is ready for review.`
              : `Automation ${automation.title} fired for ${event.type} and is ready for review.`
          },
          execute: { service: "automation", op: automation.action, args: { automationId: automation.id, eventId: event.id, payload: event.payload } },
          createdBy: "system"
        });
      }
    });
  }
}
