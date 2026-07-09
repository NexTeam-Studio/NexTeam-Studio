import { z } from "zod";

export const selfRepairFailureClassSchema = z.enum([
  "A_SINGLE_RAIL_CONCLUSION",
  "B_FABRICATED_TOOL_INPUT",
  "C_INTENT_MISROUTING",
  "D_CAPABILITY_GAP_MISCLASSIFIED",
  "E_TOOL_EXCEPTION_LEAK",
  "F_TENANT_OR_SOURCE_SCOPE",
  "G_USER_FACING_REALITY_GAP",
  "UNKNOWN"
]);

export const selfRepairPrioritySchema = z.enum(["P1", "P2", "P3"]);

export const selfRepairFindingSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  date: z.string().min(1),
  classId: selfRepairFailureClassSchema,
  priority: selfRepairPrioritySchema,
  title: z.string().min(1),
  evidenceRefs: z.array(z.string()),
  reproPhrasings: z.array(z.string()),
  suspectedFiles: z.array(z.string()).default([]),
  recurrenceCount: z.number().int().min(1),
  notes: z.string().optional()
});

export const selfRepairSafeRepairSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "failure_log_reclassification",
    "wall_entry_candidate",
    "transient_health_retry",
    "gap_label_correction"
  ]),
  targetRef: z.string().min(1),
  before: z.string().optional(),
  after: z.string().optional(),
  applied: z.boolean(),
  summary: z.string().min(1)
});

export const selfRepairFixBriefSchema = z.object({
  id: z.string().min(1),
  classId: selfRepairFailureClassSchema,
  priority: selfRepairPrioritySchema,
  title: z.string().min(1),
  reproPhrasings: z.array(z.string()),
  suspectedFiles: z.array(z.string()),
  receiptRequired: z.string().min(1)
});

export const selfRepairRunInputSchema = z.object({
  tenantId: z.string().min(1).default("aquatrace"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ownerEmail: z.string().email().optional()
});

export const selfRepairLogSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.object({
    conversations: z.number().int().min(0),
    failureLog: z.number().int().min(0),
    usageLog: z.number().int().min(0),
    approvalQueue: z.number().int().min(0),
    healthHistory: z.number().int().min(0),
    wallStatus: z.number().int().min(0)
  }),
  found: z.number().int().min(0),
  autoRepaired: z.number().int().min(0),
  blocked: z.array(z.string()),
  needsApproval: z.array(z.string()),
  watchItems: z.array(z.string()),
  findings: z.array(selfRepairFindingSchema),
  safeRepairs: z.array(selfRepairSafeRepairSchema),
  fixBriefs: z.array(selfRepairFixBriefSchema),
  morningReport: z.string(),
  morningReportApprovalId: z.string().optional(),
  analysisMode: z.enum(["deterministic-local", "anthropic-gateway"]),
  createdAt: z.string()
});

export type SelfRepairFailureClass = z.infer<typeof selfRepairFailureClassSchema>;
export type SelfRepairFinding = z.infer<typeof selfRepairFindingSchema>;
export type SelfRepairSafeRepair = z.infer<typeof selfRepairSafeRepairSchema>;
export type SelfRepairFixBrief = z.infer<typeof selfRepairFixBriefSchema>;
export type SelfRepairRunInput = z.infer<typeof selfRepairRunInputSchema>;
export type SelfRepairLog = z.infer<typeof selfRepairLogSchema>;
