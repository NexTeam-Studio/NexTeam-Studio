import { z } from "zod";
import { RailError, type ApprovalExecutor, type ApprovalItem } from "@nexteam/core";
import type { NexReachService } from "./nexreachService.js";

const contentExecutionArgsSchema = z.object({
  tenantId: z.string().min(1),
  draftId: z.string().min(1)
});

export class ContentApprovalExecutor implements ApprovalExecutor {
  constructor(private readonly service: NexReachService | (() => NexReachService)) {}

  private resolveService(): NexReachService {
    return typeof this.service === "function" ? this.service() : this.service;
  }

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "content") {
      throw new RailError(`Unsupported content approval service ${item.execute.service}.`, { provider: "native", op: "executeApproval", status: 409 });
    }
    if (!["publishGbpPost", "publishSocialPost", "publishSeoArticle"].includes(item.execute.op)) {
      throw new RailError(`Unsupported content approval op ${item.execute.op}.`, { provider: "native", op: "executeApproval", status: 409 });
    }
    const args = contentExecutionArgsSchema.parse(item.execute.args ?? {});
    return this.resolveService().executeApproval({
      ...item,
      execute: {
        ...item.execute,
        args
      }
    });
  }
}
