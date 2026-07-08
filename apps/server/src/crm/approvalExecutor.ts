import { z } from "zod";
import { RailError, type ApprovalExecutor, type ApprovalItem, type CRMProvider, type NewClient } from "@nexteam/core";

const createClientApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  client: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    company: z.string().optional(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    consent: z.object({ email: z.boolean(), sms: z.boolean() })
  }),
  addressNote: z.string().optional()
});

export class CrmApprovalExecutor implements ApprovalExecutor {
  constructor(private readonly provider: CRMProvider) {}

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "crm" || item.execute.op !== "createClient") {
      throw new RailError("CRM approval executor received an unsupported approval item.", { provider: "native", op: "approvalExecute", status: 400 });
    }
    if (!this.provider.createClient) {
      throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
    }
    const args = createClientApprovalArgsSchema.parse(item.execute.args);
    if (args.tenantId !== item.tenantId || args.client.tenantId !== item.tenantId) {
      throw new RailError("Approved client artifact targets a different tenant.", { provider: "native", op: "createClient", status: 403 });
    }
    const client = await this.provider.createClient(args.client as NewClient);
    return { client, addressNote: args.addressNote };
  }
}
