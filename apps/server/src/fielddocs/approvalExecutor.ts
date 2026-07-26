import { z } from "zod";
import {
  RailError,
  type ApprovalExecutor,
  type ApprovalItem
} from "@nexteam/core";
import { NexDocsService } from "./nexDocsService.js";

const createFolderApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  label: z.string().min(1),
  createdBy: z.string().optional()
});

const uploadDocumentApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  label: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  source: z.enum(["staff_upload", "client_upload", "generated"]),
  uploadedBy: z.string().optional()
});

export class FieldDocsApprovalExecutor implements ApprovalExecutor {
  constructor(
    private readonly nexDocsService: NexDocsService,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "fielddocs" || !["createNexDocsFolder", "uploadNexDocsDocument"].includes(item.execute.op)) {
      throw new RailError("FieldDocs approval executor received an unsupported approval item.", {
        provider: "native",
        op: "fieldDocsApprovalExecute",
        status: 400
      });
    }
    if (item.execute.op === "createNexDocsFolder") {
      const args = createFolderApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved NexDocs folder targets a different tenant.", {
          provider: "native",
          op: "createNexDocsFolder",
          status: 403
        });
      }
      const folder = await this.nexDocsService.createFolder({
        tenantId: args.tenantId,
        clientId: args.clientId,
        label: args.label,
        ...(args.createdBy ? { createdBy: args.createdBy } : {})
      });
      return { folder };
    }
    const args = uploadDocumentApprovalArgsSchema.parse(item.execute.args);
    if (args.tenantId !== item.tenantId) {
      throw new RailError("Approved NexDocs upload targets a different tenant.", {
        provider: "native",
        op: "uploadNexDocsDocument",
        status: 403
      });
    }
    const document = await this.nexDocsService.uploadDocument({
      tenantId: args.tenantId,
      clientId: args.clientId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileBase64: args.fileBase64,
      source: args.source,
      ...(args.label ? { label: args.label } : {}),
      ...(args.folderId ? { folderId: args.folderId } : {}),
      ...(args.propertyId ? { propertyId: args.propertyId } : {}),
      ...(args.jobId ? { jobId: args.jobId } : {}),
      ...(args.visitId ? { visitId: args.visitId } : {}),
      ...(args.uploadedBy ? { uploadedBy: args.uploadedBy } : {})
    }, this.env);
    return { document };
  }
}
