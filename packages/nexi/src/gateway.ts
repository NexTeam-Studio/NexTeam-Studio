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
    /\b(?:for|of|at)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  const candidate = matches.at(-1)?.[1] ?? "";
  return candidate
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
    const entity = entityQueryFromText(message.content)
      || (/\b(?:photos?|pictures?|images?)\b/i.test(message.content) ? photoQueryFromText(message.content) : "")
      || namedEntityFromText(message.content);
    if (entity && !looksLikeGenericEntityCandidate(entity)) {
      return entity;
    }
  }
  return "";
}

function namedEntityFromText(text: string): string {
  const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:is|was|has|on|at|[-—])/);
  return match?.[1]?.trim() ?? "";
}

function looksLikeGenericEntityCandidate(entity: string): boolean {
  return /^(?:companycam|company cam|jobber|reports?|documents?|checklists?|photos?|pictures?|images?|answer|correct answer)$/i.test(entity.trim());
}

function normalizeToolInput(toolName: string, input: unknown, messages: GatewayMessage[], tenant?: Tenant | undefined): unknown {
  const record = input && typeof input === "object" && !Array.isArray(input) ? { ...input as Record<string, unknown> } : {};
  const userText = latestUserText(messages);
  const lowerUserText = userText.toLowerCase();
  const correctionFollowUp = looksLikeCorrectionFollowUp(lowerUserText);
  const emailRef = emailRefFromText(userText);
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
      : entityQueryFromText(userText) || photoQueryFromText(userText) || entityQueryFromMessages(messages);
  }
  if (toolName === "getDocuments") {
    if (!record.projectQuery) {
      record.projectQuery = correctionFollowUp
        ? entityQueryFromMessages(messages, { skipLatest: true })
        : entityQueryFromText(userText) || photoQueryFromText(userText) || entityQueryFromMessages(messages);
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
  if (toolName === "summarizeInbox" && !record.maxResults) {
    record.maxResults = 10;
  }
  if (toolName === "triageInbox") {
    record.date ??= new Date().toISOString();
    record.maxResults ??= 25;
  }
  if (toolName === "getJobDetail" && !record.nameQuery && !record.id) {
    record.nameQuery = correctionFollowUp
      ? entityQueryFromMessages(messages, { skipLatest: true }) || userText
      : entityQueryFromText(userText) || entityQueryFromMessages(messages) || userText;
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
  return /\b(?:issue|problem|finding|findings|result|results|leak detection)\b/.test(lower);
}

function looksLikeTechnicianQuestion(lower: string): boolean {
  return /\b(?:technician|tech|assigned|who was there|who went|who did|who performed)\b/.test(lower);
}

function looksLikeJobDetailQuestion(lower: string): boolean {
  return /\b(?:completion|competion|completed|complete|service\s+(?:time|date|completion|competion|[a-z]+\s+(?:completion|competion))|arrival|arrived|onsite|on-site|water\s+temp|air\s+temp|daily\s+loss|bucket|measurements?|main\s+drains?|skimmers?|returns?|lights?|filtration|testing\s+procedures?)\b/.test(lower);
}

function looksLikeCorrectionFollowUp(lower: string): boolean {
  return /\b(?:where\s+is\s+the\s+answer|what\s+is\s+the\s+answer|correct\s+answer|i\s+corrected\s+you|you\s+should\s+have\s+(?:replied|answered)|find\s+it\s+then)\b/.test(lower)
    || (/\b(?:incorrect|wrong|correction|corrected)\b/.test(lower) && /\bcompany\s*cam\b/.test(lower));
}

function looksLikeInboxSummaryQuestion(lower: string): boolean {
  return /\b(?:emails?|mail|inbox)\b/.test(lower)
    && /\b(?:came in|received|today|this morning|this afternoon|summarize|summary|what(?:'s| is) in)\b/.test(lower);
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

function looksLikeInboxTriageQuestion(lower: string): boolean {
  return /\b(?:needs? my attention|what needs attention|triage|urgent|important)\b/.test(lower);
}

function looksLikePaymentStatusQuestion(lower: string): boolean {
  return /\b(?:paid|pay|payment|invoice|zero\s+balance|balance|receipt|owes?|owed|due|collected|charged)\b/.test(lower);
}

function looksLikeRevenueQuestion(lower: string): boolean {
  return /\b(?:ytd|year\s+to\s+date|revenue|gross|sales)\b/.test(lower);
}

function looksLikePipelineQuestion(lower: string): boolean {
  return /\b(?:approved\s+but\s+not\s+scheduled|pipeline|unscheduled|not\s+scheduled)\b/.test(lower);
}

function looksLikeDistanceQuestion(lower: string): boolean {
  return /\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time|from\s+(?:here|my house|the shop))\b/.test(lower);
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
  if (/\bwhat\s+sources?\s+do\s+you\s+use\b|\bwhat\s+(?:tools?|rails?|systems?)\s+do\s+you\s+use\b|\bwhat\s+can\s+you\s+(?:access|see|check|do)\b/i.test(userText)) {
    return {
      answer: "I can check Aquatrace work records, schedules, job reports, photos, saved site notes, invoices, and connected email when those are wired for this tenant."
    };
  }
  return {
    answer: "You're right. I noted that feedback so we can fix the behavior instead of repeating it."
  };
}

function emailRefFromText(text: string): { mailbox: string; messageId: string; attachmentId?: string | undefined } | null {
  const match = text.match(/\bemail:([^:\s]+):([^:\s]+)(?::([^:\s]+))?/i);
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

function deterministicToolNames(messages: GatewayMessage[], toolsByName: Map<string, NexiTool>, tenant?: Tenant | undefined): string[] {
  const userText = latestUserText(messages);
  const lower = userText.toLowerCase();
  const emailRef = emailRefFromText(userText);
  if (emailRef?.attachmentId && toolsByName.has("getEmailAttachment")) {
    return ["getEmailAttachment"];
  }
  if (emailRef && toolsByName.has("getEmailMessage")) {
    return ["getEmailMessage"];
  }
  if (looksLikeEmailDraftAction(lower) && firstEmailAddress(userText) && toolsByName.has("draftEmail")) {
    return ["draftEmail"];
  }
  if (looksLikeInboxSummaryQuestion(lower) && toolsByName.has("summarizeInbox")) {
    return ["summarizeInbox"];
  }
  if (looksLikeInboxTriageQuestion(lower) && toolsByName.has("triageInbox")) {
    return ["triageInbox"];
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
  if (lower.includes("gallon") && toolsByName.has("lookupSiteJobBlueprintField")) {
    return uniqueToolNames(["getDocuments", "lookupSiteJobBlueprintField"], toolsByName);
  }
  if (looksLikeEmailSearchQuestion(lower) && toolsByName.has("searchEmail")) {
    return ["searchEmail"];
  }
  if (looksLikeTechnicianQuestion(lower)) {
    return uniqueToolNames(["getJobDetail", "getDocuments", "getPhotos"], toolsByName);
  }
  if (looksLikeIssueQuestion(lower) || looksLikeJobDetailQuestion(lower)) {
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
    const toolNames = deterministicRuns.map((run) => run.name).join(", ");
    messages.push({
      role: "assistant",
      content: `${reusableRuns.length > 0 ? "I found saved checked records" : "I found checked records"} from ${toolNames} and will use them for the final answer.`
    });
    messages.push({
      role: "user",
      content: [
        ...deterministicRuns.flatMap((run) => [`Verified ${run.name} result:`, toolResultContent(run.result)]),
        "Answer the original user request using only these checked records. For job issue, technician, completion-time, service-time, and report/checklist questions, compare Jobber and CompanyCam before answering; do not treat Jobber's missing completion/status field as proof that no CompanyCam report answer exists. For payment, paid/unpaid, invoice, balance, and receipt questions, compare Jobber, native invoices, and email receipts before answering; do not treat lead status as proof of unpaid. Say clearly when one system has no matching data. Keep record labels attached in the API response."
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
        const args = tool.inputSchema.parse(normalizeToolInput(toolUse.name, toolUse.input, messages, request.tenant));
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
