import type { ApprovalQueueService, TenantDataExport } from "@nexteam/core";
import { AnthropicSelfRepairAnalyzer, type SelfRepairUsageLogWriter } from "./anthropicAnalyzer.js";
import { DeterministicSelfRepairAnalyzer, type SelfRepairAnalyzer } from "./analyzer.js";
import { SafeSelfRepairExecutor, type SelfRepairRepairExecutor } from "./repairExecutor.js";
import type { SelfRepairRepository } from "./repository.js";
import {
  selfRepairLogSchema,
  selfRepairRunInputSchema,
  type SelfRepairLog,
  type SelfRepairRunInput
} from "./schemas.js";

export interface SelfRepairDataReader {
  exportTenantData(tenantId: string): Promise<TenantDataExport>;
}

export interface SelfRepairReportMailer {
  send(input: { tenantId: string; to: string; subject: string; bodyText: string }): Promise<void>;
}

export interface SelfRepairServiceDeps {
  dataReader: SelfRepairDataReader;
  repository: SelfRepairRepository;
  approvalQueue: ApprovalQueueService;
  analyzer?: SelfRepairAnalyzer | undefined;
  usageLog?: SelfRepairUsageLogWriter | undefined;
  reportMailer?: SelfRepairReportMailer | undefined;
  repairExecutor?: SelfRepairRepairExecutor | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

function recordsForDate(records: unknown[], date: string): unknown[] {
  return records.filter((record) => {
    if (!record || typeof record !== "object") return true;
    const value = (record as Record<string, unknown>).createdAt
      ?? (record as Record<string, unknown>).checkedAt
      ?? (record as Record<string, unknown>).ts
      ?? (record as Record<string, unknown>).updatedAt;
    return typeof value !== "string" || value.startsWith(date);
  });
}

function recordsForWindow(records: unknown[], since: string | undefined, through: string | undefined): unknown[] {
  if (!since && !through) return records;
  return records.filter((record) => {
    if (!record || typeof record !== "object") return false;
    const value = (record as Record<string, unknown>).createdAt
      ?? (record as Record<string, unknown>).checkedAt
      ?? (record as Record<string, unknown>).ts
      ?? (record as Record<string, unknown>).updatedAt;
    return typeof value === "string" && (!since || value > since) && (!through || value <= through);
  });
}

function exportForWindow(exportData: TenantDataExport, since: string | undefined, through: string | undefined): TenantDataExport {
  if (!since && !through) return exportData;
  return {
    ...exportData,
    collections: Object.fromEntries(Object.entries(exportData.collections).map(([name, records]) => [
      name,
      recordsForWindow(records, since, through)
    ]))
  };
}

function count(exportData: TenantDataExport, collection: string, date: string): number {
  return recordsForDate(exportData.collections[collection] ?? [], date).length;
}

function reportEmail(input: SelfRepairRunInput, env: NodeJS.ProcessEnv): string | undefined {
  if (input.ownerEmail) return input.ownerEmail;
  const configured = env.SELF_REPAIR_REPORT_EMAIL || env.FIREBASE_PLATFORM_OPERATOR_EMAILS || "";
  return configured.split(",").map((entry) => entry.trim()).find((entry) => entry.includes("@"));
}

function auditLogId(tenantId: string, date: string, windowEnd: string): string {
  return `${tenantId}_${date}_${windowEnd.replace(/[^0-9]/g, "")}`;
}

function buildMorningReport(log: Omit<SelfRepairLog, "morningReport" | "reportDelivery">): string {
  const lines = [
    log.windowStart
      ? `Hourly quality report for ${log.tenantId} on ${log.date}`
      : `Self-repair report for ${log.tenantId} on ${log.date}`,
    "",
    ...(log.windowStart ? [`Review window: ${log.windowStart} through ${log.windowEnd ?? log.createdAt}`, ""] : []),
    `Checked: ${log.checked.conversations} conversations, ${log.checked.failureLog} failure logs, ${log.checked.usageLog} usage logs, ${log.checked.approvalQueue} pending approvals, ${log.checked.healthHistory} health records, ${log.checked.wallStatus} wall records.`,
    `Found: ${log.found}`,
    `Auto-repaired: ${log.autoRepaired} safe allowlist item(s).`,
    ""
  ];
  if (!log.findings.length) {
    lines.push(
      "Issue 1",
      "Issue: No new issue was found in this review window.",
      "Resolution: No repair was needed.",
      "Status: Healthy. Nexi will review the next new messages at the next hourly check."
    );
  }
  for (const [index, finding] of log.findings.entries()) {
    const fixBrief = log.fixBriefs.find((brief) => brief.classId === finding.classId);
    const safeRepair = log.safeRepairs.find((repair) => repair.targetRef === finding.evidenceRefs[0]);
    const execution = safeRepair ? log.repairExecutions.find((entry) => entry.repairId === safeRepair.id) : undefined;
    lines.push(
      "",
      `Issue ${index + 1}`,
      `Issue: ${finding.priority} - ${finding.title}`,
      `Repair Agent: ${execution?.repairAgent ?? "Nexi Product Repair Agent"}`,
      `Resolution Performed: ${execution?.resolution ?? "No automatic repair was performed."}`,
      `Verification: ${execution?.verification ?? "A product repair task was recorded for this issue."}`,
      `Status: ${execution?.status === "performed" ? "Safe repair performed and receipt verified. Product-code behavior was not changed by this audit." : fixBrief?.title ?? "Needs product repair."}`
    );
  }
  if (log.watchItems.length) {
    lines.push("", "Watch items:");
    for (const item of log.watchItems) lines.push(`- ${item}`);
  }
  if (log.blocked.length) {
    lines.push("", "Blocked:");
    for (const item of log.blocked) lines.push(`- ${item}`);
  }
  if (log.needsApproval.length) {
    lines.push("", "Needs approval:");
    for (const item of log.needsApproval) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

export class SelfRepairService {
  private readonly analyzer: SelfRepairAnalyzer;
  private readonly repairExecutor: SelfRepairRepairExecutor;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly deps: SelfRepairServiceDeps) {
    this.env = deps.env ?? process.env;
    this.analyzer = deps.analyzer ?? (
      this.env.ANTHROPIC_API_KEY && this.env.SELF_REPAIR_ANALYSIS_MODE !== "deterministic"
        ? new AnthropicSelfRepairAnalyzer({
          env: this.env,
          usageLog: deps.usageLog,
          fallback: new DeterministicSelfRepairAnalyzer()
        })
        : new DeterministicSelfRepairAnalyzer()
    );
    this.repairExecutor = deps.repairExecutor ?? new SafeSelfRepairExecutor();
  }

  async run(inputValue: unknown): Promise<SelfRepairLog> {
    const input = selfRepairRunInputSchema.parse(inputValue);
    const date = input.date ?? today();
    const windowEnd = input.through ?? now();
    const exportData = exportForWindow(
      await this.deps.dataReader.exportTenantData(input.tenantId),
      input.since,
      windowEnd
    );
    const recentLogs = await this.deps.repository.listRecentLogs(input.tenantId, 7);
    const analysis = await this.analyzer.analyze({
      tenantId: input.tenantId,
      date,
      exportData,
      recentLogs
    });
    const repairExecutions = await this.repairExecutor.execute(analysis.safeRepairs);
    const pendingApprovals = await this.deps.approvalQueue.listPending(input.tenantId);
    const healthHistory = count(exportData, "tenantAdapterStatuses", date);
    const wallStatus = count(exportData, "nexiRegressionWallRuns", date) + count(exportData, "wallStatus", date);
    const blocked = [
      "Safe-repair rail does not change code, SOUL, schemas, deploys, or customer data.",
      ...(reportEmail(input, this.env) ? [] : ["Report email was not queued because SELF_REPAIR_REPORT_EMAIL is not configured."])
    ];
    const baseLog = {
      // Each audit run is retained. The hourly cursor must survive a server
      // restart without replacing the earlier report from the same day.
      id: auditLogId(input.tenantId, date, windowEnd),
      tenantId: input.tenantId,
      date,
      checked: {
        conversations: count(exportData, "conversations", date),
        failureLog: count(exportData, "failureLog", date),
        usageLog: count(exportData, "usageLog", date),
        approvalQueue: pendingApprovals.length,
        healthHistory,
        wallStatus
      },
      found: analysis.findings.length,
      autoRepaired: repairExecutions.filter((execution) => execution.status === "performed" && execution.verified).length,
      blocked,
      needsApproval: analysis.fixBriefs.map((brief) => `${brief.priority} ${brief.classId}: ${brief.title}`),
      watchItems: analysis.watchItems,
      findings: analysis.findings,
      safeRepairs: analysis.safeRepairs,
      repairExecutions,
      fixBriefs: analysis.fixBriefs,
      analysisMode: analysis.analysisMode,
      ...(input.since ? { windowStart: input.since } : {}),
      windowEnd,
      createdAt: now()
    };
    const morningReport = buildMorningReport(baseLog);
    let morningReportApprovalId: string | undefined;
    let reportDelivery: SelfRepairLog["reportDelivery"] = "not_requested";
    const to = reportEmail(input, this.env);
    if (input.deliverReport && to && this.deps.reportMailer) {
      try {
        await this.deps.reportMailer.send({
          tenantId: input.tenantId,
          to,
          subject: baseLog.found > 0
            ? `Nexi hourly quality review: ${baseLog.found} item${baseLog.found === 1 ? "" : "s"} need attention`
            : "Nexi hourly quality review: no new issues",
          bodyText: morningReport
        });
        reportDelivery = "sent";
      } catch {
        blocked.push("Hourly report email could not be delivered; the diagnosis was saved and will be retried on a later pass.");
        reportDelivery = "not_configured";
      }
    } else if (to && (!input.deliverReport || baseLog.found > 0)) {
      const approval = await this.deps.approvalQueue.create({
        tenantId: input.tenantId,
        kind: "email",
        preview: {
          title: `Self-repair report: ${input.tenantId} ${date}`,
          body: morningReport
        },
        execute: {
          service: "selfRepair",
          op: "sendMorningReport",
          args: {
            tenantId: input.tenantId,
            date,
            to,
            logId: baseLog.id,
            noOutboundSend: true
          }
        },
        createdBy: "system"
      });
      morningReportApprovalId = approval.id;
      reportDelivery = "queued_for_approval";
    } else if (input.deliverReport) {
      reportDelivery = "not_configured";
    }
    const parsed = selfRepairLogSchema.parse({
      ...baseLog,
      morningReport,
      ...(morningReportApprovalId ? { morningReportApprovalId } : {}),
      reportDelivery
    });
    return this.deps.repository.saveLog(parsed);
  }

  getLog(tenantId: string, date: string): Promise<SelfRepairLog | null> {
    return this.deps.repository.getLog(tenantId, date);
  }

  listLogs(tenantId: string, limit = 14): Promise<SelfRepairLog[]> {
    return this.deps.repository.listRecentLogs(tenantId, limit);
  }
}
