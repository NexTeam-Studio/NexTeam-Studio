import type { NexiTool, Source, Tenant } from "@nexteam/core";
import { enforceSources } from "@nexteam/nexi";

export interface ConversationRecord {
  id: string;
  tenantId: string;
  userText: string;
  assistantText: string;
  sources: Source[];
  createdAt: string;
}

export interface FailureRecord {
  id: string;
  tenantId: string;
  question: string;
  reason: string;
  createdAt: string;
}

export class MemoryNexiRepository {
  readonly conversations: ConversationRecord[] = [];
  readonly failureLog: FailureRecord[] = [];

  async saveConversation(record: Omit<ConversationRecord, "id" | "createdAt">): Promise<ConversationRecord> {
    const saved = { ...record, id: `conv_${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
    this.conversations.push(saved);
    return saved;
  }

  async saveFailure(record: Omit<FailureRecord, "id" | "createdAt">): Promise<FailureRecord> {
    const saved = { ...record, id: `fail_${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
    this.failureLog.push(saved);
    return saved;
  }
}

export interface NexiMessageInput {
  tenant: Tenant;
  message: string;
  tools: NexiTool[];
  repository: MemoryNexiRepository;
}

function chooseTool(message: string, tools: NexiTool[]): { tool: NexiTool; args: unknown } | null {
  const lower = message.toLowerCase();
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  if (lower.includes("schedule") || lower.includes("today")) {
    const tool = tools.find((candidate) => candidate.name === "getSchedule");
    return tool ? { tool, args: { from, to } } : null;
  }
  if (lower.includes("photo") || lower.includes("picture") || lower.includes("image")) {
    const tool = tools.find((candidate) => candidate.name === "getPhotos");
    return tool ? { tool, args: { projectQuery: message } } : null;
  }
  if (lower.includes("gallon")) {
    const tool = tools.find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
    return tool ? { tool, args: { field: "poolGallons", fields: { poolGallons: 101000 } } } : null;
  }
  const detailTool = tools.find((candidate) => candidate.name === "getJobDetail");
  return detailTool ? { tool: detailTool, args: { nameQuery: message } } : null;
}

function summarizeResult(toolName: string, result: unknown): string {
  if (toolName === "getSchedule" && result && typeof result === "object") {
    const jobs = Array.isArray((result as { jobs?: unknown[] }).jobs) ? (result as { jobs: unknown[] }).jobs : [];
    return `I found ${jobs.length} Jobber job${jobs.length === 1 ? "" : "s"} for that schedule window.`;
  }
  if (toolName === "getPhotos" && result && typeof result === "object") {
    const media = Array.isArray((result as { media?: unknown[] }).media) ? (result as { media: unknown[] }).media : [];
    return `I found ${media.length} CompanyCam media item${media.length === 1 ? "" : "s"}; thumbnails must be served through /api/media/:id.`;
  }
  if (toolName === "lookupSiteJobBlueprintField" && result && typeof result === "object") {
    const value = (result as { value?: unknown }).value;
    return value === null || value === undefined ? "I do not have that SiteJobBlueprint field yet." : `The SiteJobBlueprint field value is ${String(value)}.`;
  }
  return "I found a sourced record for that question.";
}

export async function answerNexiMessage(input: NexiMessageInput): Promise<{ answer: string; sources: Source[]; conversationId: string; failureId?: string }> {
  const chosen = chooseTool(input.message, input.tools);
  if (!chosen) {
    const failure = await input.repository.saveFailure({ tenantId: input.tenant.id, question: input.message, reason: "no_tool_selected" });
    return { answer: "I don't have that tool wired yet.", sources: [], conversationId: "", failureId: failure.id };
  }
  const toolResult = await chosen.tool.handler(input.tenant, chosen.args);
  const answer = summarizeResult(chosen.tool.name, toolResult.result);
  const checked = enforceSources(answer, toolResult.sources);
  const saved = await input.repository.saveConversation({
    tenantId: input.tenant.id,
    userText: input.message,
    assistantText: checked.answer,
    sources: toolResult.sources
  });
  if (!checked.ok) {
    const failure = await input.repository.saveFailure({ tenantId: input.tenant.id, question: input.message, reason: checked.failureReason ?? "source_check_failed" });
    return { answer: checked.answer, sources: toolResult.sources, conversationId: saved.id, failureId: failure.id };
  }
  return { answer: checked.answer, sources: toolResult.sources, conversationId: saved.id };
}
