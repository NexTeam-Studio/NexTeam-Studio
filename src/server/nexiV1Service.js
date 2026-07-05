import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { resolveAnthropicTextModel } from "../lib/anthropicModels.js";
import { createCompanyCamRail } from "../features/missioncontrol/services/companyCamRailService.js";
import { companyCamQuestionServiceInternals } from "../features/missioncontrol/services/companyCamQuestionService.js";
import { createOperationalQuestionService } from "./operationalQuestionService.js";
import { resolveCompanyCamAccountSummaryQuestion } from "./companyCamAccountSummaryService.js";
import { resolveCompanyCamProjectPhotos } from "./companyCamPhotoLookupService.js";
import { resolveCompanyCamProjectDetailQuestion } from "./companyCamProjectDetailLookupService.js";
import { classifyNexiV1Question } from "./nexiV1QuestionClassifier.js";
import { createFirebaseNexiV1Repository } from "./firebaseNexiV1Repository.js";
import { createJobberService, hasUsableJobberConfig } from "./jobberService.js";
import { callAnthropicMessages } from "./anthropicClient.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NEXI_V1_SOUL_PATH = join(REPO_ROOT, "docs", "internal", "tmnt", "nexi", "NEXI_V1_JOB_DESK_SOUL.md");

function normalizeText(value = "") {
  return String(value || "").trim();
}

function hasAnthropicKey(env = process.env) {
  return Boolean(normalizeText(env.ANTHROPIC_API_KEY));
}

function hasJobberConfig(env = process.env) {
  return hasUsableJobberConfig(env);
}

function loadNexiV1Soul() {
  if (!existsSync(NEXI_V1_SOUL_PATH)) {
    throw new Error(`Nexi v1 SOUL file is missing at ${NEXI_V1_SOUL_PATH}.`);
  }
  return readFileSync(NEXI_V1_SOUL_PATH, "utf8");
}

function buildTenantContextSummary(context = {}) {
  const root = context.root || {};
  const config = context.config || {};
  const summary = context.summary || {};
  const services = Array.isArray(config?.businessRules?.serviceCatalog)
    ? config.businessRules.serviceCatalog.slice(0, 6)
    : [];
  const territories = Array.isArray(config?.businessRules?.serviceArea?.territories)
    ? config.businessRules.serviceArea.territories.slice(0, 8)
    : [];
  const ownerGoals = Array.isArray(config?.dashboard?.ownerGoals)
    ? config.dashboard.ownerGoals.slice(0, 4)
    : [];
  const connectivity = summary?.connectivity || {};

  return [
    `tenantId: ${normalizeText(context.tenantId)}`,
    `brandName: ${normalizeText(root.brandName || summary.brandName || config?.profile?.brandName)}`,
    `industry: ${normalizeText(root.industry || summary.industry || config?.profile?.industry)}`,
    `publicAgentName: ${normalizeText(summary.publicAgentName || config?.profile?.publicAgentName || "Nexi")}`,
    `services: ${services.join(", ") || "unknown"}`,
    `territories: ${territories.join(", ") || "unknown"}`,
    `ownerGoals: ${ownerGoals.join(" | ") || "unknown"}`,
    `companycam: ${normalizeText(connectivity.companycam || config?.channels?.companycam?.status || "unknown")}`,
    `jobber: ${normalizeText(connectivity.jobber || config?.channels?.jobber?.status || "unknown")}`,
  ].join("\n");
}

function buildToolDefinitions({ jobberConfigured = false } = {}) {
  const tools = [
    {
      name: "companycam_account_summary",
      description: "Return a live CompanyCam account summary such as how many current projects are visible.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
    {
      name: "companycam_project_detail_question",
      description: "Read live CompanyCam project details for a named Aquatrace job, including technician/creator, address, or status.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
    {
      name: "companycam_report_question",
      description: "Read a CompanyCam exported report/checklist and answer a question like gallons, measurements, or report findings for a named Aquatrace job.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
    {
      name: "companycam_project_photos",
      description: "Return a small set of live CompanyCam photo URLs for a named Aquatrace project or customer job.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
  ];

  if (jobberConfigured) {
    tools.push(
      {
        name: "jobber_schedule_lookup",
        description: "Read the connected Jobber schedule for today or this week.",
        input_schema: {
          type: "object",
          properties: {
            question: { type: "string" },
          },
          required: ["question"],
        },
      },
      {
        name: "jobber_job_detail_lookup",
        description: "Read a connected Jobber job record for address, notes, or quote status.",
        input_schema: {
          type: "object",
          properties: {
            question: { type: "string" },
          },
          required: ["question"],
        },
      }
    );
  }

  return tools;
}

function extractAnthropicText(payload = {}) {
  return (payload?.content || [])
    .filter((entry) => entry?.type === "text" && normalizeText(entry?.text))
    .map((entry) => entry.text)
    .join("\n")
    .trim();
}

function extractAnthropicToolUses(payload = {}) {
  return (payload?.content || []).filter((entry) => entry?.type === "tool_use");
}

function buildSystemPrompt({ soul, tenantContextSummary, jobberConfigured }) {
  return [
    soul,
    "",
    "TENANT CONTEXT",
    tenantContextSummary,
    "",
    "LIVE TOOL RULES",
    "- Use only the provided tools for operational data.",
    "- CompanyCam is connected and read-only.",
    jobberConfigured
      ? "- Jobber tools are connected for read-only schedule/job lookup."
      : "- Jobber is NOT connected in this runtime. If asked for today/this-week jobs or Jobber-only details, say the Jobber lane is not connected yet.",
    "- Use recent conversation turns to resolve short follow-ups like 'what issues were present?' to the same job/report unless the user clearly switches targets.",
    "- Never invent or estimate job data.",
    "- Never state that a source system does or does not contain a field unless the tool result explicitly proved that fact.",
    "- If something is missing or blocked, say you couldn't find it in the data you can access right now.",
    "- Distinguish carefully between: source not found, field not returned by the current tool, and a connection/tooling blocker.",
    "- For direct operational questions, do not ask a routing question and do not mention internal consult layers.",
    "- Keep the final answer short and cite the source used.",
  ].join("\n");
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractLatestProjectReference(historyMessages = []) {
  const lastUserMessages = [...historyMessages]
    .filter((message) => message?.role === "user" && normalizeText(message?.content))
    .slice(-4)
    .reverse();

  for (const message of lastUserMessages) {
    const queries = companyCamQuestionServiceInternals.buildProjectSearchQueries(message.content);
    const best = queries.sort((left, right) => String(right || "").length - String(left || "").length)[0];
    if (normalizeText(best)) {
      return normalizeText(best);
    }
  }

  return "";
}

function maybeContextualizeFollowUpQuestion(question, historyMessages = []) {
  const normalizedQuestion = normalizeText(question);
  const lower = normalizedQuestion.toLowerCase();
  const followUpNeedsContext =
    includesAny(lower, [
      "what issues were present",
      "what issues were there",
      "what findings",
      "what was found",
      "what problems were present",
      "what did the report say",
      "what did you find",
    ]) &&
    !classifyNexiV1Question(normalizedQuestion).handled;

  if (!followUpNeedsContext) {
    return normalizedQuestion;
  }

  const priorProjectReference = extractLatestProjectReference(historyMessages);
  if (!priorProjectReference) {
    return normalizedQuestion;
  }

  return `What report findings were present for ${priorProjectReference}?`;
}

function buildBlockedJobberAnswer(question) {
  const lower = normalizeText(question).toLowerCase();
  const scheduleQuestion =
    lower.includes("today") || lower.includes("this week") || lower.includes("tomorrow") || lower.includes("schedule");
  return scheduleQuestion
    ? "I can't answer that from live data yet because the Jobber read-only connection is not configured in this runtime. I logged the question to the failure log."
    : "I can't answer that from live data yet because the Jobber job-detail lane is not configured in this runtime. I logged the question to the failure log.";
}

function buildOutOfScopeAnswer() {
  return "That's outside Nexi v1's current scope. I can help with read-only job lookups, report answers, and job photos. I logged this question for follow-up.";
}

async function executeDirectQuestion({
  tenantId,
  question,
  questionClass,
  companyCamRail,
  operationalQuestionService,
  jobberService,
  jobberConfigured,
}) {
  if (questionClass.kind === "companycam_account_summary") {
    const accountSummaryResult = await resolveCompanyCamAccountSummaryQuestion({
      companyCamRail,
    });

    return {
      ok: true,
      handled: true,
      answer: accountSummaryResult.answerText,
      source: "companycam",
      route: { kind: "companycam_account_summary", lane: "work" },
      result: accountSummaryResult,
    };
  }

  if (questionClass.kind === "companycam_project_detail") {
    const projectDetailResult = await resolveCompanyCamProjectDetailQuestion({
      companyCamRail,
      tenantId,
      question,
    });

    if (!projectDetailResult?.ok) {
      return {
        ok: false,
        handled: false,
        failureCode: "COMPANYCAM_PROJECT_DETAIL_NOT_FOUND",
        failureReason: "CompanyCam project detail lookup could not find a matching live project.",
      };
    }

    return {
      ok: true,
      handled: true,
      answer: projectDetailResult.answerText,
      source: "companycam",
      route: { kind: "companycam_project_detail", lane: "work" },
      result: projectDetailResult,
    };
  }

  if (questionClass.kind === "companycam_photos") {
    const photoResult = await resolveCompanyCamProjectPhotos({
      companyCamRail,
      tenantId,
      question,
    });
    if (!photoResult?.ok) {
      return {
        ok: false,
        handled: false,
        failureCode: "COMPANYCAM_PHOTO_PROJECT_NOT_FOUND",
        failureReason: "CompanyCam photo lookup could not find a matching live project.",
      };
    }

    return {
      ok: true,
      handled: true,
      answer: photoResult.answerText,
      source: "companycam",
      route: { kind: "companycam_photos", lane: "work" },
      photos: photoResult.photos || [],
    };
  }

  if (questionClass.route === "jobber" && !jobberConfigured) {
    return {
      ok: false,
      handled: true,
      answer: buildBlockedJobberAnswer(question),
      source: "jobber_unconfigured",
      route: { kind: questionClass.kind, lane: "work" },
      failureCode: "JOBBER_NOT_CONFIGURED",
      failureReason: "Jobber direct read-only connection is not configured in this runtime.",
    };
  }

  if (questionClass.kind === "jobber_schedule") {
    try {
      const jobberResult = await jobberService.answerScheduleQuestion({ tenantId, question });
      return {
        ok: jobberResult.ok !== false,
        handled: true,
        answer: normalizeText(jobberResult.answerText),
        source: jobberResult.source || "jobber",
        route: jobberResult.route || { kind: "jobber_schedule", lane: "fast" },
        result: jobberResult,
      };
    } catch (error) {
      return {
        ok: false,
        handled: true,
        answer: `Jobber schedule lookup failed: ${normalizeText(error?.message || "unknown error")}`,
        source: "jobber",
        route: { kind: "jobber_schedule", lane: "fast" },
        failureCode: "JOBBER_SCHEDULE_LOOKUP_FAILED",
        failureReason: normalizeText(error?.message || "Jobber schedule lookup failed."),
      };
    }
  }

  if (questionClass.kind === "jobber_job_detail") {
    try {
      const jobberResult = await jobberService.answerJobDetailQuestion({ tenantId, question });
      return {
        ok: jobberResult.ok !== false,
        handled: true,
        answer: normalizeText(jobberResult.answerText),
        source: jobberResult.source || "jobber",
        route: jobberResult.route || { kind: "jobber_job_detail", lane: "work" },
        result: jobberResult,
        failureCode: jobberResult.ok === false ? "JOBBER_JOB_DETAIL_LOOKUP_FAILED" : "",
        failureReason: jobberResult.ok === false ? normalizeText(jobberResult.answerText) : "",
      };
    } catch (error) {
      return {
        ok: false,
        handled: true,
        answer: `Jobber job-detail lookup failed: ${normalizeText(error?.message || "unknown error")}`,
        source: "jobber",
        route: { kind: "jobber_job_detail", lane: "work" },
        failureCode: "JOBBER_JOB_DETAIL_LOOKUP_FAILED",
        failureReason: normalizeText(error?.message || "Jobber job-detail lookup failed."),
      };
    }
  }

  const operationalResult = await operationalQuestionService.answerQuestion({
    tenantId,
    question,
  });

  if (operationalResult?.handled) {
    return {
      ok: operationalResult.ok !== false,
      handled: true,
      answer: normalizeText(operationalResult.response),
      source: operationalResult.route?.resourceProvider || "companycam",
      route: operationalResult.route || null,
      result: operationalResult.result || null,
      failureCode: operationalResult.ok === false ? "OPERATIONAL_LOOKUP_BLOCKED" : "",
      failureReason: operationalResult.ok === false ? normalizeText(operationalResult.response) : "",
    };
  }

  return {
    ok: false,
    handled: false,
    failureCode: "NEXI_V1_UNHANDLED",
    failureReason: "Question did not match a connected direct operational lane.",
  };
}

async function executeModelQuestion({
  tenantId,
  question,
  historyMessages = [],
  tenantContextSummary,
  soul,
  directToolExecutor,
  jobberConfigured,
  env = process.env,
}) {
  if (!hasAnthropicKey(env)) {
    return null;
  }

  const tools = buildToolDefinitions({ jobberConfigured });
  const system = buildSystemPrompt({ soul, tenantContextSummary, jobberConfigured });
  const first = await callAnthropicMessages({
    model: resolveAnthropicTextModel(env),
    system,
    tools,
    env,
    tenantId,
    routeActionName: "nexiV1ReasoningTurn",
    taskType: "reasoning_tool_loop",
    metadata: { phase: "first_turn" },
    maxTokens: 450,
    messages: [
      ...historyMessages,
      { role: "user", content: question },
    ],
  });

  const toolUses = extractAnthropicToolUses(first);
  if (toolUses.length === 0) {
    const directText = extractAnthropicText(first);
    return directText
      ? {
          ok: true,
          handled: true,
          answer: directText,
          source: "anthropic",
          route: { kind: "model_only", lane: "fast" },
        }
      : null;
  }

  const firstTool = toolUses[0];
  const toolQuestion = normalizeText(firstTool?.input?.question || question);
  const executed = await directToolExecutor({
    tenantId,
    question: toolQuestion,
    questionClass: classifyNexiV1Question(toolQuestion),
  });

  const toolPayload = executed?.handled
    ? {
        ok: executed.ok !== false,
        answer: executed.answer,
        photos: executed.photos || [],
        route: executed.route || null,
        source: executed.source || null,
      }
    : {
        ok: false,
        error: executed?.failureReason || "Tool execution did not return a usable result.",
      };

  const second = await callAnthropicMessages({
    model: resolveAnthropicTextModel(env),
    system,
    tools,
    env,
    tenantId,
    routeActionName: "nexiV1ReasoningTurn",
    taskType: "reasoning_tool_loop",
    metadata: { phase: "tool_followup", toolName: firstTool.name },
    maxTokens: 450,
    messages: [
      ...historyMessages,
      { role: "user", content: question },
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: firstTool.id,
            content: JSON.stringify(toolPayload),
          },
        ],
      },
    ],
  });

  const answer = extractAnthropicText(second);
  if (!answer) {
    return null;
  }

  return {
    ok: executed?.ok !== false,
    handled: true,
    answer,
    source: executed?.source || "anthropic_tool_call",
    route: executed?.route || { kind: firstTool.name, lane: "work" },
    photos: executed?.photos || [],
    failureCode: executed?.failureCode || "",
    failureReason: executed?.failureReason || "",
  };
}

export function createNexiV1Service({
  repository = createFirebaseNexiV1Repository(),
  companyCamRail = createCompanyCamRail(),
  operationalQuestionService = createOperationalQuestionService({
    companyCamRail,
  }),
  jobberService = null,
  env = process.env,
} = {}) {
  const soul = loadNexiV1Soul();
  const jobberConfigured = hasJobberConfig(env);
  const resolvedJobberService = jobberService || createJobberService({ env });

  async function directToolExecutor({ tenantId, question, questionClass = classifyNexiV1Question(question) }) {
    return executeDirectQuestion({
      tenantId,
      question,
      questionClass,
      companyCamRail,
      operationalQuestionService,
      jobberService: resolvedJobberService,
      jobberConfigured,
    });
  }

  return {
    async answerQuestion({ tenantId = "aquatrace", question, actor = {}, conversationId = "" } = {}) {
      const normalizedQuestion = normalizeText(question);
      if (!normalizedQuestion) {
        const error = new Error("question is required.");
        error.status = 400;
        throw error;
      }

      const tenantContext = await repository.getTenantContext(tenantId);
      if (!tenantContext?.root || !tenantContext?.config || !tenantContext?.summary) {
        const error = new Error(`Tenant context is incomplete for "${tenantId}".`);
        error.status = 404;
        throw error;
      }

      const tenantContextSummary = buildTenantContextSummary(tenantContext);
      const historyMessages = await repository.listConversationHistory({
        tenantId,
        conversationId,
        limit: 10,
      });
      const effectiveQuestion = maybeContextualizeFollowUpQuestion(normalizedQuestion, historyMessages);
      const questionClass = classifyNexiV1Question(effectiveQuestion);

      let result = null;
      try {
        result = await executeModelQuestion({
          tenantId,
          question: effectiveQuestion,
          historyMessages,
          tenantContextSummary,
          soul,
          directToolExecutor,
          jobberConfigured,
          env,
        });
      } catch {
        result = null;
      }

      if (!result) {
        result = await directToolExecutor({
          tenantId,
          question: effectiveQuestion,
          questionClass,
        });
      }

      if (!result?.handled) {
        const answer = buildOutOfScopeAnswer();
        const failure = await repository.appendFailureLog({
          tenantId,
          actor,
          conversationId,
          question: normalizedQuestion,
          failureCode: result?.failureCode || "NEXI_V1_OUT_OF_SCOPE",
          failureReason: result?.failureReason || "Question is outside Nexi v1 scope.",
          classifier: questionClass,
        });

        const log = await repository.appendConversationLog({
          tenantId,
          actor,
          conversationId,
          question: normalizedQuestion,
          answer,
          route: { kind: "out_of_scope", lane: "fast" },
          source: "nexi_v1_guardrail",
          success: false,
        });

        return {
          ok: false,
          answer,
          failure,
          conversation: log,
          route: { kind: "out_of_scope", lane: "fast" },
          source: "nexi_v1_guardrail",
          conversationId: log.conversationId,
        };
      }

      const log = await repository.appendConversationLog({
        tenantId,
        actor,
        conversationId,
        question: normalizedQuestion,
        answer: result.answer,
        route: result.route,
        source: result.source,
        success: result.ok !== false,
        attachmentCount: Array.isArray(result.photos) ? result.photos.length : 0,
      });

      let failure = null;
      if (result.ok === false || result.failureReason) {
        failure = await repository.appendFailureLog({
          tenantId,
          actor,
          conversationId: log.conversationId,
          question: normalizedQuestion,
          failureCode: result.failureCode || "NEXI_V1_BLOCKED",
          failureReason: result.failureReason || result.answer,
          classifier: questionClass,
        });
      }

      return {
        ok: result.ok !== false,
        answer: result.answer,
        route: result.route || null,
        source: result.source || null,
        photos: result.photos || [],
        failure: failure || null,
        conversation: log,
        conversationId: log.conversationId,
        context: {
          tenantId,
          brandName: tenantContext.root.brandName,
          avatarName: tenantContext.root.avatarName,
        },
      };
    },
  };
}

export const nexiV1ServiceInternals = {
  buildBlockedJobberAnswer,
  buildSystemPrompt,
  buildTenantContextSummary,
  buildToolDefinitions,
  buildOutOfScopeAnswer,
  executeDirectQuestion,
  hasJobberConfig,
  hasAnthropicKey,
  loadNexiV1Soul,
};
