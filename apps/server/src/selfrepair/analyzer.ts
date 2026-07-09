import type { TenantDataExport } from "@nexteam/core";
import type {
  SelfRepairFailureClass,
  SelfRepairFinding,
  SelfRepairFixBrief,
  SelfRepairSafeRepair
} from "./schemas.js";

interface ConversationLike {
  id?: string | undefined;
  userText?: string | undefined;
  assistantText?: string | undefined;
  createdAt?: string | undefined;
}

interface FailureLike {
  id?: string | undefined;
  reason?: string | undefined;
  question?: string | undefined;
  correctionText?: string | undefined;
  createdAt?: string | undefined;
}

export interface SelfRepairAnalysis {
  findings: SelfRepairFinding[];
  safeRepairs: SelfRepairSafeRepair[];
  fixBriefs: SelfRepairFixBrief[];
  watchItems: string[];
}

export interface SelfRepairAnalyzeInput {
  tenantId: string;
  date: string;
  exportData: TenantDataExport;
  recentLogs: Array<{ findings: SelfRepairFinding[] }>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function recordId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

function recordsForDate<T extends { createdAt?: string | undefined }>(records: T[], date: string): T[] {
  return records.filter((record) => !record.createdAt || record.createdAt.startsWith(date));
}

function collection<T>(exportData: TenantDataExport, name: string): T[] {
  return (exportData.collections[name] ?? []) as T[];
}

function isStonewall(answer: string): boolean {
  return /verified source|written down anywhere|couldn'?t find (a )?(matching )?email|couldn'?t find (a )?matching|failed check|lookup instead of guessing/i.test(answer);
}

function looksMetaOrFeedback(prompt: string): boolean {
  return /\b(what commands can i use|why did|how do i|incorrect|wrong|correct|format|feedback|that failed|upload photos)\b/i.test(prompt);
}

function looksEmailIntent(prompt: string): boolean {
  return /\b(email|inbox|unread|message|mailbox|came in today)\b/i.test(prompt);
}

function looksSendIntent(prompt: string): boolean {
  return /\b(send|email me|draft|reply to|forward)\b/i.test(prompt);
}

function looksJobDetailIntent(prompt: string): boolean {
  return /\b(total gallons|gallons|completion time|completed|status|payment|paid|issue|technician|main drains?|skimmers?|returns?|lights?)\b/i.test(prompt);
}

function looksCapabilityGap(prompt: string): boolean {
  return /\b(how far|distance|drive time|attach|attachments?|email me the report|send.*pdf|clock|time is it|weather|temperature|temp)\b/i.test(prompt);
}

function suspectedFilesFor(classId: SelfRepairFailureClass, prompt: string): string[] {
  const base = ["packages/nexi/src/gateway.ts", "apps/server/src/nexi/nexiService.ts"];
  if (classId === "A_SINGLE_RAIL_CONCLUSION") {
    return [...base, "apps/server/src/nexi/nexiTools.ts", "apps/server/src/nexi/reportDocuments.ts"];
  }
  if (classId === "C_INTENT_MISROUTING" && looksEmailIntent(prompt)) {
    return [...base, "apps/server/src/comms/nexiTools.ts"];
  }
  if (classId === "C_INTENT_MISROUTING" && /evap/i.test(prompt)) {
    return [...base, "apps/server/src/evaporation/nexiTools.ts"];
  }
  if (classId === "D_CAPABILITY_GAP_MISCLASSIFIED") {
    return [...base, "packages/nexi/src/sourceCheck.ts"];
  }
  return base;
}

function titleFor(classId: SelfRepairFailureClass, prompt: string): string {
  if (classId === "A_SINGLE_RAIL_CONCLUSION") return `Cross-rail job detail gap: ${prompt.slice(0, 80)}`;
  if (classId === "C_INTENT_MISROUTING") return `Intent routed to the wrong rail: ${prompt.slice(0, 80)}`;
  if (classId === "D_CAPABILITY_GAP_MISCLASSIFIED") return `Capability gap was explained as missing data: ${prompt.slice(0, 80)}`;
  if (classId === "E_TOOL_EXCEPTION_LEAK") return `Raw tool exception reached the user: ${prompt.slice(0, 80)}`;
  return `Unclassified Nexi issue: ${prompt.slice(0, 80)}`;
}

function priorityFor(classId: SelfRepairFailureClass): "P1" | "P2" | "P3" {
  if (classId === "A_SINGLE_RAIL_CONCLUSION" || classId === "C_INTENT_MISROUTING") return "P1";
  if (classId === "D_CAPABILITY_GAP_MISCLASSIFIED" || classId === "E_TOOL_EXCEPTION_LEAK") return "P2";
  return "P3";
}

function recurrenceFor(classId: SelfRepairFailureClass, prompt: string, recentLogs: Array<{ findings: SelfRepairFinding[] }>): number {
  const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  let count = 1;
  for (const log of recentLogs) {
    if (log.findings.some((finding) =>
      finding.classId === classId
      && finding.reproPhrasings.some((phrase) => phrase.toLowerCase().replace(/\s+/g, " ").slice(0, 80) === normalizedPrompt)
    )) {
      count += 1;
    }
  }
  return count;
}

function classifyConversation(record: ConversationLike): SelfRepairFailureClass | null {
  const prompt = lower(record.userText);
  const answer = lower(record.assistantText);
  if (/invalid time value|rangeerror|typeerror|object object/.test(answer)) {
    return "E_TOOL_EXCEPTION_LEAK";
  }
  if (looksSendIntent(prompt) && /couldn'?t find|matching email|lookup instead/i.test(answer)) {
    return "C_INTENT_MISROUTING";
  }
  if (looksEmailIntent(prompt) && /couldn'?t find|matching email|failed check/i.test(answer)) {
    return "C_INTENT_MISROUTING";
  }
  if (/\b(evap|evaporation calculator)\b/.test(prompt) && isStonewall(answer)) {
    return "C_INTENT_MISROUTING";
  }
  if (looksMetaOrFeedback(prompt) && isStonewall(answer)) {
    return "C_INTENT_MISROUTING";
  }
  if (/\bspa\b/.test(prompt) && /\b(main drain|drain|return|skimmer|light)\b/.test(prompt) && isStonewall(answer)) {
    return "A_SINGLE_RAIL_CONCLUSION";
  }
  if (looksJobDetailIntent(prompt) && isStonewall(answer)) {
    return "A_SINGLE_RAIL_CONCLUSION";
  }
  if (looksCapabilityGap(prompt) && /couldn'?t find|matching email|written down anywhere|verified source/i.test(answer)) {
    return "D_CAPABILITY_GAP_MISCLASSIFIED";
  }
  return null;
}

function findingFromConversation(input: {
  tenantId: string;
  date: string;
  record: ConversationLike;
  classId: SelfRepairFailureClass;
  index: number;
  recentLogs: Array<{ findings: SelfRepairFinding[] }>;
}): SelfRepairFinding {
  const prompt = text(input.record.userText).trim() || "(missing user text)";
  const recurrenceCount = recurrenceFor(input.classId, prompt, input.recentLogs);
  const basePriority = priorityFor(input.classId);
  return {
    id: recordId("finding_conv", input.index),
    tenantId: input.tenantId,
    date: input.date,
    classId: input.classId,
    priority: recurrenceCount > 1 && basePriority === "P2" ? "P1" : basePriority,
    title: titleFor(input.classId, prompt),
    evidenceRefs: [input.record.id ? `conversation:${input.record.id}` : `conversation:index:${input.index}`],
    reproPhrasings: [prompt],
    suspectedFiles: suspectedFilesFor(input.classId, prompt),
    recurrenceCount,
    ...(recurrenceCount > 1 ? { notes: `Seen ${recurrenceCount} times across recent self-repair runs.` } : {})
  };
}

function safeRepairsFromFailureLog(records: FailureLike[], date: string): SelfRepairSafeRepair[] {
  return records.flatMap((record, index): SelfRepairSafeRepair[] => {
    const reason = text(record.reason);
    const correction = lower(record.correctionText);
    const question = lower(record.question);
    const shouldReclassify = reason !== "capability_not_available"
      && (/\b(not built|isn'?t built|not available|can'?t send attachments?|pdfs?)\b/.test(correction)
        || /\b(email me the report|send.*pdf|attach)\b/.test(question));
    if (!shouldReclassify) return [];
    return [{
      id: recordId("repair_failure", index),
      type: "gap_label_correction",
      targetRef: record.id ? `failureLog:${record.id}` : `failureLog:${date}:${index}`,
      before: reason || "unknown",
      after: "capability_not_available",
      applied: true,
      summary: "Logged a safe gap-label correction candidate so the owner sees capability-not-available instead of search-empty wording."
    }];
  });
}

function fixBriefFromFinding(finding: SelfRepairFinding, index: number): SelfRepairFixBrief {
  return {
    id: recordId("fix_brief", index),
    classId: finding.classId,
    priority: finding.priority,
    title: finding.title,
    reproPhrasings: finding.reproPhrasings,
    suspectedFiles: finding.suspectedFiles,
    receiptRequired: "Add/keep a permanent regression-wall case and prove the phrasing passes live on staging before merge."
  };
}

export class DeterministicSelfRepairAnalyzer {
  analyze(input: SelfRepairAnalyzeInput): SelfRepairAnalysis {
    const conversations = recordsForDate(collection<ConversationLike>(input.exportData, "conversations"), input.date);
    const failures = recordsForDate(collection<FailureLike>(input.exportData, "failureLog"), input.date);
    const findings = conversations.flatMap((record, index): SelfRepairFinding[] => {
      const classId = classifyConversation(record);
      return classId ? [findingFromConversation({ tenantId: input.tenantId, date: input.date, record, classId, index, recentLogs: input.recentLogs })] : [];
    });
    const safeRepairs = [
      ...safeRepairsFromFailureLog(failures, input.date),
      ...findings.map((finding, index): SelfRepairSafeRepair => ({
        id: recordId("repair_wall", index),
        type: "wall_entry_candidate",
        targetRef: finding.evidenceRefs[0] ?? finding.id,
        applied: true,
        summary: `Drafted regression-wall candidate for ${finding.classId}: ${finding.reproPhrasings[0]}`
      }))
    ];
    const fixBriefs = findings.map(fixBriefFromFinding);
    const watchItems = findings
      .filter((finding) => finding.recurrenceCount > 1)
      .map((finding) => `${finding.classId} recurrence: ${finding.title}`);
    return { findings, safeRepairs, fixBriefs, watchItems };
  }
}
