import type { NexiTool, Source, Tenant, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import { enforceSources } from "./sourceCheck.js";

export const NEXI_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOOL_ITERATIONS = 6;

export interface AnthropicUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface UsageLogWriter {
  write(record: UsageLogRecord): Promise<void>;
}

export type GatewayMessageContent = string | Array<Record<string, unknown>>;

export interface GatewayMessage {
  role: "user" | "assistant";
  content: GatewayMessageContent;
}

export interface GatewayToolDefinition {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface GatewayRequest {
  tenantId: string;
  system: string;
  messages: GatewayMessage[];
  tools?: GatewayToolDefinition[];
  maxTokens?: number;
  routeActionName: string;
  taskType: string;
  sources: Source[];
  usageLog?: UsageLogWriter | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
}

export interface GatewayResponse {
  answer: string;
  sources: Source[];
  usage: UsageLogRecord["usage"];
  raw: unknown;
  failureReason?: string | undefined;
}

export interface ToolLoopRequest {
  tenant: Tenant;
  system: string;
  messages: GatewayMessage[];
  tools: NexiTool[];
  maxTokens?: number;
  routeActionName: string;
  taskType: string;
  usageLog?: UsageLogWriter | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
  maxToolIterations?: number | undefined;
}

export interface ToolRunTrace {
  name: string;
  sources: Source[];
  result: unknown;
}

export interface ToolLoopResponse extends GatewayResponse {
  toolRuns: ToolRunTrace[];
}

interface AnthropicTextBlock {
  type: "text";
  text?: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input?: unknown;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | Record<string, unknown>;

interface AnthropicPayload {
  content?: AnthropicContentBlock[];
  usage?: AnthropicUsagePayload;
}

interface AnthropicCallResult {
  payload: AnthropicPayload;
  usage: UsageLogRecord["usage"];
  answer: string;
  content: AnthropicContentBlock[];
  latencyMs: number;
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function addUsage(left: UsageLogRecord["usage"], right: UsageLogRecord["usage"]): UsageLogRecord["usage"] {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheCreationInputTokens: left.cacheCreationInputTokens + right.cacheCreationInputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
    totalTokens: left.totalTokens + right.totalTokens
  };
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

function estimateCostUsd(usage: UsageLogRecord["usage"]): number {
  const input = usage.inputTokens * 3 / 1_000_000;
  const output = usage.outputTokens * 15 / 1_000_000;
  const cacheWrite = usage.cacheCreationInputTokens * 3.75 / 1_000_000;
  const cacheRead = usage.cacheReadInputTokens * 0.30 / 1_000_000;
  return Number((input + output + cacheWrite + cacheRead).toFixed(6));
}

function textFromContentBlocks(content: AnthropicContentBlock[] | undefined): string {
  return (content ?? [])
    .map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function payloadMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error && typeof record.error === "object" ? errorRecord(record.error) : null;
    const message = error?.message ?? record.message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Anthropic request failed.";
}

function errorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" ? error as Record<string, unknown> : null;
}

function isPayload(value: unknown): value is AnthropicPayload {
  return Boolean(value && typeof value === "object");
}

async function writeUsageRecord(input: {
  tenantId: string;
  routeActionName: string;
  taskType: string;
  usage: UsageLogRecord["usage"];
  ok: boolean;
  errorSummary: string;
  usageLog?: UsageLogWriter | undefined;
}): Promise<void> {
  await input.usageLog?.write({
    tenantId: input.tenantId,
    provider: "anthropic",
    model: NEXI_ANTHROPIC_MODEL,
    routeActionName: input.routeActionName,
    taskType: input.taskType,
    usage: input.usage,
    estimatedCostUsd: estimateCostUsd(input.usage),
    ok: input.ok,
    errorSummary: input.errorSummary,
    createdAt: new Date().toISOString()
  });
}

async function sendAnthropicRequest(input: {
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
  system: string;
  messages: GatewayMessage[];
  tools?: GatewayToolDefinition[] | undefined;
  maxTokens?: number | undefined;
}): Promise<AnthropicCallResult> {
  const env = input.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new RailError("ANTHROPIC_API_KEY is not configured.", { provider: "anthropic", op: "messages", status: 400 });
  }

  const body = {
    model: NEXI_ANTHROPIC_MODEL,
    max_tokens: input.maxTokens ?? 1200,
    system: [
      {
        type: "text",
        text: input.system,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: input.messages,
    tools: input.tools ?? []
  };

  const startedAt = Date.now();
  const response = await (input.fetchFn ?? fetch)(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  const parsedPayload = isPayload(payload) ? payload : {};
  const usage = normalizeUsage(parsedPayload.usage);

  if (!response.ok) {
    throw new RailError(payloadMessage(payload), {
      provider: "anthropic",
      op: "messages",
      status: response.status,
      retryable: response.status >= 500
    });
  }

  return {
    payload: parsedPayload,
    usage,
    answer: textFromContentBlocks(parsedPayload.content),
    content: parsedPayload.content ?? [],
    latencyMs: Date.now() - startedAt
  };
}

function toolDefinition(tool: NexiTool): GatewayToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputJsonSchema ?? {
      type: "object",
      additionalProperties: true
    }
  };
}

function latestUserText(messages: GatewayMessage[]): string {
  for (const message of [...messages].reverse()) {
    if (message.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function todayWindow(): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function photoQueryFromText(text: string): string {
  const normalized = text
    .replace(/\buse\s+getPhotos\b.*$/i, "")
    .replace(/\binclude\s+sources\b.*$/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  const match = normalized.match(/\b(?:photos?|pictures?|images?)\s+(?:for|of)\s+(.+)$/i);
  return (match?.[1] ?? normalized).replace(/[?.!]+$/g, "").trim();
}

function entityQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const matches = [...normalized.matchAll(
    /\b(?:for|of|at)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  const candidate = matches.at(-1)?.[1] ?? "";
  return candidate
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToolInput(toolName: string, input: unknown, messages: GatewayMessage[]): unknown {
  const record = input && typeof input === "object" && !Array.isArray(input) ? { ...input as Record<string, unknown> } : {};
  const userText = latestUserText(messages);
  if (toolName === "getSchedule") {
    const fallback = todayWindow();
    record.from ??= fallback.from;
    record.to ??= fallback.to;
  }
  if (toolName === "getPhotos" && !record.projectQuery) {
    record.projectQuery = photoQueryFromText(userText);
  }
  if (toolName === "getDocuments") {
    if (!record.projectQuery) {
      record.projectQuery = entityQueryFromText(userText) || photoQueryFromText(userText);
    }
    if (!record.question) {
      record.question = userText;
    }
  }
  if (toolName === "getJobDetail" && !record.nameQuery && !record.id) {
    record.nameQuery = userText;
  }
  if (toolName === "lookupSiteJobBlueprintField" && !record.field && /gallon/i.test(userText)) {
    record.field = "poolGallons";
  }
  if (toolName === "lookupSiteJobBlueprintField" && !record.requestedEntity) {
    const requestedEntity = entityQueryFromText(userText);
    if (requestedEntity) {
      record.requestedEntity = requestedEntity;
    }
  }
  return record;
}

function deterministicToolName(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>): string | null {
  const lower = latestUserText(messages).toLowerCase();
  if ((lower.includes("photo") || lower.includes("picture") || lower.includes("image")) && toolsByName.has("getPhotos")) {
    return "getPhotos";
  }
  if (
    toolsByName.has("getDocuments")
    && (
      lower.includes("report")
      || lower.includes("document")
      || lower.includes("checklist")
      || lower.includes("finding")
      || lower.includes("result")
      || lower.includes("issue")
      || lower.includes("leak detection")
    )
  ) {
    return "getDocuments";
  }
  if (lower.includes("gallon") && toolsByName.has("lookupSiteJobBlueprintField")) {
    return "lookupSiteJobBlueprintField";
  }
  if ((lower.includes("schedule") || lower.includes("today")) && toolsByName.has("getSchedule")) {
    return "getSchedule";
  }
  return null;
}

async function runDeterministicTool(input: {
  tenant: Tenant;
  messages: GatewayMessage[];
  toolsByName: Map<string, NexiTool>;
}): Promise<ToolRunTrace | null> {
  const toolName = deterministicToolName(input.messages, input.toolsByName);
  if (!toolName) {
    return null;
  }
  const tool = input.toolsByName.get(toolName);
  if (!tool) {
    return null;
  }
  const args = tool.inputSchema.parse(normalizeToolInput(tool.name, {}, input.messages));
  const result = await tool.handler(input.tenant, args);
  return { name: tool.name, result: result.result, sources: result.sources };
}

function toolUsesFromContent(content: AnthropicContentBlock[]): AnthropicToolUseBlock[] {
  return content.filter((block): block is AnthropicToolUseBlock =>
    block.type === "tool_use"
      && typeof (block as Record<string, unknown>).id === "string"
      && typeof (block as Record<string, unknown>).name === "string"
  );
}

function toolResultContent(result: unknown): string {
  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({ error: "Tool result could not be serialized." });
  }
}

export async function callNexiGateway(request: GatewayRequest): Promise<GatewayResponse> {
  let call: AnthropicCallResult;
  try {
    call = await sendAnthropicRequest(request);
  } catch (error) {
    const usage = emptyUsage();
    await writeUsageRecord({
      tenantId: request.tenantId,
      routeActionName: request.routeActionName,
      taskType: request.taskType,
      usage,
      ok: false,
      errorSummary: error instanceof Error ? error.message : "Anthropic request failed.",
      usageLog: request.usageLog
    });
    throw error;
  }

  const sourceCheck = enforceSources(call.answer, request.sources, latestUserText(request.messages));
  await writeUsageRecord({
    tenantId: request.tenantId,
    routeActionName: request.routeActionName,
    taskType: request.taskType,
    usage: call.usage,
    ok: sourceCheck.ok,
    errorSummary: sourceCheck.failureReason ?? "",
    usageLog: request.usageLog
  });

  return {
    answer: sourceCheck.answer,
    sources: request.sources,
    usage: call.usage,
    raw: { payload: call.payload, latencyMs: call.latencyMs },
    failureReason: sourceCheck.failureReason
  };
}

export async function runNexiToolLoop(request: ToolLoopRequest): Promise<ToolLoopResponse> {
  const messages: GatewayMessage[] = [...request.messages];
  const toolsByName = new Map(request.tools.map((tool) => [tool.name, tool]));
  const toolDefinitions = request.tools.map(toolDefinition);
  let sources: Source[] = [];
  let totalUsage = emptyUsage();
  const toolRuns: ToolRunTrace[] = [];
  const rawIterations: unknown[] = [];
  const maxToolIterations = request.maxToolIterations ?? MAX_TOOL_ITERATIONS;
  const deterministicRun = await runDeterministicTool({ tenant: request.tenant, messages, toolsByName });
  if (deterministicRun) {
    sources = [...sources, ...deterministicRun.sources];
    toolRuns.push(deterministicRun);
    messages.push({
      role: "assistant",
      content: `I found verified ${deterministicRun.name} source data and will use it for the final answer.`
    });
    messages.push({
      role: "user",
      content: [
        `Verified ${deterministicRun.name} result:`,
        toolResultContent(deterministicRun.result),
        "Answer the original user request using only this verified result and keep the source labels attached in the API response."
      ].join("\n")
    });
  }

  for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
    let call: AnthropicCallResult;
    try {
      call = await sendAnthropicRequest({
        env: request.env,
        fetchFn: request.fetchFn,
        system: request.system,
        messages,
        tools: deterministicRun ? [] : toolDefinitions,
        maxTokens: request.maxTokens
      });
    } catch (error) {
      const usage = emptyUsage();
      await writeUsageRecord({
        tenantId: request.tenant.id,
        routeActionName: request.routeActionName,
        taskType: request.taskType,
        usage,
        ok: false,
        errorSummary: error instanceof Error ? error.message : "Anthropic request failed.",
        usageLog: request.usageLog
      });
      throw error;
    }

    totalUsage = addUsage(totalUsage, call.usage);
    rawIterations.push({ payload: call.payload, latencyMs: call.latencyMs });
    const toolUses = toolUsesFromContent(call.content);

    if (toolUses.length === 0) {
      const sourceCheck = enforceSources(call.answer, sources, latestUserText(request.messages));
      await writeUsageRecord({
        tenantId: request.tenant.id,
        routeActionName: request.routeActionName,
        taskType: request.taskType,
        usage: call.usage,
        ok: sourceCheck.ok,
        errorSummary: sourceCheck.failureReason ?? "",
        usageLog: request.usageLog
      });
      return {
        answer: sourceCheck.answer,
        sources,
        usage: totalUsage,
        raw: { iterations: rawIterations },
        failureReason: sourceCheck.failureReason,
        toolRuns
      };
    }

    await writeUsageRecord({
      tenantId: request.tenant.id,
      routeActionName: request.routeActionName,
      taskType: request.taskType,
      usage: call.usage,
      ok: true,
      errorSummary: "",
      usageLog: request.usageLog
    });

    messages.push({ role: "assistant", content: call.content as Array<Record<string, unknown>> });
    const toolResults: Record<string, unknown>[] = [];

    for (const toolUse of toolUses) {
      const tool = toolsByName.get(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Unknown tool: ${toolUse.name}`
        });
        continue;
      }
      const args = tool.inputSchema.parse(normalizeToolInput(toolUse.name, toolUse.input, messages));
      const result = await tool.handler(request.tenant, args);
      sources = [...sources, ...result.sources];
      toolRuns.push({ name: tool.name, result: result.result, sources: result.sources });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: toolResultContent(result.result)
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  const answer = "I don't have that yet; the tool loop reached its safety limit.";
  return {
    answer,
    sources,
    usage: totalUsage,
    raw: { iterations: rawIterations },
    failureReason: "tool_iteration_limit_exceeded",
    toolRuns
  };
}
