import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source } from "@nexteam/core";
import type { AccessContext } from "../auth/accessContext.js";
import { actorIdForAccess } from "../auth/accessContext.js";
import { answerIntakeInputSchema, finalizeIntakeInputSchema, startIntakeInputSchema } from "./schemas.js";
import type { IntakeService } from "./service.js";

const intakeStatusInputSchema = z.object({
  sessionId: z.string().min(1).optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createIntakeNexiTools(input: {
  service: IntakeService;
  approvalQueue: ApprovalQueueService;
  access: AccessContext;
}): NexiTool[] {
  return [
    {
      name: "startIntake",
      description: "Start a tenant onboarding interview and create an intake session. This does not provision anything yet.",
      inputSchema: startIntakeInputSchema,
      handler: async (tenant, args) => {
        const parsed = startIntakeInputSchema.parse(args);
        const session = await input.service.start(parsed, tenant.id);
        return {
          result: {
            session,
            nextQuestion: session.nextQuestion,
            approvalRequiredBeforeProvisioning: true
          },
          sources: [source(session.id, `Tenant intake ${session.targetTenantId}`)]
        };
      }
    },
    {
      name: "answerIntake",
      description: "Record one answer in a tenant onboarding interview.",
      inputSchema: answerIntakeInputSchema,
      handler: async (tenant, args) => {
        const parsed = answerIntakeInputSchema.parse(args);
        const session = await input.service.answer(parsed, tenant.id);
        return {
          result: { session, nextQuestion: session.nextQuestion },
          sources: [source(session.id, `Tenant intake ${session.targetTenantId}`)]
        };
      }
    },
    {
      name: "intakeStatus",
      description: "Read tenant onboarding sessions and their approval status.",
      inputSchema: intakeStatusInputSchema,
      handler: async (tenant, args) => {
        const parsed = intakeStatusInputSchema.parse(args);
        const session = parsed.sessionId ? await input.service.getSession(tenant.id, parsed.sessionId) : null;
        const sessions = parsed.sessionId ? (session ? [session] : []) : await input.service.listSessions(tenant.id);
        const compact = sessions.filter(Boolean);
        return {
          result: { sessions: compact },
          sources: compact.length
            ? compact.map((session) => source(session.id, `Tenant intake ${session.targetTenantId}`))
            : [source("intakeSessions", `Tenant intake sessions for ${tenant.id}`)]
        };
      }
    },
    {
      name: "finalizeIntake",
      description: "Create the ApprovalQueue item for a tenant onboarding plan. Provisioning waits until the owner approves.",
      inputSchema: finalizeIntakeInputSchema,
      handler: async (tenant, args) => {
        const parsed = finalizeIntakeInputSchema.parse(args);
        const result = await input.service.finalize(parsed, tenant.id, input.approvalQueue, actorIdForAccess(input.access));
        return {
          result: {
            session: result.session,
            approvalId: result.approvalId,
            approvalQueuedOnly: true,
            externalProvisioningDeferred: true
          },
          sources: [
            source(result.session.id, `Tenant intake ${result.session.targetTenantId}`),
            source(result.approvalId, `ApprovalQueue tenant provisioning ${result.approvalId}`)
          ]
        };
      }
    }
  ];
}
