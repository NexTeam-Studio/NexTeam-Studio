import type { NexiTool, Source, Tenant, UsageLogRecord } from "@nexteam/core";
import { RailError } from "@nexteam/core";
import { enforceSources, promptIsMetaOrFeedback } from "./sourceCheck.js";

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

function bareEntityFromText(text: string): string {
  const trimmed = text.replace(/[?.!]+$/g, "").trim();
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(trimmed) ? trimmed : "";
}

function currentEntityFromText(text: string): string {
  return namedEntityFromText(text) || entityQueryFromText(text) || bareEntityFromText(text);
}

function clientLookupQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const lookupMatch = normalized.match(/\b(?:look\s+up|lookup|find|show|check|get|pull)\s+(?:the\s+)?(?:client|customer)\s+(.+)$/i);
  const clientFirstMatch = normalized.match(/\b(?:client|customer)\s+(.+)$/i);
  const possessiveMatch = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'?\s+(?:client|customer|job|jobs)\b/);
  const candidate = lookupMatch?.[1] ?? clientFirstMatch?.[1] ?? possessiveMatch?.[1] ?? currentEntityFromText(text);
  return candidate
    .replace(/\b(?:in|from|on|with)\s+(?:jobber|crm|native|the\s+crm).*$/i, "")
    .replace(/\b(?:record|profile|file|account|jobs?)\b$/i, "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:is|was|has|on|at|[-—])/);
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
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
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
  if (/\bsq(?:uare)?\s*ft|square footage|surface area|ft2|ft²/.test(lower)) return "surfaceAreaSqFt";
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

function distanceDestinationFromText(text: string): string | undefined {
  if (/\b(?:today'?s?\s+pool|today'?s?\s+job|today'?s?\s+visit|current\s+job|current\s+pool|that\s+pool|that\s+job|it)\b/i.test(text)) {
    return undefined;
  }
  const direct = text.match(
    /\b(?:how\s+far(?:\s+is)?|distance\s+(?:to|for)|drive\s+time\s+(?:to|for)|travel\s+time\s+(?:to|for)|miles?\s+(?:to|from))\s+(.+?)(?=\s+from\s+(?:my\s+house|the\s+shop|here|102\s+kate|aquatrace)|[?.!]|$)/i
  )?.[1]?.trim();
  if (direct) {
    return direct.replace(/^is\s+/i, "").trim();
  }
  return looksLikeStreetAddress(text) ? text.trim() : undefined;
}

function distanceOriginFromText(text: string): string | undefined {
  const match = text.match(/\bfrom\s+(.+?)(?:[?.!]|$)/i)?.[1]?.trim();
  if (!match || /^(?:my\s+house|the\s+shop|here|aquatrace)$/i.test(match)) {
    return undefined;
  }
  return match;
}

function hasCompleteEvaporationInput(input: Record<string, unknown>): boolean {
  return typeof input.address === "string"
    && numberValue(input.surfaceAreaFt2) !== undefined
    && numberValue(input.waterTempF) !== undefined;
}

function normalizeToolInput(toolName: string, input: unknown, messages: GatewayMessage[], tenant?: Tenant | undefined, priorRuns: ToolRunTrace[] = []): unknown {
  const record = input && typeof input === "object" && !Array.isArray(input) ? { ...input as Record<string, unknown> } : {};
  const userText = latestUserText(messages);
  const lowerUserText = userText.toLowerCase();
  const correctionFollowUp = looksLikeCorrectionFollowUp(lowerUserText);
  const emailRef = emailRefFromText(userText);
  if (toolName === "createClient") {
    const parsed = createClientInputFromText(userText);
    record.name ??= parsed.name;
    record.address ??= parsed.address;
    record.emails ??= parsed.emails;
    record.phones ??= parsed.phones;
    record.consent ??= parsed.consent;
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
    const parsed = draftEmailInputFromText(userText);
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
  if (toolName === "approve") {
    record.draftId ??= contentDraftIdFromText(userText) ?? contentDraftIdFromPriorRuns(priorRuns);
  }
  if (toolName === "rejectContentDraft") {
    record.draftId ??= contentDraftIdFromText(userText) ?? contentDraftIdFromPriorRuns(priorRuns);
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
  if (toolName === "clientLookup" && (typeof record.q !== "string" || (!record.q.trim() && !looksLikeClientListQuestion(lowerUserText)))) {
    record.q = looksLikeClientListQuestion(lowerUserText)
      ? ""
      : clientLookupQueryFromText(userText) || entityQueryFromMessages(messages) || "";
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
    record.origin ??= distanceOriginFromText(userText);
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
    record.locationId ??= "aquatrace-primary";
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
    record.address ??= jobAddressFromPriorRuns(priorRuns);
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
  return /\b(?:gallons per inch|square footage|sq ft|ft2|ftÂ²|total gallons|pool gallons|how many gallons|measurements?)\b/.test(lower);
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
    || /\b(?:evap|evaporation)\s+(?:calculator|report|pdf)\b/.test(lower);
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

function looksLikeSeoRankQuestion(lower: string): boolean {
  return /\b(?:seo|rank|ranking|rankings|keyword|keywords|search)\b/.test(lower)
    && /\b(?:where\s+do\s+we\s+rank|rank\s+snapshot|rank\s+tracking|track|position|positions|ranking|rankings)\b/.test(lower);
}

function looksLikeSeoAuditQuestion(lower: string): boolean {
  return /\b(?:seo|search|on-page|schema|json-ld|meta|title)\b/.test(lower)
    && /\b(?:audit|check|scan|fix|repair)\b/.test(lower)
    && /\b(?:site|website|page|aquatrace)\b/.test(lower);
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
    || /\b(?:client|customer)\s+(?:record|profile|file|account)\s+(?:for\s+)?/.test(lower);
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
  return slug?.toLowerCase() ?? "aquatrace";
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
  if (/\b(?:10|ten)\s+(?:real\s+)?(?:aquatrace\s+)?keywords\b/i.test(text)) {
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

function directNoToolResponseForRequest(messages: GatewayMessage[]): { answer: string; failureReason?: string | undefined } | null {
  const userText = latestUserText(messages);
  const exactReply = userText.match(/^\s*reply\s+with\s+exactly\s*:?\s*([\s\S]+?)\s*$/i)?.[1]?.trim();
  if (exactReply) {
    return { answer: exactReply.replace(/^["']|["']$/g, "") };
  }
  if (!promptIsMetaOrFeedback(userText)) {
    return null;
  }
  if (/\bwhat\s+commands?\s+can\s+i\s+use\b|\bwhat\s+sources?\s+do\s+you\s+use\b|\bwhat\s+(?:tools?|rails?|systems?)\s+do\s+you\s+use\b|\bwhat\s+can\s+you\s+(?:access|see|check|do|help\s+me\s+do)\b/i.test(userText)) {
    return {
      answer: "You can ask me about today's schedule, work records, job details, CompanyCam reports and photos, client lists, invoices, inbox summaries, important unread email, draft emails for your approval, evaporation reports, content drafts, review replies, review requests, Google Business Profile updates, and website updates. If something is not live yet, I'll say that plainly instead of acting like the information is missing."
    };
  }
  if (/\bwhy\s+did\s+(?:that|this|it)\s+fail\b/i.test(userText)) {
    return {
      answer: "That failed because I either checked the wrong place or the ability is not live yet. I wrote the miss down so we can fix the path instead of making you repeat it."
    };
  }
  if (/\bhow\s+do\s+i\s+upload\s+(?:photos?|pictures?|images?|videos?)\b/i.test(userText)) {
    return {
      answer: "For now, use CompanyCam for job photos and videos. I can read and summarize those here. Native NexTeam phone uploads are part of the mobile field app work, and once that is live you'll be able to capture on the job and sync automatically."
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

function firstEmailAddress(text: string): string | undefined {
  return text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
}

function firstPhoneNumber(text: string): string | undefined {
  const labeled = text.match(/\b(?:phone|number|cell|call|text)\s*(?:is|=|:)?\s*([+()\d][+()\d\s.-]{6,})\b/i)?.[1];
  const fallback = text.match(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/)?.[0];
  return (labeled ?? fallback)?.replace(/[^\d+]/g, "").trim();
}

function looksLikeCreateClientAction(lower: string): boolean {
  return /\b(?:add|create|set\s+up|make)\b.{0,40}\b(?:new\s+)?client\b/.test(lower)
    || /\b(?:new\s+client|client\s+create)\b/.test(lower);
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
  const industryPack = /\b(?:pool|leak|aquatrace)\b/.test(lower)
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

function createClientNameFromText(text: string): string {
  const match = text.match(/\b(?:add|create|set\s+up|make)\s+(?:a\s+)?(?:new\s+)?client\s*,?\s*(?:named\s+|called\s+)?(.+?)(?=,|\s+(?:at|address|email|e-mail|phone|number|with)\b|[?.!]|$)/i)
    ?? text.match(/\bclient\s+(?:named\s+|called\s+)?(.+?)(?=,|\s+(?:at|address|email|e-mail|phone|number|with)\b|[?.!]|$)/i);
  const name = (match?.[1] ?? "")
    .replace(/\b(?:named|called)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name || text.replace(/[?.!]+$/g, "").trim();
}

function createClientAddressFromText(text: string): string | undefined {
  const match = text.match(/\b(?:address\s*(?:is|=|:)?|at)\s+(.+?)(?=,\s*(?:email|e-mail|phone|number|with)\b|\s+(?:email|e-mail|phone|number)\b|[?.!]|$)/i);
  const address = match?.[1]?.replace(/\s+/g, " ").trim();
  return address || undefined;
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
  return (match?.[1] ?? "Please see the note from Aquatrace.").trim().replace(/^["']|["']$/g, "");
}

function draftSubjectFromBody(bodyText: string): string {
  const firstSentence = bodyText.split(/[.!?]\s/)[0]?.trim() || "Aquatrace follow-up";
  const compact = firstSentence.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").slice(0, 72).trim();
  return compact.length >= 8 ? compact : "Aquatrace follow-up";
}

function draftEmailInputFromText(text: string): { to: string[]; subject: string; bodyText: string } {
  const to = firstEmailAddress(text);
  const bodyText = draftBodyFromText(text);
  return {
    to: to ? [to] : [],
    subject: draftSubjectFromBody(bodyText),
    bodyText
  };
}

function contentDraftIdFromText(text: string): string | undefined {
  return text.match(/\bcontent_[a-z_]+_[a-f0-9-]{8,}\b/i)?.[0];
}

function contentDraftIdFromPriorRuns(priorRuns: ToolRunTrace[]): string | undefined {
  for (const run of [...priorRuns].reverse()) {
    if (run.name !== "contentQueue" && run.name !== "draftPostFromJob") {
      continue;
    }
    const result = run.result && typeof run.result === "object" ? run.result as Record<string, unknown> : {};
    const drafts = Array.isArray(result.drafts) ? result.drafts : [];
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

function deterministicToolNames(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>, tenant?: Tenant | undefined): string[] {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  const emailRef = emailRefFromText(userText);
  const distanceFollowUp = looksLikeAddressOnlyFollowUp(userText) && recentUserTextMatches(messages, looksLikeDistanceQuestion);
  if (emailRef?.attachmentId && toolsByName.has("getEmailAttachment")) {
    return ["getEmailAttachment"];
  }
  if (emailRef && toolsByName.has("getEmailMessage")) {
    return ["getEmailMessage"];
  }
  if (looksLikeCreateClientAction(lower) && toolsByName.has("createClient")) {
    return ["createClient"];
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
  if (looksLikeEmailDraftAction(lower) && firstEmailAddress(userText) && toolsByName.has("draftEmail")) {
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
  if (looksLikeEmailSearchQuestion(lower) && toolsByName.has("searchEmail")) {
    return ["searchEmail"];
  }
  if (looksLikeClientListQuestion(lower) || looksLikeNamedClientLookupQuestion(lower)) {
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
      const args = tool.inputSchema.parse(normalizeToolInput(tool.name, {}, input.messages, input.tenant, runs));
      const result = await tool.handler(input.tenant, args);
      runs.push({ name: tool.name, result: result.result, sources: result.sources });
    } catch {
      runs.push({
        name: tool.name,
        result: safeToolErrorResult(tool.name),
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

function safeToolErrorResult(toolName: string): Record<string, string> {
  return {
    error: `${toolName} failed safely before returning checked data.`,
    userMessage: "I couldn't finish that check. I wrote it down so we can fix it."
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

function intakeAnswerSavedAnswer(result: unknown): string {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const nextQuestion = typeof record.nextQuestion === "string" ? record.nextQuestion : "keep going when you are ready.";
  return `I saved that onboarding answer. Next: ${nextQuestion}`;
}

function normalizeIdentityText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clientLookupAnswer(latestText: string, result: unknown): string | undefined {
  const record = objectRecord(result);
  const rawClients = Array.isArray(record?.clients) ? record.clients : [];
  const requested = clientLookupQueryFromText(latestText);
  const requestedNormalized = normalizeIdentityText(requested);
  const clients = rawClients
    .map((client) => objectRecord(client))
    .filter((client): client is Record<string, unknown> => Boolean(client))
    .map((client) => ({
      name: stringValue(client.name) ?? "",
      company: stringValue(client.company) ?? ""
    }))
    .filter((client) => client.name || client.company);
  const matches = requestedNormalized
    ? clients.filter((client) => {
        const values = [client.name, client.company].map(normalizeIdentityText).filter(Boolean);
        return values.some((value) => value === requestedNormalized || value.includes(requestedNormalized));
      })
    : clients;
  const names = [...new Set(matches.map((client) => client.name || client.company).filter(Boolean))];
  if (names.length === 0) {
    return requested
      ? `I checked the client list and Jobber, but I did not find ${requested}.`
      : "I checked the client list and Jobber, but I did not find a matching client.";
  }
  const foundIn = record?.fallbackUsed || Number(record?.jobberFallbackCount ?? 0) > 0 ? "Jobber" : "the client list";
  if (names.length === 1) {
    return `I found ${names[0]} in ${foundIn}.`;
  }
  return `I found ${names.length} matching clients in ${foundIn}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", and more" : ""}.`;
}

function directAnswerFromDeterministicRuns(messages: GatewayMessage[], toolRuns: ToolRunTrace[]): string | undefined {
  const latestText = latestUserText(messages);
  const lower = latestText.toLowerCase();
  const distanceFollowUp = looksLikeAddressOnlyFollowUp(latestText) && recentUserTextMatches(messages, looksLikeDistanceQuestion);
  const distanceRun = [...toolRuns].reverse().find((run) => run.name === "getDistance" && run.sources.length > 0);
  if (distanceRun && (looksLikeDistanceQuestion(lower) || distanceFollowUp)) {
    return distanceAnswer(distanceRun.result);
  }
  const draftRun = [...toolRuns].reverse().find((run) => run.name === "draftEmail" && run.sources.length > 0);
  if (draftRun && looksLikeEmailDraftAction(lower)) {
    return draftEmailAnswer(draftRun.result);
  }
  const intakeAnswerRun = [...toolRuns].reverse().find((run) => run.name === "answerIntake" && run.sources.length > 0);
  if (intakeAnswerRun && looksLikeAnswerIntakeAction(latestText)) {
    return intakeAnswerSavedAnswer(intakeAnswerRun.result);
  }
  const clientLookupRun = [...toolRuns].reverse().find((run) => run.name === "clientLookup" && run.sources.length > 0);
  if (clientLookupRun && looksLikeNamedClientLookupQuestion(lower) && !looksLikeClientListQuestion(lower)) {
    return clientLookupAnswer(latestText, clientLookupRun.result);
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
  const directResponse = directNoToolResponseForRequest(messages);
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
      toolRuns: []
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
      toolRuns: []
    };
  }
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
        toolRuns
      };
    }
    const directDeterministicAnswer = directAnswerFromDeterministicRuns(request.messages, deterministicRuns);
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
        toolRuns
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
        "Answer the original user request using only these checked records. For job issue, technician, measurement, total-gallons, completion-time, service-time, and report/checklist questions, compare Jobber and CompanyCam before answering; do not treat Jobber's missing completion/status/measurement field as proof that no CompanyCam report answer exists. For payment, paid/unpaid, invoice, balance, and receipt questions, compare Jobber, native invoices, and email receipts before answering; do not treat lead status as proof of unpaid. Say clearly when one system has no matching data. Keep record labels attached in the API response."
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
      try {
        const args = tool.inputSchema.parse(normalizeToolInput(toolUse.name, toolUse.input, messages, request.tenant, toolRuns));
        const result = await tool.handler(request.tenant, args);
        sources = [...sources, ...result.sources];
        toolRuns.push({ name: tool.name, result: result.result, sources: result.sources });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolResultContent(result.result)
        });
      } catch {
        const safeResult = safeToolErrorResult(tool.name);
        toolRuns.push({ name: tool.name, result: safeResult, sources: [] });
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
    toolRuns
  };
}
