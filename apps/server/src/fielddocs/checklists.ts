import { randomUUID } from "node:crypto";
import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  section: z.string().min(1).optional(),
  memory: z.enum(["property", "visit"]).optional(),
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

type ChecklistMemory = "property" | "visit";
type ChecklistTemplateItem = {
  label: string;
  section: string;
  memory: ChecklistMemory;
  required?: boolean;
};

export const leakDetectionChecklistTemplate: { id: string; title: string; items: ChecklistTemplateItem[] } = {
  id: "leak_detection_checklist_v1",
  title: "Aquatrace Leak Detection Checklist",
  items: [
    { section: "Summary", memory: "visit", label: "Client, city/state, service date, and completion time" },
    { section: "Summary", memory: "visit", label: "Technician name(s)" },
    { section: "Summary", memory: "visit", label: "Loss beyond evaporation present" },
    { section: "Summary", memory: "visit", label: "Leak located" },
    { section: "Details/Results", memory: "visit", label: "Free-text findings" },
    { section: "Details/Results", memory: "visit", label: "Annotated findings photos selected" },
    { section: "Additional Notes", memory: "property", label: "Site conventions and numbering notes" },
    { section: "Conditions Upon Arrival", memory: "visit", label: "Weather conditions" },
    { section: "Conditions Upon Arrival", memory: "visit", label: "Water temperature, air temperature, and daily evap index" },
    { section: "Conditions Upon Arrival", memory: "visit", label: "Reported daily water loss notation" },
    { section: "Conditions Upon Arrival", memory: "property", label: "Pre-existing site conditions" },
    { section: "Pool/Spa Overview", memory: "property", label: "Residential/commercial and inground/above-ground" },
    { section: "Pool/Spa Overview", memory: "property", label: "Construction type and special features" },
    { section: "Pool/Spa Overview", memory: "property", label: "Pool skimmer, return, drain, light, and cleaner-port counts" },
    { section: "Pool/Spa Overview", memory: "property", label: "Spa skimmer, return, drain, light, and cleaner-port counts" },
    { section: "Pool/Spa Overview", memory: "property", label: "Catch basin skimmer, return, drain, light, and cleaner-port counts" },
    { section: "Measurements", memory: "property", label: "Pool Moasure used, square feet, average depth, gallons/inch, total gallons" },
    { section: "Measurements", memory: "property", label: "Spa Moasure used, square feet, average depth, gallons/inch, total gallons" },
    { section: "Measurements", memory: "property", label: "Catch basin Moasure used, square feet, average depth, gallons/inch, total gallons" },
    { section: "Filtration Overview", memory: "property", label: "Filter type and water system" },
    { section: "Filtration Overview", memory: "property", label: "Electrical, pumps, motors, and equipment-pad notes" },
    { section: "Testing Procedures", memory: "visit", label: "Testing procedures used" },
    { section: "Testing Procedures", memory: "visit", label: "Testing procedures successful" },
    { section: "Results", memory: "visit", label: "Structure pass/fail and issue description" },
    { section: "Results", memory: "visit", label: "Lights pass/fail and issue description" },
    { section: "Results", memory: "visit", label: "Plumbing pass/fail and issue description" },
    { section: "Results", memory: "visit", label: "Roof solar pass/fail and issue description" },
    { section: "Results", memory: "visit", label: "Filtration pass/fail and issue description" },
    { section: "Results", memory: "visit", label: "Defects without water loss noted separately from failed systems" },
    { section: "Media", memory: "visit", label: "Before, testing, findings, and closeout photos attached" },
    { section: "Report", memory: "visit", label: "Client-facing report PDF generated and reviewed" },
    { section: "Closeout", memory: "visit", label: "Recommended repair, next step, or no-leak conclusion" },
    { section: "Closeout", memory: "visit", label: "Receipt/report delivery method confirmed" }
  ]
};

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
    items: leakDetectionChecklistTemplate.items.map((item, index) => {
      const id = `item_${index + 1}`;
      const update = updates.get(id);
      return {
        id,
        label: item.label,
        section: item.section,
        memory: item.memory,
        required: item.required ?? true,
        status: update?.status ?? "pending",
        note: update?.note
      };
    }),
    createdAt: new Date().toISOString()
  }) as ChecklistInstance;
}
