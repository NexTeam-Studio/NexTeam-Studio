import type { ApprovalQueueService, TenantDataExport } from "@nexteam/core";
import { AnthropicSelfRepairAnalyzer, type SelfRepairUsageLogWriter } from "./anthropicAnalyzer.js";
import { DeterministicSelfRepairAnalyzer, type SelfRepairAnalyzer } from "./analyzer.js";
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

export interface SelfRepairServiceDeps {
  dataReader: SelfRepairDataReader;
  repository: SelfRepairRepository;
  approvalQueue: ApprovalQueueService;
  analyzer?: SelfRepairAnalyzer | undefined;
  usageLog?: SelfRepairUsageLogWriter | undefined;
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

function count(exportData: TenantDataExport, collection: string, date: string): number {
  return recordsForDate(exportData.collections[collection] ?? [], date).length;
}

function reportEmail(input: SelfRepairRunInput, env: NodeJS.ProcessEnv): string | undefined {
  if (input.ownerEmail) return input.ownerEmail;
  const configured = env.SELF_REPAIR_REPORT_EMAIL || env.FIREBASE_PLATFORM_OPERATOR_EMAILS || "";
  return configured.split(",").map((entry) => entry.trim()).find((entry) => entry.includes("@"));
}

function buildMorningReport(log: Omit<SelfRepairLog, "morningReport">): string {
  const lines = [
    `Self-repair report for ${log.tenantId} on ${log.date}`,
    "",
    `Checked: ${log.checked.conversations} conversations, ${log.checked.failureLog} failure logs, ${log.checked.usageLog} usage logs, ${log.checked.approvalQueue} pending approvals, ${log.checked.healthHistory} health records, ${log.checked.wallStatus} wall records.`,
    `Found: ${log.found}`,
    `Auto-repaired: ${log.autoRepaired} safe allowlist item(s).`,
    ""
  ];
  if (log.findings.length) {
    lines.push("Findings:");
    for (const finding of log.findings) {
      lines.push(`- ${finding.priority} ${finding.classId}: ${finding.reproPhrasings[0]}`);
    }
  } else {
    lines.push("Findings: none.");
  }
  if (log.safeRepairs.length) {
    lines.push("", "Safe repairs:");
    for (const repair of log.safeRepairs) {
      lines.push(`- ${repair.type}: ${repair.summary}`);
    }
  }
  if (log.fixBriefs.length) {
    lines.push("", "Fix briefs:");
    for (const brief of log.fixBriefs) {
      lines.push(`- ${brief.priority} ${brief.classId}: ${brief.title}`);
    }
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
  }

  async run(inputValue: unknown): Promise<SelfRepairLog> {
    const input = selfRepairRunInputSchema.parse(inputValue);
    const date = input.date ?? today();
    const exportData = await this.deps.dataReader.exportTenantData(input.tenantId);
    const recentLogs = await this.deps.repository.listRecentLogs(input.tenantId, 7);
    const analysis = await this.analyzer.analyze({
      tenantId: input.tenantId,
      date,
      exportData,
      recentLogs
    });
    const pendingApprovals = await this.deps.approvalQueue.listPending(input.tenantId);
    const healthHistory = count(exportData, "tenantAdapterStatuses", date);
    const wallStatus = count(exportData, "nexiRegressionWallRuns", date) + count(exportData, "wallStatus", date);
    const blocked = [
      "Safe-repair rail does not change code, SOUL, schemas, deploys, or outbound sends.",
      ...(reportEmail(input, this.env) ? [] : ["Morning report email approval was not queued because SELF_REPAIR_REPORT_EMAIL is not configured."])
    ];
    const baseLog = {
      id: `${input.tenantId}_${date}`,
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
      autoRepaired: analysis.safeRepairs.filter((repair) => repair.applied).length,
      blocked,
      needsApproval: analysis.fixBriefs.map((brief) => `${brief.priority} ${brief.classId}: ${brief.title}`),
      watchItems: analysis.watchItems,
      findings: analysis.findings,
      safeRepairs: analysis.safeRepairs,
      fixBriefs: analysis.fixBriefs,
      analysisMode: analysis.analysisMode,
      createdAt: now()
    };
    const morningReport = buildMorningReport(baseLog);
    let morningReportApprovalId: string | undefined;
    const to = reportEmail(input, this.env);
    if (to) {
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
    }
    const parsed = selfRepairLogSchema.parse({
      ...baseLog,
      morningReport,
      ...(morningReportApprovalId ? { morningReportApprovalId } : {})
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
