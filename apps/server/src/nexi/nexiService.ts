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
  conversationId?: string | undefined;
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

type JsonRecord = Record<string, unknown>;

function redactEmailContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactEmailContent);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as JsonRecord;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (/^(?:body|bodyText|bodyHtml|snippet|text|html|subject|from|to|cc|bcc|data|content|raw)$/i.test(key)) {
      return [key, "[redacted-email-content]"];
    }
    return [key, redactEmailContent(entry)];
  }));
}

function persistableToolRuns(toolRuns: ToolLoopResponse["toolRuns"]): ToolLoopResponse["toolRuns"] {
  return toolRuns.map((run) => run.sources.some((source) => source.rail === "email")
    ? { ...run, result: redactEmailContent(run.result) }
    : run);
}

function buildNexiSystemPrompt(tenant: Tenant): string {
  return [
    `You are ${tenant.branding.assistantName}, the NexTeam Job Desk assistant for ${tenant.name}.`,
    "Check the connected work records before answering job, schedule, photo, report, and saved site-note questions.",
    "Never invent job data. If you cannot find it in the connected records, say plainly that you do not have it written down.",
    "For schedule answers, use schedule.localSummary when present and do not describe tenant-local Jobber all-day windows as UTC appointments.",
    "Answer only what was asked in a scannable format: short lead sentence, compact bullets only when useful, no extra menu of options unless the user asks.",
    "For email summaries and triage, group by priority when available and format each item as sender - subject - one-line ask. Leave internal IDs out unless the owner asks. Sign-in tests and account welcomes are not client inquiries.",
    "Talk like a sharp, reliable employee for trade owners and field workers. Avoid user-facing jargon such as API, endpoint, tool call, source, query, rail, and schema.",
    "For action requests like drafting or sending email, use the approval-gated draft tool and do not require factual sources before acknowledging the queued draft.",
    "For tenant onboarding requests, run the intake interview, capture current app-stack choices, and queue provisioning for owner approval only. Never claim external accounts, publishing, emails, or domains are set up.",
    "Keep phone answers short, direct, and operational. Ask at most one clarifying question."
  ].join("\n");
}

function chooseTool(message: string, tools: NexiTool[]): { tool: NexiTool; args: unknown } | null {
  const lower = message.toLowerCase();
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const emailAttachmentRef = message.match(/\bemail:([^:\s]+):([^:\s]+):([^:\s]+)/i);
  if (emailAttachmentRef) {
    const tool = tools.find((candidate) => candidate.name === "getEmailAttachment");
    return tool ? { tool, args: { mailbox: emailAttachmentRef[1], messageId: emailAttachmentRef[2], attachmentId: emailAttachmentRef[3] } } : null;
  }
  const emailMessageRef = message.match(/\bemail:([^:\s]+):([^:\s]+)/i);
  if (emailMessageRef) {
    const tool = tools.find((candidate) => candidate.name === "getEmailMessage");
    return tool ? { tool, args: { mailbox: emailMessageRef[1], messageId: emailMessageRef[2] } } : null;
  }
  if (/\b(?:send|draft|compose|write)\s+(?:an?\s+)?email\b/i.test(lower) && !/\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftEmail");
    const recipient = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const bodyText = message.match(/\b(?:saying|that says|to say|with message|message)\b\s*:?\s*([\s\S]+)$/i)?.[1]?.trim() || "Please see the note from Aquatrace.";
    const subject = bodyText.split(/[.!?]\s/)[0]?.trim().replace(/[.!?]+$/g, "").slice(0, 72) || "Aquatrace follow-up";
    return tool && recipient ? { tool, args: { to: [recipient], subject, bodyText } } : null;
  }
  if (/\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "getDistance");
    const destination = distanceDestinationFromText(message);
    return tool && destination ? { tool, args: { destination } } : null;
  }
  const intakeSessionId = message.match(/\bintake_[a-z0-9-]+\b/i)?.[0];
  if (/\b(?:finalize|finish|park|queue)\b.*\b(?:intake|tenant\s+plan|onboarding)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "finalizeIntake");
    return tool && intakeSessionId ? { tool, args: { sessionId: intakeSessionId } } : null;
  }
  if (/\b(?:intake|tenant\s+onboarding|onboarding)\b.*\b(?:status|sessions?|where|show|list)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "intakeStatus");
    return tool ? { tool, args: intakeSessionId ? { sessionId: intakeSessionId } : {} } : null;
  }
  if (/\b(?:onboard|start\s+(?:an?\s+)?intake|tenant\s+intake|set\s+up\s+(?:a\s+)?(?:new\s+)?tenant|create\s+(?:a\s+)?(?:new\s+)?tenant)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "startIntake");
    const businessName = intakeBusinessNameFromText(message);
    return tool ? { tool, args: businessName ? { businessName } : {} } : null;
  }
  if (/\b(?:send|draft|queue|create|schedule|ask)\b.*\b(?:review\s+request|ask\s+for\s+a\s+review|request\s+a\s+review)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftReviewRequest");
    const recipient = message.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
    const clientName = entityQueryFromText(message) || "client";
    return tool && recipient ? { tool, args: { to: recipient, invoiceId: "manual-review-request", clientName } } : null;
  }
  if (/\b(?:reply|respond|answer|draft)\b.*\b(?:review|google\s+review|gbp|google\s+business)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftReviewReply");
    const reviewId = message.match(/\bgbp_review_[a-z0-9_-]+\b/i)?.[0];
    return tool ? { tool, args: reviewId ? { reviewId } : {} } : null;
  }
  if (/\b(?:draft|queue|sync|update|change)\b.*\b(?:gbp|google\s+business|business\s+profile)\b.*\b(?:profile|hours|services?|q\s*&\s*a|q&a|questions?)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "draftGbpProfileSync");
    return tool ? { tool, args: { locationId: "aquatrace-primary" } } : null;
  }
  if (/\b(?:reviews?|reputation|google\s+reviews?|gbp\s+reviews?)\b/i.test(lower)) {
    const pollTool = tools.find((candidate) => candidate.name === "pollGbpReviews");
    const queueTool = tools.find((candidate) => candidate.name === "reputationQueue");
    if (/\b(?:check|pull|fetch|import|sync|new|latest|recent)\b/i.test(lower) && pollTool) {
      return { tool: pollTool, args: {} };
    }
    return queueTool ? { tool: queueTool, args: {} } : null;
  }
  if (/\b(?:run|calculate|check|make|create)\b.*\b(?:evap|evaporation|bucket\s+test|water\s+loss)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "runEvaporation");
    const address = message.match(/\b(?:for|at)\s+(.+?)(?=\s+(?:with|using|surface\s+area|pool\s+area|water\s+temp|water\s+temperature|observed\s+loss|daily\s+loss|loss)\b|[?.!]|$)/i)?.[1]?.trim();
    const zip = message.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
    const surfaceAreaFt2 = Number(message.match(/\b(?:surface\s+area|pool\s+area|area)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:square\s*feet|sq\.?\s*ft|ft2)\b/i)?.[1]?.replace(/,/g, ""));
    const waterTempF = Number(message.match(/\b(?:water\s+temp(?:erature)?|water\s+temperature)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:degrees?|deg|f|fahrenheit)?\b/i)?.[1]?.replace(/,/g, ""));
    const observedLoss = Number(message.match(/\b(?:observed\s+daily\s+loss|daily\s+loss|observed\s+loss|water\s+loss|loss)\s*(?:is|of|=|:)?\s*([\d,.]+)\s*(?:inches?|in\.?|")\b/i)?.[1]?.replace(/,/g, ""));
    const args: Record<string, unknown> = {};
    if (address) args.address = address;
    if (zip) args.zip = zip;
    if (Number.isFinite(surfaceAreaFt2)) args.surfaceAreaFt2 = surfaceAreaFt2;
    if (Number.isFinite(waterTempF)) args.waterTempF = waterTempF;
    if (Number.isFinite(observedLoss)) args.observedLoss = { inches: observedLoss, observationDays: 1 };
    return tool ? { tool, args } : null;
  }
  if (/\b(?:change|update|make|set)\b.*\b(?:chat|job\s*desk|interface|screen|ui|colors?|colours?|theme)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "customizeOperatorUi");
    const preset = /\b(?:blue|water|teal|ocean)\b/i.test(lower)
      ? "deep_water"
      : /\b(?:contrast|bold|easy to read)\b/i.test(lower)
        ? "high_contrast"
        : /\b(?:sand|warm|tan|gold)\b/i.test(lower)
          ? "sandbar"
          : "aquatrace";
    return tool ? { tool, args: { preset, plainRequest: message } } : null;
  }
  if (/\b(?:needs? my attention|what needs attention|triage|urgent|important)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "triageInbox");
    return tool ? { tool, args: { date: today.toISOString(), maxResults: 25 } } : null;
  }
  if (/\b(?:email|emails|mail|inbox|reply|replied|came in)\b/i.test(lower)) {
    const tool = tools.find((candidate) => candidate.name === "summarizeInbox");
    return tool ? { tool, args: { date: today.toISOString(), maxResults: 10 } } : null;
  }
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
    return tool ? { tool, args: { field: "poolGallons", requestedEntity: entityQueryFromText(message) } } : null;
  }
  const detailTool = tools.find((candidate) => candidate.name === "getJobDetail");
  return detailTool ? { tool: detailTool, args: { nameQuery: message } } : null;
}

function distanceDestinationFromText(text: string): string | undefined {
  const match = text.match(
    /\b(?:how\s+far(?:\s+is)?|distance\s+(?:to|for)|drive\s+time\s+(?:to|for)|travel\s+time\s+(?:to|for)|miles?\s+(?:to|from))\s+(.+?)(?=\s+from\s+(?:my\s+house|the\s+shop|here|102\s+kate|aquatrace)|[?.!]|$)/i
  )?.[1]?.trim();
  return match?.replace(/^is\s+/i, "").trim();
}

function intakeBusinessNameFromText(text: string): string | undefined {
  const direct = text.match(
    /\b(?:onboard|start\s+(?:an?\s+)?intake\s+for|tenant\s+intake\s+for|set\s+up\s+(?:a\s+)?(?:new\s+)?tenant\s+for|create\s+(?:a\s+)?(?:new\s+)?tenant\s+for)\s+(.+?)(?=\s+(?:as|with|that|and|then)\b|[?.!]|$)/i
  )?.[1]?.trim();
  const fallback = text.match(/\b(?:business|company)\s+(?:called|named)\s+(.+?)(?=\s+(?:as|with|that|and|then)\b|[?.!]|$)/i)?.[1]?.trim();
  return (direct || fallback)?.replace(/^["']|["']$/g, "");
}

function entityQueryFromText(text: string): string {
  const normalized = text.replace(/[?.!]+$/g, "").trim();
  const matches = [...normalized.matchAll(
    /\b(?:for|of|at)\s+(.+?)(?=\s+(?:in|from|on|with|report|pool|job|photos?|pictures?|images?|results?|gallons?|total)\b|[?.!]|$)/gi
  )];
  return (matches.at(-1)?.[1] ?? "")
    .replace(/\b(?:the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (toolName === "triageInbox" && result && typeof result === "object") {
    const items = Array.isArray((result as { items?: unknown[] }).items) ? (result as { items: unknown[] }).items : [];
    return `I found ${items.length} email item${items.length === 1 ? "" : "s"} needing attention after excluding spam and promos.`;
  }
  if (toolName === "lookupSiteJobBlueprintField" && result && typeof result === "object") {
    const value = (result as { value?: unknown }).value;
    return value === null || value === undefined ? "I do not have that SiteJobBlueprint field yet." : `The SiteJobBlueprint field value is ${String(value)}.`;
  }
  if (toolName === "runEvaporation" && result && typeof result === "object") {
    const report = (result as { report?: { calculation?: { evapInchesPerDay?: unknown; leakInchesPerDay?: unknown } } }).report;
    const calculation = report?.calculation;
    return `I ran the Aquatrace evaporation report. Estimated evaporation is ${String(calculation?.evapInchesPerDay ?? "unknown")} inches/day; leak loss after evaporation is ${String(calculation?.leakInchesPerDay ?? "unknown")} inches/day.`;
  }
  if (toolName === "customizeOperatorUi" && result && typeof result === "object") {
    const theme = (result as { theme?: { name?: unknown; density?: unknown } }).theme;
    return `I updated the Job Desk look${theme?.name ? ` to ${String(theme.name)}` : ""}. Refresh the screen if you do not see it right away.`;
  }
  if (toolName === "getDistance" && result && typeof result === "object") {
    const distance = result as { destination?: unknown; driveMinutes?: unknown; distanceMiles?: unknown; distanceText?: unknown };
    const milesText = typeof distance.distanceMiles === "number"
      ? `${distance.distanceMiles} miles`
      : typeof distance.distanceText === "string"
        ? distance.distanceText
        : "";
    return `Drive time to ${String(distance.destination ?? "that place")} is about ${String(distance.driveMinutes ?? "unknown")} minutes${milesText ? ` (${milesText})` : ""}.`;
  }
  if (toolName === "pollGbpReviews" && result && typeof result === "object") {
    const imported = Array.isArray((result as { imported?: unknown[] }).imported) ? (result as { imported: unknown[] }).imported : [];
    const blocker = (result as { blocker?: unknown }).blocker;
    return imported.length
      ? `I found ${imported.length} Google review${imported.length === 1 ? "" : "s"} and saved them to the review queue.`
      : `I could not pull live Google reviews yet${typeof blocker === "string" ? `: ${blocker}` : "."}`;
  }
  if (toolName === "reputationQueue" && result && typeof result === "object") {
    const reviews = Array.isArray((result as { reviews?: unknown[] }).reviews) ? (result as { reviews: unknown[] }).reviews : [];
    const pendingReplies = Array.isArray((result as { pendingReplies?: unknown[] }).pendingReplies) ? (result as { pendingReplies: unknown[] }).pendingReplies : [];
    return `The reputation queue has ${reviews.length} review${reviews.length === 1 ? "" : "s"} and ${pendingReplies.length} drafted repl${pendingReplies.length === 1 ? "y" : "ies"} waiting.`;
  }
  if (toolName === "draftReviewReply" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I drafted the review reply and parked it for approval${approval?.id ? ` (${String(approval.id)})` : ""}. Nothing posted live.`;
  }
  if (toolName === "draftReviewRequest" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I queued the review request for approval${approval?.id ? ` (${String(approval.id)})` : ""}. Nothing sends until it is approved.`;
  }
  if (toolName === "draftGbpProfileSync" && result && typeof result === "object") {
    const approval = (result as { approval?: { id?: unknown } }).approval;
    return `I drafted the Google Business Profile update and parked it for approval${approval?.id ? ` (${String(approval.id)})` : ""}.`;
  }
  if (toolName === "startIntake" && result && typeof result === "object") {
    const session = (result as { session?: { targetTenantId?: unknown; nextQuestion?: unknown } }).session;
    return `I started the onboarding interview${session?.targetTenantId ? ` for ${String(session.targetTenantId)}` : ""}. Next: ${String(session?.nextQuestion ?? "tell me about the business.")}`;
  }
  if (toolName === "answerIntake" && result && typeof result === "object") {
    const nextQuestion = (result as { nextQuestion?: unknown }).nextQuestion;
    return `I saved that onboarding answer. Next: ${String(nextQuestion ?? "keep going when you are ready.")}`;
  }
  if (toolName === "intakeStatus" && result && typeof result === "object") {
    const sessions = Array.isArray((result as { sessions?: unknown[] }).sessions) ? (result as { sessions: unknown[] }).sessions : [];
    return `I found ${sessions.length} onboarding session${sessions.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "finalizeIntake" && result && typeof result === "object") {
    const approvalId = (result as { approvalId?: unknown }).approvalId;
    return `I parked the tenant plan in the approval queue${approvalId ? ` as ${String(approvalId)}` : ""}. Nothing external was created.`;
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

function isUserFlaggedIncorrect(message: string): boolean {
  return /\b(?:wrong answer|wrong|incorrect|not correct|somewhat correct|you'?re incorrect|you are incorrect)\b/i.test(message);
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

function stableConversationId(input: NexiMessageInput): string {
  return input.conversationId ?? `thread_${crypto.randomUUID()}`;
}

async function answerUserFlaggedIncorrect(input: NexiMessageInput): Promise<NexiMessageResult> {
  const conversationId = stableConversationId(input);
  const recent = await input.repository.loadRecentConversations(input.tenant.id, conversationId, 8);
  const flagged = recent.at(-1);
  const failure = await input.repository.saveFailure({
    tenantId: input.tenant.id,
    op: "message",
    question: input.message,
    reason: "user_flagged_incorrect",
    sources: flagged?.sources ?? [],
    correctionText: input.message,
    flaggedConversationId: flagged?.id,
    flaggedQuestion: flagged?.userText,
    flaggedAnswer: flagged?.assistantText,
    flaggedAnswerSources: flagged?.sources
  });
  const answer = "You're right to flag that. I logged this as user_flagged_incorrect and tied it to my prior answer so we can correct the source path.";
  const saved = await input.repository.saveConversation({
    tenantId: input.tenant.id,
    conversationId,
    userText: input.message,
    assistantText: answer,
    sources: []
  });
  return {
    answer,
    sources: [],
    conversationId: saved.conversationId ?? saved.id,
    failureId: failure.id,
    usage: emptyUsage(),
    toolRuns: []
  };
}

export async function answerNexiMessage(input: NexiMessageInput): Promise<NexiMessageResult> {
  if (isUserFlaggedIncorrect(input.message)) {
    return answerUserFlaggedIncorrect(input);
  }
  const conversationId = stableConversationId(input);
  const recent = await input.repository.loadRecentConversations(input.tenant.id, conversationId, 8);
  const history = recent.flatMap((record) => [
    { role: "user" as const, content: record.userText },
    { role: "assistant" as const, content: record.assistantText }
  ]);
  const cachedToolRuns = recent.flatMap((record) => record.toolRuns ?? []);
  const gateway = gatewayForEnv(input);
  try {
    const result = await gateway({
      tenant: input.tenant,
      system: buildNexiSystemPrompt(input.tenant),
      messages: [...history, { role: "user", content: input.message }],
      tools: input.tools,
      cachedToolRuns,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      usageLog: input.usageLog,
      env: input.env
    });
    const saved = await input.repository.saveConversation({
      tenantId: input.tenant.id,
      conversationId,
      userText: input.message,
      assistantText: result.answer,
      sources: result.sources,
      toolRuns: persistableToolRuns(result.toolRuns)
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
      conversationId: saved.conversationId ?? saved.id,
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
