import { z } from "zod";
import type { TenantDataExport, UsageLogRecord } from "@nexteam/core";
import {
  DeterministicSelfRepairAnalyzer,
  type SelfRepairAnalysis,
  type SelfRepairAnalyzeInput,
  type SelfRepairAnalyzer
} from "./analyzer.js";
import {
  selfRepairFailureClassSchema,
  selfRepairPrioritySchema,
  type SelfRepairFinding,
  type SelfRepairFixBrief,
  type SelfRepairSafeRepair
} from "./schemas.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const anthropicFindingSchema = z.object({
  classId: selfRepairFailureClassSchema,
  priority: selfRepairPrioritySchema,
  title: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  reproPhrasings: z.array(z.string()).min(1),
  suspectedFiles: z.array(z.string()).default([]),
  notes: z.string().optional()
});

const anthropicAnalysisSchema = z.object({
  findings: z.array(anthropicFindingSchema).default([]),
  watchItems: z.array(z.string()).default([])
});

interface AnthropicUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicResponsePayload {
  content?: Array<{ type?: string; text?: string } | Record<string, unknown>>;
  usage?: AnthropicUsagePayload;
}

export interface SelfRepairUsageLogWriter {
  write(record: UsageLogRecord): Promise<void>;
}

export interface AnthropicSelfRepairAnalyzerDeps {
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
  usageLog?: SelfRepairUsageLogWriter | undefined;
  fallback?: SelfRepairAnalyzer | undefined;
}

function emptyUsage(): UsageLogRecord["usage"] {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  };
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeUsage(usage: AnthropicUsagePayload | undefined): UsageLogRecord["usage"] {
  const inputTokens = normalizeNumber(usage?.input_tokens);
  const outputTokens = normalizeNumber(usage?.output_tokens);
  const cacheCreationInputTokens = normalizeNumber(usage?.cache_creation_input_tokens);
  const cacheReadInputTokens = normalizeNumber(usage?.cache_read_input_tokens);
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens
  };
}

function estimateCostUsd(usage: UsageLogRecord["usage"]): number {
  const input = usage.inputTokens * 3 / 1_000_000;
  const output = usage.outputTokens * 15 / 1_000_000;
  const cacheWrite = usage.cacheCreationInputTokens * 3.75 / 1_000_000;
  const cacheRead = usage.cacheReadInputTokens * 0.30 / 1_000_000;
  return Number((input + output + cacheWrite + cacheRead).toFixed(6));
}

function recordsForDate(records: unknown[], date: string): unknown[] {
  return records.filter((record) => {
    if (!record || typeof record !== "object") return true;
    const value = (record as Record<string, unknown>).createdAt
      ?? (record as Record<string, unknown>).checkedAt
      ?? (record as Record<string, unknown>).updatedAt
      ?? (record as Record<string, unknown>).ts;
    return typeof value !== "string" || value.startsWith(date);
  });
}

function collection(exportData: TenantDataExport, name: string, date: string): unknown[] {
  return recordsForDate(exportData.collections[name] ?? [], date).slice(0, 75);
}

function compactRecord(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object") return {};
  const source = record as Record<string, unknown>;
  return {
    id: source.id,
    userText: source.userText,
    assistantText: source.assistantText,
    reason: source.reason,
    question: source.question,
    correctionText: source.correctionText,
    routeActionName: source.routeActionName,
    taskType: source.taskType,
    ok: source.ok,
    errorSummary: source.errorSummary,
    status: source.status,
    createdAt: source.createdAt ?? source.checkedAt ?? source.updatedAt
  };
}

function buildPrompt(input: SelfRepairAnalyzeInput, deterministic: SelfRepairAnalysis): string {
  const payload = {
    tenantId: input.tenantId,
    date: input.date,
    deterministicFindings: deterministic.findings.map((finding) => ({
      classId: finding.classId,
      priority: finding.priority,
      title: finding.title,
      reproPhrasings: finding.reproPhrasings,
      evidenceRefs: finding.evidenceRefs
    })),
    conversations: collection(input.exportData, "conversations", input.date).map(compactRecord),
    failureLog: collection(input.exportData, "failureLog", input.date).map(compactRecord),
    usageLog: collection(input.exportData, "usageLog", input.date).map(compactRecord),
    approvalQueue: collection(input.exportData, "approvalQueue", input.date).map(compactRecord),
    healthHistory: collection(input.exportData, "tenantAdapterStatuses", input.date).map(compactRecord),
    wallStatus: [
      ...collection(input.exportData, "nexiRegressionWallRuns", input.date),
      ...collection(input.exportData, "wallStatus", input.date)
    ].map(compactRecord),
    instruction: "Return JSON only. Identify additional unflagged Nexi defects by class A-G/UNKNOWN. Do not propose code edits as repairs. Do not include email bodies or secret values. Findings must include exact repro phrasing when present."
  };
  return JSON.stringify(payload);
}

function textFromPayload(payload: AnthropicResponsePayload): string {
  return (payload.content ?? [])
    .map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
    }
    throw new Error("Anthropic self-repair response did not contain JSON.");
  }
}

function findingKey(finding: Pick<SelfRepairFinding, "classId" | "reproPhrasings">): string {
  const phrase = finding.reproPhrasings[0] ?? "";
  return `${finding.classId}:${phrase.toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`;
}

function wallCandidateFor(finding: SelfRepairFinding, index: number): SelfRepairSafeRepair {
  return {
    id: `repair_llm_wall_${String(index + 1).padStart(3, "0")}`,
    type: "wall_entry_candidate",
    targetRef: finding.evidenceRefs[0] ?? finding.id,
    applied: true,
    summary: `Drafted regression-wall candidate from Anthropic analysis for ${finding.classId}: ${finding.reproPhrasings[0]}`
  };
}

function fixBriefFor(finding: SelfRepairFinding, index: number): SelfRepairFixBrief {
  return {
    id: `fix_brief_llm_${String(index + 1).padStart(3, "0")}`,
    classId: finding.classId,
    priority: finding.priority,
    title: finding.title,
    reproPhrasings: finding.reproPhrasings,
    suspectedFiles: finding.suspectedFiles,
    receiptRequired: "Add/keep a permanent regression-wall case and prove the phrasing passes live on staging before merge."
  };
}

function mergeAnalysis(input: SelfRepairAnalyzeInput, deterministic: SelfRepairAnalysis, parsed: z.infer<typeof anthropicAnalysisSchema>): SelfRepairAnalysis {
  const existing = new Set(deterministic.findings.map(findingKey));
  const llmFindings = parsed.findings
    .map((finding, index): SelfRepairFinding => ({
      id: `finding_llm_${String(index + 1).padStart(3, "0")}`,
      tenantId: input.tenantId,
      date: input.date,
      classId: finding.classId,
      priority: finding.priority,
      title: finding.title,
      evidenceRefs: finding.evidenceRefs.length ? finding.evidenceRefs : [`llm:${index + 1}`],
      reproPhrasings: finding.reproPhrasings,
      suspectedFiles: finding.suspectedFiles,
      recurrenceCount: 1,
      ...(finding.notes ? { notes: finding.notes } : {})
    }))
    .filter((finding) => !existing.has(findingKey(finding)));
  return {
    findings: [...deterministic.findings, ...llmFindings],
    safeRepairs: [
      ...deterministic.safeRepairs,
      ...llmFindings.map(wallCandidateFor)
    ],
    fixBriefs: [
      ...deterministic.fixBriefs,
      ...llmFindings.map(fixBriefFor)
    ],
    watchItems: Array.from(new Set([...deterministic.watchItems, ...parsed.watchItems])),
    analysisMode: "anthropic-gateway"
  };
}

export class AnthropicSelfRepairAnalyzer implements SelfRepairAnalyzer {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchFn: typeof fetch;
  private readonly fallback: SelfRepairAnalyzer;

  constructor(private readonly deps: AnthropicSelfRepairAnalyzerDeps = {}) {
    this.env = deps.env ?? process.env;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.fallback = deps.fallback ?? new DeterministicSelfRepairAnalyzer();
  }

  async analyze(input: SelfRepairAnalyzeInput): Promise<SelfRepairAnalysis> {
    const deterministic = await this.fallback.analyze(input);
    const apiKey = this.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey || this.env.SELF_REPAIR_ANALYSIS_MODE === "deterministic") {
      return deterministic;
    }
    const model = this.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    const prompt = buildPrompt(input, deterministic);
    const response = await this.fetchFn(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: "You are the NexTeam self-diagnosis reviewer. Return compact JSON only. You may draft findings and wall-entry candidates, but you must never propose executing code, deploys, schema changes, SOUL changes, or outbound sends.",
        messages: [{ role: "user", content: prompt }]
      })
    });
    const payload = await response.json() as AnthropicResponsePayload;
    const usage = normalizeUsage(payload.usage);
    await this.deps.usageLog?.write({
      tenantId: input.tenantId,
      provider: "anthropic",
      model,
      routeActionName: "/api/self-repair/run",
      taskType: "self_repair_analysis",
      usage: usage.totalTokens ? usage : emptyUsage(),
      estimatedCostUsd: estimateCostUsd(usage),
      ok: response.ok,
      errorSummary: response.ok ? "" : `Anthropic self-repair analysis failed with status ${response.status}.`,
      createdAt: new Date().toISOString()
    });
    if (!response.ok) {
      return deterministic;
    }
    const parsed = anthropicAnalysisSchema.parse(extractJson(textFromPayload(payload)));
    return mergeAnalysis(input, deterministic, parsed);
  }
}
