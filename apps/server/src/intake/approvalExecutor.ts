import { RailError, type ApprovalExecutor, type ApprovalItem } from "@nexteam/core";
import { z } from "zod";
import type { IntakeService } from "./service.js";
import { provisioningPlanSchema } from "./schemas.js";

const provisionTenantArgsSchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  targetTenantId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  provisioningPlan: provisioningPlanSchema,
  externalProvisioningDeferred: z.boolean()
});

export class IntakeApprovalExecutor implements ApprovalExecutor {
  constructor(private readonly service: IntakeService) {}

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "intake" || item.execute.op !== "provisionTenant") {
      throw new RailError("Unsupported intake approval action.", { provider: "native", op: "provisionTenant", status: 400 });
    }
    const args = provisionTenantArgsSchema.parse(item.execute.args);
    if (args.tenantId !== item.tenantId) {
      throw new RailError("Approved intake artifact targets a different tenant.", { provider: "native", op: "provisionTenant", status: 403 });
    }
    if (args.provisioningPlan.tenant.id !== args.targetTenantId) {
      throw new RailError("Provisioning plan tenant id does not match the approval target.", { provider: "native", op: "provisionTenant", status: 400 });
    }
    const result = await this.service.provisionFromApproval({
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      provisioningPlan: args.provisioningPlan,
      actorId: args.actorId
    });
    return {
      ...result,
      externalProvisioningDeferred: args.externalProvisioningDeferred,
      nativeWritesOnly: true
    };
  }
}
