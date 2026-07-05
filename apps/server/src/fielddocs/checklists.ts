import { randomUUID } from "node:crypto";
import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  status: z.enum(["pending", "pass", "fail", "not_applicable"]),
  note: z.string().optional()
});

export const checklistInstanceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  title: z.string().min(1),
  items: z.array(checklistItemSchema),
  createdAt: z.string()
});

export type ChecklistInstance = z.infer<typeof checklistInstanceSchema>;

export const checklistItemUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "pass", "fail", "not_applicable"]),
  note: z.string().optional()
});

export type ChecklistItemUpdate = z.infer<typeof checklistItemUpdateSchema>;

export const leakDetectionChecklistTemplate = {
  id: "leak_detection_checklist_v1",
  title: "Leak Detection Checklist",
  items: [
    "Confirm static water loss baseline",
    "Inspect skimmers and throats",
    "Inspect returns and fittings",
    "Dye-test suspect penetrations",
    "Inspect equipment pad and visible plumbing",
    "Capture before and after photos",
    "Record findings and repair recommendation"
  ]
} as const;

export function createLeakDetectionChecklist(input: {
  tenantId: string;
  jobId?: string | undefined;
  visitId?: string | undefined;
  itemUpdates?: ChecklistItemUpdate[] | undefined;
}): ChecklistInstance {
  const updates = new Map((input.itemUpdates ?? []).map((item) => [item.id, item]));
  return checklistInstanceSchema.parse({
    id: `checklist_${randomUUID()}`,
    tenantId: input.tenantId,
    templateId: leakDetectionChecklistTemplate.id,
    jobId: input.jobId,
    visitId: input.visitId,
    title: leakDetectionChecklistTemplate.title,
    items: leakDetectionChecklistTemplate.items.map((label, index) => {
      const id = `item_${index + 1}`;
      const update = updates.get(id);
      return {
        id,
        label,
        required: true,
        status: update?.status ?? "pending",
        note: update?.note
      };
    }),
    createdAt: new Date().toISOString()
  }) as ChecklistInstance;
}
