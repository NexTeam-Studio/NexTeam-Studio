import type { NexiTool, Source, Tenant, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import { z } from "zod";
import { enforceSources, promptIsMetaOrFeedback } from "./sourceCheck.js";

export const NEXI_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOOL_ITERATIONS = 6;

/**
 * Claude-first keeps ordinary Nexi conversation in the model's reasoning loop.
 * The older deterministic parser remains available as an explicit offline
 * fallback, but must not decide the meaning of a live user's words first.
 */
function usesClaudeFirstRouting(env: NodeJS.ProcessEnv | undefined): boolean {
  const routingMode = env?.NEXI_ROUTING_MODE?.trim().toLowerCase();
  return routingMode === "claude_first" || routingMode === "claude-first";
}

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
  actorDisplayName?: string | undefined;
  requestorEmail?: string | undefined;
  requestorPhones?: string[] | undefined;
  requestorOrigin?: string | undefined;
  pendingApproval?: PendingApprovalContext | null | undefined;
  cachedToolRuns?: ToolRunTrace[] | undefined;
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
  /** Tool arguments are retained for tenant-scoped audit and regression evidence. */
  input?: unknown;
  sources: Source[];
  result: unknown;
}

export interface PendingApprovalContext {
  approvalId: string;
  awaitingChanges: boolean;
  revisableClientCreate: boolean;
  revisableQuoteCreate: boolean;
  revisableJobCreate: boolean;
  revisableJobAction: boolean;
  revisableJobVisitSeries: boolean;
  revisableVisitShift: boolean;
  revisableLedgerAction: boolean;
  revisableInvoiceCompose: boolean;
  revisableInvoiceSend: boolean;
  revisableCollectPayment: boolean;
  revisableReceiptReview: boolean;
  revisableContentDraft: boolean;
}

export interface ToolLoopResponse extends GatewayResponse {
  toolRuns: ToolRunTrace[];
  pendingApproval?: PendingApprovalContext | null;
}

const createClientExtractionSchema = z.object({
  name: z.string().trim().default(""),
  address: z.string().trim().optional(),
  emails: z.array(z.string().trim()).default([]),
  phones: z.array(z.string().trim()).default([]),
  consent: z.object({
    email: z.boolean().default(false),
    sms: z.boolean().default(false)
  }).default({ email: false, sms: false })
});

export type CreateClientExtraction = z.infer<typeof createClientExtractionSchema>;

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
  // A 429/5xx is a temporary provider condition, not a user-facing Nexi
  // failure. Retry a small, bounded number of times with backoff; never retry
  // authentication, validation, or other permanent errors.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await (input.fetchFn ?? fetch)(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      const networkRetryable = error instanceof TypeError && /fetch failed/i.test(error.message);
      if (!networkRetryable || attempt === maxAttempts) {
        throw new RailError(error instanceof Error ? error.message : "Anthropic request failed.", {
          provider: "anthropic",
          op: "messages",
          status: 503,
          retryable: networkRetryable
        });
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
      continue;
    }
    const payload = await readJson(response);
    const parsedPayload = isPayload(payload) ? payload : {};
    const usage = normalizeUsage(parsedPayload.usage);

    if (response.ok) {
      return {
        payload: parsedPayload,
        usage,
        answer: textFromContentBlocks(parsedPayload.content),
        content: parsedPayload.content ?? [],
        latencyMs: Date.now() - startedAt
      };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new RailError(payloadMessage(payload), {
        provider: "anthropic",
        op: "messages",
        status: response.status,
        retryable
      });
    }
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 5_000)
      : 250 * (2 ** (attempt - 1));
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  throw new RailError("Anthropic request retry limit reached.", { provider: "anthropic", op: "messages", status: 503, retryable: true });
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

const DEFAULT_TIME_ZONE = "America/New_York";
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};
const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
};
const MONTH_PATTERN = Object.keys(MONTH_INDEX).sort((left, right) => right.length - left.length).join("|");
const WEEKDAY_PATTERN = Object.keys(WEEKDAY_INDEX).join("|");

interface CalendarDate {
  year: number;
  monthIndex: number;
  day: number;
}

interface ZonedDateTimeParts extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

function safeTimeZone(timeZone?: string): string {
  const candidate = timeZone?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(date: Date, timeZone?: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const year = readPart("year");
  const month = readPart("month");
  const day = readPart("day");
  if (!year || !month || !day) {
    return {
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }
  return {
    year,
    monthIndex: month - 1,
    day,
    hour: readPart("hour"),
    minute: readPart("minute"),
    second: readPart("second")
  };
}

function timeZoneOffsetMs(date: Date, timeZone?: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.monthIndex, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(parts: CalendarDate, timeZone?: string): Date {
  const guess = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day, 0, 0, 0, 0));
  const first = new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
  return new Date(guess.getTime() - timeZoneOffsetMs(first, timeZone));
}

function normalizeCalendarDate(year: number, monthIndex: number, day: number): CalendarDate {
  const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth(), day: date.getUTCDate() };
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  const leftValue = Date.UTC(left.year, left.monthIndex, left.day);
  const rightValue = Date.UTC(right.year, right.monthIndex, right.day);
  return leftValue - rightValue;
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return normalizeCalendarDate(date.year, date.monthIndex, date.day + days);
}

function dateWindow(date: CalendarDate, timeZone?: string): { from: string; to: string } {
  const start = zonedDateTimeToUtc(date, timeZone);
  const end = zonedDateTimeToUtc(addCalendarDays(date, 1), timeZone);
  return { from: start.toISOString(), to: end.toISOString() };
}

function todayWindow(timeZone?: string): { from: string; to: string } {
  const today = zonedParts(new Date(), timeZone);
  return dateWindow({ year: today.year, monthIndex: today.monthIndex, day: today.day }, timeZone);
}

function thisYearOrNext(monthIndex: number, day: number, timeZone?: string): CalendarDate {
  const today = zonedParts(new Date(), timeZone);
  let candidate = normalizeCalendarDate(today.year, monthIndex, day);
  if (compareCalendarDates(candidate, today) < 0) {
    candidate = normalizeCalendarDate(today.year + 1, monthIndex, day);
  }
  return candidate;
}

function parseYear(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const year = Number(raw);
  if (!Number.isInteger(year)) {
    return undefined;
  }
  return year < 100 ? 2000 + year : year;
}

export function scheduleWindowFromText(text: string, timeZone?: string): { from: string; to: string } | null {
  const lower = text.toLowerCase();
  if (/\btomorrow(?:'s|s)?\b/.test(lower)) {
    const today = zonedParts(new Date(), timeZone);
    return dateWindow(addCalendarDays(today, 1), timeZone);
  }
  if (/\b(?:today|tonight)(?:'s|s)?\b/.test(lower)) {
    return todayWindow(timeZone);
  }

  const namedMonth = lower.match(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{2,4}))?\\b`, "i"));
  if (namedMonth) {
    const monthName = namedMonth[1]?.replace(/\.$/, "").toLowerCase() ?? "";
    const monthIndex = MONTH_INDEX[monthName];
    const day = Number(namedMonth[2]);
    const year = parseYear(namedMonth[3]);
    if (monthIndex !== undefined && Number.isInteger(day) && day >= 1 && day <= 31) {
      const calendarDate = year === undefined ? thisYearOrNext(monthIndex, day, timeZone) : normalizeCalendarDate(year, monthIndex, day);
      return dateWindow(calendarDate, timeZone);
    }
  }

  const numericDate = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericDate) {
    const month = Number(numericDate[1]);
    const day = Number(numericDate[2]);
    const year = parseYear(numericDate[3]);
    if (Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const calendarDate = year === undefined ? thisYearOrNext(month - 1, day, timeZone) : normalizeCalendarDate(year, month - 1, day);
      return dateWindow(calendarDate, timeZone);
    }
  }

  const weekday = lower.match(new RegExp(`\\b(next\\s+)?(${WEEKDAY_PATTERN})\\b`, "i"));
  if (weekday) {
    const targetDay = WEEKDAY_INDEX[weekday[2]?.toLowerCase() ?? ""];
    if (targetDay !== undefined) {
      const today = zonedParts(new Date(), timeZone);
      const todayIndex = new Date(Date.UTC(today.year, today.monthIndex, today.day)).getUTCDay();
      let delta = (targetDay - todayIndex + 7) % 7;
      if (weekday[1] && delta === 0) {
        delta = 7;
      }
      return dateWindow(addCalendarDays(today, delta), timeZone);
    }
  }

  return null;
}

function textMessages(messages: GatewayMessage[]): string[] {
  return messages
    .map((message) => typeof message.content === "string" ? message.content : "")
    .filter(Boolean);
}

function previousUserText(messages: GatewayMessage[]): string {
  const previous = [...messages]
    .reverse()
    .slice(1)
    .find((message) => message.role === "user" && typeof message.content === "string");
  return typeof previous?.content === "string" ? previous.content : "";
}

function latestAssistantText(messages: GatewayMessage[]): string {
  for (const message of [...messages].reverse()) {
    if (message.role === "assistant" && typeof message.content === "string") {
      return message.content.trim();
    }
  }
  return "";
}

function looksLikeAssistantStatusText(text: string): boolean {
  return /^(?:I\s+(?:saved|drafted|couldn'?t|can't|don'?t|found|checked|logged|wrote)|Good\b|Noted\b|Uploaded\b)/i.test(text.trim())
    && text.length < 500;
}

function latestAuthoredAssistantDraftText(messages: GatewayMessage[]): string {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant" || typeof message.content !== "string") {
      continue;
    }
    const text = message.content.trim();
    if (!text || looksLikeAssistantStatusText(text)) {
      continue;
    }
    if (/^#{1,6}\s+\S+/m.test(text) || text.length >= 120) {
      return text;
    }
  }
  return latestAssistantText(messages);
}

function scheduleWindowFromConversation(messages: GatewayMessage[], timeZone?: string): { from: string; to: string } | null {
  for (const text of [...textMessages(messages)].reverse()) {
    const window = scheduleWindowFromText(text, timeZone);
    if (window) {
      return window;
    }
  }
  return null;
}

function photoQueryFromText(text: string): string {
  const normalized = text
    .replace(/\buse\s+getPhotos\b.*$/i, "")
    .replace(/\binclude\s+sources\b.*$/i, "")
    .replace(/^\s*(?:please\s+)?(?:show|find|get|pull|open)\s+(?:me\s+)?/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  const match = normalized.match(/\b(?:photos?|pictures?|images?)\s+(?:for|of)\s+(.+)$/i);
  const trailingMatch = normalized.match(/^(?:the\s+)?(.+?)\s+(?:photos?|pictures?|images?)$/i);
  return (match?.[1] ?? trailingMatch?.[1] ?? normalized)
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function entityQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const matches = [...normalized.matchAll(
    /\b(?:for|of|at|on)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  const candidate = matches.at(-1)?.[1] ?? "";
  return candidate
    .replace(/'s\b/gi, "")
    .replace(/\b(?:is|was|has)\b.*$/i, "")
    .replace(/^(?:file|record|profile|account)\s+for\s+/i, "")
    .replace(/\b(?:right\s+now|currently|now)\b.*$/i, "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entityQueryFromMessages(messages: GatewayMessage[], options: { skipLatest?: boolean } = {}): string {
  const sourceMessages = options.skipLatest ? messages.slice(0, -1) : messages;
  for (const message of [...sourceMessages].reverse()) {
    if (typeof message.content !== "string") {
      continue;
    }
    const candidates = [
      clientLookupQueryFromText(message.content),
      entityQueryFromText(message.content),
      /\b(?:photos?|pictures?|images?)\b/i.test(message.content) ? photoQueryFromText(message.content) : "",
      namedEntityFromText(message.content)
    ];
    for (const entity of candidates) {
      if (entity && !looksLikeGenericEntityCandidate(entity)) {
        return entity;
      }
    }
  }
  return "";
}

function clientEntityFromPreviousUserMessages(messages: GatewayMessage[]): string {
  for (const message of [...messages.slice(0, -1)].reverse()) {
    if (message.role !== "user" || typeof message.content !== "string") {
      continue;
    }
    const entity = clientLookupQueryFromText(message.content) || namedEntityFromText(message.content);
    if (entity && !looksLikeGenericEntityCandidate(entity)) {
      return entity;
    }
  }
  return "";
}

function bareEntityFromText(text: string): string {
  const trimmed = text.replace(/[?.!]+$/g, "").trim();
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(trimmed) ? trimmed : "";
}

function currentEntityFromText(text: string): string {
  return namedEntityFromText(text) || entityQueryFromText(text) || bareEntityFromText(text);
}

function clientLookupQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  // People commonly say "pull up Avery Smith" rather than "pull up client
  // Avery Smith".  The former must keep the name as the lookup target.
  const lookupMatch = normalized.match(/\b(?:look\s+up|lookup|find|show|check|get|pull\s+up|pull)\s+(?:the\s+)?(?:(?:client|customer)\s+)?(.+)$/i);
  const deleteMatch = normalized.match(/\b(?:delete|remove)\s+(?:the\s+)?(?:duplicate\s+)?(?:client\s+)?(.+)$/i);
  const clientFirstMatch = normalized.match(/\b(?:client|customer)\s+(.+)$/i);
  const forEntityMatch = normalized.match(/\bfor\s+(.+?)(?=,?\s+(?:what|where|who|when|which|how)\b|[?.!]|$)/i);
  const whereaboutsMatch = normalized.match(/\b(?:where\s+(?:does|is)|where's)\s+(.+?)\s+(?:live|located|stay|reside)\b/i);
  const whatIsFieldMatch = normalized.match(/\bwhat(?:'s|\s+is)\s+(.+?)\s+(?:phone(?:\s+number)?|telephone|mobile|cell|call|text|number|address|street|road|drive|lane|avenue|court|trail|way|circle|boulevard|highway|zip|postal|e-?mail(?:\s+address)?)\b/i);
  const possessiveMatch = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'?\s+(?:client|customer|job|jobs)\b/);
  const candidate = deleteMatch?.[1] ?? lookupMatch?.[1] ?? clientFirstMatch?.[1] ?? forEntityMatch?.[1] ?? whereaboutsMatch?.[1] ?? whatIsFieldMatch?.[1] ?? possessiveMatch?.[1] ?? currentEntityFromText(text);
  return candidate
    .replace(/\b([A-Za-z][A-Za-z' -]*)'s\b/g, "$1")
    // Assistant history can contain a prior factual sentence such as
    // "Catherine Sears is 864-617-1838".  If it is considered while resolving
    // a later possessive follow-up, retain the person—not the factual tail.
    .replace(/\s+(?:is|was)\s+(?:\(?\d[\d().\s-]*|no\s+(?:phone|email|address)\b).*$/i, "")
    .replace(/\b(?:in|from|on|with)\s+(?:jobber|crm|native|the\s+crm).*$/i, "")
    .replace(/\b(?:record|profile|file|account|jobs?)\b$/i, "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferConversationClientEntity(candidate: string, messages: GatewayMessage[]): string {
  const cleaned = candidate.trim();
  if (!cleaned) {
    return "";
  }
  const priorEntity = entityQueryFromMessages(messages, { skipLatest: true }) || entityQueryFromMessages(messages);
  if (!priorEntity) {
    return cleaned;
  }
  if (/^(?:he|him|his|she|her|hers|they|them|their|theirs)$/i.test(cleaned)) {
    return priorEntity;
  }
  const candidateTokens = normalizeIdentityText(cleaned).split(" ").filter(Boolean);
  const priorTokens = normalizeIdentityText(priorEntity).split(" ").filter(Boolean);
  if (
    candidateTokens.length === 1
    && priorTokens.length > 1
    && priorTokens[0] === candidateTokens[0]
  ) {
    return priorEntity;
  }
  return cleaned;
}

function hasClientPronounReference(text: string): boolean {
  return /\b(?:he|him|his|she|her|hers|they|them|their|theirs)\b/i.test(text);
}

function hasExplicitClientSubject(text: string): boolean {
  // Do not mistake the trailing "call them" in "What is Avery Smith's
  // number? I may call them" for a request to replace Avery Smith with a
  // previous conversation subject.
  return /\b[A-Z][A-Za-z0-9-]+(?:\s+[A-Z][A-Za-z0-9-]+)+\b/.test(text);
}

function jobLookupQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const whatHaveMatch = normalized.match(/\bwhat\s+(?:job|jobs|work|service)\s+(?:do|does)\s+(?:we|i)\s+have\s+(?:for|with)\s+(.+)$/i);
  const lookupMatch = normalized.match(/\b(?:look\s+up|lookup|find|show|check|get|pull)\s+(?:the\s+)?(?:job|jobs|work|service)\s+(?:for\s+)?(.+)$/i);
  const jobForMatch = normalized.match(/\b(?:job|jobs|work|service)\s+(?:record|profile|file|detail|details)?\s*(?:for|with)\s+(.+)$/i);
  const candidate = whatHaveMatch?.[1] ?? lookupMatch?.[1] ?? jobForMatch?.[1] ?? "";
  return candidate
    .replace(/\b(?:in|from|on|with)\s+(?:jobber|crm|native|the\s+crm).*$/i, "")
    .replace(/\b(?:job|jobs|record|profile|file|detail|details)\b$/i, "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namedEntityFromText(text: string): string {
  const didHaveMatch = text.match(/\b(?:did|does|do)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+have\b/);
  if (didHaveMatch?.[1]) {
    return didHaveMatch[1].trim();
  }
  const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:is|was|has|on|at|[-â€”])/);
  return match?.[1]?.trim() ?? "";
}

function looksLikeGenericEntityCandidate(entity: string): boolean {
  if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(entity.trim())) {
    return true;
  }
  return /^(?:companycam|company cam|jobber|reports?|documents?|checklists?|photos?|pictures?|images?|answer|correct answer)$/i.test(entity.trim());
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && !value.trim()) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function fieldRecordsFromToolResult(result: unknown): Array<Record<string, unknown>> {
  const record = objectRecord(result);
  if (!record) {
    return [];
  }
  const fields: Array<Record<string, unknown>> = [];
  const directFields = objectRecord(record.fields);
  if (directFields) {
    fields.push(directFields);
  }
  for (const report of Array.isArray(record.reports) ? record.reports : []) {
    const reportFields = objectRecord(objectRecord(report)?.fields);
    if (reportFields) {
      fields.push(reportFields);
    }
  }
  for (const suggestedSiteJobBlueprint of Array.isArray(record.suggestedSiteJobBlueprints) ? record.suggestedSiteJobBlueprints : []) {
    const siteJobBlueprintFields = objectRecord(objectRecord(suggestedSiteJobBlueprint)?.fields);
    if (siteJobBlueprintFields) {
      fields.push(siteJobBlueprintFields);
    }
  }
  return fields;
}

function fieldValueFromPriorRuns(priorRuns: ToolRunTrace[], names: string[]): unknown {
  for (const run of [...priorRuns].reverse()) {
    for (const fields of fieldRecordsFromToolResult(run.result)) {
      for (const name of names) {
        if (fields[name] !== undefined) {
          return fields[name];
        }
      }
      const poolSpaCounts = stringValue(fields.poolSpaCountsJson);
      if (poolSpaCounts) {
        try {
          const parsed = objectRecord(JSON.parse(poolSpaCounts));
          for (const name of names) {
            if (parsed?.[name] !== undefined) {
              return parsed[name];
            }
          }
        } catch {
          // Ignore old malformed extraction blobs; the caller will use another field.
        }
      }
    }
  }
  return undefined;
}

function jobAddressFromPriorRuns(priorRuns: ToolRunTrace[]): string | undefined {
  const reportAddress = stringValue(fieldValueFromPriorRuns(priorRuns, ["projectAddress", "address"]));
  if (reportAddress) {
    return reportAddress;
  }
  for (const run of [...priorRuns].reverse()) {
    const job = objectRecord(objectRecord(run.result)?.job);
    const direct = stringValue(job?.address) ?? stringValue(job?.streetAddress) ?? stringValue(job?.serviceAddress);
    if (direct) {
      return direct;
    }
    const address = objectRecord(job?.address);
    if (address) {
      const joined = [
        address.street1,
        address.city,
        address.province,
        address.state,
        address.postalCode,
        address.zip
      ].map(stringValue).filter(Boolean).join(", ");
      if (joined) {
        return joined;
      }
    }
  }
  return undefined;
}

function siteJobBlueprintFieldFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\bspa\b/.test(lower) && /\bmain\s+drains?\b/.test(lower)) return "spaMainDrains";
  if (/\bcatch\s+basin\b/.test(lower) && /\bmain\s+drains?\b/.test(lower)) return "catchBasinMainDrains";
  if (/\bpool\b/.test(lower) && /\bmain\s+drains?\b/.test(lower)) return "poolMainDrains";
  if (/\bmain\s+drains?\b/.test(lower)) return "poolMainDrains";
  if (/\bspa\b/.test(lower) && /\bskimmers?\b/.test(lower)) return "spaSkimmers";
  if (/\bpool\b/.test(lower) && /\bskimmers?\b/.test(lower)) return "poolSkimmers";
  if (/\breturns?\b/.test(lower) && /\bspa\b/.test(lower)) return lower.includes("floor") ? "spaFloorReturns" : "spaWallReturns";
  if (/\breturns?\b/.test(lower) && /\bpool\b/.test(lower)) return lower.includes("floor") ? "poolFloorReturns" : "poolWallReturns";
  if (/\bgallons?\b/.test(lower)) return "poolGallons";
  if (/\bsq(?:uare)?\s*ft|square footage|surface area|ft2|ftÂ²/.test(lower)) return "surfaceAreaSqFt";
  return undefined;
}

function weatherLocationFromText(text: string): string | undefined {
  const match = text.match(/\b(?:current\s+)?(?:weather|temp|temperature)\s+(?:right\s+now\s+)?(?:in|at|for)\s+(.+?)(?:[?.!]|$)/i);
  const location = match?.[1]?.replace(/\bcurrent\b/gi, "").trim();
  if (!location) {
    return undefined;
  }
  if (/^fair\s+play$/i.test(location)) {
    return "Fair Play, SC";
  }
  return location;
}

function looksLikeStreetAddress(text: string): boolean {
  return /^\s*\d{1,6}\s+[a-z0-9 .'-]+(?:road|rd|street|st|lane|ln|drive|dr|avenue|ave|court|ct|circle|cir|way|trail|trl|highway|hwy)\b/i.test(text);
}

function looksLikeEvaporationAddress(text: string): boolean {
  return looksLikeStreetAddress(text)
    || /\b\d{5}(?:-\d{4})?\b/.test(text)
    || /,\s*[A-Z]{2}\b/.test(text);
}

function distanceDestinationFromText(text: string): string | undefined {
  if (/\b(?:today'?s?\s+pool|today'?s?\s+job|today'?s?\s+visit|current\s+job|current\s+pool|that\s+pool|that\s+job|it)\b/i.test(text)) {
    return undefined;
  }
  const direct = text.match(
    /\b(?:how\s+far(?:\s+is)?|distance\s+(?:to|for)|drive\s+time\s+(?:to|for)|travel\s+time\s+(?:to|for)|miles?\s+(?:to|from))\s+(.+?)(?=\s+from\s+(?:my\s+house|the\s+shop|here)|[?.!]|$)/i
  )?.[1]?.trim();
  if (direct) {
    return direct.replace(/^is\s+/i, "").trim();
  }
  return looksLikeStreetAddress(text) ? text.trim() : undefined;
}

function distanceOriginFromText(text: string): string | undefined {
  const match = text.match(/\bfrom\s+(.+?)(?:[?.!]|$)/i)?.[1]?.trim();
  if (!match || /^(?:my\s+house|the\s+shop|here)$/i.test(match)) {
    return undefined;
  }
  return match;
}

function messageTargetsRequestor(text: string): boolean {
  return /\b(?:to|for|send|share|email|mail|text|sms|call|draft|compose|write)\s+me\b/i.test(text)
    || /\bto\s+my\s+(?:email|mail|phone|cell|mobile|text|sms)\b/i.test(text)
    || /\b(?:my\s+(?:house|home)|from\s+here|from\s+me)\b/i.test(text);
}

function requestorEmailForText(text: string, requestorEmail?: string): string | undefined {
  return firstEmailAddress(text) ?? (requestorEmail && messageTargetsRequestor(text) ? requestorEmail : undefined);
}

function requestorPhoneForText(text: string, requestorPhones?: string[]): string | undefined {
  const explicitPhone = firstPhoneNumber(text);
  if (explicitPhone) {
    return explicitPhone;
  }
  if (!messageTargetsRequestor(text)) {
    return undefined;
  }
  return requestorPhones?.map((value) => value.replace(/[^\d+]/g, "").trim()).find(Boolean);
}

function requestorOriginForText(text: string, requestorOrigin?: string): string | undefined {
  if (!requestorOrigin) {
    return undefined;
  }
  return /\b(?:from\s+here|from\s+my\s+(?:house|home)|from\s+me)\b/i.test(text)
    ? requestorOrigin
    : undefined;
}

function hasCompleteEvaporationInput(input: Record<string, unknown>): boolean {
  return typeof input.address === "string"
    && numberValue(input.surfaceAreaFt2) !== undefined
    && numberValue(input.waterTempF) !== undefined;
}

async function normalizeToolInput(
  toolName: string,
  input: unknown,
  messages: GatewayMessage[],
  tenant?: Tenant | undefined,
  priorRuns: ToolRunTrace[] = [],
  pendingApprovalInput?: PendingApprovalContext | null,
  requestorContext?: Pick<ToolLoopRequest, "requestorEmail" | "requestorPhones" | "requestorOrigin">,
  options?: { env?: NodeJS.ProcessEnv | undefined; fetchFn?: typeof fetch | undefined }
): Promise<unknown> {
  const record = input && typeof input === "object" && !Array.isArray(input) ? { ...input as Record<string, unknown> } : {};
  const userText = latestUserText(messages);
  const lowerUserText = userText.toLowerCase();
  const correctionFollowUp = looksLikeCorrectionFollowUp(lowerUserText);
  const emailRef = emailRefFromText(userText);
  const approvalContext = pendingApprovalInput ?? approvalContextFromMessages(messages);
  if (toolName === "createClient") {
    const parsed = await extractCreateClientInput({
      text: userText,
      env: options?.env,
      fetchFn: options?.fetchFn
    });
    // Literal values in the user's message outrank incomplete or malformed
    // model tool arguments.  In particular, an empty array is a valid JS
    // value but is not evidence that the operator omitted a phone number.
    if (parsed.name) record.name = parsed.name;
    if (parsed.address) record.address = parsed.address;
    if (parsed.emails.length > 0) record.emails = parsed.emails;
    if (parsed.phones.length > 0) record.phones = parsed.phones;
    record.consent = parsed.consent;
  }
  if (toolName === "updateClient") {
    const parsed = clientUpdateInputFromText(userText, messages);
    record.clientQuery ??= parsed.clientQuery;
    // The approved client rail owns the detailed interpretation of an edit.
    // Preserve the user's literal request so it can apply a ZIP-only or other
    // focused correction without guessing at omitted client fields.
    record.changeRequest ??= userText;
    record.name ??= parsed.name;
    record.address ??= parsed.address;
    record.postalCode ??= parsed.postalCode;
    record.emails ??= parsed.emails;
    record.phones ??= parsed.phones;
  }
  if (toolName === "deleteClient") {
    const named = userText.match(/\b(?:delete|remove)\s+(?:the\s+)?(?:duplicate\s+)?(?:client\s+)?([A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){1,5})\b/i)?.[1]
      || userText.match(/\b(?:client|customer)\s+([A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){1,5})\b/i)?.[1]
      || clientLookupQueryFromText(userText)
      || entityQueryFromMessages(messages, { skipLatest: true });
    record.clientQuery ??= named.trim();
  }
  if (toolName === "createQuote") {
    const parsed = createQuoteInputFromText(userText);
    record.clientQuery ??= parsed.clientQuery;
    record.title ??= parsed.title;
    record.items ??= parsed.items;
    record.approvalRules ??= parsed.approvalRules;
  }
  if (toolName === "createJob") {
    const parsed = createJobInputFromText(userText);
    record.clientQuery ??= parsed.clientQuery;
    record.title ??= parsed.title;
  }
  if (toolName === "approvePendingApproval" || toolName === "rejectPendingApproval") {
    record.approvalId ??= approvalContext?.approvalId;
  }
  if (toolName === "revisePendingClientCreateApproval") {
    record.approvalId ??= approvalContext?.approvalId;
    record.changeRequest ??= userText;
  }
  if (toolName === "revisePendingQuoteCreateApproval") {
    record.approvalId ??= approvalContext?.approvalId;
    record.changeRequest ??= userText;
  }
  if (toolName === "revisePendingJobCreateApproval" || toolName === "revisePendingJobActionApproval") {
    record.approvalId ??= approvalContext?.approvalId;
    record.changeRequest ??= userText;
  }
  if (toolName === "revisePendingLedgerActionApproval") {
    record.approvalId ??= approvalContext?.approvalId;
    record.changeRequest ??= userText;
  }
  if (toolName === "listJobs" && !record.q) {
    record.q = entityQueryFromText(userText) || "";
  }
  if ((toolName === "listPayments" || toolName === "listDeposits" || toolName === "listRefunds" || toolName === "listCredits") && !record.q) {
    record.q = entityQueryFromText(userText) || "";
  }
  if (toolName === "getJobDetail") {
    record.jobId ??= userText.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    record.query ??= entityQueryFromText(userText) || userText;
  }
  if (toolName === "getPaymentDetail") {
    record.paymentId ??= userText.match(/\bpayment_[a-z0-9-]+\b/i)?.[0];
    record.query ??= entityQueryFromText(userText) || userText;
  }
  if (toolName === "queueJobAction") {
    record.jobId ??= userText.match(/\bjob_[a-z0-9-]+\b/i)?.[0];
    record.query ??= entityQueryFromText(userText) || userText;
    record.action ??= /\bclose\s+and\s+invoice\b/i.test(userText)
      ? "close_and_invoice"
      : /\bdismiss\b.*\breminder\b/i.test(userText) || /\barchive\b.*\bwithout\s+invoice\b/i.test(userText)
        ? "dismiss_invoice_reminder"
        : /\binvoice\b/i.test(userText) && !/\bclose\b/i.test(userText)
          ? "invoice"
          : "close";
  }
  if (toolName === "queueLedgerAction") {
    record.paymentId ??= userText.match(/\bpayment_[a-z0-9-]+\b/i)?.[0];
    record.invoiceId ??= userText.match(/\binvoice_[a-z0-9-]+\b/i)?.[0];
    record.query ??= entityQueryFromText(userText) || userText;
    record.action ??= /\brefund\b/i.test(userText)
      ? "refund_payment"
      : /\bbad debt\b/i.test(userText) || /\bwrite\s+off\b/i.test(userText)
        ? "mark_bad_debt"
        : "void_invoice";
    const amount = Number(userText.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? "");
    if (Number.isFinite(amount) && amount > 0) {
      record.amount ??= amount;
    }
    const reason = userText.match(/\breason\s*(?:is|=|:)\s*(.+)$/i)?.[1]?.trim()
      ?? userText.match(/\bbecause\s+(.+)$/i)?.[1]?.trim();
    if (reason) {
      record.reason ??= reason;
    }
  }
  if (toolName === "completeVisit") {
    record.visitId ??= userText.match(/\bvisit_[a-z0-9-]+\b/i)?.[0];
  }
  if (toolName === "startIntake") {
    const parsed = intakeStartInputFromText(userText);
    record.businessName ??= parsed.businessName;
    record.targetTenantId ??= parsed.targetTenantId;
    record.industryPack ??= parsed.industryPack;
    record.plan ??= parsed.plan;
  }
  if (toolName === "answerIntake") {
    const parsed = answerIntakeInputFromText(userText, priorRuns);
    record.sessionId ??= parsed.sessionId;
    record.field ??= parsed.field;
    record.value ??= parsed.value;
  }
  if (toolName === "finalizeIntake") {
    record.sessionId ??= intakeSessionIdFromText(userText) ?? intakeSessionIdFromPriorRuns(priorRuns);
  }
  if (toolName === "intakeStatus") {
    record.sessionId ??= intakeSessionIdFromText(userText) ?? intakeSessionIdFromPriorRuns(priorRuns);
  }
  if (toolName === "draftEmail") {
    const parsed = draftEmailInputFromText(userText, requestorContext?.requestorEmail);
    if (typeof record.to === "string") {
      record.to = [record.to];
    }
    if (typeof record.cc === "string") {
      record.cc = [record.cc];
    }
    if (typeof record.bcc === "string") {
      record.bcc = [record.bcc];
    }
    record.to ??= parsed.to;
    record.subject ??= parsed.subject;
    record.bodyText ??= parsed.bodyText;
  }
  if (toolName === "draftReportEmail") {
    const parsed = draftReportEmailInputFromText(userText);
    if (typeof record.to === "string") {
      record.to = [record.to];
    }
    record.to ??= parsed.to;
    record.clientName ??= parsed.clientName;
    record.reportTitle ??= parsed.reportTitle;
    record.bodyText ??= parsed.bodyText;
    record.findings ??= parsed.findings;
  }
  if (toolName === "approve") {
    record.draftId ??= contentDraftIdFromText(userText) ?? contentDraftIdFromPriorRuns(priorRuns);
  }
  if (toolName === "rejectContentDraft") {
    record.draftId ??= contentDraftIdFromText(userText) ?? contentDraftIdFromPriorRuns(priorRuns);
  }
  if (toolName === "queueFreeformContent") {
    const parsed = freeformContentInputFromConversation(messages);
    record.kind ??= parsed.kind;
    record.title ??= parsed.title;
    record.body ??= parsed.body;
    record.sourcePrompt ??= parsed.sourcePrompt;
  }
  if (toolName === "getEmailAttachment" && emailRef?.attachmentId) {
    return { ...record, mailbox: emailRef.mailbox, messageId: emailRef.messageId, attachmentId: emailRef.attachmentId };
  }
  if (toolName === "getEmailMessage" && emailRef) {
    return { ...record, mailbox: emailRef.mailbox, messageId: emailRef.messageId };
  }
  if (toolName === "getSchedule") {
    const traceable = scheduleWindowFromText(userText, tenant?.timezone)
      ?? (looksLikeScheduleFollowUp(userText) ? scheduleWindowFromConversation(messages, tenant?.timezone) : null);
    const fallback = traceable ?? scheduleWindowFromConversation(messages, tenant?.timezone) ?? todayWindow(tenant?.timezone);
    record.from = fallback.from;
    record.to = fallback.to;
  }
  if (toolName === "getPhotos" && !record.projectQuery) {
    record.projectQuery = correctionFollowUp
      ? entityQueryFromMessages(messages, { skipLatest: true })
      : currentEntityFromText(userText) || photoQueryFromText(userText) || entityQueryFromMessages(messages);
  }
  if (toolName === "getDocuments") {
    if (!record.projectQuery) {
      const currentEntity = currentEntityFromText(userText)
        || (/\b(?:photos?|pictures?|images?)\b/i.test(userText) ? photoQueryFromText(userText) : "");
      record.projectQuery = correctionFollowUp
        ? entityQueryFromMessages(messages, { skipLatest: true })
        : currentEntity || entityQueryFromMessages(messages, { skipLatest: true }) || entityQueryFromMessages(messages);
    }
    if (!record.question) {
      record.question = userText;
    }
  }
  if (toolName === "searchEmail" && !record.keywords) {
    const mailboxOnlyFollowUp = firstEmailAddress(userText) && recentUserTextMatches(messages, looksLikeEmailSearchQuestion);
    const entity = entityQueryFromText(userText) || entityQueryFromMessages(messages);
    if (mailboxOnlyFollowUp) {
      record.mailbox ??= mailboxAliasFromEmailAddress(firstEmailAddress(userText));
      record.keywords = previousUserText(messages) || entity || userText;
      return record;
    }
    record.keywords = looksLikePaymentStatusQuestion(lowerUserText)
      ? [entity, "paid payment receipt invoice zero balance"].filter(Boolean).join(" ")
      : userText;
  }
  if (toolName === "clientLookup") {
    const parsedUserQuery = clientLookupQueryFromText(userText);
    const pronounOnlyQuery = /^(?:he|him|his|she|her|hers|they|them|their|theirs)$/i.test(parsedUserQuery)
      || (hasClientPronounReference(userText) && !hasExplicitClientSubject(userText));
    // A pronoun is not a client lookup key.  Keep the person established in
    // the earlier turn instead of sending a literal search for "their".
    const conversationQuery = pronounOnlyQuery
      ? clientEntityFromPreviousUserMessages(messages)
      : entityQueryFromMessages(messages);
    const parsedQuery = (pronounOnlyQuery ? conversationQuery : parsedUserQuery) || conversationQuery || "";
    if (looksLikeClientListQuestion(lowerUserText)) {
      record.q = "";
    } else if (parsedQuery) {
      // Prefer the name parsed from the user's actual sentence over a model
      // argument that accidentally contains conversational filler such as
      // "I may need to call them".
      record.q = preferConversationClientEntity(parsedQuery, messages);
    } else if (typeof record.q !== "string" || !record.q.trim()) {
      record.q = "";
    }
  }
  if (toolName === "summarizeInbox" && !record.maxResults) {
    record.mailbox ??= mailboxAliasFromEmailAddress(firstEmailAddress(userText));
    if (/\bunread\b/i.test(userText)) {
      record.keywords ??= "is:unread -in:spam -in:trash -category:promotions -category:social";
    }
    record.maxResults = 10;
  }
  if (toolName === "triageInbox") {
    record.mailbox ??= mailboxAliasFromEmailAddress(firstEmailAddress(userText));
    record.date ??= new Date().toISOString();
    if (/\bunread\b/i.test(userText)) {
      record.keywords ??= "is:unread -in:spam -in:trash -category:promotions -category:social";
    }
    record.maxResults ??= 25;
  }
  if (toolName === "getCurrentTime") {
    record.timezone ??= tenant?.timezone;
  }
  if (toolName === "getCurrentWeather" && !record.location) {
    record.location = weatherLocationFromText(userText) || entityQueryFromText(userText) || "Fair Play, SC";
  }
  if (toolName === "getDistance") {
    const directDestination = distanceDestinationFromText(userText);
    const priorAddress = jobAddressFromPriorRuns(priorRuns);
    record.destination ??= directDestination && looksLikeStreetAddress(directDestination)
      ? directDestination
      : priorAddress ?? directDestination ?? entityQueryFromText(userText) ?? entityQueryFromMessages(messages);
    record.origin ??= distanceOriginFromText(userText) ?? requestorOriginForText(userText, requestorContext?.requestorOrigin);
  }
  if (toolName === "sendStatement" && !record.target) {
    record.target = requestorEmailForText(userText, requestorContext?.requestorEmail)
      ?? requestorPhoneForText(userText, requestorContext?.requestorPhones);
  }
  if (toolName === "queueInvoiceSend" && !record.target) {
    record.target = String(record.mode ?? "") === "sms"
      ? requestorPhoneForText(userText, requestorContext?.requestorPhones)
      : requestorEmailForText(userText, requestorContext?.requestorEmail);
  }
  if (toolName === "queueReceiptReviewSend") {
    if (!Array.isArray(record.emailRecipients)) {
      const email = requestorEmailForText(userText, requestorContext?.requestorEmail);
      if (email) {
        record.emailRecipients = [email];
      }
    }
    if (!Array.isArray(record.smsRecipients)) {
      const phone = requestorPhoneForText(userText, requestorContext?.requestorPhones);
      if (phone) {
        record.smsRecipients = [phone];
      }
    }
  }
  if (toolName === "draftCampaign") {
    record.templateId ??= "vgb-hotel-gm-outreach";
    record.audience ??= {
      channel: "email",
      tagsAny: ["test"],
      consentRequired: true,
      excludeSuppressed: true,
      maxResults: 2
    };
  }
  if (toolName === "draftReviewReply") {
    record.reviewId ??= reputationReviewIdFromText(userText) ?? reputationReviewIdFromPriorRuns(priorRuns);
  }
  if (toolName === "draftReviewRequest") {
    const recipient = firstEmailAddress(userText);
    if (recipient) {
      record.to ??= recipient;
    }
    record.invoiceId ??= invoiceIdFromText(userText) ?? "manual-review-request";
    record.clientName ??= reviewRequestClientFromText(userText) || entityQueryFromText(userText) || "client";
  }
  if (toolName === "draftGbpProfileSync") {
    record.locationId ??= "primary";
  }
  if (toolName === "rankSnapshot") {
    record.keywords ??= seoKeywordsFromText(userText);
    record.targetDomain ??= seoTargetDomainFromText(userText);
  }
  if (toolName === "auditSiteSeo") {
    record.slug ??= seoSiteSlugFromText(userText);
    if (/\b(?:fix|repair|queue|approve|approval)\b/i.test(userText)) {
      record.queueFix ??= true;
    }
    record.issueCode ??= seoIssueCodeFromText(userText);
  }
  if (toolName === "draftSeoArticleBrief") {
    const parsed = seoBriefInputFromText(userText);
    record.keyword ??= parsed.keyword;
    record.geo ??= parsed.geo;
    record.competitorUrl ??= parsed.competitorUrl;
  }
  if (toolName === "seoReport") {
    record.periodStart ??= dateRangeFromSeoReportText(userText)?.periodStart;
    record.periodEnd ??= dateRangeFromSeoReportText(userText)?.periodEnd;
  }
  if (toolName === "getJobDetail" && !record.nameQuery && !record.id) {
    const currentEntity = jobLookupQueryFromText(userText) || currentEntityFromText(userText);
    record.nameQuery = correctionFollowUp
      ? entityQueryFromMessages(messages, { skipLatest: true }) || userText
      : currentEntity || entityQueryFromMessages(messages, { skipLatest: true }) || entityQueryFromMessages(messages) || userText;
  }
  if (toolName === "lookupSiteJobBlueprintField" && !record.field) {
    record.field = siteJobBlueprintFieldFromText(userText);
  }
  if (toolName === "lookupSiteJobBlueprintField" && !record.requestedEntity) {
    const requestedEntity = currentEntityFromText(userText) || entityQueryFromMessages(messages, { skipLatest: true }) || entityQueryFromMessages(messages);
    if (requestedEntity) {
      record.requestedEntity = requestedEntity;
    }
  }
  if (toolName === "runEvaporation") {
    const parsed = evaporationInputFromText(userText);
    record.address ??= parsed.address;
    record.zip ??= parsed.zip;
    record.surfaceAreaFt2 ??= parsed.surfaceAreaFt2;
    record.waterTempF ??= parsed.waterTempF;
    record.observedLoss ??= parsed.observedLoss;
    record.windMphOverride ??= parsed.windMphOverride;
    record.clientName ??= currentEntityFromText(userText) || entityQueryFromMessages(messages);
    const priorAddress = jobAddressFromPriorRuns(priorRuns);
    if (priorAddress && (!stringValue(record.address) || !looksLikeEvaporationAddress(String(record.address)))) {
      record.address = priorAddress;
    }
    record.zip ??= fieldValueFromPriorRuns(priorRuns, ["evapZipCode"]);
    record.surfaceAreaFt2 ??= numberValue(fieldValueFromPriorRuns(priorRuns, ["evapSurfaceAreaSqFt", "surfaceAreaSqFt", "moasureAreaSqFt"]));
    record.waterTempF ??= numberValue(fieldValueFromPriorRuns(priorRuns, ["evapWaterTempF", "waterTempF"]));
    if (!record.observedLoss) {
      const observed = numberValue(fieldValueFromPriorRuns(priorRuns, ["observedDailyLossInchesPerDay", "reportedDailyLossInchesPerDay"]));
      if (observed !== undefined) {
        record.observedLoss = { inches: observed, observationDays: 1 };
      }
    }
  }
  return record;
}

function hasScheduleDateCue(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(?:today|tonight|tomorrow)(?:'s|s)?\b/.test(lower)
    || new RegExp(`\\b(?:next\\s+)?(?:${WEEKDAY_PATTERN})\\b`, "i").test(lower)
    || new RegExp(`\\b(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i").test(lower)
    || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(lower);
}

function looksLikeScheduleQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b(?:schedule|calendar|appointments?|visits?|booked|jobs?)\b/.test(lower)) {
    return true;
  }
  return hasScheduleDateCue(lower)
    && /\b(?:what(?:'s| is)\s+on|what\s+do\s+we\s+have|who\s+is\s+scheduled|where\s+(?:am|are)\s+(?:i|we)|anything\s+on)\b/.test(lower);
}

function looksLikeScheduleFollowUp(text: string): boolean {
  return /\b(?:eta|arrival|arrive|arrival\s+time|what\s+time|when\s+(?:is|are|do|does|will)|how\s+long)\b/i.test(text);
}

function uniqueToolNames(names: string[], toolsByName: Map<string, NexiTool>): string[] {
  return [...new Set(names)].filter((name) => toolsByName.has(name));
}

function looksLikeIssueQuestion(lower: string): boolean {
  return /\b(?:issue|issues|ssues|problem|finding|findings|found|result|results|leak detection)\b/.test(lower)
    || /\b(?:leak\s+report|report\s+(?:find|found|finding|findings)|what\s+did\s+.+\s+report\s+find)\b/.test(lower);
}

function looksLikeTechnicianQuestion(lower: string): boolean {
  return /\b(?:technicians?|techs?|assigned|who was there|who went|who did|who performed)\b/.test(lower);
}

function looksLikeJobDetailQuestion(lower: string): boolean {
  return /\b(?:address|completion|competion|completed|complete|close\s+out|closed?\s+out|service\s+(?:time|date|completion|competion|[a-z]+\s+(?:completion|competion))|arrival|arrived|onsite|on-site|water\s+temp|air\s+temp|daily\s+loss|bucket|measurements?|main\s+drains?|skimmers?|returns?|lights?|filtration|testing\s+procedures?)\b/.test(lower);
}

function looksLikeReportMeasurementQuestion(lower: string): boolean {
  return /\b(?:gallons per inch|square footage|sq ft|ft2|ftÃ‚Â²|total gallons|pool gallons|how many gallons|measurements?)\b/.test(lower);
}

function looksLikeSectionCountQuestion(lower: string): boolean {
  return /\b(?:main\s+drains?|skimmers?|wall\s+returns?|floor\s+returns?|cleaner\s+ports?|lights?)\b/.test(lower)
    && /\b(?:pool|spa|catch\s+basin|how many|counts?)\b/.test(lower);
}

function crossRailJobDetailToolsForQuestion(lower: string): string[] {
  if (looksLikeReportMeasurementQuestion(lower) || looksLikeSectionCountQuestion(lower)) {
    return ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"];
  }
  if (looksLikeTechnicianQuestion(lower)) {
    return ["getJobDetail", "getDocuments", "getPhotos"];
  }
  if (looksLikeIssueQuestion(lower) || looksLikeJobDetailQuestion(lower)) {
    return ["getJobDetail", "getDocuments"];
  }
  return [];
}

function looksLikeCorrectionFollowUp(lower: string): boolean {
  return /\b(?:where\s+is\s+the\s+answer|what\s+is\s+the\s+answer|correct\s+answer|i\s+corrected\s+you|you\s+should\s+have\s+(?:replied|answered)|find\s+it\s+then)\b/.test(lower)
    || (/\b(?:incorrect|wrong|correction|corrected)\b/.test(lower) && /\bcompany\s*cam\b/.test(lower));
}

function looksLikeInboxSummaryQuestion(lower: string): boolean {
  return /\b(?:emails?|mail|inbox)\b/.test(lower)
    && /\b(?:came in|received|today|this morning|this afternoon|summarize|summary|rundown|run\s*down|recap|what(?:'s| is) in|check\s+(?:my\s+|the\s+)?(?:inbox|mailbox)|unread)\b/.test(lower);
}

function looksLikeEmailSearchQuestion(lower: string): boolean {
  return /\b(?:emails?|mail|gmail|inbox|reply|replied|responded|sent)\b/.test(lower)
    || /\bsemrush\b/.test(lower)
    || /\bsite audit\b/.test(lower)
    || /\b(?:send|sent)\b.*\breport\b/.test(lower)
    || /\bmedallion\s+pool\s+company\b/.test(lower);
}

function looksLikeEmailDraftAction(lower: string): boolean {
  return /\b(?:send|draft|compose|write)\s+(?:an?\s+)?email\b/.test(lower)
    || /\b(?:send|draft|compose|write)\s+(?:me\s+)?(?:an?\s+)?email\s+(?:at|to)\s+[\w.+-]+@[\w.-]+\.\w+\b/.test(lower)
    || /\bemail\s+[\w.+-]+@[\w.-]+\.\w+\s+(?:saying|that|to say)\b/.test(lower);
}

function recentConversationMentionsContactCard(messages: GatewayMessage[]): boolean {
  return textMessages(messages)
    .slice(-6)
    .some((text) => /\b(?:contact\s+(?:card|info|information)|full\s+contact\s+card|client\s+details?)\b/i.test(text));
}

function looksLikeContactCardDeliveryRequest(lower: string, messages: GatewayMessage[]): boolean {
  const explicitRequest = /\b(?:email|text|send)\s+me\b/.test(lower)
    && /\b(?:contact\s+(?:card|info|information)|full\s+contact\s+card|client\s+details?)\b/.test(lower);
  const contextualFollowUp = /\b(?:email|text|send)\b/.test(lower)
    && /\b(?:it|that|them)\b/.test(lower)
    && /\b(?:me|instead)\b/.test(lower)
    && recentConversationMentionsContactCard(messages);
  return explicitRequest || contextualFollowUp;
}

function looksLikeReportPdfEmailRequest(lower: string): boolean {
  if (looksLikeEmailDraftAction(lower)) {
    return false;
  }
  const searchingExistingMail =
    /\b(?:did\s+i\s+send|check\s+(?:email|gmail|mail)|look\s+(?:in|through)\s+(?:email|gmail|mail|inbox)|mail\s*box|mailbox|inbox|receipt\s+in\s+(?:the\s+)?mail|report\s+(?:was\s+)?sent)\b/.test(lower);
  if (searchingExistingMail) {
    return false;
  }

  return /\b(?:email|send|draft|forward)\s+(?:me\s+|to\s+me\s+|[\w.+-]+@[\w.-]+\.\w+\s+)?(?:the\s+|all\s+|every\s+)?(?:[\w\s'-]+\s+)?(?:report|reports|pdf|pdfs)\b/.test(lower)
    || /\b(?:report|reports|pdf|pdfs)\b.*\b(?:email|send|draft|forward)\s+(?:it|them|to|me)\b/.test(lower);
}

function looksLikeEvaporationRunQuestion(lower: string): boolean {
  return /\b(?:run|calculate|check|make|create|use)\b.*\b(?:evap|evaporation|bucket\s+test|water\s+loss)\b/.test(lower)
    || /\b(?:evap|evaporation)\s+(?:calculator|report|pdf)\b/.test(lower)
    || /\b(?:what(?:'s|\s+is)|how\s+much\s+is|show\s+me)\s+(?:the\s+)?(?:evap|evaporation)\b/.test(lower);
}

function looksLikeCampaignDraftAction(lower: string): boolean {
  return /\b(?:draft|queue|build|create|start|run)\b.*\b(?:campaign|sequence|newsletter|outreach)\b/.test(lower);
}

function looksLikeCampaignQueueQuestion(lower: string): boolean {
  return /\b(?:campaign|sequence|newsletter|outreach)\b.*\b(?:queue|queued|status|stats|tracking|opens?|clicks?|unsubscribe|suppression)\b/.test(lower);
}

function looksLikeReviewRequestAction(lower: string): boolean {
  return /\b(?:send|draft|queue|create|schedule|ask)\b.*\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/.test(lower)
    || /\breview\s+request\b.*\b(?:client|invoice|email|queue|send|draft)\b/.test(lower);
}

function looksLikeReviewReplyAction(lower: string): boolean {
  return !looksLikeReviewRequestAction(lower)
    && !looksLikeEmailDraftAction(lower)
    && /\b(?:reply|respond|answer|draft)\b.*\b(?:review|google\s+review|gbp|google\s+business)\b/.test(lower);
}

function looksLikeGbpProfileSyncAction(lower: string): boolean {
  return /\b(?:draft|queue|sync|update|change)\b.*\b(?:gbp|google\s+business|business\s+profile)\b.*\b(?:profile|hours|services?|q\s*&\s*a|q&a|questions?)\b/.test(lower)
    || /\b(?:gbp|google\s+business|business\s+profile)\b.*\b(?:profile|hours|services?|q\s*&\s*a|q&a|questions?)\b.*\b(?:draft|queue|sync|update|change)\b/.test(lower);
}

function looksLikeGbpReviewPollQuestion(lower: string): boolean {
  return /\b(?:check|pull|fetch|import|sync|look\s+for)\b.*\b(?:reviews?|google\s+reviews?|gbp\s+reviews?)\b/.test(lower)
    || /\b(?:any|new|latest|recent)\s+(?:google\s+|gbp\s+)?reviews?\b/.test(lower);
}

function looksLikeReputationQueueQuestion(lower: string): boolean {
  const reputationCue = /\b(?:reputation|reviews?|google\s+reviews?|gbp\s+reviews?|review\s+replies?|ratings?)\b/.test(lower);
  return reputationCue && /\b(?:queue|queued|pending|waiting|approve|approval|status|show|list|drafts?)\b/.test(lower);
}

function looksLikeContentQueueQuestion(lower: string): boolean {
  if (/\b(?:campaign|sequence|newsletter|outreach)\b/.test(lower)) {
    return false;
  }
  return /\b(?:content|post|posts|gbp|social|article|articles|draft|drafts)\b.*\b(?:queue|queued|pending|waiting|approve|approval|ready)\b/.test(lower)
    || /\bshow\s+me\s+(?:the\s+)?content\s+queue\b/.test(lower);
}

function looksLikeFreeformContentSaveAction(lower: string): boolean {
  if (/\b(?:show|list|what'?s|whats|read|open)\b.*\bcontent\s+queue\b/.test(lower)) {
    return false;
  }
  return /\b(?:save|queue|add|put|park)\b.*\b(?:this|that|it|article|post|draft|content)\b.*\b(?:content\s+queue|content\s+draft|draft\s+queue|queue)\b/.test(lower)
    || /\b(?:save|queue|put|park)\s+(?:this|that|it)\s+(?:to|in|as)\s+(?:the\s+)?(?:content\s+queue|content\s+draft|draft\s+queue)\b/.test(lower);
}

function looksLikeFreeformContentDraftAction(lower: string): boolean {
  return /\b(?:write|draft|compose|create)\s+(?:me\s+)?(?:an?\s+)?(?:article|post|gbp\s+post|social\s+post|content)\b/.test(lower);
}

function looksLikeReportBasedContentDraftAction(lower: string): boolean {
  const ownerProvidedScenario = /\b(?:job|project|service)\s+scenario\b/.test(lower);
  const reportArtifactCue = /\b(?:report|documents?|checklist|findings?|results?)\b/;
  const sourceRailCue = reportArtifactCue.test(lower) || (!ownerProvidedScenario && /\b(?:job|project)\b/.test(lower));
  return looksLikeFreeformContentDraftAction(lower)
    && (
      (/\b(?:based\s+on|from|using|about)\b/.test(lower) && sourceRailCue)
      || (reportArtifactCue.test(lower) && /\b(?:article|post|content)\b/.test(lower))
    );
}

function looksLikeSeoRankQuestion(lower: string): boolean {
  return /\b(?:seo|rank|ranking|rankings|keyword|keywords|search)\b/.test(lower)
    && /\b(?:where\s+do\s+we\s+rank|rank\s+snapshot|rank\s+tracking|track|position|positions|ranking|rankings)\b/.test(lower);
}

function looksLikeSeoAuditQuestion(lower: string): boolean {
  return /\b(?:seo|search|on-page|schema|json-ld|meta|title)\b/.test(lower)
    && /\b(?:audit|check|scan|fix|repair)\b/.test(lower)
    && /\b(?:site|website|page|business)\b/.test(lower);
}

function looksLikeSeoQueueQuestion(lower: string): boolean {
  return /\bseo\b/.test(lower) && /\b(?:queue|queued|pending|fixes|briefs|reports|status)\b/.test(lower);
}

function looksLikeSeoBriefQuestion(lower: string): boolean {
  return /\b(?:keyword\s+gap|seo\s+brief|article\s+brief|search\s+brief)\b/.test(lower)
    || (/\bseo\b/.test(lower) && /\b(?:draft|make|create)\b/.test(lower) && /\b(?:article|brief)\b/.test(lower));
}

function looksLikeSeoReportQuestion(lower: string): boolean {
  return /\bseo\b/.test(lower) && /\b(?:monthly\s+report|report|pdf|summary)\b/.test(lower);
}

function looksLikeContentApproveAction(lower: string): boolean {
  return /\bapprove\b.*\b(?:content|post|gbp|social|article|draft|queue|content_[a-z_]+_[a-f0-9-]{8,})\b/.test(lower);
}

function looksLikeContentRejectAction(lower: string): boolean {
  return /\b(?:reject|decline|trash|discard)\b.*\b(?:content|post|gbp|social|article|draft|queue|content_[a-z_]+_[a-f0-9-]{8,})\b/.test(lower);
}

function looksLikeInboxTriageQuestion(lower: string): boolean {
  return /\b(?:needs? my attention|what needs attention|triage|urgent|important|order\s+unread|sort\s+unread|rank\s+unread)\b/.test(lower);
}

function looksLikePaymentStatusQuestion(lower: string): boolean {
  return /\b(?:paid|pay|payment|invoice|zero\s+balance|balance|receipt|owes?|owed|due|collected|charged)\b/.test(lower);
}

function looksLikeRevenueQuestion(lower: string): boolean {
  return /\b(?:ytd|year\s+to\s+date|revenue|gross|sales)\b/.test(lower);
}

function looksLikeAccountsReceivableSummaryQuestion(lower: string): boolean {
  return /\b(?:who\s+owes\s+(?:us\s+)?money|who\s+hasn'?t\s+paid|unpaid\s+(?:clients?|invoices?)|accounts?\s+receivable|a\/r|ar\s+summary)\b/.test(lower);
}

function looksLikePipelineQuestion(lower: string): boolean {
  return /\b(?:approved\s+but\s+not\s+scheduled|pipeline|unscheduled|not\s+scheduled)\b/.test(lower);
}

function looksLikeDistanceQuestion(lower: string): boolean {
  return /\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time|from\s+(?:here|my house|the shop))\b/.test(lower);
}

function looksLikeScheduleRelativeDistanceQuestion(lower: string): boolean {
  return looksLikeDistanceQuestion(lower)
    && /\b(?:today'?s?\s+(?:pool|job|visit)|tomorrow'?s?\s+(?:pool|job|visit)|current\s+(?:pool|job|visit))\b/.test(lower);
}

function looksLikeClientListQuestion(lower: string): boolean {
  return /\b(?:client\s+list|list\s+(?:the\s+)?clients|show\s+me\s+(?:the\s+)?clients|show\s+me\s+a\s+client\s+list|how\s+many\s+clients|client\s+count|all\s+clients)\b/.test(lower);
}

function looksLikeNamedClientLookupQuestion(lower: string): boolean {
  return /\b(?:look\s+up|lookup|find|show|check|get|pull)\s+(?:the\s+)?(?:client|customer)\s+/.test(lower)
    || /\b(?:client|customer)\s+(?:record|profile|file|account)\s+(?:for\s+)?/.test(lower)
    || /\bwhat(?:'s| is)\s+(?:the\s+)?(?:phone(?:\s+number)?|telephone|mobile|cell|address|e-?mail(?:\s+address)?)\s+(?:on\s+file\s+)?(?:for\s+)?[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)+\b/.test(lower)
    || /\b(?:phone(?:\s+number)?|telephone|mobile|cell|address|e-?mail(?:\s+address)?)\s+(?:for|on\s+file\s+for)\s+[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)+\b/.test(lower);
}

function looksLikeEmailLookupQuestion(lower: string): boolean {
  return /\b(?:email|e-mail)\b/.test(lower)
    && /\b(?:what(?:'s| is)|for|on\s+file|get|show|find|lookup|look\s+up|pull)\b/.test(lower)
    && !/\b(?:draft|compose|write|send)\b.*\bemail\b/.test(lower)
    && !/\b(?:inbox|gmail|mailbox|reply|replied|responded|sent)\b/.test(lower);
}

function looksLikeNamedJobLookupQuestion(lower: string): boolean {
  return /\bwhat\s+(?:job|jobs|work|service)\s+(?:do|does)\s+(?:we|i)\s+have\s+(?:for|with)\s+[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)+\b/.test(lower)
    || /\b(?:look\s+up|lookup|find|show|check|get|pull)\s+(?:the\s+)?(?:job|jobs|work|service)\s+(?:for\s+)?[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)+\b/.test(lower)
    || /\b(?:job|jobs|work|service)\s+(?:record|profile|file|detail|details)?\s*(?:for|with)\s+[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)+\b/.test(lower);
}

function looksLikeCurrentTimeQuestion(lower: string): boolean {
  return /\b(?:what\s+time\s+is\s+it|current\s+time|what(?:'s| is)\s+the\s+time|today'?s?\s+date|what(?:'s| is)\s+today'?s?\s+date)\b/.test(lower);
}

function looksLikeCurrentWeatherQuestion(lower: string): boolean {
  return /\b(?:current\s+)?(?:weather|temp|temperature)\s+(?:right\s+now\s+)?(?:in|at|for)\b/.test(lower)
    || /\bhow\s+(?:hot|cold)\s+is\s+it\s+(?:in|at|for)\b/.test(lower);
}

function seoTargetDomainFromText(text: string): string | undefined {
  return text.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,})(?:\/\S*)?\b/i)?.[1];
}

function seoSiteSlugFromText(text: string): string {
  const slug = text.match(/\bsite\s+([a-z0-9-]+)\b/i)?.[1]
    ?? text.match(/\bwebsite\s+([a-z0-9-]+)\b/i)?.[1];
  return slug?.toLowerCase() ?? "site";
}

function cleanSeoKeyword(value: string): string {
  return value
    .replace(/\b(?:seo|rank|ranking|rankings|keyword|keywords|snapshot|tracking|track|where|do|we|for|near|around|in|site|website)\b/gi, " ")
    .replace(/[?.!,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seoGeoFromText(text: string): string {
  const match = text.match(/\b(?:in|near|around|for)\s+([a-z][a-z .'-]+(?:,\s*(?:sc|nc|ga|tn))?)(?=\s+(?:for|with|on|site|website|keyword|keywords|rank|ranking)\b|[?.!]|$)/i);
  const geo = match?.[1]?.replace(/\s+/g, " ").trim();
  return geo || "Fair Play, SC";
}

function seoKeywordsFromText(text: string): Array<{ keyword: string; geo: string; device: "desktop" }> {
  if (/\b(?:10|ten)\s+(?:real\s+)?keywords\b/i.test(text)) {
    return [
      "pool leak detection",
      "swimming pool leak detection",
      "pool leak repair",
      "pool pressure testing",
      "pool dye testing",
      "spa leak detection",
      "commercial pool leak detection",
      "pool losing water",
      "bucket test pool",
      "pool leak detection near me"
    ].map((keyword) => ({ keyword, geo: seoGeoFromText(text), device: "desktop" as const }));
  }
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));
  const geo = seoGeoFromText(text);
  if (quoted.length > 0) {
    return quoted.map((keyword) => ({ keyword, geo, device: "desktop" as const }));
  }
  const raw = text.match(/\b(?:rank|ranking|rankings|track|tracking|keyword|keywords)\s+(?:for\s+)?(.+?)(?=\s+(?:in|near|around)\b|[?.!]|$)/i)?.[1]
    ?? text.match(/\bwhere\s+do\s+we\s+rank\s+(?:for\s+)?(.+?)(?=\s+(?:in|near|around)\b|[?.!]|$)/i)?.[1]
    ?? "pool leak detection";
  return [{ keyword: cleanSeoKeyword(raw) || "pool leak detection", geo, device: "desktop" }];
}

function seoIssueCodeFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\bjson-?ld|schema|localbusiness\b/.test(lower)) {
    return "missing_localbusiness_json_ld";
  }
  if (/\bmeta|description\b/.test(lower)) {
    return "missing_or_weak_meta_description";
  }
  if (/\btitle\b/.test(lower)) {
    return "title_length";
  }
  return undefined;
}

function seoBriefInputFromText(text: string): { keyword: string; geo: string; competitorUrl?: string | undefined } {
  const keyword = cleanSeoKeyword(
    text.match(/\b(?:brief|article)\s+(?:for|about)\s+(.+?)(?=\s+(?:in|near|around)\b|[?.!]|$)/i)?.[1]
      ?? text.match(/\bkeyword\s+gap\s+(?:for\s+)?(.+?)(?=\s+(?:in|near|around)\b|[?.!]|$)/i)?.[1]
      ?? "pool leak detection"
  ) || "pool leak detection";
  const competitorUrl = text.match(/\bhttps?:\/\/\S+/i)?.[0];
  return { keyword, geo: seoGeoFromText(text), competitorUrl };
}

function dateRangeFromSeoReportText(text: string): { periodStart: string; periodEnd: string } | null {
  if (!/\blast\s+30\s+days\b|\bmonthly\b/i.test(text)) {
    return null;
  }
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

function looksLikeMapAction(lower: string): boolean {
  return /\b(?:open|launch)\b.*\b(?:google\s+maps|maps?)\b/.test(lower);
}

function looksLikeAddressOnlyFollowUp(text: string): boolean {
  return /^\s*\d{1,6}\s+[a-z0-9 .'-]+(?:road|rd|street|st|lane|ln|drive|dr|avenue|ave|court|ct|circle|cir|way|trail|trl|highway|hwy)\b/i.test(text);
}

function recentUserTextMatches(messages: GatewayMessage[], predicate: (lower: string) => boolean): boolean {
  return [...messages]
    .reverse()
    .slice(1, 8)
    .some((message) => message.role === "user" && typeof message.content === "string" && predicate(message.content.toLowerCase()));
}

function capabilityGapForRequest(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>): { answer: string; failureReason: string } | null {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  const unsupportedWriteGap = unsupportedWriteCapabilityGap(messages, toolsByName);
  if (unsupportedWriteGap) {
    return unsupportedWriteGap;
  }
  const distanceFollowUp = looksLikeAddressOnlyFollowUp(userText) && recentUserTextMatches(messages, looksLikeDistanceQuestion);
  if ((looksLikeDistanceQuestion(lower) || distanceFollowUp) && !toolsByName.has("getDistance")) {
    return {
      answer: "I can't measure drive distance in chat yet because the distance tool is not wired to Nexi. I logged it as capability_not_available.",
      failureReason: "capability_not_available"
    };
  }
  if (looksLikeMapAction(lower) && !toolsByName.has("openMap")) {
    return {
      answer: "I can't open Google Maps from here yet. I can give you the address, but the map-opening tool is not wired to Nexi.",
      failureReason: "capability_not_available"
    };
  }
  if (looksLikeRevenueQuestion(lower) && !toolsByName.has("revenueSummary")) {
    return {
      answer: "I can't total revenue from chat yet because the revenue summary tool is not wired to Nexi. I logged it as capability_not_available.",
      failureReason: "capability_not_available"
    };
  }
  if (looksLikeAccountsReceivableSummaryQuestion(lower) && !toolsByName.has("accountsReceivableSummary")) {
    return {
      answer: "I can't give a reliable who-owes-us-money list from chat yet because the accounts-receivable summary tool is not wired to Nexi. I logged it as capability_not_available.",
      failureReason: "capability_not_available"
    };
  }
  if (
    looksLikeReportPdfEmailRequest(lower)
    && !toolsByName.has("draftReportEmail")
    && !toolsByName.has("draftReportDelivery")
    && !toolsByName.has("sendReportPdf")
  ) {
    return {
      answer: "I can't attach and email report PDFs from chat yet. I logged it as capability_not_available.",
      failureReason: "capability_not_available"
    };
  }
  return null;
}

function emptyPendingApprovalContext(approvalId: string, awaitingChanges = false): PendingApprovalContext {
  return {
    approvalId,
    awaitingChanges,
    revisableClientCreate: false,
    revisableQuoteCreate: false,
    revisableJobCreate: false,
    revisableJobAction: false,
    revisableJobVisitSeries: false,
    revisableVisitShift: false,
    revisableLedgerAction: false,
    revisableInvoiceCompose: false,
    revisableInvoiceSend: false,
    revisableCollectPayment: false,
    revisableReceiptReview: false,
    revisableContentDraft: false
  };
}

function pendingApprovalFlagsForToolName(toolName: string): Partial<PendingApprovalContext> {
  switch (toolName) {
    case "createClient":
    case "revisePendingClientCreateApproval":
      return { revisableClientCreate: true };
    case "createQuote":
    case "revisePendingQuoteCreateApproval":
      return { revisableQuoteCreate: true };
    case "createJob":
    case "revisePendingJobCreateApproval":
      return { revisableJobCreate: true };
    case "queueJobAction":
    case "revisePendingJobActionApproval":
      return { revisableJobAction: true };
    case "scheduleJobVisits":
    case "scheduleUnscheduledJob":
    case "revisePendingJobVisitSeriesApproval":
      return { revisableJobVisitSeries: true };
    case "shiftJobVisitSeries":
    case "revisePendingVisitShiftApproval":
      return { revisableVisitShift: true };
    case "queueLedgerAction":
    case "revisePendingLedgerActionApproval":
      return { revisableLedgerAction: true };
    case "queueInvoiceCompose":
    case "revisePendingInvoiceComposeApproval":
      return { revisableInvoiceCompose: true };
    case "queueInvoiceSend":
    case "revisePendingInvoiceSendApproval":
      return { revisableInvoiceSend: true };
    case "queueCollectPayment":
    case "revisePendingCollectPaymentApproval":
      return { revisableCollectPayment: true };
    case "queueReceiptReviewSend":
    case "revisePendingReceiptReviewApproval":
      return { revisableReceiptReview: true };
    case "approveDraft":
    case "revisePendingDraftApproval":
      return { revisableContentDraft: true };
    default:
      return {};
  }
}

function approvalIdFromResult(result: unknown): string | undefined {
  const record = objectRecord(result);
  const approval = objectRecord(record?.approval);
  return stringValue(approval?.id) ?? undefined;
}

function pendingApprovalFromToolRun(toolRun: ToolRunTrace, awaitingChanges = false): PendingApprovalContext | null {
  const approvalId = approvalIdFromResult(toolRun.result);
  if (!approvalId) {
    return null;
  }
  return {
    ...emptyPendingApprovalContext(approvalId, awaitingChanges),
    ...pendingApprovalFlagsForToolName(toolRun.name)
  };
}

function approvalResolvedByToolRuns(toolRuns: ToolRunTrace[]): boolean {
  return toolRuns.some((run) => run.name === "approvePendingApproval" || run.name === "rejectPendingApproval");
}

function pendingApprovalFromToolRuns(toolRuns: ToolRunTrace[], fallback?: PendingApprovalContext | null): PendingApprovalContext | null {
  if (approvalResolvedByToolRuns(toolRuns)) {
    return null;
  }
  for (const toolRun of [...toolRuns].reverse()) {
    const pending = pendingApprovalFromToolRun(toolRun);
    if (pending) {
      return pending;
    }
  }
  return fallback ?? null;
}

function directNoToolResponseForRequest(
  messages: GatewayMessage[],
  pendingApprovalInput?: PendingApprovalContext | null
): { answer: string; failureReason?: string | undefined; pendingApproval?: PendingApprovalContext | null } | null {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  const approvalContext = pendingApprovalInput ?? approvalContextFromMessages(messages);
  const exactReply = userText.match(/^\s*reply\s+with\s+exactly\s*:?\s*([\s\S]+?)\s*$/i)?.[1]?.trim();
  if (exactReply) {
    return { answer: exactReply.replace(/^["']|["']$/g, "") };
  }
  if (approvalContext && looksLikeApprovalChangeRequest(userText)) {
    if (hasActionableApprovalChangeRequest(userText, approvalContext)) {
      return null;
    }
    return {
      answer: approvalContext.revisableClientCreate
        ? "Tell me what to change, and I'll restate the client before I save anything."
        : approvalContext.revisableQuoteCreate
          ? "Tell me what to change, and I'll restate the quote before I create anything."
          : "Tell me what to change. If that queued action supports chat revision, I'll restate it before I run anything.",
      pendingApproval: { ...approvalContext, awaitingChanges: true }
    };
  }
  if (looksLikeContactCardDeliveryRequest(lower, messages)) {
    return {
      answer: "I can't send a client's full contact card from chat yet. That delivery flow is still waiting on tenant user-seat profiles, so I don't want to fake it as a data problem."
    };
  }
  if (!promptIsMetaOrFeedback(userText)) {
    return null;
  }
  if (/\bwhat\s+commands?\s+can\s+i\s+use\b|\bwhat\s+sources?\s+do\s+you\s+use\b|\bwhat\s+(?:tools?|rails?|systems?)\s+do\s+you\s+use\b|\bwhat\s+can\s+you\s+(?:access|see|check|do|help\s+me\s+do)\b/i.test(userText)) {
    return {
      answer: "You can ask me about today's schedule, work records, job details, field reports and photos, client lists, invoices, inbox summaries, important unread email, draft emails for your approval, evaporation reports, content drafts, review replies, review requests, Google Business Profile updates, and website updates. If something is not live yet, I'll say that plainly instead of acting like the information is missing."
    };
  }
  if (/\bwhy\s+did\s+(?:that|this|it)\s+fail\b/i.test(userText)) {
    return {
      answer: "That failed because I either checked the wrong place or the ability is not live yet. I wrote the miss down so we can fix the path instead of making you repeat it."
    };
  }
  if (/\bhow\s+do\s+i\s+upload\s+(?:photos?|pictures?|images?|videos?)\b/i.test(userText)) {
    return {
      answer: "For now, use the field capture lane for job photos and videos. I can read and summarize those here. Native phone uploads are part of the mobile field app work, and once that is live you'll be able to capture on the job and sync automatically."
    };
  }
  return {
    answer: "You're right. I noted that feedback so we can fix the behavior instead of repeating it."
  };
}

function emailRefFromText(text: string): { mailbox: string; messageId: string; attachmentId?: string | undefined } | null {
  const match = text.match(/\bemail:([^:\s]+):([^:\s]+)(?::([^:\s]+))?/i)
    ?? text.match(/\bread\s+email\s+([a-z0-9_-]+)\s+([a-z0-9_-]+)(?:\s+attachment\s+([a-z0-9_-]+))?/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    mailbox: match[1],
    messageId: match[2],
    attachmentId: match[3]
  };
}

function labeledEmailAddress(text: string): string | undefined {
  const candidate = text.match(/\b(?:email|e-mail)(?:\s+address)?\s*(?:is|=|:)?\s+([A-Za-z0-9@._%+\- ]+)/i)?.[1];
  if (!candidate) {
    return undefined;
  }
  const trimmed = candidate
    .split(/[?!,]/)[0]
    ?.replace(/\b(?:to|at|for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = trimmed.split(" ");
  const atIndex = tokens.findIndex((token) => token.includes("@"));
  if (atIndex === -1) {
    return undefined;
  }
  const firstStart = Math.max(0, atIndex - 2);
  for (let start = firstStart; start <= atIndex; start += 1) {
    const combined = tokens.slice(start, atIndex + 1).join("");
    const matched = combined.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
    if (matched) {
      return matched;
    }
  }
  return tokens[atIndex]?.match(/[\w.+-]+@[\w.-]+\.\w+/i)?.[0];
}

function adjacentTokenEmailAddress(text: string): string | undefined {
  const tokens = text
    .replace(/[<>"'`()[\],!?;:]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w.+-]+|[^\w.+-@]+$/g, ""))
    .filter(Boolean);
  let best: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (!token.includes("@")) {
      continue;
    }
    for (let start = Math.max(0, index - 2); start <= index; start += 1) {
      const prefix = tokens.slice(start, index);
      if (prefix.some((part) => /^(?:to|at|for|is|my|me|email|e-mail)$/i.test(part) || /^\d{5,}$/.test(part))) {
        continue;
      }
      const combined = tokens.slice(start, index + 1).join("");
      const matched = combined.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
      if (matched && (!best || matched.length > best.length)) {
        best = matched;
      }
    }
    const direct = token.match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
    if (direct && (!best || direct.length > best.length)) {
      best = direct;
    }
  }
  return best;
}

function firstEmailAddress(text: string): string | undefined {
  return labeledEmailAddress(text)
    ?? adjacentTokenEmailAddress(text)
    ?? text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
}

function firstPhoneNumber(text: string): string | undefined {
  const labeled = text.match(/\b(?:phone|telephone|number|mobile|cell|call|text)\s*(?:is|=|:)?\s*([+()\d][+()\d\s.-]{6,})\b/i)?.[1];
  const fallback = text.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
  return (labeled ?? fallback)?.replace(/[^\d+]/g, "").trim();
}

function looksLikeCreateClientAction(lower: string): boolean {
  return /\b(?:add|create|set\s+up|make)\b.{0,40}\b(?:new\s+)?client\b/.test(lower)
    || /\b(?:new\s+client|client\s+create)\b/.test(lower);
}

function approvalIdFromText(text: string): string | undefined {
  return text.match(/\bappr_[a-z0-9_-]+\b/i)?.[0];
}

function looksLikeApprovalYes(text: string): boolean {
  return /^(?:yes|yep|yeah|approve|approved|looks good|go ahead|do it|run it|ship it|send it)\b/i.test(text.trim());
}

function looksLikeApprovalNo(text: string): boolean {
  return /^(?:no|nope|reject|decline|cancel that|don't do it|do not do it)\b/i.test(text.trim());
}

function looksLikeApprovalChangeRequest(text: string): boolean {
  return /\b(?:make changes|change it|revise it|update it|edit it|not yet|hold on)\b/i.test(text);
}

function hasClientApprovalChangeDetails(text: string): boolean {
  // A pending create must not capture a later lookup such as "What is Logan's
  // address?" merely because that sentence contains the word "address".
  if (/^\s*(?:what|where|who|when|why|how|do|does|did|is|are|can|could|would)\b/i.test(text)) {
    return false;
  }
  return Boolean(
    firstEmailAddress(text)
    || firstPhoneNumber(text)
    || /\b(?:name|client|address|street|road|drive|lane|court|avenue|boulevard|suite|unit|apt)\b/i.test(text)
  );
}

function hasQuoteApprovalChangeDetails(text: string): boolean {
  return /\b(?:title|quote\s+title|terms?|expire|expiry|expiration|discount|signature|deposit|card\s+on\s+file)\b/i.test(text)
    || /\d+\s*%/.test(text)
    || /\$\s*\d+(?:\.\d{1,2})?/.test(text);
}

function hasLedgerApprovalChangeDetails(text: string): boolean {
  return /\b(?:refund|void|bad debt|write\s+off|reason)\b/i.test(text)
    || /\$\s*\d+(?:\.\d{1,2})?/.test(text);
}

function hasActionableApprovalChangeRequest(
  text: string,
  approvalContext: {
    revisableClientCreate: boolean;
    revisableQuoteCreate: boolean;
    revisableJobCreate: boolean;
    revisableJobAction: boolean;
    revisableLedgerAction: boolean;
  } | null
): boolean {
  if (!approvalContext) {
    return false;
  }
  return (approvalContext.revisableClientCreate && hasClientApprovalChangeDetails(text))
    || (approvalContext.revisableQuoteCreate && hasQuoteApprovalChangeDetails(text))
    || (approvalContext.revisableJobCreate && /\b(?:change|fix|update|rename|title)\b/i.test(text))
    || (approvalContext.revisableJobAction && /\b(?:close\s+and\s+invoice|invoice only|invoice it|close only|just close|dismiss(?: the)? reminder|archive without invoice)\b/i.test(text))
    || (approvalContext.revisableLedgerAction && hasLedgerApprovalChangeDetails(text));
}

function looksLikeSavedClientEditRequest(text: string, messages: GatewayMessage[]): boolean {
  const lower = text.toLowerCase();
  if (looksLikeCreateClientAction(lower)) {
    return false;
  }
  if (!/\b(?:add|edit|change|update|fix|correct|replace)\b/.test(lower)) {
    return false;
  }
  if (/\b(?:job|quote|invoice|payment|request|visit)\b/.test(lower)) {
    return false;
  }
  if (!/\b(?:name|phone|telephone|mobile|email|e-mail|address|street|road|drive|lane|avenue|court|trail|way|circle|boulevard|highway|zip|postal|city|state|billing|contact)\b/.test(lower)) {
    return false;
  }
  const namedPossessiveClient = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'s\b/)?.[1]?.trim() ?? "";
  const referencedClient = namedPossessiveClient
    || clientLookupQueryFromText(text)
    || currentEntityFromText(text)
    || clientLookupQueryFromText(previousUserText(messages))
    || entityQueryFromMessages(messages, { skipLatest: true })
    || entityQueryFromMessages(messages);
  return /\b(?:client|customer|record|profile|details?)\b/.test(lower)
    || Boolean(namedPossessiveClient)
    || Boolean(clientLookupQueryFromText(text))
    || Boolean(currentEntityFromText(text))
    || (/\b(?:this|that|it|he|him|his|she|her|hers|they|them|their|theirs)\b/.test(lower) && Boolean(referencedClient));
}

function looksLikeClientDeleteRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(?:delete|remove)\b/.test(lower)
    && /\b(?:client|customer|duplicate|record|entry)\b/.test(lower)
    && !/\b(?:job|quote|invoice|payment|request|visit)\b/.test(lower);
}

function clientUpdateInputFromText(text: string, messages: GatewayMessage[]): {
  clientQuery: string;
  name?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  emails?: string[] | undefined;
  phones?: string[] | undefined;
} {
  const named = (text.match(/\b(?:for|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?=\s+(?:to|zip|postal|phone|telephone|mobile|email|e-mail|address|street|road|drive|lane|avenue|court|trail|way|circle|boulevard|highway)\b)/)?.[1]
    ?? text.match(/\b(?:edit|change|update|fix|correct|replace)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?=\s+(?:zip|postal|phone|telephone|mobile|email|e-mail|address|street|road|drive|lane|avenue|court|trail|way|circle|boulevard|highway)\b)/i)?.[1]
    ?? text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'s\b/)?.[1]
    ?? clientLookupQueryFromText(text))
    || entityQueryFromMessages(messages, { skipLatest: true });
  const email = firstEmailAddress(text);
  const phone = firstPhoneNumber(text);
  const postalCode = text.match(/\b(?:zip(?:\s+code)?|postal(?:\s+code)?)\s*(?:to|is|=|:)?\s*(\d{5}(?:-\d{4})?)\b/i)?.[1]
    ?? text.match(/\bto\s+(\d{5}(?:-\d{4})?)\b/i)?.[1];
  const address = text.match(/\b(?:address|street)\s*(?:to|is|=|:)?\s*([^.!?]+)$/i)?.[1]?.trim();
  const replacementName = text.match(/\b(?:name)\s*(?:to|is|=|:)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/i)?.[1]?.trim();
  return {
    clientQuery: named.trim(),
    ...(replacementName ? { name: replacementName } : {}),
    ...(address ? { address } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(email ? { emails: [email] } : {}),
    ...(phone ? { phones: [phone] } : {})
  };
}

function approvalContextFromMessages(messages: GatewayMessage[]): PendingApprovalContext | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant" || typeof message.content !== "string") {
      continue;
    }
    const approvalId = approvalIdFromText(message.content);
    if (!approvalId) {
      continue;
    }
    if (/tell me what to change/i.test(message.content)) {
      return {
        ...emptyPendingApprovalContext(approvalId, true),
        revisableClientCreate: /create client:|you requested create client for/i.test(message.content),
        revisableQuoteCreate: /create quote:|you requested create quote for/i.test(message.content),
        revisableJobCreate: /create job:|you requested create job for/i.test(message.content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:|you requested (?:close|invoice|close and invoice|dismiss invoice reminder) job for/i.test(message.content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:|you requested (?:refund payment|void invoice|mark bad debt) for/i.test(message.content)
      };
    }
    if (/(?:approve this|is this correct)\?\s*(?:reply\s+)?yes\s*\/\s*no(?:\s*\/\s*make changes)?/i.test(message.content)) {
      return {
        ...emptyPendingApprovalContext(approvalId, false),
        revisableClientCreate: /create client:|you requested create client for/i.test(message.content),
        revisableQuoteCreate: /create quote:|you requested create quote for/i.test(message.content),
        revisableJobCreate: /create job:|you requested create job for/i.test(message.content),
        revisableJobAction: /close job:|invoice job:|close and invoice job:|dismiss invoice reminder:|you requested (?:close|invoice|close and invoice|dismiss invoice reminder) job for/i.test(message.content),
        revisableLedgerAction: /refund payment:|void invoice:|mark bad debt:|you requested (?:refund payment|void invoice|mark bad debt) for/i.test(message.content)
      };
    }
  }
  return null;
}

function unsupportedWriteCapabilityGap(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>): { answer: string; failureReason: string } | null {
  const userText = latestUserText(messages);
  if (!toolsByName.has("updateClient") && looksLikeSavedClientEditRequest(userText, messages)) {
    return {
      answer: "I can't edit saved client records from chat yet. That is a capability gap, not a missing-data issue.",
      failureReason: "capability_not_available"
    };
  }
  const lower = latestUserText(messages).toLowerCase();
  if (/\bupdate me on\b/.test(lower)) {
    return null;
  }
  const patterns = [
    {
      pattern: /\b(?:delete|remove)\b.*\b(?:client|customer|duplicate)(?:\s+record|\s+entry)?s?\b/i,
      toolName: "deleteClient",
      answer: "I can't delete a client from chat yet. That is a capability gap, not a missing-data issue. Imported client history is protected; NexTeam-created clients can be deleted from the client workspace when they have no linked work."
    },
    {
      pattern: /\b(?:edit|change|update)\b.*\b(?:client|customer)(?:\s+record)?s?\b/i,
      toolName: "updateClient",
      answer: "I can't edit saved client records from chat yet. That is a capability gap, not a missing-data issue."
    },
    {
      pattern: /\b(?:edit|change|update)\b.*\b(?:phone|email|address|billing|contact)\b/i,
      toolName: "updateClient",
      answer: "I can't edit saved client records from chat yet. That is a capability gap, not a missing-data issue."
    },
    {
      pattern: /\b(?:delete|remove)\b.*\brequests?\b/i,
      toolName: "deleteRequest",
      answer: "I can't delete saved requests from chat yet. That is a capability gap, not a missing-data issue."
    },
    {
      pattern: /\b(?:delete|remove)\b.*\b(?:quote|job|invoice|payment)s?\b/i,
      toolName: "deleteCrmRecord",
      answer: "I can't delete saved work or billing records from chat yet. That is a capability gap, not a missing-data issue."
    }
  ] as const;
  const match = patterns.find((entry) => entry.pattern.test(lower) && !toolsByName.has(entry.toolName));
  return match ? { answer: match.answer, failureReason: "capability_not_available" } : null;
}

function looksLikeStartIntakeAction(lower: string): boolean {
  return /\b(?:onboard|intake|set\s+up|create|start)\b.{0,60}\b(?:tenant|company|business|demo\s+pool\s+co|pool\s+co)\b/.test(lower)
    || /\b(?:new\s+tenant|tenant\s+intake|demo\s+pool\s+co)\b/.test(lower);
}

function looksLikeFinalizeIntakeAction(lower: string): boolean {
  return /\b(?:finalize|finish|queue|approve|park)\b.{0,50}\b(?:intake|tenant\s+plan|onboarding\s+plan|onboarding)\b/.test(lower)
    || /\b(?:create|queue)\b.{0,50}\b(?:tenant\s+provisioning|provisioning\s+approval)\b/.test(lower);
}

function looksLikeIntakeStatusQuestion(lower: string): boolean {
  return /\b(?:intake|onboarding|tenant\s+plan)\b.*\b(?:status|queue|queued|where|show|list)\b/.test(lower)
    || /\bshow\s+me\s+(?:the\s+)?intake\b/.test(lower);
}

function looksLikeAnswerIntakeAction(text: string): boolean {
  const lower = text.toLowerCase();
  return !!intakeSessionIdFromText(text)
    && !!intakeAnswerFieldFromText(lower)
    && !looksLikeFinalizeIntakeAction(lower)
    && !looksLikeIntakeStatusQuestion(lower);
}

function intakeBusinessNameFromText(text: string): string | undefined {
  const match = text.match(/\b(?:onboard|intake|set\s+up|create|start)\s+(?:a\s+)?(?:new\s+)?(?:tenant|company|business)?\s*(?:called|named)?\s*([^,.!?]+?)(?=\s+(?:as|for|with|that|who|which)\b|[,!.?]|$)/i)
    ?? text.match(/\b(?:tenant|company|business)\s+(?:called|named)\s+([^,.!?]+)(?:[,!.?]|$)/i);
  const value = match?.[1]?.replace(/\b(?:tenant|company|business)\b/gi, " ").replace(/\s+/g, " ").trim();
  return value || (/demo\s+pool\s+co/i.test(text) ? "Demo Pool Co" : undefined);
}

function intakeTargetTenantIdFromBusinessName(name: string | undefined): string | undefined {
  return name?.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function intakeStartInputFromText(text: string): { businessName?: string | undefined; targetTenantId?: string | undefined; industryPack: string; plan: string } {
  const businessName = intakeBusinessNameFromText(text);
  const lower = text.toLowerCase();
  const industryPack = /\b(?:pool|leak)\b/.test(lower)
    ? "pool_leak"
    : /\b(?:hvac|heating|air\s+conditioning)\b/.test(lower)
      ? "hvac"
      : /\bplumb(?:er|ing)?\b/.test(lower)
        ? "plumbing"
        : "pool_leak";
  return {
    businessName,
    targetTenantId: intakeTargetTenantIdFromBusinessName(businessName),
    industryPack,
    plan: "suite"
  };
}

function intakeAnswerFieldFromText(lower: string): string | undefined {
  if (/\b(?:service\s+areas?|cities|counties|territor(?:y|ies)|coverage\s+area)\b/.test(lower)) {
    return "serviceArea";
  }
  if (/\b(?:services?|offerings?|work\s+types?)\b/.test(lower)) {
    return "services";
  }
  if (/\b(?:pricing|price|estimate|quote|quoting|rate|rates)\b/.test(lower)) {
    return "pricingNotes";
  }
  if (/\b(?:brand\s+voice|voice|tone|sound|personality)\b/.test(lower)) {
    return "brandVoice";
  }
  if (/\b(?:app\s+stack|current\s+apps?|tools?|software|jobber|quickbooks|calendar|companycam)\b/.test(lower)) {
    return "appStack";
  }
  if (/\b(?:plan|subscription)\b/.test(lower)) {
    return "plan";
  }
  if (/\b(?:business\s+name|company\s+name)\b/.test(lower)) {
    return "businessName";
  }
  return undefined;
}

function intakeAnswerValueFromText(text: string): unknown {
  const value = text.match(/\b(?:are|is|should\s+be|should\s+sound|should\s+cover|includes?|include|=|:)\s+([\s\S]+)$/i)?.[1]
    ?? text.replace(/\bfor\s+intake_[a-f0-9-]{8,}\b[:,]?\s*/i, "");
  return value.trim().replace(/[.!?]+$/g, "");
}

function answerIntakeInputFromText(text: string, priorRuns: ToolRunTrace[] = []): { sessionId?: string | undefined; field?: string | undefined; value?: unknown } {
  const lower = text.toLowerCase();
  return {
    sessionId: intakeSessionIdFromText(text) ?? intakeSessionIdFromPriorRuns(priorRuns),
    field: intakeAnswerFieldFromText(lower),
    value: intakeAnswerValueFromText(text)
  };
}

function intakeSessionIdFromText(text: string): string | undefined {
  return text.match(/\bintake_[a-f0-9-]{8,}\b/i)?.[0];
}

function intakeSessionIdFromPriorRuns(priorRuns: ToolRunTrace[]): string | undefined {
  for (const run of [...priorRuns].reverse()) {
    const result = run.result;
    if (!result || typeof result !== "object") {
      continue;
    }
    const record = result as Record<string, unknown>;
    const session = record.session;
    if (session && typeof session === "object") {
      const id = (session as Record<string, unknown>).id;
      if (typeof id === "string" && id.startsWith("intake_")) {
        return id;
      }
    }
  }
  return undefined;
}

function createClientAddressMatchFromText(text: string): { address: string; index: number } | undefined {
  const markerMatch = text.match(/\b(?:address\s*(?:is|=|:)?|at)\s+(.+?)(?=,\s*(?:email|e-mail|phone|telephone|number|mobile|cell|text|with)\b|\s+(?:email|e-mail|phone|telephone|number|mobile|cell|text)\b|[?.!]|$)/i);
  if (markerMatch?.[1]) {
    return { address: markerMatch[1].replace(/\s+/g, " ").trim(), index: markerMatch.index ?? -1 };
  }
  const streetMatch = text.match(/\b\d{1,6}\s+[A-Za-z0-9.' -]+?\s+(?:road|rd|drive|dr|lane|ln|street|st|avenue|ave|court|ct|trail|trl|way|circle|cir|boulevard|blvd|highway|hwy|place|pl|parkway|pkwy)\b(?:\s+[A-Za-z.'-]+){0,4}(?:\s+\d{5}(?:-\d{4})?)?/i);
  if (!streetMatch?.[0]) {
    return undefined;
  }
  const tail = text.slice(streetMatch.index ?? 0)
    .replace(/\b(?:email|e-mail|phone|telephone|number|mobile|cell|text)\b[\s\S]*$/i, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b[\s\S]*$/i, " ")
    .replace(/\s+(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?:[\s\S]*)$/i, " ")
    .replace(/[,. ]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { address: tail, index: streetMatch.index ?? -1 };
}

function createClientNameFromText(text: string): string {
  const match = text.match(/\b(?:add|create|set\s+up|make)\s+(?:a\s+)?(?:new\s+)?client\b(?:\s+to\s+(?:the\s+)?system\b)?\s*,?\s*(?:named\s+|called\s+)?(.+?)(?=,|\s+(?:at|address|email|e-mail|phone|number|with)\b|[?.!]|$)/i)
    ?? text.match(/\bclient\s+(?:named\s+|called\s+)?(.+?)(?=,|\s+(?:at|address|email|e-mail|phone|number|with)\b|[?.!]|$)/i);
  const address = createClientAddressMatchFromText(text)?.address;
  let candidate = (match?.[1] ?? "")
    .replace(firstEmailAddress(text) ?? "", " ")
    .replace(firstPhoneNumber(text) ?? "", " ");
  if (address) {
    const addressStart = candidate.toLowerCase().indexOf(address.toLowerCase());
    if (addressStart >= 0) {
      candidate = candidate.slice(0, addressStart);
    }
  }
  const name = candidate
    .replace(/^(?:to|into)\s+(?:the\s+)?system\b/gi, " ")
    .replace(/^(?:the\s+)?system\b/gi, " ")
    .replace(/\b(?:named|called)\b/gi, " ")
    .replace(/\b\d{1,6}\s+[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanClientPreviewName(name) ?? "";
}

function createClientAddressFromText(text: string): string | undefined {
  return createClientAddressMatchFromText(text)?.address;
}

function createClientInputFromText(text: string): { name: string; address?: string | undefined; emails: string[]; phones: string[]; consent: { email: boolean; sms: boolean } } {
  const email = firstEmailAddress(text);
  const phone = firstPhoneNumber(text);
  const lower = text.toLowerCase();
  return {
    name: createClientNameFromText(text),
    address: createClientAddressFromText(text),
    emails: email ? [email] : [],
    phones: phone ? [phone] : [],
    consent: {
      email: /\b(?:email\s+ok|can\s+email|email\s+consent|opt(?:ed)?\s+in\s+for\s+email)\b/.test(lower),
      sms: /\b(?:text\s+ok|sms\s+ok|can\s+text|text\s+consent|opt(?:ed)?\s+in\s+for\s+(?:sms|text))\b/.test(lower)
    }
  };
}

function mergeCreateClientInput(primary: CreateClientExtraction, fallback: CreateClientExtraction): CreateClientExtraction {
  // The deterministic parser reads the operator's literal message.  When it
  // found a complete field, it is the source of truth over a model extraction:
  // a stale or guessed value must never appear in an approval that can create
  // a saved client.
  const mergedEmails = fallback.emails.length > 0
    ? fallback.emails
    : mergeCreateClientEmails(primary.emails, fallback.emails);
  return {
    name: cleanClientPreviewName(fallback.name) ?? cleanClientPreviewName(primary.name) ?? "",
    address: fallback.address?.trim() || primary.address,
    emails: mergedEmails.length > 0 ? mergedEmails : fallback.emails,
    phones: fallback.phones.length > 0 ? fallback.phones : [...new Set(primary.phones.filter(Boolean))],
    consent: {
      email: primary.consent.email ?? fallback.consent.email,
      sms: primary.consent.sms ?? fallback.consent.sms
    }
  };
}

function emailLooksContaminatedByPhoneDigits(candidate: string, shorterVariant: string): boolean {
  const [candidateLocal = "", candidateDomain = ""] = candidate.toLowerCase().split("@");
  const [shorterLocal = "", shorterDomain = ""] = shorterVariant.toLowerCase().split("@");
  if (!candidateLocal || !shorterLocal || candidateDomain !== shorterDomain) {
    return false;
  }
  if (!candidateLocal.endsWith(shorterLocal) || candidateLocal === shorterLocal) {
    return false;
  }
  const leakedPrefix = candidateLocal.slice(0, candidateLocal.length - shorterLocal.length);
  return /\d{5,}/.test(leakedPrefix);
}

function mergeCreateClientEmails(primary: string[], fallback: string[]): string[] {
  const merged: string[] = [];
  for (const raw of [...primary, ...fallback]) {
    const candidate = raw.trim().match(/^[\w.+-]+@[\w.-]+\.\w+$/i)?.[0];
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    const existingIndex = merged.findIndex((value) => {
      const [existingLocal = "", existingDomain = ""] = value.toLowerCase().split("@");
      const [nextLocal = "", nextDomain = ""] = normalized.split("@");
      return existingDomain === nextDomain
        && (existingLocal === nextLocal || existingLocal.endsWith(nextLocal) || nextLocal.endsWith(existingLocal));
    });
    if (existingIndex >= 0) {
      const existingValue = merged[existingIndex];
      if (existingValue && emailLooksContaminatedByPhoneDigits(existingValue, candidate)) {
        merged[existingIndex] = candidate;
      } else if (existingValue && candidate.length > existingValue.length && !emailLooksContaminatedByPhoneDigits(candidate, existingValue)) {
        merged[existingIndex] = candidate;
      }
      continue;
    }
    if (!merged.some((value) => value.toLowerCase() === normalized)) {
      merged.push(candidate);
    }
  }
  return merged;
}

function createClientExtractionToolDefinition(): GatewayToolDefinition {
  return {
    name: "submit_create_client_extraction",
    description: "Return the parsed client-create fields from the operator request.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        emails: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        consent: {
          type: "object",
          additionalProperties: false,
          properties: {
            email: { type: "boolean" },
            sms: { type: "boolean" }
          }
        }
      },
      required: ["name", "emails", "phones", "consent"]
    }
  };
}

export async function extractCreateClientInput(input: {
  text: string;
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
}): Promise<CreateClientExtraction> {
  const fallback = createClientExtractionSchema.parse(createClientInputFromText(input.text));
  const apiKey = (input.env ?? process.env).ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return fallback;
  }

  try {
    const extractionCall = await sendAnthropicRequest({
      env: input.env,
      fetchFn: input.fetchFn,
      system: [
        "You extract structured client-create details from one operator message.",
        "Always call the submit_create_client_extraction tool exactly once.",
        "Ignore command scaffolding such as add/create/new client, to system, set up, or make client.",
        "Preserve the full client name, full email address, full phone number, and the complete service address exactly as stated.",
        "Do not invent or infer missing data. If a field is absent, leave it blank or empty.",
        "Return opt-in booleans only when the operator explicitly granted them."
      ].join(" "),
      messages: [{ role: "user", content: input.text }],
      tools: [createClientExtractionToolDefinition()],
      maxTokens: 300
    });
    const extractionUse = toolUsesFromContent(extractionCall.content)
      .find((block) => block.name === "submit_create_client_extraction");
    if (!extractionUse?.input) {
      return fallback;
    }
    const parsed = createClientExtractionSchema.parse(extractionUse.input);
    return mergeCreateClientInput(parsed, fallback);
  } catch {
    return fallback;
  }
}

function quoteClientQueryFromText(text: string): string | undefined {
  const direct = text.match(/\bfor\s+([a-z][a-z' -]+?)(?=\s+(?:for|with|using|at|total|amount|price|called|titled|named)\b|[?.!]|$)/i)?.[1]?.trim();
  const candidate = direct ?? "";
  return candidate && !looksLikeGenericEntityCandidate(candidate) && !/\$\s*\d/.test(candidate) ? candidate : undefined;
}

function quoteAmountFromText(text: string): number {
  const amount = Number(text.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? "0");
  return Number.isFinite(amount) ? amount : 0;
}

function quoteLineNameFromText(text: string, clientQuery?: string): string {
  const normalized = clientQuery
    ? text.replace(new RegExp(`\\bfor\\s+${clientQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ")
    : text;
  return normalized.match(/\bfor\s+(.+?)(?=\s+\$\d|\s+at\s+\$|[?.!]|$)/i)?.[1]?.trim() || "Quoted work";
}

function createQuoteInputFromText(text: string): {
  clientQuery?: string | undefined;
  title: string;
  items: Array<{ kind: string; name: string; quantity: number; unitPrice: number }>;
  approvalRules: { requireSignature: boolean; requireDeposit: boolean; requireCardOnFile: boolean };
} {
  const lower = text.toLowerCase();
  const clientQuery = quoteClientQueryFromText(text);
  return {
    ...(clientQuery ? { clientQuery } : {}),
    title: clientQuery ? `${clientQuery} quote` : "Quote draft",
    items: [{
      kind: "custom",
      name: quoteLineNameFromText(text, clientQuery),
      quantity: 1,
      unitPrice: quoteAmountFromText(text)
    }],
    approvalRules: {
      requireSignature: !/\bno signature\b/i.test(lower),
      requireDeposit: /\bdeposit\b/i.test(lower),
      requireCardOnFile: /\bcard\s+on\s+file\b/i.test(lower)
    }
  };
}

function createJobInputFromText(text: string): {
  clientQuery?: string | undefined;
  title: string;
} {
  const clientQuery = quoteClientQueryFromText(text) || entityQueryFromText(text) || undefined;
  const explicitTitle = text.match(/\b(?:called|titled|named)\s+([^.!?\n]+)$/i)?.[1]?.trim();
  return {
    ...(clientQuery ? { clientQuery } : {}),
    title: explicitTitle || (clientQuery ? `${clientQuery} job` : "Job draft")
  };
}

function mailboxAliasFromEmailAddress(email: string | undefined): string | undefined {
  if (!email) {
    return undefined;
  }
  return email.split("@")[0]
    ?.replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function draftBodyFromText(text: string): string {
  const match = text.match(/\b(?:saying|that says|to say|with message|message|tell(?:ing)?\s+(?:them|him|her|me)?)\b\s*:?\s*([\s\S]+)$/i);
  return (match?.[1] ?? "Please see the note from the service team.").trim().replace(/^["']|["']$/g, "");
}

function draftSubjectFromBody(bodyText: string): string {
  const firstSentence = bodyText.split(/[.!?]\s/)[0]?.trim() || "Service follow-up";
  const compact = firstSentence.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").slice(0, 72).trim();
  return compact.length >= 8 ? compact : "Service follow-up";
}

function draftEmailInputFromText(text: string, requestorEmail?: string): { to: string[]; subject: string; bodyText: string } {
  const to = requestorEmailForText(text, requestorEmail);
  const bodyText = draftBodyFromText(text);
  return {
    to: to ? [to] : [],
    subject: draftSubjectFromBody(bodyText),
    bodyText
  };
}

function reportEmailClientNameFromText(text: string): string {
  const withoutRecipient = text.replace(firstEmailAddress(text) ?? "", " ");
  const direct = withoutRecipient.match(
    /\b(?:email|send|draft|forward)\s+(?:me\s+|to\s+me\s+)?(?:the\s+)?(.+?)\s+(?:report|reports|pdf|pdfs)\b/i
  )?.[1];
  const reverse = withoutRecipient.match(
    /\b(?:report|reports|pdf|pdfs)\s+(?:for|of)\s+(.+?)(?:\s+(?:to|at|by)\b|[?.!]|$)/i
  )?.[1];
  const candidate = direct ?? reverse ?? currentEntityFromText(text) ?? "client";
  return candidate
    .replace(/\b(?:the|a|an|all|every)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || "client";
}

function draftReportEmailInputFromText(text: string): {
  to: string[];
  clientName: string;
  reportTitle: string;
  bodyText: string;
  findings: string[];
} {
  const to = firstEmailAddress(text);
  const clientName = reportEmailClientNameFromText(text);
  return {
    to: to ? [to] : [],
    clientName,
    reportTitle: `${clientName} field report`,
    bodyText: `Attached is the field report PDF for ${clientName}. Please review it and let us know if you have any questions.`,
    findings: [
      `Report delivery requested for ${clientName}.`,
      "PDF generated by the field documentation rail and parked for approval before sending."
    ]
  };
}

function cleanContentTitle(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function titleFromDraftBody(body: string): string {
  const heading = body.match(/^\s*#{1,6}\s+(.+)$/m)?.[1];
  if (heading) {
    return cleanContentTitle(heading).slice(0, 120) || "Nexi content draft";
  }
  const firstUsefulLine = body
    .split(/\r?\n/)
    .map((line) => cleanContentTitle(line))
    .find((line) => line.length >= 8);
  return (firstUsefulLine ?? "Nexi content draft").slice(0, 120);
}

function freeformContentKindFromText(text: string, body: string): "gbp_post" | "social_post" | "article" {
  const lower = `${text}\n${body}`.toLowerCase();
  if (/\b(?:gbp|google\s+business|business\s+profile)\b/.test(lower)) {
    return "gbp_post";
  }
  if (/\b(?:social|facebook|instagram|post)\b/.test(lower) && !/\barticle\b/.test(lower)) {
    return "social_post";
  }
  return "article";
}

function freeformContentInputFromConversation(messages: GatewayMessage[]): {
  kind: "gbp_post" | "social_post" | "article";
  title: string;
  body: string;
  sourcePrompt: string;
} {
  const body = latestAuthoredAssistantDraftText(messages) || "Nexi content draft";
  const latestText = latestUserText(messages);
  return {
    kind: freeformContentKindFromText(latestText, body),
    title: titleFromDraftBody(body),
    body,
    sourcePrompt: previousUserText(messages) || latestText
  };
}

function contentDraftIdFromText(text: string): string | undefined {
  return text.match(/\bcontent_[a-z_]+_[a-f0-9-]{8,}\b/i)?.[0];
}

function contentDraftIdFromPriorRuns(priorRuns: ToolRunTrace[]): string | undefined {
  for (const run of [...priorRuns].reverse()) {
    if (run.name !== "contentQueue" && run.name !== "draftPostFromJob" && run.name !== "queueFreeformContent") {
      continue;
    }
    const result = run.result && typeof run.result === "object" ? run.result as Record<string, unknown> : {};
    const drafts = Array.isArray(result.drafts)
      ? result.drafts
      : result.draft && typeof result.draft === "object"
        ? [result.draft]
        : [];
    for (const draft of drafts) {
      if (!draft || typeof draft !== "object") {
        continue;
      }
      const record = draft as Record<string, unknown>;
      if (typeof record.id === "string" && record.status === "approval_pending") {
        return record.id;
      }
    }
  }
  return undefined;
}

function reputationReviewIdFromText(text: string): string | undefined {
  return text.match(/\bgbp_review_[a-z0-9_-]+\b/i)?.[0];
}

function reputationReviewIdFromPriorRuns(priorRuns: ToolRunTrace[]): string | undefined {
  for (const run of [...priorRuns].reverse()) {
    if (!["reputationQueue", "pollGbpReviews", "draftReviewReply"].includes(run.name)) {
      continue;
    }
    const result = run.result && typeof run.result === "object" ? run.result as Record<string, unknown> : {};
    const candidates = [
      Array.isArray(result.reviews) ? result.reviews : [],
      Array.isArray(result.imported) ? result.imported : [],
      Array.isArray(result.pendingReplies) ? result.pendingReplies : []
    ].flat();
    for (const review of candidates) {
      if (!review || typeof review !== "object") {
        continue;
      }
      const record = review as Record<string, unknown>;
      if (typeof record.id === "string") {
        return record.id;
      }
    }
  }
  return undefined;
}

function invoiceIdFromText(text: string): string | undefined {
  return text.match(/\b(?:invoice|inv)\s*(?:id|number|#|:|-)?\s*([a-z0-9_-]{3,})\b/i)?.[1];
}

function reviewRequestClientFromText(text: string): string | undefined {
  const match = text.match(/\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\s+(?:for|to)?\s*(.+?)(?=\s+(?:at|to|invoice|inv|after)\b|[?.!]|$)/i)
    ?? text.match(/\bfor\s+(.+?)(?=\s+(?:at|to|invoice|inv|after)\b|[?.!]|$)/i);
  return match?.[1]?.replace(/\b(?:the|client)\b/gi, " ").replace(/\s+/g, " ").trim() || undefined;
}

function numberFromMatch(text: string, pattern: RegExp): number | undefined {
  const value = text.match(pattern)?.[1];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function evaporationAddressFromText(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /\b(?:for|at)\s+(.+?)(?=\s+(?:with|using|surface\s+area|pool\s+area|water\s+temp|water\s+temperature|observed\s+loss|daily\s+loss|loss)\b|[?.!]|$)/i
  );
  const address = (match?.[1] ?? "")
    .replace(/\b(?:the\s+)?(?:evap|evaporation|calculator|report|pdf)\b/gi, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return address || undefined;
}

function evaporationInputFromText(text: string): Record<string, unknown> {
  const surfaceAreaFt2 = numberFromMatch(
    text,
    /\b(?:surface\s+area|pool\s+area|area)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:square\s*feet|sq\.?\s*ft|ft2)\b/i
  );
  const waterTempF = numberFromMatch(
    text,
    /\b(?:water\s+temp(?:erature)?|water\s+temperature)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:degrees?|deg|f|fahrenheit)?\b/i
  );
  const observedLossInches = numberFromMatch(
    text,
    /\b(?:observed\s+daily\s+loss|daily\s+loss|observed\s+loss|water\s+loss|loss)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:inches?|in\.?|")\b/i
  );
  const observationDays = numberFromMatch(
    text,
    /\b(?:over|across|for)\s+([\d,.]+)\s*(?:days?|24-hour|24\s*hours?)\b/i
  ) ?? 1;
  const windMphOverride = numberFromMatch(
    text,
    /\b(?:wind|wind\s+speed)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:mph|miles?\s+per\s+hour)\b/i
  );
  const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  const parsed: Record<string, unknown> = {};
  const address = evaporationAddressFromText(text);
  if (address) {
    parsed.address = address;
  }
  if (zip) {
    parsed.zip = zip;
  }
  if (surfaceAreaFt2 !== undefined) {
    parsed.surfaceAreaFt2 = surfaceAreaFt2;
  }
  if (waterTempF !== undefined) {
    parsed.waterTempF = waterTempF;
  }
  if (observedLossInches !== undefined) {
    parsed.observedLoss = { inches: observedLossInches, observationDays };
  }
  if (windMphOverride !== undefined) {
    parsed.windMphOverride = windMphOverride;
  }
  return parsed;
}

function deterministicToolNames(
  messages: GatewayMessage[],
  toolsByName: Map<string, NexiTool>,
  tenant?: Tenant | undefined,
  pendingApprovalInput?: PendingApprovalContext | null,
  requestorContext?: Pick<ToolLoopRequest, "requestorEmail" | "requestorPhones" | "requestorOrigin">
): string[] {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  const emailRef = emailRefFromText(userText);
  const distanceFollowUp = looksLikeAddressOnlyFollowUp(userText) && recentUserTextMatches(messages, looksLikeDistanceQuestion);
  const approvalContext = pendingApprovalInput ?? approvalContextFromMessages(messages);
  if (looksLikeFreeformContentDraftAction(lower)) {
    if (looksLikeReportBasedContentDraftAction(lower)) {
      return uniqueToolNames(["getJobDetail", "getDocuments"], toolsByName);
    }
    return [];
  }
  if (emailRef?.attachmentId && toolsByName.has("getEmailAttachment")) {
    return ["getEmailAttachment"];
  }
  if (emailRef && toolsByName.has("getEmailMessage")) {
    return ["getEmailMessage"];
  }
  if (approvalContext && looksLikeApprovalYes(userText) && toolsByName.has("approvePendingApproval")) {
    return ["approvePendingApproval"];
  }
  if (approvalContext && looksLikeApprovalNo(userText) && toolsByName.has("rejectPendingApproval")) {
    return ["rejectPendingApproval"];
  }
  if (
    approvalContext?.revisableClientCreate
    && toolsByName.has("revisePendingClientCreateApproval")
    && (approvalContext.awaitingChanges || hasClientApprovalChangeDetails(userText))
  ) {
    return ["revisePendingClientCreateApproval"];
  }
  if (
    approvalContext?.revisableQuoteCreate
    && toolsByName.has("revisePendingQuoteCreateApproval")
    && (approvalContext.awaitingChanges || hasQuoteApprovalChangeDetails(userText))
  ) {
    return ["revisePendingQuoteCreateApproval"];
  }
  if (
    approvalContext?.revisableJobCreate
    && toolsByName.has("revisePendingJobCreateApproval")
    && (approvalContext.awaitingChanges || /\b(?:change|fix|update|rename|title)\b/i.test(userText))
  ) {
    return ["revisePendingJobCreateApproval"];
  }
  if (
    approvalContext?.revisableJobAction
    && toolsByName.has("revisePendingJobActionApproval")
    && (approvalContext.awaitingChanges || /\b(?:close\s+and\s+invoice|invoice only|invoice it|close only|just close|dismiss(?: the)? reminder|archive without invoice)\b/i.test(userText))
  ) {
    return ["revisePendingJobActionApproval"];
  }
  if (
    approvalContext?.revisableLedgerAction
    && toolsByName.has("revisePendingLedgerActionApproval")
    && (approvalContext.awaitingChanges || hasLedgerApprovalChangeDetails(userText))
  ) {
    return ["revisePendingLedgerActionApproval"];
  }
  if (looksLikeClientDeleteRequest(userText) && toolsByName.has("deleteClient")) {
    return ["deleteClient"];
  }
  if (looksLikeSavedClientEditRequest(userText, messages) && toolsByName.has("updateClient")) {
    return ["updateClient"];
  }
  if (looksLikeCreateClientAction(lower) && toolsByName.has("createClient")) {
    return ["createClient"];
  }
  if (/\b(?:delete|remove)\b/i.test(lower) && /\b(?:client|customer|duplicate|record|entry)\b/i.test(lower) && toolsByName.has("deleteClient")) {
    return ["deleteClient"];
  }
  if (looksLikeSavedClientEditRequest(userText, messages) && toolsByName.has("updateClient")) {
    return ["updateClient"];
  }
  // Client-detail questions must win before generic cross-rail job matching.
  // A name plus a phone, address, email, or property question refers to the
  // client record unless the user explicitly asks about a job.
  if (
    toolsByName.has("clientLookup")
    && (
      looksLikeClientListQuestion(lower)
      || looksLikeNamedClientLookupQuestion(lower)
      || ((looksLikePhoneLookupQuestion(lower) || looksLikeAddressLookupQuestion(lower) || looksLikeEmailLookupQuestion(lower))
        && Boolean(clientLookupQueryFromText(userText) || entityQueryFromMessages(messages)))
      || (/\b(?:how many|which|what)\b.*\bpropert(?:y|ies)\b/i.test(userText)
        && Boolean(clientLookupQueryFromText(userText) || entityQueryFromMessages(messages)))
    )
  ) {
    return ["clientLookup"];
  }
  if (/\b(?:create|add|draft|new)\b.*\bquote\b/i.test(lower) && toolsByName.has("createQuote")) {
    return ["createQuote"];
  }
  if (/\b(?:create|add|draft|new)\b.*\bjob\b/i.test(lower) && toolsByName.has("createJob")) {
    return ["createJob"];
  }
  if (/\b(?:show|list|find|open)\b.*\bjobs?\b/i.test(lower) && toolsByName.has("listJobs")) {
    return ["listJobs"];
  }
  if (/\bjob\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower) && toolsByName.has("getJobDetail")) {
    return ["getJobDetail"];
  }
  if (/\b(?:close|invoice|archive)\b.*\bjob\b/i.test(lower) && toolsByName.has("queueJobAction")) {
    return ["queueJobAction"];
  }
  if (/\b(?:refund|void|bad debt|write\s+off)\b/i.test(lower) && toolsByName.has("queueLedgerAction")) {
    return ["queueLedgerAction"];
  }
  if (/\bcomplete\b.*\bvisit\b/i.test(lower) && toolsByName.has("completeVisit")) {
    return ["completeVisit"];
  }
  if (/\b(?:show|list|find|open)\b.*\bquotes?\b/i.test(lower) && toolsByName.has("listQuotes")) {
    return ["listQuotes"];
  }
  if (/\bquote\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower) && toolsByName.has("getQuoteDetail")) {
    return ["getQuoteDetail"];
  }
  if (/\b(?:show|list|find|open)\b.*\bpayments?\b/i.test(lower) && toolsByName.has("listPayments")) {
    return ["listPayments"];
  }
  if (/\bpayment\b/i.test(lower) && /\b(?:detail|details|tell me|show me|what(?:'| i)?s|what is|open)\b/i.test(lower) && toolsByName.has("getPaymentDetail")) {
    return ["getPaymentDetail"];
  }
  if (/\b(?:show|list|find|open)\b.*\bdeposits?\b/i.test(lower) && toolsByName.has("listDeposits")) {
    return ["listDeposits"];
  }
  if (/\b(?:show|list|find|open)\b.*\brefunds?\b/i.test(lower) && toolsByName.has("listRefunds")) {
    return ["listRefunds"];
  }
  if (/\b(?:show|list|find|open)\b.*\bcredits?\b/i.test(lower) && toolsByName.has("listCredits")) {
    return ["listCredits"];
  }
  if (looksLikeFinalizeIntakeAction(lower) && toolsByName.has("finalizeIntake")) {
    return ["finalizeIntake"];
  }
  if (looksLikeIntakeStatusQuestion(lower) && toolsByName.has("intakeStatus")) {
    return ["intakeStatus"];
  }
  if (looksLikeStartIntakeAction(lower) && toolsByName.has("startIntake")) {
    return ["startIntake"];
  }
  if (looksLikeAnswerIntakeAction(userText) && toolsByName.has("answerIntake")) {
    return ["answerIntake"];
  }
  if (looksLikeReportPdfEmailRequest(lower) && toolsByName.has("draftReportEmail")) {
    return ["draftReportEmail"];
  }
  if (looksLikeEmailDraftAction(lower) && requestorEmailForText(userText, requestorContext?.requestorEmail) && toolsByName.has("draftEmail")) {
    return ["draftEmail"];
  }
  if (looksLikeReviewRequestAction(lower) && toolsByName.has("draftReviewRequest")) {
    return ["draftReviewRequest"];
  }
  if (looksLikeReviewReplyAction(lower) && toolsByName.has("draftReviewReply")) {
    return uniqueToolNames(["reputationQueue", "draftReviewReply"], toolsByName);
  }
  if (looksLikeGbpProfileSyncAction(lower) && toolsByName.has("draftGbpProfileSync")) {
    return ["draftGbpProfileSync"];
  }
  if (looksLikeGbpReviewPollQuestion(lower) && toolsByName.has("pollGbpReviews")) {
    return ["pollGbpReviews"];
  }
  if (looksLikeReputationQueueQuestion(lower) && toolsByName.has("reputationQueue")) {
    return ["reputationQueue"];
  }
  if (looksLikeEvaporationRunQuestion(lower) && toolsByName.has("runEvaporation")) {
    const parsed = evaporationInputFromText(userText);
    return hasCompleteEvaporationInput(parsed)
      ? ["runEvaporation"]
      : uniqueToolNames(["getJobDetail", "getDocuments", "runEvaporation"], toolsByName);
  }
  if ((looksLikeDistanceQuestion(lower) || distanceFollowUp) && toolsByName.has("getDistance")) {
    const destination = distanceDestinationFromText(userText);
    if (looksLikeScheduleRelativeDistanceQuestion(lower)) {
      return uniqueToolNames(["getSchedule", "getDistance"], toolsByName);
    }
    return destination && looksLikeStreetAddress(destination)
      ? ["getDistance"]
      : uniqueToolNames(["getJobDetail", "getDistance"], toolsByName);
  }
  if (looksLikeCurrentTimeQuestion(lower) && toolsByName.has("getCurrentTime")) {
    return ["getCurrentTime"];
  }
  if (looksLikeCurrentWeatherQuestion(lower) && toolsByName.has("getCurrentWeather")) {
    return ["getCurrentWeather"];
  }
  if (looksLikeContentApproveAction(lower) && toolsByName.has("approve")) {
    return uniqueToolNames(["contentQueue", "approve"], toolsByName);
  }
  if (looksLikeContentRejectAction(lower) && toolsByName.has("rejectContentDraft")) {
    return uniqueToolNames(["contentQueue", "rejectContentDraft"], toolsByName);
  }
  if (looksLikeFreeformContentSaveAction(lower) && latestAssistantText(messages) && toolsByName.has("queueFreeformContent")) {
    return ["queueFreeformContent"];
  }
  if (looksLikeContentQueueQuestion(lower) && toolsByName.has("contentQueue")) {
    return ["contentQueue"];
  }
  if (looksLikeCampaignDraftAction(lower) && toolsByName.has("draftCampaign")) {
    return ["draftCampaign"];
  }
  if (looksLikeCampaignQueueQuestion(lower) && toolsByName.has("campaignQueue")) {
    return ["campaignQueue"];
  }
  if (looksLikeSeoRankQuestion(lower) && toolsByName.has("rankSnapshot")) {
    return ["rankSnapshot"];
  }
  if (looksLikeSeoAuditQuestion(lower) && toolsByName.has("auditSiteSeo")) {
    return ["auditSiteSeo"];
  }
  if (looksLikeSeoQueueQuestion(lower) && toolsByName.has("seoQueue")) {
    return ["seoQueue"];
  }
  if (looksLikeSeoBriefQuestion(lower) && toolsByName.has("draftSeoArticleBrief")) {
    return ["draftSeoArticleBrief"];
  }
  if (looksLikeSeoReportQuestion(lower) && toolsByName.has("seoReport")) {
    return ["seoReport"];
  }
  if (looksLikeInboxTriageQuestion(lower) && toolsByName.has("triageInbox")) {
    return ["triageInbox"];
  }
  if (looksLikeInboxSummaryQuestion(lower) && toolsByName.has("summarizeInbox")) {
    return ["summarizeInbox"];
  }
  if (firstEmailAddress(userText) && recentUserTextMatches(messages, looksLikeEmailSearchQuestion) && toolsByName.has("searchEmail")) {
    return ["searchEmail"];
  }
  if (looksLikeCorrectionFollowUp(lower)) {
    return uniqueToolNames(["getJobDetail", "getDocuments"], toolsByName);
  }
  if (looksLikePaymentStatusQuestion(lower)) {
    return uniqueToolNames(["getSchedule", "getJobDetail", "invoiceStatus", "searchEmail"], toolsByName);
  }
  if (looksLikePipelineQuestion(lower)) {
    return uniqueToolNames(["getPipeline"], toolsByName);
  }
  if (bareEntityFromText(userText) && recentUserTextMatches(messages, looksLikeReportMeasurementQuestion)) {
    return uniqueToolNames(crossRailJobDetailToolsForQuestion(previousUserText(messages).toLowerCase()), toolsByName);
  }
  if (
    looksLikeEmailLookupQuestion(lower)
    && Boolean(clientLookupQueryFromText(userText) || entityQueryFromMessages(messages))
    && toolsByName.has("clientLookup")
  ) {
    return uniqueToolNames(["clientLookup"], toolsByName);
  }
  if (looksLikeEmailSearchQuestion(lower) && toolsByName.has("searchEmail")) {
    return ["searchEmail"];
  }
  if (
    looksLikeClientListQuestion(lower)
    || looksLikeNamedClientLookupQuestion(lower)
    || ((looksLikePhoneLookupQuestion(lower) || looksLikeAddressLookupQuestion(lower) || looksLikeEmailLookupQuestion(lower))
      && Boolean(clientLookupQueryFromText(userText) || entityQueryFromMessages(messages)))
  ) {
    return uniqueToolNames(["clientLookup"], toolsByName);
  }
  if (looksLikeNamedJobLookupQuestion(lower)) {
    return uniqueToolNames(["getJobDetail"], toolsByName);
  }
  const crossRailTools = crossRailJobDetailToolsForQuestion(lower);
  if (crossRailTools.length > 0) {
    return uniqueToolNames(crossRailTools, toolsByName);
  }
  if ((lower.includes("photo") || lower.includes("picture") || lower.includes("image")) && toolsByName.has("getPhotos")) {
    return ["getPhotos"];
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
    return ["getDocuments"];
  }
  if (
    (looksLikeScheduleQuestion(userText) || (looksLikeScheduleFollowUp(userText) && Boolean(scheduleWindowFromConversation(messages, tenant?.timezone))))
    && toolsByName.has("getSchedule")
  ) {
    return ["getSchedule"];
  }
  return [];
}

function latestCachedToolRuns(cachedToolRuns: ToolRunTrace[] | undefined, toolNames: string[]): ToolRunTrace[] {
  const runs = cachedToolRuns ?? [];
  return toolNames.flatMap((toolName) => {
    const match = [...runs].reverse().find((run) => run.name === toolName);
    return match ? [match] : [];
  });
}

function hasExplicitPhotoTarget(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(?:photos?|pictures?|images?)\s+(?:for|of)\s+/.test(lower)
    || /^\s*(?:please\s+)?(?:show|find|get|pull|open)\s+(?:me\s+)?(?:the\s+)?.+?\s+(?:photos?|pictures?|images?)\s*[?.!]*$/i.test(text);
}

function hasFreshLookupTarget(text: string, timeZone?: string): boolean {
  const lower = text.toLowerCase();
  return Boolean(
    scheduleWindowFromText(text, timeZone)
    || entityQueryFromText(text)
    || clientLookupQueryFromText(text)
    || jobLookupQueryFromText(text)
    || looksLikeNamedClientLookupQuestion(lower)
    || looksLikeNamedJobLookupQuestion(lower)
    || hasExplicitPhotoTarget(text)
    || looksLikeEvaporationRunQuestion(lower)
    || looksLikeDistanceQuestion(lower)
    || looksLikeCurrentTimeQuestion(lower)
    || looksLikeCurrentWeatherQuestion(lower)
    || looksLikeSeoRankQuestion(lower)
    || looksLikeSeoAuditQuestion(lower)
    || looksLikeSeoQueueQuestion(lower)
    || looksLikeSeoBriefQuestion(lower)
    || looksLikeSeoReportQuestion(lower)
  );
}

function reusableCachedToolRuns(input: {
  messages: GatewayMessage[];
  toolsByName: Map<string, NexiTool>;
  tenant: Tenant;
  cachedToolRuns?: ToolRunTrace[] | undefined;
  pendingApproval?: PendingApprovalContext | null | undefined;
  requestorContext?: Pick<ToolLoopRequest, "requestorEmail" | "requestorPhones" | "requestorOrigin"> | undefined;
}): ToolRunTrace[] {
  const requested = deterministicToolNames(input.messages, input.toolsByName, input.tenant, input.pendingApproval, input.requestorContext);
  if (requested.length === 0 || hasFreshLookupTarget(latestUserText(input.messages), input.tenant.timezone)) {
    return [];
  }
  const cached = latestCachedToolRuns(input.cachedToolRuns, requested);
  return cached.length === requested.length ? cached : [];
}

async function runDeterministicTools(input: {
  tenant: Tenant;
  messages: GatewayMessage[];
  toolsByName: Map<string, NexiTool>;
  pendingApproval?: PendingApprovalContext | null | undefined;
  requestorContext?: Pick<ToolLoopRequest, "requestorEmail" | "requestorPhones" | "requestorOrigin"> | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
}): Promise<ToolRunTrace[]> {
  const toolNames = deterministicToolNames(input.messages, input.toolsByName, input.tenant, input.pendingApproval, input.requestorContext);
  const runs: ToolRunTrace[] = [];
  for (const toolName of toolNames) {
    const tool = input.toolsByName.get(toolName);
    if (!tool) {
      continue;
    }
    let args: unknown = {};
    try {
      args = tool.inputSchema.parse(
        await normalizeToolInput(
          tool.name,
          {},
          input.messages,
          input.tenant,
          runs,
          input.pendingApproval,
          input.requestorContext,
          {
            env: input.env,
            fetchFn: input.fetchFn
          }
        )
      );
      const result = await tool.handler(input.tenant, args);
      runs.push({ name: tool.name, input: args, result: result.result, sources: result.sources });
    } catch (error) {
      const safeError = safeToolErrorResult(tool.name, error);
      console.warn(JSON.stringify({
        event: "nexi_deterministic_tool_failure",
        toolName: tool.name,
        provider: safeError.provider ?? "unknown",
        op: safeError.op ?? "unknown",
        status: safeError.status ?? "unknown"
      }));
      runs.push({
        name: tool.name,
        input: args,
        result: safeError,
        sources: []
      });
    }
  }
  return runs;
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

function safeToolErrorResult(toolName: string, error?: unknown): Record<string, string | number> {
  const maybeRail = error && typeof error === "object" ? error as { provider?: unknown; op?: unknown; status?: unknown } : {};
  const diagnostic = diagnosticForToolFailure(toolName, error);
  return {
    error: `${toolName} failed safely before returning checked data.`,
    userMessage: "I couldn't finish that check. I wrote it down so we can fix it.",
    diagnosticCategory: diagnostic.diagnosticCategory,
    diagnosticSummary: diagnostic.diagnosticSummary,
    ...(typeof maybeRail.provider === "string" ? { provider: maybeRail.provider } : {}),
    ...(typeof maybeRail.op === "string" ? { op: maybeRail.op } : {}),
    ...(typeof maybeRail.status === "number" ? { status: maybeRail.status } : {})
  };
}

function diagnosticForToolFailure(toolName: string, error?: unknown): { diagnosticCategory: string; diagnosticSummary: string } {
  const maybeRail = error && typeof error === "object" ? error as { status?: unknown } : {};
  if (toolName === "draftReportEmail") {
    if (maybeRail.status === 403) {
      return {
        diagnosticCategory: "tenant_context_mismatch",
        diagnosticSummary: "I got to the email-draft step, but this request is attached to the wrong tenant workspace. Most likely break point: workspace sign-in, not Gmail."
      };
    }
    if (maybeRail.status === 503) {
      return {
        diagnosticCategory: "send_mailbox_not_configured",
        diagnosticSummary: "I got to the email-draft step, but the dedicated Nexi send mailbox was not available. Most likely break point: Gmail send setup."
      };
    }
    if (maybeRail.status === 400) {
      return {
        diagnosticCategory: "missing_report_email_input",
        diagnosticSummary: "I got to the email-draft step, but I was missing a required recipient or report detail. Most likely break point: request parsing."
      };
    }
    return {
      diagnosticCategory: "report_email_draft_failed",
      diagnosticSummary: "I got to the email-draft step, but the draft stopped before it reached approvals. Most likely break point: report lookup, PDF build, or approval details."
    };
  }
  return {
    diagnosticCategory: "tool_failed",
    diagnosticSummary: "The tool failed before returning checked data."
  };
}

const EMAIL_READ_TOOL_NAMES = new Set(["searchEmail", "getEmailThread", "getEmailMessage", "getEmailAttachment"]);

function emailNoSourceFallback(toolRuns: ToolLoopResponse["toolRuns"]): { answer: string; failureReason: string } | undefined {
  const emailRun = toolRuns.find((run) => EMAIL_READ_TOOL_NAMES.has(run.name) && run.sources.length === 0);
  if (!emailRun) {
    return undefined;
  }
  if (emailRun.name === "searchEmail") {
    return {
      answer: "I couldn't find an email that matched that. I wrote it down so we can fill the gap.",
      failureReason: "email_lookup_without_sources"
    };
  }
  return {
    answer: "I couldn't open that email yet. I wrote it down so we can fix it.",
    failureReason: "email_read_without_sources"
  };
}

function distanceAnswer(result: unknown): string {
  const distance = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const miles =
    typeof distance.distanceMiles === "number"
      ? `${distance.distanceMiles} miles`
      : typeof distance.distanceText === "string"
        ? distance.distanceText
        : "";
  return `Drive time to ${String(distance.destination ?? "that place")} is about ${String(distance.driveMinutes ?? "unknown")} minutes${miles ? ` (${miles})` : ""}.`;
}

function draftEmailAnswer(result: unknown): string {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const approval = record.approval && typeof record.approval === "object" ? record.approval as Record<string, unknown> : {};
  return `I drafted that email and put it in the approval queue${typeof approval.id === "string" ? ` (${approval.id})` : ""}. It has not been sent.`;
}

function draftReportEmailAnswer(result: unknown): string {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const approval = record.approval && typeof record.approval === "object" ? record.approval as Record<string, unknown> : {};
  const attachment = record.attachment && typeof record.attachment === "object" ? record.attachment as Record<string, unknown> : {};
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const attachmentNames = attachments
    .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).filename : undefined)
    .filter((item): item is string => typeof item === "string" && item.length > 0);
  const filename = typeof attachment.filename === "string" ? ` with ${attachment.filename} attached` : "";
  const files = attachmentNames.length
    ? ` with ${attachmentNames.length} PDF${attachmentNames.length === 1 ? "" : "s"} attached (${attachmentNames.slice(0, 3).join(", ")}${attachmentNames.length > 3 ? ", and more" : ""})`
    : filename;
  return `I drafted the report email${files} and put it in the approval queue${typeof approval.id === "string" ? ` (${approval.id})` : ""}. It has not been sent.`;
}

function draftReportEmailFailureAnswer(result: unknown): string | null {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  if (typeof record.error !== "string") {
    return null;
  }
  const diagnostic = typeof record.diagnosticSummary === "string" && record.diagnosticSummary.trim()
    ? ` ${record.diagnosticSummary.trim()}`
    : "";
  return `I couldn't create that report email draft yet.${diagnostic} I wrote it down so we can fix the email attachment path instead of guessing.`;
}

function queueFreeformContentAnswer(result: unknown): string {
  const record = objectRecord(result);
  const draft = objectRecord(record?.draft);
  const title = stringValue(draft?.title) ?? "that draft";
  const approvalId = stringValue(draft?.approvalId);
  return `I saved "${title}" to the content queue${approvalId ? ` (${approvalId})` : ""}. It is ready for review and has not been published.`;
}

function intakeAnswerSavedAnswer(result: unknown): string {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const nextQuestion = typeof record.nextQuestion === "string" ? record.nextQuestion : "keep going when you are ready.";
  return `I saved that onboarding answer. Next: ${nextQuestion}`;
}

function normalizeIdentityText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z0-9]+)'s\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikePhoneLookupQuestion(lower: string): boolean {
  return /\b(?:phone|telephone|mobile|cell|call|text)\b/.test(lower);
}

function looksLikeAddressLookupQuestion(lower: string): boolean {
  return /\b(?:address|street|road|drive|lane|avenue|court|trail|way|circle|boulevard|highway|zip|postal)\b/.test(lower)
    && !/\b(?:email|e-mail)\s+address\b/.test(lower);
}

function looksLikeClientEmailFieldQuestion(lower: string): boolean {
  return looksLikeEmailLookupQuestion(lower);
}

function arrayRecord(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((entry) => objectRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function joinAddressParts(value: unknown): string | undefined {
  const record = objectRecord(value);
  if (!record) {
    return undefined;
  }
  const joined = [
    record.street1,
    record.street2,
    record.city,
    record.province,
    record.state,
    record.postalCode,
    record.zip
  ].map(stringValue).filter(Boolean).join(", ").replace(/\s+,/g, ",").trim();
  return joined || undefined;
}

function clientPhoneFromRecord(record: Record<string, unknown>): string | undefined {
  const topLevel = Array.isArray(record.phones) ? record.phones.map(stringValue).filter(Boolean) : [];
  if (topLevel.length > 0) {
    return topLevel[0];
  }
  for (const contact of arrayRecord(record.contacts)) {
    const nested = Array.isArray(contact.phones)
      ? contact.phones
        .map((phone) => objectRecord(phone))
        .map((phone) => stringValue(phone?.value))
        .filter(Boolean)
      : [];
    if (nested.length > 0) {
      return nested[0];
    }
  }
  return undefined;
}

function clientEmailFromRecord(record: Record<string, unknown>): string | undefined {
  const topLevel = Array.isArray(record.emails) ? record.emails.map(stringValue).filter(Boolean) : [];
  if (topLevel.length > 0) {
    return topLevel[0];
  }
  for (const contact of arrayRecord(record.contacts)) {
    const nested = Array.isArray(contact.emails)
      ? contact.emails
        .map((email) => objectRecord(email))
        .map((email) => stringValue(email?.value))
        .filter(Boolean)
      : [];
    if (nested.length > 0) {
      return nested[0];
    }
  }
  return undefined;
}

function clientAddressFromRecord(record: Record<string, unknown>): string | undefined {
  for (const property of arrayRecord(record.relatedProperties)) {
    const joined = joinAddressParts(property.address);
    if (joined) {
      return joined;
    }
  }
  return joinAddressParts(record.billingAddress);
}

function formatClientLookupPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function clientLookupAnswer(latestText: string, messages: GatewayMessage[], result: unknown): string | undefined {
  const record = objectRecord(result);
  const rawClients = Array.isArray(record?.clients) ? record.clients : [];
  const parsedUserQuery = clientLookupQueryFromText(latestText);
  const requested = preferConversationClientEntity(
    /^(?:he|him|his|she|her|hers|they|them|their|theirs)$/i.test(parsedUserQuery)
      || (hasClientPronounReference(latestText) && !hasExplicitClientSubject(latestText))
      ? clientEntityFromPreviousUserMessages(messages)
      : parsedUserQuery,
    messages
  );
  const requestedNormalized = normalizeIdentityText(requested);
  const lower = latestText.toLowerCase();
  const phoneQuestion = looksLikePhoneLookupQuestion(lower);
  const addressQuestion = looksLikeAddressLookupQuestion(lower);
  const emailQuestion = looksLikeClientEmailFieldQuestion(lower);
  const clients = rawClients
    .map((client) => objectRecord(client))
    .filter((client): client is Record<string, unknown> => Boolean(client))
    .map((client) => ({
      raw: client,
      name: stringValue(client.name) ?? "",
      company: stringValue(client.company) ?? ""
    }))
    .filter((client) => client.name || client.company);
  if (looksLikeClientListQuestion(lower)) {
    const nativeCount = typeof record?.nativeCount === "number" ? record.nativeCount : clients.length;
    return `I found ${nativeCount.toLocaleString()} client${nativeCount === 1 ? "" : "s"} in the current client records.`;
  }
  const matches = requestedNormalized
    ? clients.filter((client) => {
        const values = [client.name, client.company].map(normalizeIdentityText).filter(Boolean);
        return values.some((value) => value === requestedNormalized || value.includes(requestedNormalized));
      })
    : clients;
  const names = [...new Set(matches.map((client) => client.name || client.company).filter(Boolean))];
  if (names.length === 0) {
    return requested
      ? `I checked the native client list, but I did not find ${requested}.`
      : "I checked the native client list, but I did not find a matching client.";
  }
  const foundIn = "the native client list";
  if ((phoneQuestion || addressQuestion || emailQuestion) && matches.length === 1) {
    const match = matches[0]!;
    const phone = clientPhoneFromRecord(match.raw);
    const email = clientEmailFromRecord(match.raw);
    if (phoneQuestion && emailQuestion) {
      const phoneLine = phone
        ? `Phone: ${formatClientLookupPhone(phone)}. Would you like me to call now?`
        : "Phone: no phone number on file yet.";
      const emailLine = email ? `Email: ${email}.` : "Email: no email on file yet.";
      return `Here are the contact details for ${match.name || match.company}.\n${phoneLine}\n${emailLine}`;
    }
    if (phoneQuestion) {
      return phone
        ? `The phone number on file for ${match.name || match.company} is ${formatClientLookupPhone(phone)}.\n\nWould you like me to call now?`
        : `I found ${match.name || match.company}, but there is no phone number on file yet.`;
    }
    if (addressQuestion) {
      const address = clientAddressFromRecord(match.raw);
      return address
        ? `The address on file for ${match.name || match.company} is ${address}.\n\nWould you like directions or should I open it in Maps?`
        : `I found ${match.name || match.company}, but there is no address on file yet.`;
    }
    if (emailQuestion) {
      return email
        ? `The email on file for ${match.name || match.company} is ${email}.`
        : `I found ${match.name || match.company}, but there is no email on file yet.`;
    }
  }
  if ((phoneQuestion || addressQuestion || emailQuestion) && matches.length > 1) {
    return `I found ${matches.length} matching clients for ${requested || "that lookup"}. Give me the exact client name so I can pull the right ${phoneQuestion ? "phone number" : addressQuestion ? "address" : "email address"}.`;
  }
  if (names.length === 1) {
    return `I found ${names[0]} in ${foundIn}.`;
  }
  return `I found ${names.length} matching clients in ${foundIn}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", and more" : ""}.`;
}

function approvalDisplayName(actorDisplayName?: string | null): string {
  return actorDisplayName?.trim() || "Operator";
}

function approvalRequestSummary(title: string): string {
  const [action, subject] = title.split(":");
  if (!action || !subject) {
    return title.trim();
  }
  return `${action.trim().toLowerCase()} for ${subject.trim()}`;
}

function previewFieldValue(body: string, label: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
}

function formatConfirmationPhone(phone: string | undefined): string | undefined {
  if (!phone) {
    return undefined;
  }
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function cleanClientPreviewName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const cleaned = trimmed.replace(/^[.\s,:;-]+|[.\s,:;-]+$/g, "").replace(/\s+/g, " ").trim();
  return /[a-z0-9]/i.test(cleaned) ? cleaned : undefined;
}

function missingClientNamePrompt(): string {
  return "I still need the client's full name before I can queue this. What should I save as the client name?";
}

function normalizedApprovalTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  if (!trimmed) {
    return undefined;
  }
  const [action, ...subjectParts] = trimmed.split(":");
  const cleanedAction = action?.trim();
  const cleanedSubject = cleanClientPreviewName(subjectParts.join(":"));
  if (cleanedAction && cleanedSubject) {
    return `${cleanedAction}: ${cleanedSubject}`;
  }
  if (cleanedAction && subjectParts.length > 0) {
    return cleanedAction;
  }
  return cleanClientPreviewName(trimmed);
}

function clientApprovalPromptAnswer(title: string, body: string): string {
  const fallbackName = cleanClientPreviewName(title.split(":").slice(1).join(":"));
  const name = cleanClientPreviewName(previewFieldValue(body, "Name")) ?? fallbackName;
  if (!name) {
    return missingClientNamePrompt();
  }
  const street = previewFieldValue(body, "Address");
  const city = previewFieldValue(body, "City");
  const state = previewFieldValue(body, "State");
  const zip = previewFieldValue(body, "ZIP");
  const addressLine = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const phone = formatConfirmationPhone(previewFieldValue(body, "Phone"));
  const email = previewFieldValue(body, "Email");
  return [
    name,
    addressLine,
    phone,
    email && !/not provided/i.test(email) ? email : "Email not provided",
    "",
    "Do the Client Details look correct?"
  ].filter((line, index, lines) => line || index >= lines.length - 2).join("\n");
}

function approvalPromptAnswer(
  result: unknown,
  actorDisplayName?: string | null,
  options: { allowChanges?: boolean } = {}
): string | undefined {
  const record = objectRecord(result);
  const approval = objectRecord(record?.approval);
  const preview = objectRecord(approval?.preview);
  const title = stringValue(preview?.title);
  const body = stringValue(preview?.body);
  if (!title || !body) {
    return undefined;
  }
  if (/^(?:create|revise) client:/i.test(title)) {
    return clientApprovalPromptAnswer(title, body);
  }
  const approvalLine = options.allowChanges === false
    ? "Is this correct?\nReply yes / no."
    : "Is this correct?\nReply yes / no / make changes.";
  return `Here is your request, ${approvalDisplayName(actorDisplayName)}.\n\nYou requested ${approvalRequestSummary(title)} with the following details:\n${body}\n\n${approvalLine}`;
}

function approvalExecutionAnswer(result: unknown): string | undefined {
  const record = objectRecord(result);
  const execution = objectRecord(record?.execution);
  const client = objectRecord(execution?.client);
  const quote = objectRecord(execution?.quote);
  const job = objectRecord(execution?.job);
  const invoice = objectRecord(execution?.invoice);
  const payment = objectRecord(execution?.payment);
  const refund = objectRecord(execution?.refund);
  const receiptReview = objectRecord(execution?.receiptReview);
  const changeSummary = stringValue(execution?.changeSummary);
  if (client?.name && typeof client.name === "string" && changeSummary) {
    return `Approved and updated ${client.name}. ${changeSummary}`;
  }
  if (client?.name && typeof client.name === "string") {
    return `Approved and created ${client.name}.`;
  }
  if (quote?.title && typeof quote.title === "string") {
    const quoteNumber = typeof quote.number === "string" && quote.number.trim() ? ` ${quote.number}` : "";
    return `Approved and created quote${quoteNumber}: ${quote.title}.`;
  }
  if (job?.title && typeof job.title === "string") {
    const jobNumber = typeof job.number === "string" && job.number.trim() ? ` ${job.number}` : "";
    const invoiceText = invoice?.id ? ` Invoice ${String(invoice.number ?? invoice.id)} is ready.` : "";
    return `Approved and executed job${jobNumber}: ${job.title}.${invoiceText}`.trim();
  }
  if (refund?.id) {
    return `Approved and recorded refund ${String(refund.id)}${receiptReview?.id ? `. Receipt review ${String(receiptReview.id)} is paused for review.` : "."}`;
  }
  if (invoice?.id && (payment?.id || execution?.preview)) {
    return `Approved and updated invoice ${String(invoice.number ?? invoice.id)}${payment?.id ? ` with payment ${String(payment.id)}` : ""}.`;
  }
  return "Approved and executed the pending item.";
}

function approvalRejectionAnswer(result: unknown): string | undefined {
  const record = objectRecord(result);
  const approval = objectRecord(record?.approval);
  const preview = objectRecord(approval?.preview);
  const title = normalizedApprovalTitle(stringValue(preview?.title));
  return title
    ? `Rejected ${title}. Nothing was created.`
    : "Rejected the pending item. Nothing was created.";
}

function directAnswerFromDeterministicRuns(
  messages: GatewayMessage[],
  toolRuns: ToolRunTrace[],
  actorDisplayName?: string | null
): string | undefined {
  const latestText = latestUserText(messages);
  const lower = latestText.toLowerCase();
  const distanceFollowUp = looksLikeAddressOnlyFollowUp(latestText) && recentUserTextMatches(messages, looksLikeDistanceQuestion);
  const createClientRun = [...toolRuns].reverse().find((run) => run.name === "createClient");
  if (createClientRun) {
    const record = objectRecord(createClientRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(createClientRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const updateClientRun = [...toolRuns].reverse().find((run) => run.name === "updateClient");
  if (updateClientRun) {
    const clarification = stringValue(objectRecord(updateClientRun.result)?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(updateClientRun.result, actorDisplayName, { allowChanges: false });
    if (prompt) {
      return prompt;
    }
  }
  const deleteClientRun = [...toolRuns].reverse().find((run) => run.name === "deleteClient");
  if (deleteClientRun) {
    const record = objectRecord(deleteClientRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const blocked = stringValue(record?.message);
    if (record?.deleteBlocked && blocked) {
      return blocked;
    }
    const prompt = approvalPromptAnswer(deleteClientRun.result, actorDisplayName, { allowChanges: false });
    if (prompt) {
      return prompt;
    }
  }
  const createQuoteRun = [...toolRuns].reverse().find((run) => run.name === "createQuote");
  if (createQuoteRun) {
    const prompt = approvalPromptAnswer(createQuoteRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const createJobRun = [...toolRuns].reverse().find((run) => run.name === "createJob");
  if (createJobRun) {
    const record = objectRecord(createJobRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(createJobRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const reviseClientRun = [...toolRuns].reverse().find((run) => run.name === "revisePendingClientCreateApproval");
  if (reviseClientRun) {
    const record = objectRecord(reviseClientRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(reviseClientRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const reviseQuoteRun = [...toolRuns].reverse().find((run) => run.name === "revisePendingQuoteCreateApproval");
  if (reviseQuoteRun) {
    const record = objectRecord(reviseQuoteRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(reviseQuoteRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const reviseJobCreateRun = [...toolRuns].reverse().find((run) => run.name === "revisePendingJobCreateApproval");
  if (reviseJobCreateRun) {
    const record = objectRecord(reviseJobCreateRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(reviseJobCreateRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const queueJobActionRun = [...toolRuns].reverse().find((run) => run.name === "queueJobAction");
  if (queueJobActionRun) {
    const record = objectRecord(queueJobActionRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(queueJobActionRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const queueLedgerActionRun = [...toolRuns].reverse().find((run) => run.name === "queueLedgerAction");
  if (queueLedgerActionRun) {
    const record = objectRecord(queueLedgerActionRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(queueLedgerActionRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const completeVisitRun = [...toolRuns].reverse().find((run) => run.name === "completeVisit");
  if (completeVisitRun) {
    const record = objectRecord(completeVisitRun.result);
    const visit = objectRecord(record?.visit);
    const job = objectRecord(record?.job);
    if (visit || job) {
      return `I marked ${String(visit?.title ?? "that visit")} complete. ${String(job?.title ?? "The job")} is now ${String(job?.status ?? "updated")}.`;
    }
  }
  const reviseJobActionRun = [...toolRuns].reverse().find((run) => run.name === "revisePendingJobActionApproval");
  if (reviseJobActionRun) {
    const record = objectRecord(reviseJobActionRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(reviseJobActionRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const reviseLedgerActionRun = [...toolRuns].reverse().find((run) => run.name === "revisePendingLedgerActionApproval");
  if (reviseLedgerActionRun) {
    const record = objectRecord(reviseLedgerActionRun.result);
    const clarification = stringValue(record?.needsClarification);
    if (clarification) {
      return clarification;
    }
    const prompt = approvalPromptAnswer(reviseLedgerActionRun.result, actorDisplayName);
    if (prompt) {
      return prompt;
    }
  }
  const approveApprovalRun = [...toolRuns].reverse().find((run) => run.name === "approvePendingApproval");
  if (approveApprovalRun) {
    return approvalExecutionAnswer(approveApprovalRun.result);
  }
  const rejectApprovalRun = [...toolRuns].reverse().find((run) => run.name === "rejectPendingApproval");
  if (rejectApprovalRun) {
    return approvalRejectionAnswer(rejectApprovalRun.result);
  }
  const distanceRun = [...toolRuns].reverse().find((run) => run.name === "getDistance" && run.sources.length > 0);
  if (distanceRun && (looksLikeDistanceQuestion(lower) || distanceFollowUp)) {
    return distanceAnswer(distanceRun.result);
  }
  const draftRun = [...toolRuns].reverse().find((run) => run.name === "draftEmail" && run.sources.length > 0);
  if (draftRun && looksLikeEmailDraftAction(lower)) {
    return draftEmailAnswer(draftRun.result);
  }
  const reportEmailRun = [...toolRuns].reverse().find((run) => run.name === "draftReportEmail");
  if (reportEmailRun && looksLikeReportPdfEmailRequest(lower)) {
    const failureAnswer = draftReportEmailFailureAnswer(reportEmailRun.result);
    return failureAnswer ?? draftReportEmailAnswer(reportEmailRun.result);
  }
  const freeformContentRun = [...toolRuns].reverse().find((run) => run.name === "queueFreeformContent" && run.sources.length > 0);
  if (freeformContentRun && looksLikeFreeformContentSaveAction(lower)) {
    return queueFreeformContentAnswer(freeformContentRun.result);
  }
  const intakeAnswerRun = [...toolRuns].reverse().find((run) => run.name === "answerIntake" && run.sources.length > 0);
  if (intakeAnswerRun && looksLikeAnswerIntakeAction(latestText)) {
    return intakeAnswerSavedAnswer(intakeAnswerRun.result);
  }
  const clientLookupRun = [...toolRuns].reverse().find((run) => run.name === "clientLookup" && run.sources.length > 0);
  if (
    clientLookupRun
    && !looksLikeClientListQuestion(lower)
    && (looksLikeNamedClientLookupQuestion(lower) || looksLikePhoneLookupQuestion(lower) || looksLikeAddressLookupQuestion(lower) || looksLikeClientEmailFieldQuestion(lower))
  ) {
    return clientLookupAnswer(latestText, messages, clientLookupRun.result);
  }
  return undefined;
}

function stripUnrequestedNextSteps(answer: string): string {
  const lines = answer.split(/\r?\n/);
  const cleaned: string[] = [];
  const nextStepPattern = /\b(?:want me to|do you want me to|would you like|should i|anything else|or are you looking|if you need|let me know if you(?: want| would like|'d like))/i;
  for (const line of lines) {
    const nextStepIndex = line.search(nextStepPattern);
    if (nextStepIndex >= 0) {
      const factualPrefix = line.slice(0, nextStepIndex).trimEnd();
      if (factualPrefix) {
        cleaned.push(factualPrefix);
      }
      break;
    }
    cleaned.push(line);
  }
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

  const sourceCheck = enforceSources(stripUnrequestedNextSteps(call.answer), request.sources, latestUserText(request.messages));
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
  const directResponse = directNoToolResponseForRequest(messages, request.pendingApproval);
  if (directResponse) {
    await writeUsageRecord({
      tenantId: request.tenant.id,
      routeActionName: request.routeActionName,
      taskType: request.taskType,
      usage: emptyUsage(),
      ok: !directResponse.failureReason,
      errorSummary: directResponse.failureReason ?? "",
      usageLog: request.usageLog
    });
    return {
      answer: directResponse.answer,
      sources: [],
      usage: emptyUsage(),
      raw: { directNoToolResponse: true },
      failureReason: directResponse.failureReason,
      toolRuns: [],
      pendingApproval: directResponse.pendingApproval ?? request.pendingApproval ?? null
    };
  }
  const capabilityGap = capabilityGapForRequest(messages, toolsByName);
  if (capabilityGap) {
    await writeUsageRecord({
      tenantId: request.tenant.id,
      routeActionName: request.routeActionName,
      taskType: request.taskType,
      usage: emptyUsage(),
      ok: false,
      errorSummary: capabilityGap.failureReason,
      usageLog: request.usageLog
    });
    return {
      answer: capabilityGap.answer,
      sources: [],
      usage: emptyUsage(),
      raw: { capabilityGap: true },
      failureReason: capabilityGap.failureReason,
      toolRuns: [],
      pendingApproval: request.pendingApproval ?? null
    };
  }
  let sources: Source[] = [];
  let totalUsage = emptyUsage();
  const toolRuns: ToolRunTrace[] = [];
  const rawIterations: unknown[] = [];
  const maxToolIterations = request.maxToolIterations ?? MAX_TOOL_ITERATIONS;
  const claudeFirstRouting = usesClaudeFirstRouting(request.env);
  // A saved approval is a safety boundary, not a conversational inference
  // exercise.  Claude-first mode remains responsible for ordinary language,
  // but a plain confirmation/rejection must execute the exact persisted
  // approval ID instead of asking the model to infer a new tool call.
  const pendingApproval = request.pendingApproval ?? approvalContextFromMessages(request.messages);
  const approvalTransition = Boolean(
    pendingApproval
    && (looksLikeApprovalYes(latestUserText(request.messages)) || looksLikeApprovalNo(latestUserText(request.messages)))
  );
  const currentUserText = latestUserText(request.messages);
  // Client address, phone, and email questions are source-bound facts. Resolve
  // simple named questions and pronoun follow-ups directly against the checked
  // client rail; keep site/property questions on the normal Claude-first path
  // because they need the model to distinguish billing from a named site.
  const clientDetailQuery = hasClientPronounReference(currentUserText)
    && !hasExplicitClientSubject(currentUserText)
    ? clientEntityFromPreviousUserMessages(request.messages)
    : clientLookupQueryFromText(currentUserText) || entityQueryFromMessages(request.messages, { skipLatest: true });
  const deterministicClientDetailRead = Boolean(
    toolsByName.has("clientLookup")
    && (looksLikePhoneLookupQuestion(currentUserText.toLowerCase())
      || looksLikeClientEmailFieldQuestion(currentUserText.toLowerCase())
      || (looksLikeAddressLookupQuestion(currentUserText.toLowerCase())
        && !/\b(?:site\s+contact|property|job\s+site)\b/i.test(currentUserText)))
    && Boolean(clientDetailQuery)
  );
  const reusableRuns = claudeFirstRouting
    ? []
    : reusableCachedToolRuns({
        tenant: request.tenant,
        messages,
        toolsByName,
        cachedToolRuns: request.cachedToolRuns,
        pendingApproval: request.pendingApproval,
        requestorContext: {
          requestorEmail: request.requestorEmail,
          requestorPhones: request.requestorPhones,
          requestorOrigin: request.requestorOrigin
        }
      });
  const deterministicRuns = claudeFirstRouting && !approvalTransition && !deterministicClientDetailRead
    ? []
    : reusableRuns.length > 0
      ? reusableRuns
      : await runDeterministicTools({
          tenant: request.tenant,
          messages,
          toolsByName,
          pendingApproval: request.pendingApproval,
          requestorContext: {
            requestorEmail: request.requestorEmail,
            requestorPhones: request.requestorPhones,
            requestorOrigin: request.requestorOrigin
          },
          env: request.env,
          fetchFn: request.fetchFn
        });
  const suppressToolsForFreeformDraft = looksLikeFreeformContentDraftAction(latestUserText(request.messages).toLowerCase());
  if (deterministicRuns.length > 0) {
    sources = [...sources, ...deterministicRuns.flatMap((run) => run.sources)];
    toolRuns.push(...deterministicRuns);
    const emailFallback = emailNoSourceFallback(deterministicRuns);
    if (emailFallback) {
      await writeUsageRecord({
        tenantId: request.tenant.id,
        routeActionName: request.routeActionName,
        taskType: request.taskType,
        usage: emptyUsage(),
        ok: false,
        errorSummary: emailFallback.failureReason,
        usageLog: request.usageLog
      });
      return {
        answer: emailFallback.answer,
        sources,
        usage: totalUsage,
        raw: { iterations: rawIterations },
        failureReason: emailFallback.failureReason,
        toolRuns,
        pendingApproval: pendingApprovalFromToolRuns(toolRuns, request.pendingApproval)
      };
    }
    const directDeterministicAnswer = directAnswerFromDeterministicRuns(
      request.messages,
      deterministicRuns,
      request.actorDisplayName
    );
    if (directDeterministicAnswer) {
      await writeUsageRecord({
        tenantId: request.tenant.id,
        routeActionName: request.routeActionName,
        taskType: request.taskType,
        usage: emptyUsage(),
        ok: true,
        errorSummary: "",
        usageLog: request.usageLog
      });
      return {
        answer: directDeterministicAnswer,
        sources,
        usage: totalUsage,
        raw: { deterministicDirectAnswer: true },
        toolRuns,
        pendingApproval: pendingApprovalFromToolRuns(toolRuns, request.pendingApproval)
      };
    }
    const toolNames = deterministicRuns.map((run) => run.name).join(", ");
    messages.push({
      role: "assistant",
      content: `${reusableRuns.length > 0 ? "I found saved checked records" : "I found checked records"} from ${toolNames} and will use them for the final answer.`
    });
    messages.push({
      role: "user",
      content: [
        ...deterministicRuns.flatMap((run) => [`Verified ${run.name} result:`, toolResultContent(run.result)]),
        "Answer the original user request using only these checked records. For job issue, technician, measurement, total-gallons, completion-time, service-time, and report/checklist questions, compare every verified work-record source before answering; do not treat one source missing a field as proof that no work-record answer exists. For payment, paid/unpaid, invoice, balance, and receipt questions, compare the verified billing records before answering; do not treat lead status as proof of unpaid. Say clearly when the checked records have no matching data. Keep record labels attached in the API response."
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
        tools: deterministicRuns.length > 0 || suppressToolsForFreeformDraft ? [] : toolDefinitions,
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
      const sourceCheck = enforceSources(stripUnrequestedNextSteps(call.answer), sources, latestUserText(request.messages));
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
        toolRuns,
        pendingApproval: pendingApprovalFromToolRuns(toolRuns, request.pendingApproval)
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
      let args: unknown = toolUse.input;
      try {
        args = tool.inputSchema.parse(
          await normalizeToolInput(
            toolUse.name,
            toolUse.input,
            messages,
            request.tenant,
            toolRuns,
            request.pendingApproval,
            {
              requestorEmail: request.requestorEmail,
              requestorPhones: request.requestorPhones,
              requestorOrigin: request.requestorOrigin
            },
            {
              env: request.env,
              fetchFn: request.fetchFn
            }
          )
        );
        const result = await tool.handler(request.tenant, args);
        sources = [...sources, ...result.sources];
        toolRuns.push({ name: tool.name, input: args, result: result.result, sources: result.sources });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolResultContent(result.result)
        });
      } catch (error) {
        const safeResult = safeToolErrorResult(tool.name, error);
        toolRuns.push({ name: tool.name, input: args, result: safeResult, sources: [] });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: toolResultContent(safeResult)
        });
      }
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
    toolRuns,
    pendingApproval: pendingApprovalFromToolRuns(toolRuns, request.pendingApproval)
  };
}
