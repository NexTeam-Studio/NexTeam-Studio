import type { NexiTool, Source, Tenant, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import {
  runNexiToolLoop,
  type ToolLoopRequest,
  type ToolLoopResponse,
  type UsageLogWriter
} from "@nexteam/nexi";
import type { NexiRepository } from "./nexiRepository.js";

export interface NexiMessageInput {
  tenant: Tenant;
  message: string;
  tools: NexiTool[];
  repository: NexiRepository;
  usageLog?: UsageLogWriter | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  gateway?: ((request: ToolLoopRequest) => Promise<ToolLoopResponse>) | undefined;
}

export interface NexiMessageResult {
  answer: string;
  sources: Source[];
  conversationId: string;
  failureId?: string | undefined;
  usage: UsageLogRecord["usage"];
  toolRuns: ToolLoopResponse["toolRuns"];
}

function buildNexiSystemPrompt(tenant: Tenant): string {
  return [
    `You are ${tenant.branding.assistantName}, the NexTeam Job Desk assistant for ${tenant.name}.`,
    "Use the provided tools for factual job, schedule, photo, and SiteJobBlueprint questions.",
    "Never invent job data. If a factual answer lacks sources, say you do not have a verified source.",
    "Keep phone answers short, direct, and operational. Ask at most one clarifying question."
  ].join("\n");
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

export async function runExplicitLocalToolLoop(request: ToolLoopRequest): Promise<ToolLoopResponse> {
  const latest = request.messages[request.messages.length - 1];
  const message = typeof latest?.content === "string" ? latest.content : "";
  const chosen = chooseTool(message, request.tools);
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  };
  if (!chosen) {
    return {
      answer: "I don't have that tool wired yet.",
      sources: [],
      usage,
      raw: { local: true },
      failureReason: "no_tool_selected",
      toolRuns: []
    };
  }
  const toolResult = await chosen.tool.handler(request.tenant, chosen.args);
  return {
    answer: summarizeResult(chosen.tool.name, toolResult.result),
    sources: toolResult.sources,
    usage,
    raw: { local: true },
    toolRuns: [{ name: chosen.tool.name, result: toolResult.result, sources: toolResult.sources }]
  };
}

function gatewayForEnv(input: NexiMessageInput): (request: ToolLoopRequest) => Promise<ToolLoopResponse> {
  if (input.gateway) {
    return input.gateway;
  }
  if (input.env?.NEXI_LOCAL_FAKE_GATEWAY === "true") {
    return runExplicitLocalToolLoop;
  }
  return runNexiToolLoop;
}

export async function answerNexiMessage(input: NexiMessageInput): Promise<NexiMessageResult> {
  const history = await input.repository.loadHistory(input.tenant.id, 8);
  const gateway = gatewayForEnv(input);
  try {
    const result = await gateway({
      tenant: input.tenant,
      system: buildNexiSystemPrompt(input.tenant),
      messages: [...history, { role: "user", content: input.message }],
      tools: input.tools,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      usageLog: input.usageLog,
      env: input.env
    });
    const saved = await input.repository.saveConversation({
      tenantId: input.tenant.id,
      userText: input.message,
      assistantText: result.answer,
      sources: result.sources
    });
    let failureId: string | undefined;
    if (result.failureReason) {
      const failure = await input.repository.saveFailure({
        tenantId: input.tenant.id,
        op: "message",
        question: input.message,
        reason: result.failureReason,
        sources: result.sources
      });
      failureId = failure.id;
    }
    return {
      answer: result.answer,
      sources: result.sources,
      conversationId: saved.id,
      failureId,
      usage: result.usage,
      toolRuns: result.toolRuns
    };
  } catch (error) {
    const failure = await input.repository.saveFailure({
      tenantId: input.tenant.id,
      op: "message",
      question: input.message,
      reason: error instanceof Error ? error.message : "nexi_message_failed",
      sources: []
    });
    if (error instanceof RailError) {
      throw error;
    }
    throw new RailError(error instanceof Error ? error.message : "Nexi message failed.", {
      provider: "anthropic",
      op: "messages",
      status: 500,
      retryable: false,
      cause: failure.id
    });
  }
}
