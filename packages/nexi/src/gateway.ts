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
  if (/\btomorrow\b/.test(lower)) {
    const today = zonedParts(new Date(), timeZone);
    return dateWindow(addCalendarDays(today, 1), timeZone);
  }
  if (/\b(?:today|tonight)\b/.test(lower)) {
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
    /\b(?:for|of|at)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  const candidate = matches.at(-1)?.[1] ?? "";
  return candidate
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToolInput(toolName: string, input: unknown, messages: GatewayMessage[], tenant?: Tenant | undefined): unknown {
  const record = input && typeof input === "object" && !Array.isArray(input) ? { ...input as Record<string, unknown> } : {};
  const userText = latestUserText(messages);
  if (toolName === "getSchedule") {
    const fallback = scheduleWindowFromConversation(messages, tenant?.timezone) ?? todayWindow(tenant?.timezone);
    record.from ??= fallback.from;
    record.to ??= fallback.to;
  }
  if (toolName === "getPhotos" && !record.projectQuery) {
    record.projectQuery = entityQueryFromText(userText) || photoQueryFromText(userText);
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

function hasScheduleDateCue(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(?:today|tonight|tomorrow)\b/.test(lower)
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
  return /\b(?:issue|problem|finding|findings|result|results|leak detection)\b/.test(lower);
}

function looksLikeTechnicianQuestion(lower: string): boolean {
  return /\b(?:technician|tech|who was there|who went|who did|who performed)\b/.test(lower);
}

function deterministicToolNames(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>, tenant?: Tenant | undefined): string[] {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  if (looksLikeTechnicianQuestion(lower)) {
    return uniqueToolNames(["getJobDetail", "getDocuments", "getPhotos"], toolsByName);
  }
  if (looksLikeIssueQuestion(lower)) {
    return uniqueToolNames(["getJobDetail", "getDocuments"], toolsByName);
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
  if (lower.includes("gallon") && toolsByName.has("lookupSiteJobBlueprintField")) {
    return ["lookupSiteJobBlueprintField"];
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
  return Boolean(scheduleWindowFromText(text, timeZone) || entityQueryFromText(text) || hasExplicitPhotoTarget(text));
}

function reusableCachedToolRuns(input: {
  messages: GatewayMessage[];
  toolsByName: Map<string, NexiTool>;
  tenant: Tenant;
  cachedToolRuns?: ToolRunTrace[] | undefined;
}): ToolRunTrace[] {
  const requested = deterministicToolNames(input.messages, input.toolsByName, input.tenant);
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
}): Promise<ToolRunTrace[]> {
  const toolNames = deterministicToolNames(input.messages, input.toolsByName, input.tenant);
  const runs: ToolRunTrace[] = [];
  for (const toolName of toolNames) {
    const tool = input.toolsByName.get(toolName);
    if (!tool) {
      continue;
    }
    try {
      const args = tool.inputSchema.parse(normalizeToolInput(tool.name, {}, input.messages, input.tenant));
      const result = await tool.handler(input.tenant, args);
      runs.push({ name: tool.name, result: result.result, sources: result.sources });
    } catch (error) {
      if (toolNames.length === 1) {
        throw error;
      }
      runs.push({
        name: tool.name,
        result: { error: error instanceof Error ? error.message : "Tool failed before returning source data." },
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
  let sources: Source[] = [];
  let totalUsage = emptyUsage();
  const toolRuns: ToolRunTrace[] = [];
  const rawIterations: unknown[] = [];
  const maxToolIterations = request.maxToolIterations ?? MAX_TOOL_ITERATIONS;
  const reusableRuns = reusableCachedToolRuns({
    tenant: request.tenant,
    messages,
    toolsByName,
    cachedToolRuns: request.cachedToolRuns
  });
  const deterministicRuns = reusableRuns.length > 0 ? reusableRuns : await runDeterministicTools({ tenant: request.tenant, messages, toolsByName });
  if (deterministicRuns.length > 0) {
    sources = [...sources, ...deterministicRuns.flatMap((run) => run.sources)];
    toolRuns.push(...deterministicRuns);
    const toolNames = deterministicRuns.map((run) => run.name).join(", ");
    messages.push({
      role: "assistant",
      content: `${reusableRuns.length > 0 ? "I found cached verified source data" : "I found verified source data"} from ${toolNames} and will use it for the final answer.`
    });
    messages.push({
      role: "user",
      content: [
        ...deterministicRuns.flatMap((run) => [`Verified ${run.name} result:`, toolResultContent(run.result)]),
        "Answer the original user request using only these verified results. For job issue and technician questions, compare Jobber and CompanyCam rails before answering, and say clearly when one rail has no matching data. Keep the source labels attached in the API response."
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
        tools: deterministicRuns.length > 0 ? [] : toolDefinitions,
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
      const args = tool.inputSchema.parse(normalizeToolInput(toolUse.name, toolUse.input, messages, request.tenant));
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
