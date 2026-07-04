# Willy Verification Packet

Generated: 2026-05-02T18:45:07.763Z

## 1. Full runtime and integration file contents

### C:/Users/Peyto/clawdia-bot/willyConsultRuntime.js

```js
import OpenAI from "openai";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getNextSafeTask, getWorkingTask, loadQueueState } from "./taskQueueStore.js";

const DEFAULT_STUDIO_PATH = "C:\\Users\\Peyto\\NexTeam-Studio";
const DEFAULT_CLAWDIA_BOT_PATH = "C:\\Users\\Peyto\\clawdia-bot";
const DEFAULT_WILLY_PROVIDER = "openai";
const DEFAULT_WILLY_MODEL = "gpt-4o";
const DEFAULT_OPENCLAW_WORKSPACE = "C:\\Users\\Peyto\\.openclaw\\workspace";
const DEFAULT_QUEUE_PATH = "C:\\Users\\Peyto\\clawdia-bot\\runtime\\task-queue.json";
const WILLY_ALLOWED_RECOMMENDATIONS = ["ACCEPT", "REJECT", "REROUTE", "PARK", "CONTINUE", "ASK CHRIS"];
const WILLY_ALLOWED_PROOF_QUALITIES = ["good", "weak", "missing", "contradictory", "not applicable"];
const WILLY_ALLOWED_CONFIDENCE = ["high", "medium", "low"];
const WILLY_DOC_RELATIVE_DIR = ["docs", "internal", "goonies", "willy"];
const CLAWDIA_MEMORY_RELATIVE_PATH = ["docs", "internal", "CLAWDIA_MEMORY.md"];
const CLAWDIA_RUNBOOK_RELATIVE_PATH = ["docs", "internal", "CLAWDIA_GENERAL_CONTRACTOR_RUNBOOK.md"];
const DEFAULT_WILLY_DOCS = {
  soul: [
    "# ONE-EYED WILLY SOUL",
    "- Role: Nova-like Proof / Judgment / Next-Step Advisor",
    "- Purpose: help Clawdia judge proof, break loops, and choose the next safe move.",
    "- Guardrails: consult-only, no execution authority, no send authority, no publish authority, no client contact authority, no fake proof, no weak-proof acceptance.",
  ].join("\n"),
  memory: [
    "# ONE-EYED WILLY MEMORY",
    "- status: initialized / live consult / LLM-backed",
    "- durable lesson: repeated blocker explanation without new proof is not progress.",
    "- do not assume narration equals completion.",
  ].join("\n"),
  knowledgeBase: [
    "# ONE-EYED WILLY KNOWLEDGE BASE",
    "- gather knowledge from internal proof packages, queue state, blocker histories, and approved runbooks.",
    "- reject secrets, fake proof, and soft discussion as durable knowledge.",
  ].join("\n"),
  playbook: [
    "# WILLY PLAYBOOK V1",
    "- inspect queue truth first",
    "- inspect proof and blocker state",
    "- choose one recommendation only",
    "- give Clawdia one exact next action",
  ].join("\n"),
  systemPrompt: [
    "You are One-Eyed Willy, Clawdia's consult-only proof and next-step advisor.",
    "Return strict JSON only.",
    "Never claim weak proof is complete.",
  ].join("\n"),
};

function normalizeText(value) {
  return String(value || "").trim();
}

function toPosixPath(value) {
  return normalizeText(value).replace(/\\/g, "/");
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function readTextFileOrFallback(pathname, fallback = "") {
  try {
    if (!pathname || !existsSync(pathname)) {
      return fallback;
    }
    return readFileSync(pathname, "utf8");
  } catch {
    return fallback;
  }
}

function sliceText(value, maxLength = 3600) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}

function getStudioRoot() {
  return resolve(process.env.NEXTEAM_STUDIO_PATH || DEFAULT_STUDIO_PATH);
}

function getClawdiaBotRoot() {
  return resolve(process.env.CLAWDIA_BOT_PATH || DEFAULT_CLAWDIA_BOT_PATH);
}

function getOpenClawWorkspaceRoot() {
  return resolve(process.env.OPENCLAW_WORKSPACE_PATH || DEFAULT_OPENCLAW_WORKSPACE);
}

function toRelativeStudioPath(absolutePath) {
  const studioRoot = toPosixPath(getStudioRoot());
  const fullPath = toPosixPath(resolve(absolutePath));
  if (fullPath.startsWith(`${studioRoot}/`)) {
    return fullPath.slice(studioRoot.length + 1);
  }
  return fullPath;
}

function getWillyDocAbsolutePath(filename) {
  return join(getStudioRoot(), ...WILLY_DOC_RELATIVE_DIR, filename);
}

function readWillyDoc(kind) {
  const filenameByKind = {
    soul: "SOUL.md",
    memory: "MEMORY.md",
    knowledgeBase: "KNOWLEDGE_BASE.md",
    playbook: "WILLY_PLAYBOOK_V1.md",
    systemPrompt: "WILLY_SYSTEM_PROMPT.md",
  };
  const filename = filenameByKind[kind];
  const absolutePath = getWillyDocAbsolutePath(filename);
  const fallback = DEFAULT_WILLY_DOCS[kind] || "";
  const content = readTextFileOrFallback(absolutePath, fallback);
  return {
    path: existsSync(absolutePath)
      ? toRelativeStudioPath(absolutePath)
      : `embedded_runtime/${filename}`,
    content,
    sourceMode: existsSync(absolutePath) ? "repo_docs" : "embedded_runtime_profile",
  };
}

function readClawdiaDoc(relativeSegments, fallbackLabel) {
  const absolutePath = join(getStudioRoot(), ...relativeSegments);
  const content = readTextFileOrFallback(absolutePath, "");
  return {
    path: existsSync(absolutePath) ? toRelativeStudioPath(absolutePath) : fallbackLabel,
    content,
    sourceMode: existsSync(absolutePath) ? "repo_docs" : "missing",
  };
}

function readWorkspaceMirror(filename) {
  const absolutePath = join(getOpenClawWorkspaceRoot(), filename);
  const content = readTextFileOrFallback(absolutePath, "");
  return {
    path: existsSync(absolutePath) ? toPosixPath(absolutePath) : filename,
    content,
    sourceMode: existsSync(absolutePath) ? "workspace_mirror" : "missing",
  };
}

function summarizeQueueState(state) {
  const workingTask = getWorkingTask(state);
  const nextTask = getNextSafeTask(state);
  const blockerTask =
    state.tasks
      .filter((task) => ["blocked", "parked"].includes(normalizeLower(task.status)) && normalizeText(task.blocker))
      .sort((left, right) => Number(left.job_number || 0) - Number(right.job_number || 0))[0] || null;

  return {
    queuePath: normalizeText(process.env.CLAWDIA_RUNTIME_DIR)
      ? toPosixPath(join(process.env.CLAWDIA_RUNTIME_DIR, "task-queue.json"))
      : toPosixPath(DEFAULT_QUEUE_PATH),
    totals: {
      tasks: state.tasks.length,
      queued: state.tasks.filter((task) => normalizeLower(task.status) === "queued").length,
      working: state.tasks.filter((task) => normalizeText(task.runtime_state) === "WORKING").length,
      done: state.tasks.filter((task) => normalizeText(task.runtime_state) === "DONE").length,
      parked: state.tasks.filter((task) => normalizeText(task.runtime_state) === "PARKED").length,
      blocked: state.tasks.filter((task) => normalizeText(task.runtime_state) === "BLOCKED").length,
    },
    workingTask: workingTask ? buildTaskSnapshot(workingTask) : null,
    nextSafeTask: nextTask ? buildTaskSnapshot(nextTask) : null,
    topBlocker: blockerTask ? buildTaskSnapshot(blockerTask) : null,
  };
}

function buildTaskSnapshot(task) {
  if (!task) {
    return null;
  }
  return {
    task_id: normalizeText(task.task_id),
    job_number: Number(task.job_number || 0) || null,
    title: normalizeText(task.title),
    lane: normalizeText(task.lane),
    front_door: normalizeText(task.front_door),
    status: normalizeText(task.status),
    runtime_state: normalizeText(task.runtime_state),
    assigned_to: normalizeText(task.assigned_to),
    task_type: normalizeText(task.task_type),
    blocker: normalizeText(task.blocker),
    next_action: normalizeText(task.next_action),
    reroute_count: Number(task.reroute_count || 0),
    repeat_blocker_count: Number(task.repeat_blocker_count || 0),
    needs_chris_approval: Boolean(task.needs_chris_approval),
    action_name: normalizeText(task.action_name),
    last_update: normalizeText(task.last_update),
  };
}

function normalizeRecommendation(value) {
  const normalized = normalizeText(value).toUpperCase();
  return WILLY_ALLOWED_RECOMMENDATIONS.includes(normalized) ? normalized : "ASK CHRIS";
}

function normalizeProofQuality(value) {
  const normalized = normalizeLower(value);
  return WILLY_ALLOWED_PROOF_QUALITIES.includes(normalized) ? normalized : "not applicable";
}

function normalizeConfidence(value) {
  const normalized = normalizeLower(value);
  return WILLY_ALLOWED_CONFIDENCE.includes(normalized) ? normalized : "low";
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return null;
  }
}

function buildWillyContextBundle(payload = {}) {
  const queueState = loadQueueState();
  const taskId = normalizeText(payload.taskId || payload.task_id);
  const taskFromQueue =
    taskId && Array.isArray(queueState.tasks)
      ? queueState.tasks.find((task) => normalizeText(task.task_id) === taskId) || null
      : null;
  const taskSnapshot = payload.taskSnapshot || taskFromQueue || null;
  const proofPayload = payload.proofPayload || taskFromQueue?.proof_payload || null;
  const question = normalizeText(payload.question);
  const situation = normalizeText(payload.situation || question);
  const queueSummary = summarizeQueueState(queueState);
  const workspaceMirrors = {
    status: readWorkspaceMirror("status.md"),
    lastAction: readWorkspaceMirror("last_action.md"),
    blockers: readWorkspaceMirror("blockers.md"),
  };
  const willyDocs = {
    soul: readWillyDoc("soul"),
    memory: readWillyDoc("memory"),
    knowledgeBase: readWillyDoc("knowledgeBase"),
    playbook: readWillyDoc("playbook"),
    systemPrompt: readWillyDoc("systemPrompt"),
  };
  const clawdiaDocs = {
    memory: readClawdiaDoc(CLAWDIA_MEMORY_RELATIVE_PATH, "docs/internal/CLAWDIA_MEMORY.md"),
    runbook: readClawdiaDoc(CLAWDIA_RUNBOOK_RELATIVE_PATH, "docs/internal/CLAWDIA_GENERAL_CONTRACTOR_RUNBOOK.md"),
  };

  return {
    question,
    situation,
    autoTrigger: normalizeText(payload.autoTrigger),
    requestedBy: normalizeText(payload.requestedBy || "Clawdia"),
    taskSnapshot: buildTaskSnapshot(taskSnapshot),
    proofPayload,
    queueSummary,
    workspaceMirrors,
    willyDocs,
    clawdiaDocs,
    rawQueueStateAvailable: Array.isArray(queueState.tasks),
  };
}

function buildPromptPayload(context) {
  return {
    question: context.question,
    situation: context.situation,
    autoTrigger: context.autoTrigger || "manual_consult",
    requestedBy: context.requestedBy,
    queueSummary: context.queueSummary,
    taskSnapshot: context.taskSnapshot,
    proofPayload: context.proofPayload,
    workspaceMirrors: {
      status: {
        path: context.workspaceMirrors.status.path,
        content: sliceText(context.workspaceMirrors.status.content, 1400),
      },
      lastAction: {
        path: context.workspaceMirrors.lastAction.path,
        content: sliceText(context.workspaceMirrors.lastAction.content, 1400),
      },
      blockers: {
        path: context.workspaceMirrors.blockers.path,
        content: sliceText(context.workspaceMirrors.blockers.content, 1400),
      },
    },
    willyDocs: {
      soul: {
        path: context.willyDocs.soul.path,
        content: sliceText(context.willyDocs.soul.content, 2800),
      },
      memory: {
        path: context.willyDocs.memory.path,
        content: sliceText(context.willyDocs.memory.content, 2200),
      },
      knowledgeBase: {
        path: context.willyDocs.knowledgeBase.path,
        content: sliceText(context.willyDocs.knowledgeBase.content, 2200),
      },
      playbook: {
        path: context.willyDocs.playbook.path,
        content: sliceText(context.willyDocs.playbook.content, 2200),
      },
    },
    clawdiaDocs: {
      memory: {
        path: context.clawdiaDocs.memory.path,
        content: sliceText(context.clawdiaDocs.memory.content, 2200),
      },
      runbook: {
        path: context.clawdiaDocs.runbook.path,
        content: sliceText(context.clawdiaDocs.runbook.content, 2200),
      },
    },
  };
}

function resolveWillyRuntimeConfig() {
  const enabledRaw = normalizeText(process.env.WILLY_ENABLED);
  const enabled = enabledRaw ? enabledRaw.toLowerCase() === "true" : true;
  const provider = normalizeLower(process.env.WILLY_LLM_PROVIDER || DEFAULT_WILLY_PROVIDER);
  const model = normalizeText(process.env.WILLY_MODEL || process.env.OPENAI_MODEL || DEFAULT_WILLY_MODEL);
  const systemPromptPath = normalizeText(
    process.env.WILLY_SYSTEM_PROMPT_PATH || toRelativeStudioPath(getWillyDocAbsolutePath("WILLY_SYSTEM_PROMPT.md"))
  );
  const memoryPath = normalizeText(
    process.env.WILLY_MEMORY_PATH || toRelativeStudioPath(getWillyDocAbsolutePath("MEMORY.md"))
  );
  const hasDirectApiKey = Boolean(normalizeText(process.env.OPENAI_API_KEY));
  const allowRailwayFallback =
    normalizeLower(process.env.WILLY_SKIP_RAILWAY_FALLBACK) !== "true" &&
    normalizeLower(process.env.WILLY_ALLOW_RAILWAY_FALLBACK || "true") !== "false";
  return {
    enabled,
    enabledRaw,
    provider,
    model,
    systemPromptPath,
    memoryPath,
    hasDirectApiKey,
    allowRailwayFallback,
  };
}

function buildMissingEnvError(names) {
  const envNames = Array.isArray(names) ? names.filter(Boolean) : [normalizeText(names)].filter(Boolean);
  return `Missing required env var name(s): ${envNames.join(", ")}`;
}

async function runOpenAiConsultDirect(promptPayload, config, systemPrompt) {
  const client = new OpenAI({ apiKey: normalizeText(process.env.OPENAI_API_KEY) });
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(promptPayload, null, 2),
      },
    ],
  });

  const content = normalizeText(completion.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("Willy LLM returned an empty response.");
  }

  const parsed = safeJsonParse(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Willy LLM returned invalid JSON.");
  }

  return parsed;
}

function runRailwayBackedConsult(promptPayload, config, systemPrompt) {
  return new Promise((resolve, reject) => {
    const railwayCommand = process.platform === "win32" ? "railway.cmd" : "railway";
    const cliScriptPath = join(getClawdiaBotRoot(), "willyConsultCli.js");
    const child = spawn(
      railwayCommand,
      ["run", "node", cliScriptPath],
      {
        cwd: getClawdiaBotRoot(),
        shell: process.platform === "win32",
        env: {
          ...process.env,
          WILLY_SKIP_RAILWAY_FALLBACK: "true",
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            normalizeText(stderr) ||
              normalizeText(stdout) ||
              `Railway-backed Willy consult failed with exit code ${code}.`
          )
        );
        return;
      }
      const parsed = safeJsonParse(stdout);
      if (!parsed || typeof parsed !== "object") {
        reject(new Error("Railway-backed Willy consult returned invalid JSON."));
        return;
      }
      resolve(parsed);
    });

    child.stdin.write(
      JSON.stringify({
        promptPayload,
        config: {
          provider: config.provider,
          model: config.model,
        },
        systemPrompt,
      })
    );
    child.stdin.end();
  });
}

function sanitizeDecision(parsed, context) {
  return {
    situation: normalizeText(parsed?.situation || context.situation || context.question || "No situation provided."),
    recommendation: normalizeRecommendation(parsed?.recommendation),
    reason: normalizeText(parsed?.reason || "Willy did not return a reason."),
    proofQuality: normalizeProofQuality(parsed?.proofQuality),
    nextActionForClawdia: normalizeText(parsed?.nextActionForClawdia || "Review the live queue truth and decide the next safe move."),
    askChris: Boolean(parsed?.askChris),
    askChrisReason: normalizeText(parsed?.askChrisReason || "No Chris escalation reason provided."),
    memoryUpdateNeeded: Boolean(parsed?.memoryUpdateNeeded),
    memoryUpdateWhatToSave: normalizeText(parsed?.memoryUpdateWhatToSave || "nothing"),
    confidence: normalizeConfidence(parsed?.confidence),
    confidenceReason: normalizeText(parsed?.confidenceReason || "Willy did not provide a confidence reason."),
  };
}

function buildWillyResponse(decision) {
  return [
    "WILLY CONSULT RESPONSE",
    "",
    "SITUATION:",
    `- ${decision.situation}`,
    "RECOMMENDATION:",
    `- ${decision.recommendation}`,
    "",
    "REASON:",
    `- ${decision.reason}`,
    "PROOF QUALITY:",
    `- ${decision.proofQuality}`,
    "",
    "NEXT ACTION FOR CLAWDIA:",
    `- ${decision.nextActionForClawdia}`,
    "ASK CHRIS:",
    `- ${decision.askChris ? "yes" : "no"}`,
    `- reason: ${decision.askChrisReason}`,
    "",
    "MEMORY UPDATE NEEDED:",
    `- ${decision.memoryUpdateNeeded ? "yes" : "no"}`,
    `- what to save: ${decision.memoryUpdateWhatToSave || "nothing"}`,
    "",
    "CONFIDENCE:",
    `- ${decision.confidence}`,
    "",
    "CONFIDENCE REASON:",
    `- ${decision.confidenceReason}`,
  ].join("\n");
}

function buildRuntimeLoaded(context, config, runtimeMode) {
  return {
    willySoul: context.willyDocs.soul.path,
    willyMemory: context.willyDocs.memory.path,
    willyKnowledgeBase: context.willyDocs.knowledgeBase.path,
    willyPlaybook: context.willyDocs.playbook.path,
    willySystemPrompt: context.willyDocs.systemPrompt.path,
    clawdiaMemory: context.clawdiaDocs.memory.path,
    clawdiaRunbook: context.clawdiaDocs.runbook.path,
    runtimeMode,
    provider: config.provider,
    model: config.model,
  };
}

function buildWillyResult(decision, context, config, runtimeMode) {
  return {
    ok: true,
    consult_only: true,
    can_execute: false,
    can_contact_clients: false,
    can_send_messages: false,
    can_publish: false,
    llm_backed: true,
    provider_name: config.provider,
    model_name: config.model,
    response: buildWillyResponse(decision),
    situation: decision.situation,
    goonie: {
      id: "willy",
      name: "One-Eyed Willy",
      short_name: "Willy",
      role: "Nova-like Proof / Judgment / Next-Step Advisor",
      consult_lane: "proof_review_next_step",
      consult_only: true,
      can_execute: false,
      llm_backed: true,
    },
    recommendation: decision.recommendation,
    reason: decision.reason,
    proof_quality: decision.proofQuality,
    ask_chris: {
      yes: decision.askChris,
      reason: decision.askChrisReason,
    },
    memory_update_needed: {
      yes: decision.memoryUpdateNeeded,
      what_to_save: decision.memoryUpdateWhatToSave,
    },
    confidence: decision.confidence.toUpperCase(),
    confidence_reason: decision.confidenceReason,
    summary: `Willy advised ${decision.recommendation} with ${decision.confidence} confidence.`,
    tests_run: [`willy llm consult (${runtimeMode})`, `provider: ${config.provider}`, `model: ${config.model}`],
    tests_passed: true,
    files_changed: [],
    next_action: decision.nextActionForClawdia,
    runtime_loaded: buildRuntimeLoaded(context, config, runtimeMode),
  };
}

function buildWillyFailureResult(context, config, message, missingEnvNames = []) {
  return {
    ok: false,
    blocked: true,
    consult_only: true,
    can_execute: false,
    can_contact_clients: false,
    can_send_messages: false,
    can_publish: false,
    llm_backed: true,
    provider_name: config.provider,
    model_name: config.model,
    response: [
      "WILLY CONSULT RESPONSE",
      "",
      "SITUATION:",
      `- ${context.situation || context.question || "No situation provided."}`,
      "RECOMMENDATION:",
      "- ASK CHRIS",
      "",
      "REASON:",
      `- Willy runtime is blocked: ${message}`,
      "PROOF QUALITY:",
      "- not applicable",
      "",
      "NEXT ACTION FOR CLAWDIA:",
      "- Restore the approved Willy LLM path, then retry the consult.",
      "ASK CHRIS:",
      "- yes",
      `- reason: ${message}`,
      "",
      "MEMORY UPDATE NEEDED:",
      "- no",
      "- what to save: nothing",
      "",
      "CONFIDENCE:",
      "- low",
      "",
      "CONFIDENCE REASON:",
      "- Willy could not reach the approved LLM consult path safely.",
    ].join("\n"),
    situation: context.situation || context.question || "No situation provided.",
    recommendation: "ASK CHRIS",
    reason: `Willy runtime is blocked: ${message}`,
    proof_quality: "not applicable",
    message,
    missing_env_names: missingEnvNames,
    tests_run: ["willy llm consult attempt"],
    tests_passed: false,
    files_changed: [],
    next_action: "Restore the approved Willy LLM path, then retry the consult.",
    confidence: "LOW",
    confidence_reason: "Willy could not reach the approved LLM consult path safely.",
    runtime_loaded: buildRuntimeLoaded(context, config, "blocked"),
  };
}

export function isWillyNamedQuestion(text) {
  const lower = normalizeLower(text);
  return lower.includes("one-eyed willy") || /\bwilly(?:'s|s)?\b/i.test(lower);
}

export function shouldAutoConsultWilly(text) {
  const lower = normalizeLower(text);
  if (!lower) {
    return false;
  }
  if (isWillyNamedQuestion(lower)) {
    return true;
  }
  return [
    "stepping away",
    "step away",
    "next clue",
    "next step",
    "what should you do next",
    "what should i do next",
    "proof is good",
    "proof good",
    "review proof",
    "proof review",
    "park or reroute",
    "reroute or park",
    "same blocker",
    "blocked again",
    "truth conflict",
    "stale status",
    "queue conflict",
    "about to call this complete",
    "should i ask chris",
  ].some((keyword) => lower.includes(keyword));
}

export async function consultWillyAction(payload = {}) {
  const context = buildWillyContextBundle(payload);
  const config = resolveWillyRuntimeConfig();

  if (!config.enabled) {
    return buildWillyFailureResult(context, config, buildMissingEnvError(["WILLY_ENABLED"]), ["WILLY_ENABLED"]);
  }

  if (config.provider !== "openai") {
    return buildWillyFailureResult(
      context,
      config,
      "Unsupported Willy provider. Configure WILLY_LLM_PROVIDER with an approved provider name.",
      ["WILLY_LLM_PROVIDER"]
    );
  }

  const systemPrompt = readWillyDoc("systemPrompt").content || DEFAULT_WILLY_DOCS.systemPrompt;
  const promptPayload = buildPromptPayload(context);

  try {
    let parsedDecision;
    let runtimeMode = "direct_env";

    if (config.hasDirectApiKey) {
      parsedDecision = await runOpenAiConsultDirect(promptPayload, config, systemPrompt);
    } else if (config.allowRailwayFallback) {
      parsedDecision = await runRailwayBackedConsult(promptPayload, config, systemPrompt);
      runtimeMode = "railway_env_fallback";
    } else {
      return buildWillyFailureResult(
        context,
        config,
        buildMissingEnvError(["OPENAI_API_KEY"]),
        ["OPENAI_API_KEY"]
      );
    }

    const decision = sanitizeDecision(parsedDecision, context);
    return buildWillyResult(decision, context, config, runtimeMode);
  } catch (error) {
    const errorMessage = normalizeText(error?.message || "Willy consult failed.");
    const missingEnvNames = errorMessage.includes("OPENAI_API_KEY") ? ["OPENAI_API_KEY"] : [];
    return buildWillyFailureResult(context, config, errorMessage, missingEnvNames);
  }
}

export async function reviewProofWithWillyAction(payload = {}) {
  const taskId = normalizeText(payload.taskId || payload.task_id);
  const question =
    normalizeText(payload.question) ||
    "Clawdia, ask Willy if this proof is good.";
  return consultWillyAction({
    ...payload,
    taskId,
    question,
    situation:
      normalizeText(payload.situation) ||
      `Proof review requested${taskId ? ` for task ${taskId}` : ""}. Decide whether Clawdia should accept, reject, reroute, park, continue, or ask Chris.`,
    autoTrigger: normalizeText(payload.autoTrigger) || "proof_review",
  });
}

export async function runWillySteppingAwayAction(payload = {}) {
  return consultWillyAction({
    ...payload,
    question: normalizeText(payload.question) || "Clawdia, I am stepping away.",
    situation:
      normalizeText(payload.situation) ||
      "Chris is stepping away. Review the live queue, blockers, and next safe work, then tell Clawdia what to do next.",
    autoTrigger: normalizeText(payload.autoTrigger) || "stepping_away",
  });
}

export const willyConsultRuntime = {
  consultWilly: consultWillyAction,
  reviewProofWithWilly: reviewProofWithWillyAction,
  runWillySteppingAway: runWillySteppingAwayAction,
};

export const willyConsultRuntimeInternals = {
  buildPromptPayload,
  buildTaskSnapshot,
  buildWillyContextBundle,
  normalizeConfidence,
  normalizeProofQuality,
  normalizeRecommendation,
  resolveWillyRuntimeConfig,
  sanitizeDecision,
  shouldAutoConsultWilly,
};

```

### C:/Users/Peyto/clawdia-bot/willyConsultCli.js

```js
import { stdin, stdout } from "node:process";
import { consultWillyAction } from "./willyConsultRuntime.js";

function readStdin() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    stdin.on("end", () => resolve(buffer));
    stdin.on("error", reject);
  });
}

async function main() {
  const rawInput = await readStdin();
  const parsed = rawInput ? JSON.parse(rawInput) : {};
  const result = await consultWillyAction({
    question: parsed?.promptPayload?.question || "",
    situation: parsed?.promptPayload?.situation || "",
    autoTrigger: parsed?.promptPayload?.autoTrigger || "",
    requestedBy: parsed?.promptPayload?.requestedBy || "Clawdia",
    taskSnapshot: parsed?.promptPayload?.taskSnapshot || null,
    proofPayload: parsed?.promptPayload?.proofPayload || null,
  });
  stdout.write(JSON.stringify({
    situation: result?.situation || parsed?.promptPayload?.situation || "",
    recommendation: result?.recommendation || "ASK CHRIS",
    reason: result?.reason || result?.summary || result?.message || "Willy consult did not complete.",
    proofQuality: result?.proof_quality || "not applicable",
    nextActionForClawdia: result?.next_action || "Restore the approved Willy path and retry.",
    askChris: result?.ask_chris?.yes === true,
    askChrisReason: result?.ask_chris?.reason || result?.message || "Willy consult did not complete.",
    memoryUpdateNeeded: result?.memory_update_needed?.yes === true,
    memoryUpdateWhatToSave: result?.memory_update_needed?.what_to_save || "nothing",
    confidence: normalizeCliConfidence(result?.confidence),
    confidenceReason: result?.confidence_reason || result?.message || "Willy consult completed through the approved runtime.",
  }));
}

function normalizeCliConfidence(value) {
  const normalized = String(value || "LOW").trim().toLowerCase();
  if (["high", "medium", "low"].includes(normalized)) {
    return normalized;
  }
  return "low";
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});

```

### C:/Users/Peyto/clawdia-bot/sharedActionLayer.js

```js
import { approvedDocMaintenanceRuntime } from "./approvedDocMaintenanceRuntime.js";
import { companyCamCommandInternals } from "./companycamCommands.js";
import { buildRuntimeTasksFromAuthoritativeQueue } from "./contractorLayer.js";
import { invokeCodexBridgeTask } from "./codexBridgeClient.js";
import { goonieConsultRuntime, goonieConsultRuntimeInternals } from "./goonieConsultRuntime.js";
import { operatorCommandInternals } from "./operatorCommands.js";
import { railwayAccessRuntime } from "./railwayAccessRuntime.js";
import {
  enqueuePersistentTask,
  enqueuePersistentTasks,
  getNextSafeTask,
  getWorkingTask,
  loadQueueState,
  saveQueueState,
  updateTaskInState,
} from "./taskQueueStore.js";
import { willyConsultRuntime, willyConsultRuntimeInternals } from "./willyConsultRuntime.js";
import { syncWorkspaceMirrors } from "./workspaceMirror.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildSessionMessage(sessionKey) {
  const key = normalizeText(sessionKey) || "shared-action-layer";
  return {
    from: { id: key },
    chat: { id: key },
  };
}

function summarizeQueueState(state) {
  const workingTask = getWorkingTask(state);
  const nextTask = getNextSafeTask(state);
  const blockedTask =
    state.tasks
      .filter((task) => ["blocked", "parked"].includes(task.status) && normalizeText(task.blocker))
      .sort((left, right) => left.job_number - right.job_number)[0] || null;

  return {
    currentTask: workingTask
      ? {
          task_id: workingTask.task_id,
          title: workingTask.title,
          status: workingTask.status,
          runtime_state: workingTask.runtime_state,
          front_door: workingTask.front_door,
          blocker: workingTask.blocker,
          next_action: workingTask.next_action,
        }
      : null,
    nextTask: nextTask
      ? {
          task_id: nextTask.task_id,
          title: nextTask.title,
          status: nextTask.status,
          runtime_state: nextTask.runtime_state,
          front_door: nextTask.front_door,
        }
      : null,
    blocker: blockedTask
      ? {
          task_id: blockedTask.task_id,
          title: blockedTask.title,
          status: blockedTask.status,
          runtime_state: blockedTask.runtime_state,
          blocker: blockedTask.blocker,
          next_action: blockedTask.next_action,
        }
      : null,
    counts: {
      queued: state.tasks.filter((task) => task.status === "queued").length,
      working: state.tasks.filter((task) => task.runtime_state === "WORKING").length,
      blocked: state.tasks.filter((task) => task.runtime_state === "BLOCKED").length,
      parked: state.tasks.filter((task) => task.runtime_state === "PARKED").length,
      done: state.tasks.filter((task) => task.runtime_state === "DONE").length,
    },
  };
}

export function readTaskQueueAction() {
  const state = loadQueueState();
  return {
    ok: true,
    state,
    summary: summarizeQueueState(state),
  };
}

export function readTaskByIdAction(taskId) {
  const state = loadQueueState();
  const task = state.tasks.find((entry) => entry.task_id === normalizeText(taskId)) || null;
  return {
    ok: Boolean(task),
    task,
    summary: summarizeQueueState(state),
  };
}

export function updateTaskQueueAction(taskInput, now = new Date()) {
  const state = loadQueueState();
  const existingTaskId = normalizeText(taskInput?.task_id);

  if (!existingTaskId || !state.tasks.some((task) => task.task_id === existingTaskId)) {
    const task = enqueuePersistentTask(taskInput, now);
    const nextState = loadQueueState();
    syncWorkspaceMirrors(nextState, now);
    return {
      ok: true,
      mode: "enqueued",
      task,
      state: nextState,
      summary: summarizeQueueState(nextState),
    };
  }

  const updated = updateTaskInState(
    state,
    existingTaskId,
    taskInput,
    now
  );
  saveQueueState(state, now);
  syncWorkspaceMirrors(state, now);
  return {
    ok: true,
    mode: "updated",
    task: updated,
    state,
    summary: summarizeQueueState(state),
  };
}

export function updateTaskQueueBatchAction(taskInputs, now = new Date()) {
  const inputs = Array.isArray(taskInputs) ? taskInputs : [];
  const tasks = enqueuePersistentTasks(inputs, now);
  const nextState = loadQueueState();
  syncWorkspaceMirrors(nextState, now);
  return {
    ok: true,
    mode: "batch_enqueued",
    count: tasks.length,
    tasks,
    state: nextState,
    summary: summarizeQueueState(nextState),
  };
}

export function loadAuthoritativeTaskQueueAction(now = new Date()) {
  const authoritativeTasks = buildRuntimeTasksFromAuthoritativeQueue();
  const state = loadQueueState();
  const existingTaskIds = new Set(state.tasks.map((task) => normalizeText(task.task_id)));
  const missingTasks = authoritativeTasks.filter(
    (task) => task.task_id && !existingTaskIds.has(normalizeText(task.task_id))
  );

  const createdTasks = missingTasks.length > 0 ? enqueuePersistentTasks(missingTasks, now) : [];
  const nextState = loadQueueState();
  const mirrors = syncWorkspaceMirrors(nextState, now);

  return {
    ok: true,
    mode: "authoritative_queue_loaded",
    authoritative_count: authoritativeTasks.length,
    created_count: createdTasks.length,
    skipped_existing_count: authoritativeTasks.length - createdTasks.length,
    created_task_ids: createdTasks.map((task) => task.task_id),
    created_titles: createdTasks.map((task) => task.title),
    skipped_existing_task_ids: authoritativeTasks
      .filter((task) => existingTaskIds.has(normalizeText(task.task_id)))
      .map((task) => task.task_id),
    summary:
      createdTasks.length > 0
        ? `Loaded ${createdTasks.length} missing contractor task(s) from the authoritative docs queue.`
        : "No missing contractor tasks needed loading from the authoritative docs queue.",
    tests_run: [
      "authoritative docs queue parsed",
      "missing runtime tasks inserted only",
      "workspace mirrors synced from runtime queue",
    ],
    tests_passed: true,
    files_changed: [],
    blocker: "",
    next_action:
      createdTasks.length > 0
        ? "Continue from the real runtime queue state instead of assuming the contractor batch failed."
        : "Use the existing runtime queue state as the authority; no missing contractor tasks remain to load.",
    mirrors,
    state: nextState,
    summary_view: summarizeQueueState(nextState),
  };
}

export function reportStatusAction(now = new Date()) {
  const state = loadQueueState();
  const mirrors = syncWorkspaceMirrors(state, now);
  return {
    ok: true,
    state,
    summary: summarizeQueueState(state),
    mirrors,
  };
}

export async function routeTaskToCodexAction(taskPacket) {
  return invokeCodexBridgeTask(taskPacket);
}

export function runCompanyCamStatusAction() {
  return {
    ok: true,
    summary: companyCamCommandInternals.buildStatusSummary(),
  };
}

export async function checkRailwayStatusAction(payload = {}) {
  return railwayAccessRuntime.checkRailwayStatus(payload);
}

export async function readRailwayLogsAction(payload = {}) {
  return railwayAccessRuntime.readRailwayLogs(payload);
}

export async function verifyRailwayEnvNamesAction(payload = {}) {
  return railwayAccessRuntime.verifyRailwayEnvNames(payload);
}

export async function restartRailwayServiceAction(payload = {}) {
  return railwayAccessRuntime.restartRailwayService(payload);
}

export async function deployRailwayServiceAction(payload = {}) {
  return railwayAccessRuntime.deployRailwayService(payload);
}

export async function confirmRailwayWebhookHealthAction(payload = {}) {
  return railwayAccessRuntime.confirmRailwayWebhookHealth(payload);
}

export function runClawdiaFrontDoorSelfTestAction(payload = {}) {
  const question =
    normalizeText(payload.question) || "What can break in the Telegram to Codex bridge?";
  const queueState = loadQueueState();
  const consult = goonieConsultRuntime.consultData({ question });
  const allowedUserConfigured = Boolean(
    normalizeText(process.env.CLAWDIA_TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_CHRIS_CHAT_ID)
  );
  const testsRun = [
    "shared brain queue state readable",
    "telegram allowed-user gate configured",
    "goonie consult runtime callable",
  ];
  const testsPassed = Boolean(queueState && allowedUserConfigured && consult?.ok === true);

  return {
    ok: testsPassed,
    blocked: !testsPassed,
    summary: testsPassed
      ? "Clawdia front-door self-test completed successfully."
      : "Clawdia front-door self-test found a blocker.",
    blocker: testsPassed
      ? ""
      : "Queue state, operator gating, or Goonie consult runtime failed the internal self-test.",
    tests_run: testsRun,
    tests_passed: testsPassed,
    files_changed: [],
    next_action: testsPassed
      ? "Front-door self-test passed. Continue using the shared brain queue and consult actions."
      : "Inspect queue state, operator gating, and consult runtime before retrying.",
    consult_preview: consult?.response || "",
  };
}

export function readApprovedDocFileAction(payload = {}) {
  return approvedDocMaintenanceRuntime.readApprovedDocFile(payload);
}

export function writeApprovedDocFileAction(payload = {}) {
  return approvedDocMaintenanceRuntime.writeApprovedDocFile(payload);
}

export function appendApprovedDocTextAction(payload = {}) {
  return approvedDocMaintenanceRuntime.appendApprovedDocText(payload);
}

export function createEmailPreviewAction({ sessionKey, to, subject, body, attachmentRequestNote = "" }) {
  return operatorCommandInternals.createPendingEmailDraftFromFields({
    message: buildSessionMessage(sessionKey),
    to,
    subject,
    body,
    attachmentRequestNote,
  });
}

export function createVgbEmailPreviewAction({ sessionKey, to }) {
  return operatorCommandInternals.createPendingVgbEmailDraftFromPackage({
    message: buildSessionMessage(sessionKey),
    to,
  });
}

export function attachFileToEmailPreviewAction({ sessionKey, queryText }) {
  return operatorCommandInternals.attachApprovedFilesToPendingEmail({
    message: buildSessionMessage(sessionKey),
    queryText,
  });
}

function resolveSerializedEmailTransport(transport = {}) {
  const mode = normalizeText(transport?.mode).toLowerCase();
  if (!mode) {
    return {
      ok: true,
      sendEmail: operatorCommandInternals.sendApprovedEmail,
    };
  }

  if (mode !== "stub") {
    return {
      ok: false,
      message: `Unsupported email transport mode: ${mode}.`,
    };
  }

  if (normalizeText(process.env.CLAWDIA_ALLOW_STUB_EMAIL_SEND).toLowerCase() !== "true") {
    return {
      ok: false,
      message: "Stub email transport is disabled in this runtime.",
    };
  }

  const messageId = normalizeText(transport?.messageId) || "stub-email-message-id";
  return {
    ok: true,
    sendEmail: async () => ({ ok: true, messageId }),
  };
}

export async function sendEmailAction({
  sessionKey,
  confirmationText = "",
  sendEmail,
  transport = {},
}) {
  const message = buildSessionMessage(sessionKey);
  const pending = operatorCommandInternals.getPendingEmail(message);
  if (!pending) {
    return {
      ok: false,
      message: "No pending email preview exists for that session.",
    };
  }

  const expectedConfirmation = `${operatorCommandInternals.EMAIL_CONFIRMATION_PREFIX} ${pending.id}`;
  if (normalizeText(confirmationText) !== expectedConfirmation) {
    return {
      ok: false,
      blocked: true,
      confirmation_required: true,
      confirmation_phrase: expectedConfirmation,
      pending_email_id: pending.id,
      message: `Email send is approval-gated. Reply with exactly: ${expectedConfirmation}`,
    };
  }

  const resolvedTransport =
    typeof sendEmail === "function"
      ? { ok: true, sendEmail }
      : resolveSerializedEmailTransport(transport);
  if (!resolvedTransport.ok) {
    return {
      ok: false,
      blocked: true,
      pending_email_id: pending.id,
      confirmation_phrase: expectedConfirmation,
      message: resolvedTransport.message,
    };
  }

  const result = await operatorCommandInternals.sendPendingEmail({
    message,
    pending,
    sendEmail: resolvedTransport.sendEmail,
  });
  return {
    ok: /EMAIL SEND COMPLETE/.test(result.message),
    pending_email_id: pending.id,
    confirmation_phrase: expectedConfirmation,
    message: result.message,
  };
}

export async function consultGoonieAction({ question, agentId }) {
  const normalizedAgentId = normalizeText(agentId).toLowerCase();
  if (normalizedAgentId === "willy") {
    return willyConsultRuntime.consultWilly({ question, requestedBy: "Clawdia" });
  }
  return goonieConsultRuntime.consultGoonie({ question, agentId });
}

export function consultChunkAction({ question }) {
  return goonieConsultRuntime.consultChunk({ question });
}

export function consultMikeyAction({ question }) {
  return goonieConsultRuntime.consultMikey({ question });
}

export function consultMouthAction({ question }) {
  return goonieConsultRuntime.consultMouth({ question });
}

export function consultBrandAction({ question }) {
  return goonieConsultRuntime.consultBrand({ question });
}

export function consultDataAction({ question }) {
  return goonieConsultRuntime.consultData({ question });
}

export function consultAndyAction({ question }) {
  return goonieConsultRuntime.consultAndy({ question });
}

export async function consultWillyAction({ question, taskId, proofPayload, situation, autoTrigger } = {}) {
  return willyConsultRuntime.consultWilly({
    question,
    taskId,
    proofPayload,
    situation,
    autoTrigger,
    requestedBy: "Clawdia",
  });
}

export async function reviewProofWithWillyAction({ question, taskId, proofPayload, situation, autoTrigger } = {}) {
  return willyConsultRuntime.reviewProofWithWilly({
    question,
    taskId,
    proofPayload,
    situation,
    autoTrigger,
    requestedBy: "Clawdia",
  });
}

export async function runWillySteppingAwayAction({ question, situation, autoTrigger } = {}) {
  return willyConsultRuntime.runWillySteppingAway({
    question,
    situation,
    autoTrigger,
    requestedBy: "Clawdia",
  });
}

export async function autoSelectGoonieConsultAction({ question }) {
  if (willyConsultRuntimeInternals.shouldAutoConsultWilly(question)) {
    return willyConsultRuntime.consultWilly({
      question,
      autoTrigger: "auto_select",
      requestedBy: "Clawdia",
    });
  }
  const chosenAgentId = goonieConsultRuntimeInternals.identifyBestGoonieId(question);
  if (normalizeText(chosenAgentId).toLowerCase() === "willy") {
    return willyConsultRuntime.consultWilly({
      question,
      autoTrigger: "auto_select",
      requestedBy: "Clawdia",
    });
  }
  return goonieConsultRuntime.autoSelectGoonieConsult({ question });
}

function getWorkerActionHandlers() {
  return {
    attachFileToEmailPreview: attachFileToEmailPreviewAction,
    autoSelectGoonieConsult: autoSelectGoonieConsultAction,
    appendApprovedDocText: appendApprovedDocTextAction,
    consultAndy: consultAndyAction,
    consultBrand: consultBrandAction,
    consultChunk: consultChunkAction,
    consultData: consultDataAction,
    consultGoonie: consultGoonieAction,
    consultMikey: consultMikeyAction,
    consultMouth: consultMouthAction,
    consultWilly: consultWillyAction,
    checkRailwayStatus: checkRailwayStatusAction,
    confirmRailwayWebhookHealth: confirmRailwayWebhookHealthAction,
    createEmailPreview: createEmailPreviewAction,
    createVgbEmailPreview: createVgbEmailPreviewAction,
    deployRailwayService: deployRailwayServiceAction,
    loadAuthoritativeTaskQueue: () => loadAuthoritativeTaskQueueAction(),
    runClawdiaFrontDoorSelfTest: () => runClawdiaFrontDoorSelfTestAction(),
    readApprovedDocFile: readApprovedDocFileAction,
    readTaskQueue: () => readTaskQueueAction(),
    readRailwayLogs: readRailwayLogsAction,
    reportStatus: () => reportStatusAction(),
    restartRailwayService: restartRailwayServiceAction,
    reviewProofWithWilly: reviewProofWithWillyAction,
    routeTaskToCodex: routeTaskToCodexAction,
    runWillySteppingAway: runWillySteppingAwayAction,
    runCompanyCamStatus: () => runCompanyCamStatusAction(),
    sendEmail: sendEmailAction,
    updateTaskQueue: (payload) => updateTaskQueueAction(payload),
    updateTaskQueueBatch: (payload) =>
      updateTaskQueueBatchAction(Array.isArray(payload?.tasks) ? payload.tasks : payload),
    verifyRailwayEnvNames: verifyRailwayEnvNamesAction,
    writeApprovedDocFile: writeApprovedDocFileAction,
  };
}

export async function executeWorkerAction(actionName, actionPayload = {}) {
  const name = normalizeText(actionName);
  const handler = getWorkerActionHandlers()[name];
  if (!handler) {
    return {
      ok: false,
      blocked: true,
      message: `Worker action is not allowlisted: ${name || "unknown"}.`,
    };
  }
  try {
    return await handler(actionPayload);
  } catch (error) {
    return {
      ok: false,
      blocked: true,
      message: String(error?.message || "Worker action failed."),
    };
  }
}

export const sharedActionLayer = {
  attachFileToEmailPreview: attachFileToEmailPreviewAction,
  autoSelectGoonieConsult: autoSelectGoonieConsultAction,
  appendApprovedDocText: appendApprovedDocTextAction,
  consultAndy: consultAndyAction,
  consultBrand: consultBrandAction,
  consultChunk: consultChunkAction,
  consultData: consultDataAction,
  consultGoonie: consultGoonieAction,
  consultMikey: consultMikeyAction,
  consultMouth: consultMouthAction,
  consultWilly: consultWillyAction,
  checkRailwayStatus: checkRailwayStatusAction,
  confirmRailwayWebhookHealth: confirmRailwayWebhookHealthAction,
  createEmailPreview: createEmailPreviewAction,
  createVgbEmailPreview: createVgbEmailPreviewAction,
  deployRailwayService: deployRailwayServiceAction,
  executeWorkerAction,
  loadAuthoritativeTaskQueue: loadAuthoritativeTaskQueueAction,
  runClawdiaFrontDoorSelfTest: runClawdiaFrontDoorSelfTestAction,
  readApprovedDocFile: readApprovedDocFileAction,
  readTaskById: readTaskByIdAction,
  readRailwayLogs: readRailwayLogsAction,
  readTaskQueue: readTaskQueueAction,
  reportStatus: reportStatusAction,
  restartRailwayService: restartRailwayServiceAction,
  reviewProofWithWilly: reviewProofWithWillyAction,
  routeTaskToCodex: routeTaskToCodexAction,
  runWillySteppingAway: runWillySteppingAwayAction,
  runCompanyCamStatus: runCompanyCamStatusAction,
  sendEmail: sendEmailAction,
  updateTaskQueue: updateTaskQueueAction,
  updateTaskQueueBatch: updateTaskQueueBatchAction,
  verifyRailwayEnvNames: verifyRailwayEnvNamesAction,
  writeApprovedDocFile: writeApprovedDocFileAction,
};

export const sharedActionLayerInternals = {
  buildSessionMessage,
  summarizeQueueState,
};

```

### C:/Users/Peyto/clawdia-bot/workerLoop.js

```js
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { invokeCodexBridgeTask } from "./codexBridgeClient.js";
import { sharedActionLayer } from "./sharedActionLayer.js";
import {
  appendQueueEvent,
  buildEndOfDayReport,
  getNextSafeTask,
  getWorkingTask,
  loadQueueState,
  saveQueueState,
  taskQueueStoreInternals,
  updateTaskInState,
} from "./taskQueueStore.js";
import { syncWorkspaceMirrors } from "./workspaceMirror.js";

const ACTIVE_HEARTBEAT_MINUTES = Number(process.env.CLAWDIA_WORKER_HEARTBEAT_MINUTES || 45);
const WORKER_LOOP_MS = Number(process.env.CLAWDIA_WORKER_INTERVAL_MS || 300000);
const END_OF_DAY_HOUR = Number(process.env.CLAWDIA_END_OF_DAY_HOUR || 17);
const STALE_WORKING_MINUTES = Number(process.env.CLAWDIA_WORKER_STALE_MINUTES || Math.max(ACTIVE_HEARTBEAT_MINUTES, 60));

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSignature(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function getAllowedUserId() {
  return normalizeText(process.env.CLAWDIA_TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_CHRIS_CHAT_ID);
}

function toMillis(value) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minutesSince(timestamp, now = new Date()) {
  const millis = toMillis(timestamp);
  if (!millis) {
    return Number.POSITIVE_INFINITY;
  }
  return (new Date(now).getTime() - millis) / 60000;
}

function readWorkspaceTruth() {
  const workspacePath = process.env.NEXTEAM_STUDIO_PATH || "C:\\Users\\Peyto\\NexTeam-Studio";
  const pathname = join(workspacePath, "docs", "internal", "CLAWDIA_MEMORY.md");
  if (!existsSync(pathname)) {
    return "";
  }
  try {
    return readFileSync(pathname, "utf8");
  } catch {
    return "";
  }
}

function detectStaleTruthConflict(state, truthText) {
  const normalized = normalizeText(truthText).toLowerCase();
  if (!normalized) {
    return "";
  }
  const hasLiveQueueWork = state.tasks.some((task) =>
    ["queued", "active", "routed_to_atlas", "waiting_on_atlas", "proof_received", "proof_bad", "blocked"].includes(task.status)
  );
  if (hasLiveQueueWork && normalized.includes("nothing active is running")) {
    return "Workspace truth said nothing active is running while the persistent queue still has live work.";
  }
  return "";
}

function buildProofSignature(proofPayload) {
  if (!proofPayload || typeof proofPayload !== "object") {
    return "";
  }
  return normalizeSignature(
    JSON.stringify({
      codex_invoked: proofPayload.codex_invoked === true,
      files_changed: Array.isArray(proofPayload.files_changed) ? proofPayload.files_changed : [],
      tests_run: Array.isArray(proofPayload.tests_run) ? proofPayload.tests_run : [],
      tests_passed: proofPayload.tests_passed === true,
      summary: normalizeText(proofPayload.summary),
      blocker: normalizeText(proofPayload.blocker),
      error: normalizeText(proofPayload.error),
    })
  );
}

function hasUsableProof(task) {
  const proof = task?.proof_payload;
  if (!proof || !Array.isArray(proof.tests_run) || typeof proof.tests_passed !== "boolean") {
    return false;
  }
  if (task?.action_name) {
    return proof.shared_action === true && proof.action_ok === true && proof.tests_passed === true;
  }
  if (["status_audit", "test_only"].includes(task?.task_type)) {
    return proof.tests_passed === true;
  }
  return proof.codex_invoked === true && proof.tests_passed === true;
}

function buildHeartbeatMessage(task) {
  return [
    "CLAWDIA HEARTBEAT",
    `- job ${task.job_number}: ${task.title}`,
    `- status: ${task.status}`,
    `- assigned to: ${task.assigned_to}`,
    `- blocker: ${task.blocker || "none"}`,
    `- next action: ${task.next_action || "continue current work"}`,
  ].join("\n");
}

function buildIdleMessage() {
  return [
    "CLAWDIA WORKER STATUS",
    "- no work is currently running",
    "- next action: waiting for the next safe queued task",
  ].join("\n");
}

function buildBlockerSignature(task, blockerMessage, proofPayload) {
  return normalizeSignature(
    [
      normalizeText(task?.task_type),
      normalizeText(task?.assigned_to),
      normalizeText(blockerMessage),
      buildProofSignature(proofPayload),
    ]
      .filter(Boolean)
      .join(" | ")
  );
}

function normalizeWillyRecommendation(value) {
  const normalized = normalizeText(value).toUpperCase();
  return ["ACCEPT", "REJECT", "REROUTE", "PARK", "CONTINUE", "ASK CHRIS"].includes(normalized)
    ? normalized
    : "";
}

async function sendTelegramUpdate(bot, text) {
  const chatId = getAllowedUserId();
  if (!bot || !chatId || !text) {
    return false;
  }
  await bot.sendMessage(chatId, text);
  console.log("[clawdia-bot] worker telegram update sent", {
    chatId,
    summary: String(text || "").split(/\r?\n/)[0] || "update",
  });
  return true;
}

async function markTaskParked(state, task, blocker, nextAction, bot, now = new Date()) {
  const parked = updateTaskInState(
    state,
    task.task_id,
    {
      status: "parked",
      blocker: normalizeText(blocker),
      next_action: normalizeText(nextAction),
      repeat_blocker_count: Math.max(Number(task?.repeat_blocker_count || 0), 1),
    },
    now
  );
  appendQueueEvent(state, {
    type: "task_parked",
    task_id: task.task_id,
    blocker: parked?.blocker || "",
  });
  console.log("[clawdia-bot] worker task parked", {
    taskId: task.task_id,
    jobNumber: task.job_number,
    blocker: parked?.blocker || "",
  });
  await sendTelegramUpdate(
    bot,
    [
      "CLAWDIA TASK PARKED",
      `- job ${task.job_number}: ${task.title}`,
      `- blocker: ${parked?.blocker || "unknown blocker"}`,
      `- next action: ${parked?.next_action || "wait for review"}`,
    ].join("\n")
  );
  return parked;
}

function recordBlockedAttempt(state, task, blocker, proofPayload, now = new Date()) {
  const blockerSignature = buildBlockerSignature(task, blocker, proofPayload);
  const sameBlocker = blockerSignature && blockerSignature === normalizeSignature(task?.last_blocker_signature);
  const repeatCount = sameBlocker ? Number(task?.repeat_blocker_count || 0) + 1 : 1;
  return updateTaskInState(
    state,
    task.task_id,
    {
      status: "blocked",
      blocker: normalizeText(blocker),
      next_action: "Park or reroute the blocker before doing any more reporting.",
      proof_payload: proofPayload || null,
      proof_attempts: Number(task?.proof_attempts || 0) + 1,
      repeat_blocker_count: repeatCount,
      last_blocker_signature: blockerSignature,
      last_proof_signature: buildProofSignature(proofPayload),
    },
    now
  );
}

async function forceProgressPastBlocker(state, task, bot, now = new Date()) {
  const repeatCount = Number(task?.repeat_blocker_count || 0);
  const rerouteCount = Number(task?.reroute_count || 0);
  const willyReview = await sharedActionLayer.consultWilly({
    question: "Clawdia, ask Willy whether to park or reroute this.",
    taskId: task.task_id,
    proofPayload: task.proof_payload || null,
    situation:
      "A task repeated the same blocker or returned unusable proof. Decide whether Clawdia should reroute once more, park it, continue safe work, or ask Chris.",
    autoTrigger: "repeat_blocker",
  });
  const willyRecommendation = willyReview?.ok ? normalizeWillyRecommendation(willyReview.recommendation) : "";
  const willyNextAction = normalizeText(willyReview?.next_action);
  const willyReason = normalizeText(willyReview?.message || willyReview?.summary || task.blocker);

  if (willyRecommendation === "ASK CHRIS") {
    return markTaskParked(
      state,
      task,
      willyReason || "Willy advised asking Chris before continuing this blocker path.",
      willyNextAction || "Wait for Chris inspection before retrying or unparking this task.",
      bot,
      now
    );
  }

  if (willyRecommendation === "PARK" || repeatCount >= 2 || rerouteCount >= 1) {
    return markTaskParked(
      state,
      task,
      willyReason || task.blocker || "Atlas/Codex returned no usable proof twice.",
      willyNextAction || "Parked after repeated blocker without new proof. Worker will continue to the next safe task.",
      bot,
      now
    );
  }

  const rerouted = updateTaskInState(
    state,
    task.task_id,
    {
      status: "queued",
      blocker: task.blocker || "Usable proof was not returned. Rerouting once with stricter proof requirements.",
      next_action: "Retry once with stricter proof requirements, then park immediately if the same blocker repeats.",
      reroute_count: rerouteCount + 1,
    },
    now
  );
  appendQueueEvent(state, {
    type: "proof_bad_reroute",
    task_id: task.task_id,
    reroute_count: rerouted?.reroute_count || 1,
  });
  console.log("[clawdia-bot] worker proof bad reroute", {
    taskId: task.task_id,
    jobNumber: task.job_number,
    rerouteCount: rerouted?.reroute_count || 1,
  });
  await sendTelegramUpdate(
    bot,
    [
      "CLAWDIA PROOF BAD",
      `- job ${task.job_number}: ${task.title}`,
      "- status: rerouted once with stricter proof requirements",
      `- next action: ${rerouted?.next_action || "retry once"}`,
    ].join("\n")
  );
  return rerouted;
}

async function processStaleWorkingTask(state, bot, now = new Date()) {
  const staleTask = state.tasks
    .filter((task) => ["active", "routed_to_atlas", "waiting_on_atlas"].includes(task.status))
    .sort((left, right) => toMillis(left.last_update) - toMillis(right.last_update))
    .find((task) => minutesSince(task.last_update, now) >= STALE_WORKING_MINUTES);
  if (!staleTask) {
    return false;
  }

  const blockedTask = recordBlockedAttempt(
    state,
    staleTask,
    "No new proof or progress returned before the worker stale-task timeout.",
    staleTask.proof_payload || null,
    now
  );
  appendQueueEvent(state, {
    type: "stale_work_park_requested",
    task_id: staleTask.task_id,
    minutes_stale: Math.floor(minutesSince(staleTask.last_update, now)),
  });
  await forceProgressPastBlocker(state, blockedTask || staleTask, bot, now);
  return true;
}

async function processProofReview(state, bot, now = new Date()) {
  const proofTask = state.tasks
    .filter((task) => task.status === "proof_received")
    .sort((left, right) => left.job_number - right.job_number)[0];
  if (!proofTask) {
    return false;
  }

  const willyReview = await sharedActionLayer.reviewProofWithWilly({
    taskId: proofTask.task_id,
    proofPayload: proofTask.proof_payload || null,
    question: "Clawdia, ask Willy if this proof is good.",
    autoTrigger: "proof_review",
  });
  const willyRecommendation = willyReview?.ok ? normalizeWillyRecommendation(willyReview.recommendation) : "";
  const willyReason =
    normalizeText(willyReview?.message || willyReview?.summary || willyReview?.next_action) ||
    "Willy did not return a review message.";
  const willyNextAction = normalizeText(willyReview?.next_action);

  if (willyRecommendation === "ASK CHRIS") {
    await markTaskParked(
      state,
      proofTask,
      willyReason || "Willy advised Chris inspection before this proof is accepted.",
      willyNextAction || "Wait for Chris inspection of the proof before continuing.",
      bot,
      now
    );
    appendQueueEvent(state, {
      type: "proof_review_ask_chris",
      task_id: proofTask.task_id,
    });
    return true;
  }

  if (willyRecommendation === "PARK") {
    await markTaskParked(
      state,
      proofTask,
      willyReason || "Willy advised parking this task instead of forcing a bad completion.",
      willyNextAction || "Park this task and continue to the next safe queued work.",
      bot,
      now
    );
    appendQueueEvent(state, {
      type: "proof_review_parked",
      task_id: proofTask.task_id,
    });
    return true;
  }

  if (!hasUsableProof(proofTask) || ["REJECT", "REROUTE"].includes(willyRecommendation)) {
    const blockedTask = recordBlockedAttempt(
      state,
      proofTask,
      willyReason || "Atlas/Codex returned proof, but it did not include usable execution evidence.",
      proofTask.proof_payload || null,
      now
    );
    appendQueueEvent(state, {
      type: "proof_bad",
      task_id: proofTask.task_id,
    });
    await forceProgressPastBlocker(state, blockedTask || proofTask, bot, now);
    return true;
  }

  const completed = updateTaskInState(
    state,
    proofTask.task_id,
    {
      status: "complete",
      blocker: "",
      next_action: willyNextAction || "Move to the next safe queued task.",
      willy_review: willyReview?.ok
        ? {
            recommendation: willyRecommendation || "ACCEPT",
            confidence: normalizeText(willyReview?.confidence || ""),
            summary: willyReason,
          }
        : null,
    },
    now
  );
  appendQueueEvent(state, {
    type: "task_complete",
    task_id: proofTask.task_id,
    tests_passed: completed?.proof_payload?.tests_passed === true,
  });
  console.log("[clawdia-bot] worker task complete", {
    taskId: proofTask.task_id,
    jobNumber: proofTask.job_number,
    testsPassed: completed?.proof_payload?.tests_passed === true,
  });
  await sendTelegramUpdate(
    bot,
    [
      "CLAWDIA TASK COMPLETE",
      `- job ${proofTask.job_number}: ${proofTask.title}`,
      `- files changed: ${(completed?.proof_payload?.files_changed || []).join(" ; ") || "none reported"}`,
      `- tests run: ${(completed?.proof_payload?.tests_run || []).join(" | ") || "none reported"}`,
      `- next action: ${completed?.next_action || "move to next task"}`,
    ].join("\n")
  );
  return true;
}

function buildSharedActionProofPayload(task, result) {
  const summary =
    (typeof result?.summary === "string" ? normalizeText(result.summary) : "") ||
    normalizeText(result?.message) ||
    `Shared action completed: ${normalizeText(task?.action_name) || "unknown action"}.`;
  const blocker = normalizeText(result?.blocker || result?.error || result?.message);
  const testsPassed = Boolean(result?.ok && !result?.blocked);
  return {
    task_id: task?.task_id || "",
    task_type: normalizeText(task?.task_type),
    repo_path: normalizeText(task?.repo_path),
    codex_invoked: false,
    shared_action: true,
    action_name: normalizeText(task?.action_name),
    action_ok: Boolean(result?.ok),
    files_changed: Array.isArray(result?.files_changed) ? result.files_changed : [],
    tests_run:
      Array.isArray(result?.tests_run) && result.tests_run.length > 0
        ? result.tests_run
        : [`shared action: ${normalizeText(task?.action_name) || "unknown"}`],
    tests_passed: testsPassed,
    summary,
    blocker,
    error: normalizeText(result?.error),
    next_action: normalizeText(
      result?.next_action ||
        (testsPassed
          ? "Review shared action proof and continue."
          : "Park or reroute the blocker before doing any more reporting.")
    ),
    action_result: result,
  };
}

async function runWorkerTask(task) {
  if (normalizeText(task?.action_name)) {
    const actionResult = await sharedActionLayer.executeWorkerAction(task.action_name, task.action_payload || {});
    return {
      ok: actionResult?.ok === true,
      blocked: actionResult?.blocked === true || actionResult?.ok !== true,
      message: normalizeText(actionResult?.message || actionResult?.error),
      payload: buildSharedActionProofPayload(task, actionResult),
    };
  }

  if (!["atlas", "codex_bridge"].includes(task.assigned_to)) {
    return {
      ok: false,
      blocked: true,
      message: "Assigned worker path is not executable from the local Clawdia worker yet.",
    };
  }

  if (!["status_audit", "repo_readonly_audit", "safe_code_build", "test_only", "docs_update"].includes(task.task_type)) {
    return {
      ok: false,
      blocked: true,
      message: "Task type is not allowlisted for Codex bridge execution.",
    };
  }

  return invokeCodexBridgeTask({
    task_id: task.task_id,
    title: task.title,
    task_type: task.task_type,
    repo_path: task.repo_path,
    goal: task.goal || task.exact_work_requested,
  });
}

async function processNextTask(state, bot, now = new Date(), runTask = runWorkerTask) {
  const nextTask = getNextSafeTask(state);
  if (!nextTask) {
    return false;
  }

  if (nextTask.needs_chris_approval) {
    await markTaskParked(
      state,
      nextTask,
      "Chris approval is required before this task may run.",
      "Wait for Chris approval, then requeue or explicitly unpark this task.",
      bot,
      now
    );
    appendQueueEvent(state, {
      type: "approval_gate_parked",
      task_id: nextTask.task_id,
    });
    return true;
  }

  updateTaskInState(
    state,
    nextTask.task_id,
    {
      status: "active",
      blocker: "",
      next_action: "Worker picked up the task.",
    },
    now
  );
  appendQueueEvent(state, {
    type: "task_activated",
    task_id: nextTask.task_id,
  });
  console.log("[clawdia-bot] worker task activated", {
    taskId: nextTask.task_id,
    jobNumber: nextTask.job_number,
    assignedTo: nextTask.assigned_to,
  });

  await sendTelegramUpdate(
    bot,
    [
      "CLAWDIA WORKER UPDATE",
      `- working on job ${nextTask.job_number}: ${nextTask.title}`,
      `- assigned to: ${nextTask.assigned_to}`,
      `- next action: ${nextTask.next_action}`,
    ].join("\n")
  );

  const routed = updateTaskInState(
    state,
    nextTask.task_id,
    {
      status: "waiting_on_atlas",
      next_action: "Waiting for Atlas/Codex proof.",
    },
    now
  );
  appendQueueEvent(state, {
    type: "task_routed",
    task_id: nextTask.task_id,
    assigned_to: routed?.assigned_to || "",
  });
  console.log("[clawdia-bot] worker task routed", {
    taskId: nextTask.task_id,
    jobNumber: nextTask.job_number,
    assignedTo: routed?.assigned_to || "",
  });

  const result = await runTask(routed || nextTask);

  if (!result?.ok || !result?.payload) {
    const blockedMessage = normalizeText(result?.message || result?.payload?.error || "No usable proof returned.");
    const updated = recordBlockedAttempt(state, nextTask, blockedMessage, result?.payload || null, now);
    appendQueueEvent(state, {
      type: result?.blocked ? "task_blocked" : "proof_missing",
      task_id: nextTask.task_id,
      blocker: blockedMessage,
    });
    console.log("[clawdia-bot] worker task blocked", {
      taskId: nextTask.task_id,
      jobNumber: nextTask.job_number,
      blocker: blockedMessage,
    });
    await forceProgressPastBlocker(state, updated || nextTask, bot, now);
    return true;
  }

  updateTaskInState(
    state,
    nextTask.task_id,
    {
      status: "proof_received",
      blocker: "",
      next_action: "Review proof and decide complete, reroute, or park.",
      proof_payload: result.payload,
      proof_attempts: (nextTask.proof_attempts || 0) + 1,
    },
    now
  );
  appendQueueEvent(state, {
    type: "proof_received",
    task_id: nextTask.task_id,
  });
  console.log("[clawdia-bot] worker proof received", {
    taskId: nextTask.task_id,
    jobNumber: nextTask.job_number,
  });
  return true;
}

async function maybeSendHeartbeat(state, bot, now = new Date()) {
  const workingTask = getWorkingTask(state);
  if (!workingTask) {
    if (minutesSince(state.last_idle_notice_at, now) >= ACTIVE_HEARTBEAT_MINUTES) {
      const sent = await sendTelegramUpdate(bot, buildIdleMessage());
      if (sent) {
        state.last_idle_notice_at = taskQueueStoreInternals.nowIso(now);
      }
      return sent;
    }
    return false;
  }

  if (minutesSince(workingTask.last_progress_update_at, now) < ACTIVE_HEARTBEAT_MINUTES) {
    return false;
  }
  const sent = await sendTelegramUpdate(bot, buildHeartbeatMessage(workingTask));
  if (sent) {
    updateTaskInState(
      state,
      workingTask.task_id,
      {
        last_progress_update_at: taskQueueStoreInternals.nowIso(now),
      },
      now
    );
    console.log("[clawdia-bot] worker heartbeat sent", {
      taskId: workingTask.task_id,
      jobNumber: workingTask.job_number,
    });
  }
  return sent;
}

async function maybeSendEndOfDayReport(state, bot, now = new Date()) {
  const current = new Date(now);
  const reportDay = current.toISOString().slice(0, 10);
  if (current.getHours() < END_OF_DAY_HOUR) {
    return false;
  }
  if (normalizeText(state.last_end_of_day_report_at) === reportDay) {
    return false;
  }
  const sent = await sendTelegramUpdate(bot, buildEndOfDayReport(state));
  if (sent) {
    state.last_end_of_day_report_at = reportDay;
    console.log("[clawdia-bot] worker end-of-day report sent", {
      reportDay,
    });
  }
  return sent;
}

export async function processTaskQueueCycle({
  bot,
  now = new Date(),
  runTask = runWorkerTask,
  workspaceTruthReader = readWorkspaceTruth,
} = {}) {
  const state = loadQueueState();
  const persistState = () => {
    saveQueueState(state, now);
    syncWorkspaceMirrors(state, now);
  };
  const truthConflict = detectStaleTruthConflict(state, workspaceTruthReader());
  if (truthConflict) {
    appendQueueEvent(state, {
      type: "stale_truth_conflict",
      message: truthConflict,
    });
    console.log("[clawdia-bot] worker stale truth conflict", {
      message: truthConflict,
    });
  }

  let progress = true;
  let steps = 0;
  const maxSteps = Math.max(12, state.tasks.length * 4);
  while (progress && steps < maxSteps) {
    progress = false;
    steps += 1;

    if (await processStaleWorkingTask(state, bot, now)) {
      progress = true;
      persistState();
      continue;
    }

    if (await processProofReview(state, bot, now)) {
      progress = true;
      persistState();
      continue;
    }

    if (await processNextTask(state, bot, now, runTask)) {
      progress = true;
      persistState();
      continue;
    }
  }

  await maybeSendHeartbeat(state, bot, now);
  await maybeSendEndOfDayReport(state, bot, now);
  persistState();
  return state;
}

export function createSerializedTaskQueueRunner(defaults = {}) {
  let inFlight = null;
  return async function runSerializedTaskQueueCycle(overrides = {}) {
    if (inFlight) {
      return inFlight;
    }
    inFlight = (async () => {
      try {
        return await processTaskQueueCycle({
          ...defaults,
          ...overrides,
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

export function startWorkerLoop({ bot, runTask, workspaceTruthReader, runCycle } = {}) {
  const runSerializedCycle =
    typeof runCycle === "function"
      ? runCycle
      : createSerializedTaskQueueRunner({ bot, runTask, workspaceTruthReader });
  console.log("[clawdia-bot] worker loop started", {
    intervalMs: WORKER_LOOP_MS,
    heartbeatMinutes: ACTIVE_HEARTBEAT_MINUTES,
    endOfDayHour: END_OF_DAY_HOUR,
  });

  async function tick() {
    try {
      await runSerializedCycle();
    } catch (error) {
      console.error("[clawdia-bot] worker loop error:", {
        message: error?.message || "Unknown worker loop error",
      });
    }
  }

  tick();
  const intervalId = setInterval(tick, WORKER_LOOP_MS);
  if (typeof intervalId.unref === "function") {
    intervalId.unref();
  }
  return intervalId;
}

export const workerLoopInternals = {
  ACTIVE_HEARTBEAT_MINUTES,
  END_OF_DAY_HOUR,
  STALE_WORKING_MINUTES,
  WORKER_LOOP_MS,
  buildBlockerSignature,
  buildHeartbeatMessage,
  buildIdleMessage,
  buildProofSignature,
  detectStaleTruthConflict,
  forceProgressPastBlocker,
  hasUsableProof,
  createSerializedTaskQueueRunner,
  maybeSendEndOfDayReport,
  maybeSendHeartbeat,
  processStaleWorkingTask,
  processNextTask,
  processProofReview,
  recordBlockedAttempt,
  readWorkspaceTruth,
  runAtlasOrCodexTask: runWorkerTask,
  runWorkerTask,
  sendTelegramUpdate,
};

```

### C:/Users/Peyto/clawdia-bot/intentRouter.js

```js
import { existsSync, readFileSync } from "node:fs";
import {
  handleCompanyCamTelegramCommand,
  isAuthorizedCompanyCamUser,
  companyCamCommandInternals,
} from "./companycamCommands.js";
import {
  handleOperatorTelegramCommand,
  isAuthorizedOperatorUser,
  operatorCommandInternals,
} from "./operatorCommands.js";
import { contractorInternals } from "./contractorLayer.js";
import { enqueuePersistentTask } from "./taskQueueStore.js";
import { getCodexBridgeConfigStatus, invokeCodexBridgeTask } from "./codexBridgeClient.js";
import { sharedActionLayer } from "./sharedActionLayer.js";
import { processTaskQueueCycle } from "./workerLoop.js";
import {
  getClawdiaBrainConfigStatus,
  invokeBrainAction,
  queueTaskThroughBrain,
  waitForBrainTaskResolution,
} from "./brainClient.js";

const CLOUD_TRANSFER_CONFIRMATION = "CONFIRM COMPANYCAM CLOUD TRANSFER 2026";
const CLOUD_MANIFEST_FILENAME = "companycam_sync_manifest.json";
const CLOUD_TRANSFER_LOG_FILENAME = "companycam_2026_transfer_log.json";
const CLOUD_SYSTEM_SYNC_SEGMENTS = ["_System", "CompanyCam Sync"];
const GOONIE_IDS = ["chunk", "mikey", "mouth", "brand", "data", "andy", "willy"];
const GOONIE_ALIASES = {
  chunk: ["chunk"],
  mikey: ["mikey"],
  mouth: ["mouth"],
  brand: ["brand"],
  data: ["data"],
  andy: ["andy"],
  willy: ["willy", "one-eyed willy", "one eyed willy"],
};
const pendingCloudTransferConfirmations = new Map();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeIntentComparableText(value) {
  return normalizeText(value)
    .replace(/[‐‑‒–—―﹘﹣－]+/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

function toLowerText(value) {
  return normalizeIntentComparableText(value).toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeCloudPathSegment(value) {
  return normalizeText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeCloudScopedPath(value) {
  const normalized = normalizeText(value).replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    return normalized.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");
  }
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  return `/${segments.join("/")}`;
}

function buildCloudScopedPath(rootPath, ...segments) {
  const normalizedRoot = normalizeCloudScopedPath(rootPath);
  const normalizedSegments = segments.map(normalizeCloudPathSegment).filter(Boolean);
  return normalizeCloudScopedPath([normalizedRoot, ...normalizedSegments].filter(Boolean).join("/"));
}

function isApprovedDropboxRootPath(rootPath) {
  const normalizedRoot = normalizeCloudScopedPath(rootPath);
  if (!normalizedRoot || normalizedRoot.includes("..")) {
    return false;
  }
  return normalizedRoot.toLowerCase().endsWith("/aquatrace");
}

function extractEmails(text) {
  return Array.from(new Set((String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((value) => value.trim())));
}

function readTextFileIfPresent(pathname) {
  if (!pathname || !existsSync(pathname)) {
    return "";
  }
  try {
    return readFileSync(pathname, "utf8");
  } catch {
    return "";
  }
}

function getDropboxCloudEnvNames() {
  return [
    "DROPBOX_ACCESS_TOKEN",
    "DROPBOX_APP_KEY",
    "DROPBOX_APP_SECRET",
    "DROPBOX_REFRESH_TOKEN",
    "DROPBOX_ROOT_PATH",
    "COMPANYCAM_API_TOKEN",
  ];
}

function getDropboxCloudConfigStatus() {
  const hasAccessToken = Boolean(normalizeText(process.env.DROPBOX_ACCESS_TOKEN));
  const hasRefreshFlow =
    Boolean(normalizeText(process.env.DROPBOX_APP_KEY)) &&
    Boolean(normalizeText(process.env.DROPBOX_APP_SECRET)) &&
    Boolean(normalizeText(process.env.DROPBOX_REFRESH_TOKEN));
  const hasRootPath = Boolean(normalizeText(process.env.DROPBOX_ROOT_PATH));
  const hasCompanyCamToken = Boolean(normalizeText(process.env.COMPANYCAM_API_TOKEN));
  const rootPath = normalizeCloudScopedPath(process.env.DROPBOX_ROOT_PATH);
  const approvedRootPath = isApprovedDropboxRootPath(rootPath);
  const envConfigured = hasCompanyCamToken && hasRootPath && (hasAccessToken || hasRefreshFlow);
  const manifestPath = approvedRootPath
    ? buildCloudScopedPath(rootPath, ...CLOUD_SYSTEM_SYNC_SEGMENTS, CLOUD_MANIFEST_FILENAME)
    : "";
  const transferLogPath = approvedRootPath
    ? buildCloudScopedPath(rootPath, ...CLOUD_SYSTEM_SYNC_SEGMENTS, CLOUD_TRANSFER_LOG_FILENAME)
    : "";
  const blocker = !envConfigured
    ? "remote Dropbox API mode is not configured yet"
    : !approvedRootPath
      ? "DROPBOX_ROOT_PATH is outside the approved Aquatrace root"
      : "";

  return {
    configured: envConfigured && approvedRootPath,
    envConfigured,
    hasAccessToken,
    hasRefreshFlow,
    hasRootPath,
    hasCompanyCamToken,
    rootPath,
    approvedRootPath,
    manifestPath,
    transferLogPath,
    blocker,
    envVarNames: getDropboxCloudEnvNames(),
  };
}

function buildCloudModeBlockedMessage(cloudStatus = getDropboxCloudConfigStatus()) {
  if (cloudStatus.envConfigured && !cloudStatus.approvedRootPath) {
    return [
      "COMPANYCAM ROUTE STATUS",
      "",
      "- remote Dropbox API mode is configured but blocked by path safety",
      "- CompanyCam remains read-only",
      "- Dropbox writes must stay inside the approved Aquatrace root only",
      `- blocker: ${cloudStatus.blocker}`,
      `- exact confirmation for future cloud transfer: ${CLOUD_TRANSFER_CONFIRMATION}`,
    ].join("\n");
  }

  return [
    "COMPANYCAM ROUTE STATUS",
    "",
    "- remote Dropbox API mode is not configured yet",
    "- CompanyCam remains read-only",
    "- real cloud transfer is blocked until Dropbox API env vars are configured",
    "- current safe options: CompanyCam status, local runner planning, or wait until Dropbox API is connected",
    `- exact confirmation for future cloud transfer: ${CLOUD_TRANSFER_CONFIRMATION}`,
  ].join("\n");
}

function buildCloudDryRunPlanMessage(cloudStatus = getDropboxCloudConfigStatus()) {
  return [
    "COMPANYCAM CLOUD DRY RUN READY",
    "",
    "- route: Railway Clawdia -> CompanyCam API read-only -> Dropbox API write scope",
    "- dry run only, no files moved",
    "- duplicate-safe and resume-safe",
    `- Dropbox root path: ${cloudStatus.rootPath}`,
    `- manifest target: ${cloudStatus.manifestPath}`,
    `- transfer log target: ${cloudStatus.transferLogPath}`,
    "- system logs and manifests stay under Aquatrace/_System/CompanyCam Sync/",
    `- exact confirmation for future cloud transfer: ${CLOUD_TRANSFER_CONFIRMATION}`,
  ].join("\n");
}

function buildCloudTransferPreviewMessage(cloudStatus = getDropboxCloudConfigStatus()) {
  return [
    "COMPANYCAM CLOUD TRANSFER PREVIEW",
    "",
    "- route: Railway Clawdia -> CompanyCam API read-only -> Dropbox API write scope",
    "- real transfer is approval-gated",
    "- Dropbox writes must stay inside approved Aquatrace paths only",
    "- duplicate-safe and resume-safe rules apply",
    `- Dropbox root path: ${cloudStatus.rootPath}`,
    `- manifest target: ${cloudStatus.manifestPath}`,
    `- transfer log target: ${cloudStatus.transferLogPath}`,
    `- reply with exactly: ${CLOUD_TRANSFER_CONFIRMATION}`,
  ].join("\n");
}

function buildPendingCloudTransferRequest(cloudStatus) {
  return {
    requestedAt: new Date().toISOString(),
    year: "2026",
    rootPath: cloudStatus.rootPath,
    manifestPath: cloudStatus.manifestPath,
    transferLogPath: cloudStatus.transferLogPath,
  };
}

function isMatchingPendingCloudTransferPlan(pendingRequest, cloudStatus) {
  return (
    normalizeText(pendingRequest?.rootPath) === normalizeText(cloudStatus.rootPath) &&
    normalizeText(pendingRequest?.manifestPath) === normalizeText(cloudStatus.manifestPath) &&
    normalizeText(pendingRequest?.transferLogPath) === normalizeText(cloudStatus.transferLogPath)
  );
}

function buildCloudTransferRestageRequiredMessage(pendingRequest, cloudStatus) {
  return [
    "COMPANYCAM CLOUD TRANSFER NOT STARTED",
    "",
    "- exact confirmation received: yes",
    "- blocker: the staged Dropbox transfer plan changed after preview and must be staged again",
    `- staged Dropbox root path: ${pendingRequest?.rootPath || "unknown"}`,
    `- current Dropbox root path: ${cloudStatus.rootPath || "unknown"}`,
    `- staged manifest target: ${pendingRequest?.manifestPath || "unknown"}`,
    `- current manifest target: ${cloudStatus.manifestPath || "unknown"}`,
    `- staged transfer log target: ${pendingRequest?.transferLogPath || "unknown"}`,
    `- current transfer log target: ${cloudStatus.transferLogPath || "unknown"}`,
    "- next action: request a new CompanyCam cloud transfer preview, then confirm that exact plan",
  ].join("\n");
}

function buildLocalRunnerFallbackMessage() {
  return [
    "COMPANYCAM ROUTE STATUS",
    "",
    "- remote Dropbox API mode is not configured yet",
    "- I can prepare this, but remote Dropbox API mode is not configured yet.",
    "- I can either queue this for the local runner or wait until Dropbox API is connected.",
  ].join("\n");
}

async function runApprovedCloudTransfer({ cloudStatus, pendingRequest }) {
  return {
    ok: true,
    year: pendingRequest?.year || "2026",
    requestedAt: pendingRequest?.requestedAt || new Date().toISOString(),
    approvalGatePassed: true,
    liveTransferExecuted: false,
    rootPath: pendingRequest?.rootPath || cloudStatus.rootPath,
    manifestPath: pendingRequest?.manifestPath || cloudStatus.manifestPath,
    transferLogPath: pendingRequest?.transferLogPath || cloudStatus.transferLogPath,
    blocker: "Live Dropbox writes remain parked until the separately approved run is started.",
  };
}

function formatCloudTransferExecutionSummary(result) {
  if (!result?.ok) {
    return [
      "COMPANYCAM CLOUD TRANSFER NOT STARTED",
      "",
      "- exact confirmation received: yes",
      `- blocker: ${normalizeText(result?.blocker || result?.message) || "unknown cloud transfer failure"}`,
      "- live Dropbox write executed: no",
    ].join("\n");
  }

  return [
    "COMPANYCAM CLOUD TRANSFER NOT STARTED",
    "",
    `- year: ${result.year || "2026"}`,
    `- exact confirmation received: ${result.approvalGatePassed ? "yes" : "no"}`,
    `- live Dropbox write executed: ${result.liveTransferExecuted ? "yes" : "no"}`,
    "- CompanyCam mode: read-only",
    `- Dropbox root path: ${result.rootPath || "unknown"}`,
    `- manifest target: ${result.manifestPath || "unknown"}`,
    `- transfer log target: ${result.transferLogPath || "unknown"}`,
    `- blocker: ${normalizeText(result.blocker) || "none"}`,
  ].join("\n");
}

function buildUnknownOperatorQuestion() {
  return "Do you want CompanyCam, email, Bragi, VGB, Aquatrace, or NexTeam help?";
}

function buildContractorClarifyQuestion() {
  return "Do you want me to route this to Atlas, review proof, park it, or tell you what is blocked?";
}

function buildNamedGoonieRegex(agentId) {
  return new RegExp(`\\b${agentId}(?:'s|s)?\\b`, "i");
}

function identifyNamedGoonieId(text) {
  const lower = toLowerText(text);
  return (
    GOONIE_IDS.find(
      (agentId) =>
        (GOONIE_ALIASES[agentId] || [agentId]).some(
          (alias) =>
            buildNamedGoonieRegex(alias).test(lower) ||
            lower.includes(`ask ${alias}`) ||
            lower.includes(` ${alias} `) ||
            lower.endsWith(alias)
        )
    ) || ""
  );
}

function isGoonieRoleQuestionText(text) {
  const lower = toLowerText(text);
  const namedAgentId = identifyNamedGoonieId(lower);
  if (!namedAgentId) {
    return false;
  }
  return /\b(what is|what's|who is|who's|what does|job|role|responsibilit|best at|what do)\b/i.test(lower);
}

function isGoonieConsultIntentText(text) {
  const lower = toLowerText(text);
  return (
    isGoonieRoleQuestionText(lower) ||
    Boolean(identifyNamedGoonieId(lower)) ||
    includesAny(lower, ["which goonie should answer", "which goonie"]) ||
    includesAny(lower, [
      "i am stepping away",
      "i'm stepping away",
      "step away",
      "next clue",
      "what should you do next",
      "what should i do next",
      "proof is good",
      "is this proof good",
      "park or reroute",
      "reroute or park",
      "same blocker",
      "blocked again",
      "truth conflict",
      "stale status",
      "queue conflict",
    ]) ||
    (lower.startsWith("clawdia") && includesAny(lower, ["research", "strategy", "sales", "messaging", "workflow", "systems", "architecture", "seo", "local growth"]))
  );
}

function buildSharedBrainUnavailableMessage(actionLabel) {
  return [
    "SHARED BRAIN ROUTE BLOCKED",
    `- requested action: ${actionLabel}`,
    "- shared brain configured: no",
    "- next action: connect Telegram to the shared brain runtime and retry the same request",
  ].join("\n");
}

function buildSharedBrainActionFailureMessage(actionLabel, errorSummary) {
  return [
    "SHARED BRAIN ACTION NOT COMPLETE",
    `- requested action: ${actionLabel}`,
    `- error summary: ${normalizeText(errorSummary) || "unknown shared brain failure"}`,
    "- next action: inspect the shared brain runtime and retry after the blocker is fixed",
  ].join("\n");
}

function buildSharedBrainTestTaskPacket() {
  const taskId = `shared-brain-test-${Math.random().toString(16).slice(2, 10)}`;
  return {
    task_id: taskId,
    title: "Telegram shared-brain test task",
    lane: "status_checkpoint",
    front_door: "telegram",
    status: "queued",
    assigned_to: "clawdia",
    task_type: "status_audit",
    goal: "Create a shared-brain test task and return the result.",
    exact_work_requested: "Create a shared-brain test task and return the result.",
    proof_expected: "proof package",
    blocker: "",
    next_action: "Worker loop will run a safe shared-brain status action and return proof.",
    action_name: "reportStatus",
    action_payload: {},
    needs_chris_approval: false,
  };
}

function buildSharedBrainTestOnlyTaskPacket() {
  const taskId = `shared-brain-test-only-${Math.random().toString(16).slice(2, 10)}`;
  return {
    task_id: taskId,
    title: "Telegram shared-brain test_only task",
    lane: "nexteam_build",
    front_door: "telegram",
    status: "queued",
    assigned_to: "clawdia",
    task_type: "test_only",
    repo_path: "",
    goal: "Run the approved smoke tests only and return proof.",
    exact_work_requested: "Queue one safe test_only task through the shared brain and return the proof.",
    proof_expected: "proof package",
    blocker: "",
    next_action: "Worker loop will route this safe test_only task through the shared brain and return proof.",
    action_name: "runClawdiaFrontDoorSelfTest",
    action_payload: {
      question: "What can break in the Telegram to Codex bridge?",
    },
    needs_chris_approval: false,
  };
}

function buildResolvedSharedBrainTaskMessage(header, task) {
  const proof = task?.proof_payload || {};
  const workerProcessed = ["complete", "parked", "blocked"].includes(normalizeText(task?.status));
  return [
    header,
    `- task created: ${task ? "yes" : "no"}`,
    `- entered shared queue: ${task ? "yes" : "no"}`,
    `- worker processed: ${workerProcessed ? "yes" : "no"}`,
    `- result returned: ${task ? "yes" : "no"}`,
    `- task_id: ${normalizeText(task?.task_id) || "unknown"}`,
    `- final status: ${normalizeText(task?.status) || "unknown"}`,
    `- proof summary: ${normalizeText(proof.summary || task?.blocker) || "none"}`,
    `- tests run: ${Array.isArray(proof.tests_run) && proof.tests_run.length > 0 ? proof.tests_run.join(" | ") : "none"}`,
    `- tests passed: ${proof.tests_passed === true ? "yes" : proof.tests_passed === false ? "no" : "n/a"}`,
    `- next action: ${normalizeText(task?.next_action || proof.next_action) || "none"}`,
  ].join("\n");
}

async function queueSharedBrainTaskAndWait(taskPacket) {
  const queued = await queueTaskThroughBrain(taskPacket);
  if (!queued.ok) {
    return {
      ok: false,
      message: buildSharedBrainActionFailureMessage(
        taskPacket.title,
        queued?.payload?.error || queued?.payload?.message || queued?.message
      ),
    };
  }

  const resolved = await waitForBrainTaskResolution(taskPacket.task_id, {
    timeoutMs: 45000,
    pollMs: 500,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      message: buildSharedBrainActionFailureMessage(taskPacket.title, resolved.message),
    };
  }

  return {
    ok: true,
    task: resolved.payload?.task || null,
    summary: resolved.payload?.summary || null,
  };
}

async function queueLocalSharedBrainTaskAndWait(taskPacket) {
  const queued = sharedActionLayer.updateTaskQueue(taskPacket);
  const silentBot = {
    async sendMessage() {
      return true;
    },
  };
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45000) {
    await processTaskQueueCycle({ bot: silentBot });
    const resolved = sharedActionLayer.readTaskById(taskPacket.task_id);
    const task = resolved?.task || null;
    if (task && ["complete", "parked", "blocked"].includes(normalizeText(task.status))) {
      return {
        ok: true,
        task,
        summary: resolved.summary || null,
        queued,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    ok: false,
    message: buildSharedBrainActionFailureMessage(
      taskPacket.title,
      "Timed out waiting for the embedded shared brain task to finish."
    ),
  };
}

async function invokeSharedBrainConsultOrAction(actionName, actionPayload, actionLabel) {
  const result = await invokeBrainAction(actionName, actionPayload);
  if (!result.ok || !normalizeText(result?.payload?.response)) {
    return {
      ok: false,
      message: buildSharedBrainActionFailureMessage(
        actionLabel,
        result?.payload?.error || result?.payload?.message || result?.message
      ),
    };
  }
  return {
    ok: true,
    payload: result.payload,
  };
}

async function invokeLocalSharedAction(actionName, actionPayload, actionLabel) {
  const result = await sharedActionLayer.executeWorkerAction(actionName, actionPayload);
  if (!result?.ok) {
    return {
      ok: false,
      message: buildSharedBrainActionFailureMessage(
        actionLabel,
        result?.message || result?.error
      ),
    };
  }
  return {
    ok: true,
    payload: result,
  };
}

async function sendOperationalReply(bot, chatId, replyText, details = {}) {
  await bot.sendMessage(chatId, replyText);
  console.log("[clawdia-bot] operational reply", {
    chatId,
    ...details,
    reply: replyText,
  });
  return true;
}

function buildCodexBridgeTaskPacket(requestText) {
  const lower = toLowerText(requestText);
  const taskType = includesAny(lower, ["test only", "tests only", "run tests only"])
    ? "test_only"
    : includesAny(lower, ["docs only", "update docs", "documentation only", "runbook"])
      ? "docs_update"
      : includesAny(lower, ["read only audit", "readonly audit", "repo audit"])
        ? "repo_readonly_audit"
        : "safe_code_build";
  return {
    task_id: `codex-build-${Math.random().toString(16).slice(2, 10)}`,
    title: "Clawdia bot safe code build",
    task_type: taskType,
    repo_path: "C:\\Users\\Peyto\\clawdia-bot",
    goal: requestText,
  };
}

function buildBragiNotWiredMessage() {
  return [
    "BRAGI REQUEST RECEIVED",
    "",
    "- Bragi remains draft-only",
    "- automatic Bragi draft delivery to Telegram or email-on-ready is not wired yet",
    "- current safe options: ask for Bragi status or request an email preview once the draft exists",
  ].join("\n");
}

function buildVgbPreviewOnlyMessage() {
  return [
    "VGB REQUEST RECEIVED",
    "",
    "- VGB is parked until CompanyCam and Bragi are stable",
    "- preview and status work is allowed",
    "- use /vgb draft to=<email> subject=<text> body=<text> to stage a VGB outreach preview",
    "- no live VGB sends will run from Telegram",
  ].join("\n");
}

function hasPendingVgbEmail(message) {
  return normalizeText(operatorCommandInternals.getPendingEmail(message)?.workflow).toLowerCase() === "vgb";
}

function isVgbEmailWorkflowText(text) {
  const lower = toLowerText(text);
  return includesAny(lower, ["email", "draft", "preview", "review", "show", "outreach", "campaign", "send"]);
}

function buildVgbRecipientNeededMessage() {
  return "I can create the VGB outreach preview, but I still need the recipient. Say /vgb draft to=<email> subject=<text> body=<text> or say email me.";
}

function parseNaturalEmailRequest(rawText) {
  const text = normalizeText(rawText);
  const lower = text.toLowerCase();
  const emails = extractEmails(text);
  const attachmentRequested = includesAny(lower, ["attach", "attachment", "photo", "image", "images", "pdf", "screenshot", "file"]);
  const sendRequested = includesAny(lower, ["send it", "send the pending email", "attach that photo and send it", "yes send", "confirm send", "approved"]);

  if (includesAny(lower, ["test email", "send a test email", "email test"])) {
    return { action: "test", attachmentRequested };
  }

  let to = emails[0] || "";
  if (!to && includesAny(lower, ["email me", "send me an email", "send me email", "send a test email to me", "send me a test email"])) {
    to = operatorCommandInternals.getApprovedOperatorTestRecipient();
  }

  const sayingIndex = lower.indexOf("saying ");
  const thatSaysIndex = lower.indexOf("that says ");
  let body = "";
  if (sayingIndex !== -1) {
    body = text.slice(sayingIndex + 7).trim();
  } else if (thatSaysIndex !== -1) {
    body = text.slice(thatSaysIndex + 10).trim();
  } else {
    body = text
      .replace(/^[Ss]end( me)? an email( to [^\s]+)?/i, "")
      .replace(/^[Ee]mail( me)?( to [^\s]+)?/i, "")
      .replace(/^[Dd]raft an email( to [^\s]+)?/i, "")
      .trim();
  }

  if (!body) {
    body = "Chris, this is your requested Clawdia Telegram email preview.";
  }

  let subject = operatorCommandInternals.DEFAULT_EMAIL_SUBJECT;
  if (includesAny(lower, ["bragi draft", "bragi article"])) {
    subject = "Bragi Draft Update";
  } else if (includesAny(lower, ["nice day"])) {
    subject = "A Note from Clawdia";
  } else if (includesAny(lower, ["companycam"])) {
    subject = "CompanyCam Update";
  }

  return {
    action: "preview",
    to,
    subject,
    body,
    attachmentRequested,
    sendRequested,
  };
}

export function detectNaturalIntent(text) {
  const normalized = normalizeIntentComparableText(text);
  const lower = normalized.toLowerCase();
  if (!normalized || normalized.startsWith("/")) {
    return { category: "none" };
  }

  if (lower === operatorCommandInternals.EMAIL_CONFIRMATION_PREFIX.toLowerCase() || lower.startsWith(`${operatorCommandInternals.EMAIL_CONFIRMATION_PREFIX.toLowerCase()} `)) {
    return { category: "none" };
  }

  if (normalized === CLOUD_TRANSFER_CONFIRMATION) {
    return { category: "companycam", action: "confirm_transfer", requiresOwner: true };
  }

  const contractorIntent = contractorInternals.detectContractorIntent(normalized);
  if (contractorIntent.action !== "none") {
    return { category: "contractor", action: contractorIntent.action, requiresOwner: true };
  }

  if (isGoonieConsultIntentText(normalized)) {
    const namedAgentId = identifyNamedGoonieId(normalized);
    return {
      category: "goonie_consult",
      action: namedAgentId ? "named" : "auto_select",
      agentId: namedAgentId,
      requiresOwner: true,
    };
  }

  const sharedBrainMentioned = includesAny(lower, ["shared-brain", "shared brain"]);
  if (
    (sharedBrainMentioned && includesAny(lower, ["test task", "shared-brain test", "shared brain test"]) && includesAny(lower, ["create", "queue", "return the result"])) ||
    (lower.startsWith("clawdia") && sharedBrainMentioned && includesAny(lower, ["create", "queue"]) && includesAny(lower, ["return the result"]))
  ) {
    return { category: "shared_brain", action: "test_task", requiresOwner: true };
  }

  if (
    includesAny(lower, ["queue one safe test_only task", "queue one safe test only task", "queue one safe test-only task"]) ||
    (lower.startsWith("clawdia") &&
      includesAny(lower, ["test_only", "test only", "test-only"]) &&
      sharedBrainMentioned &&
      includesAny(lower, ["queue", "return the proof"]))
  ) {
    return { category: "shared_brain", action: "test_only_task", requiresOwner: true };
  }

  if (includesAny(lower, ["companycam", "company cam", "dropbox"]) || (includesAny(lower, ["sync", "transfer", "move", "latest", "new"]) && includesAny(lower, ["photo", "photos", "job", "jobs"]))) {
    if (includesAny(lower, ["status", "blocked"])) {
      return { category: "companycam", action: "status", requiresOwner: true };
    }
    if (includesAny(lower, ["dry run", "dryrun"])) {
      return { category: "companycam", action: "dryrun", requiresOwner: true };
    }
    if (includesAny(lower, ["move", "sync", "transfer", "latest", "new"])) {
      return { category: "companycam", action: "transfer", requiresOwner: true };
    }
    return { category: "companycam", action: "clarify", requiresOwner: true };
  }

  if (includesAny(lower, ["bragi"])) {
    if (includesAny(lower, ["status", "working on", "what is"])) {
      return { category: "bragi", action: "status", requiresOwner: true };
    }
    return { category: "bragi", action: "plan", requiresOwner: true };
  }

  if (includesAny(lower, ["vgb"])) {
    if (includesAny(lower, ["status", "what is"])) {
      return { category: "vgb", action: "status", requiresOwner: true };
    }
    return { category: "vgb", action: "plan", requiresOwner: true };
  }

  if (includesAny(lower, ["email", "gmail", "send me an email", "draft an email", "send a test email"])) {
    return { category: "email", action: "natural", requiresOwner: true };
  }

  if (includesAny(lower, ["send the pending email", "attach that photo and send it", "add the file to the email", "attach your avatar photo"])) {
    return { category: "email", action: "natural", requiresOwner: true };
  }

  if (includesAny(lower, ["what is blocked", "what's blocked", "blocked right now"])) {
    return { category: "status", action: "blocked", requiresOwner: true };
  }

  if (includesAny(lower, ["what needs my approval", "needs my approval", "what do you need my approval for"])) {
    return { category: "status", action: "approval", requiresOwner: true };
  }

  if (includesAny(lower, ["companycam status", "aquatrace status", "nexteam status", "bragi status", "current status", "what is the status", "what is companycam status", "what is bragi doing"])) {
    if (includesAny(lower, ["companycam"])) return { category: "status", action: "companycam", requiresOwner: true };
    if (includesAny(lower, ["aquatrace"])) return { category: "status", action: "aquatrace", requiresOwner: true };
    if (includesAny(lower, ["nexteam"])) return { category: "status", action: "nexteam", requiresOwner: true };
    if (includesAny(lower, ["bragi"])) return { category: "status", action: "bragi", requiresOwner: true };
    return { category: "status", action: "clawdia", requiresOwner: true };
  }

  if (lower === "status" || lower === "what is blocked right now?" || lower === "what is blocked right now") {
    return { category: "status", action: "clawdia", requiresOwner: true };
  }

  if (includesAny(lower, ["approval", "blocked", "status", "companycam", "dropbox", "bragi", "vgb", "aquatrace", "nexteam", "email"])) {
    return { category: "unknown", action: "clarify", requiresOwner: true };
  }

  if (
    lower.startsWith("clawdia") &&
    includesAny(lower, [
      "shared brain",
      "shared-brain",
      "test_only",
      "test only",
      "test-only",
      "goonie",
      "ask chunk",
      "ask mikey",
      "ask mouth",
      "ask brand",
      "ask data",
      "ask andy",
      "queue",
      "consult",
    ])
  ) {
    return { category: "unknown", action: "clarify", requiresOwner: true };
  }

  return { category: "none" };
}

function createSyntheticMessage(message, text) {
  return {
    ...message,
    text,
  };
}

async function sendAuthorizedOnlyMessage(bot, message) {
  await bot.sendMessage(message.chat.id, "Operator actions are restricted to the approved operator.");
  return true;
}

async function handleNaturalStatusIntent({ bot, message, intent }) {
  const commandMap = {
    clawdia: "/clawdia status",
    companycam: "/companycam status",
    bragi: "/bragi status",
    aquatrace: "/aquatrace status",
    nexteam: "/nexteam status",
  };

  if (intent.action === "approval") {
    await bot.sendMessage(message.chat.id, operatorCommandInternals.buildApprovalStatus());
    return true;
  }

  if (intent.action === "blocked") {
    await bot.sendMessage(message.chat.id, operatorCommandInternals.buildBlockedStatus());
    return true;
  }

  const mappedCommand = commandMap[intent.action] || "/clawdia status";
  if (mappedCommand.startsWith("/companycam")) {
    await handleCompanyCamTelegramCommand({
      bot,
      message: createSyntheticMessage(message, mappedCommand),
    });
    return true;
  }

  await handleOperatorTelegramCommand({
    bot,
    message: createSyntheticMessage(message, mappedCommand),
  });
  return true;
}

async function handleNaturalCompanyCamIntent({ bot, message, intent, runCloudTransfer = runApprovedCloudTransfer }) {
  const cloudStatus = getDropboxCloudConfigStatus();
  const fromUserId = String(message?.from?.id || "").trim();

  if (intent.action === "status") {
    await handleCompanyCamTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/companycam status"),
    });
    return true;
  }

  if (intent.action === "dryrun") {
    if (!cloudStatus.configured) {
      await bot.sendMessage(
        message.chat.id,
        cloudStatus.envConfigured
          ? buildCloudModeBlockedMessage(cloudStatus)
          : [
              buildCloudModeBlockedMessage(cloudStatus),
              "",
              buildLocalRunnerFallbackMessage(),
            ].join("\n")
      );
      return true;
    }

    await bot.sendMessage(message.chat.id, buildCloudDryRunPlanMessage(cloudStatus));
    return true;
  }

  if (intent.action === "transfer") {
    if (!cloudStatus.configured) {
      await bot.sendMessage(
        message.chat.id,
        cloudStatus.envConfigured
          ? buildCloudModeBlockedMessage(cloudStatus)
          : buildLocalRunnerFallbackMessage()
      );
      return true;
    }

    if (!fromUserId) {
      await bot.sendMessage(message.chat.id, "I need the approved operator identity before I can stage a CompanyCam cloud transfer.");
      return true;
    }

    pendingCloudTransferConfirmations.set(fromUserId, buildPendingCloudTransferRequest(cloudStatus));
    await bot.sendMessage(message.chat.id, buildCloudTransferPreviewMessage(cloudStatus));
    return true;
  }

  if (intent.action === "confirm_transfer") {
    if (!fromUserId || !pendingCloudTransferConfirmations.has(fromUserId)) {
      await bot.sendMessage(message.chat.id, "No pending CompanyCam cloud transfer request is waiting for confirmation.");
      return true;
    }

    const pendingRequest = pendingCloudTransferConfirmations.get(fromUserId);
    pendingCloudTransferConfirmations.delete(fromUserId);

    if (!cloudStatus.configured) {
      await bot.sendMessage(message.chat.id, buildCloudModeBlockedMessage(cloudStatus));
      return true;
    }

    if (!isMatchingPendingCloudTransferPlan(pendingRequest, cloudStatus)) {
      await bot.sendMessage(message.chat.id, buildCloudTransferRestageRequiredMessage(pendingRequest, cloudStatus));
      return true;
    }

    const result = await runCloudTransfer({
      cloudStatus,
      pendingRequest,
    });
    await bot.sendMessage(message.chat.id, formatCloudTransferExecutionSummary(result));
    return true;
  }

  await bot.sendMessage(message.chat.id, "Do you want CompanyCam status, a dry run, or a transfer plan?");
  return true;
}

async function handleNaturalEmailIntent({ bot, message }) {
  const parsed = parseNaturalEmailRequest(message.text);

  if (parsed.action === "test") {
    await handleOperatorTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/email test"),
    });
    return true;
  }

  if (!parsed.to) {
    const existingPending = operatorCommandInternals.getPendingEmail(message);
    if (!existingPending) {
      await bot.sendMessage(
        message.chat.id,
        "I can create the email preview, but I still need the recipient. Tell me who it should go to or say email me."
      );
      return true;
    }

    if (parsed.attachmentRequested) {
      const attachResult = operatorCommandInternals.attachApprovedFilesToPendingEmail({
        message,
        queryText: message.text,
      });
      await bot.sendMessage(message.chat.id, attachResult.message);
      if (attachResult.ok && parsed.sendRequested) {
        await handleOperatorTelegramCommand({
          bot,
          message: createSyntheticMessage(message, "send"),
        });
      }
      return true;
    }

    if (parsed.sendRequested) {
      await handleOperatorTelegramCommand({
        bot,
        message: createSyntheticMessage(message, "send"),
      });
      return true;
    }

    await bot.sendMessage(message.chat.id, "I found your pending email. Tell me what file to attach, or say send.");
    return true;
  }

  const attachmentNote = parsed.attachmentRequested
    ? "I created the preview. If I can find the requested file in an approved source, I'll attach it. Otherwise upload the jpg, jpeg, png, or pdf here and I'll attach it before sending."
    : "";

  const preview = operatorCommandInternals.createPendingEmailDraftFromFields({
    message,
    to: parsed.to,
    subject: parsed.subject,
    body: parsed.body,
    attachmentRequestNote: attachmentNote,
  });

  if (!preview.ok) {
    await bot.sendMessage(message.chat.id, preview.message);
    return true;
  }

  let replyMessage = preview.message;
  if (parsed.attachmentRequested) {
    const attachResult = operatorCommandInternals.attachApprovedFilesToPendingEmail({
      message,
      queryText: message.text,
    });
    replyMessage = `${replyMessage}\n- attachment lookup: ${attachResult.ok ? attachResult.attachment.filename : attachResult.message}`;
    if (attachResult.ok && parsed.sendRequested) {
      await bot.sendMessage(message.chat.id, replyMessage);
      await handleOperatorTelegramCommand({
        bot,
        message: createSyntheticMessage(message, "send"),
      });
      return true;
    }
  }

  await bot.sendMessage(message.chat.id, replyMessage);
  return true;
}

async function handleNaturalBragiIntent({ bot, message, intent }) {
  if (intent.action === "status") {
    await handleOperatorTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/bragi status"),
    });
    return true;
  }

  await bot.sendMessage(message.chat.id, buildBragiNotWiredMessage());
  return true;
}

async function handleNaturalVgbIntent({ bot, message, intent }) {
  if (intent.action === "status") {
    await handleOperatorTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/vgb status"),
    });
    return true;
  }

  const lower = toLowerText(message.text);
  if (hasPendingVgbEmail(message) && includesAny(lower, ["preview", "review", "show"])) {
    await handleOperatorTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/vgb preview"),
    });
    return true;
  }

  if (hasPendingVgbEmail(message) && includesAny(lower, ["send", "approved", "confirm"])) {
    await handleOperatorTelegramCommand({
      bot,
      message: createSyntheticMessage(message, "/vgb send"),
    });
    return true;
  }

  if (!isVgbEmailWorkflowText(message.text)) {
    await bot.sendMessage(message.chat.id, buildVgbPreviewOnlyMessage());
    return true;
  }

  const parsed = parseNaturalEmailRequest(message.text);
  if (!parsed.to) {
    await bot.sendMessage(message.chat.id, buildVgbRecipientNeededMessage());
    return true;
  }

  const preview = operatorCommandInternals.createPendingVgbEmailDraftFromPackage({
    message,
    to: parsed.to,
  });
  if (!preview.ok) {
    await bot.sendMessage(message.chat.id, preview.message);
    return true;
  }

  await bot.sendMessage(message.chat.id, preview.message);
  return true;
}

async function handleNaturalContractorIntent({ bot, message, intent }) {
  if (intent.action === "atlas_status") {
    await bot.sendMessage(message.chat.id, contractorInternals.buildAtlasWorkSummary());
    return true;
  }

  if (intent.action === "needs_chris") {
    await bot.sendMessage(message.chat.id, contractorInternals.buildNeedsChrisApprovalSummary());
    return true;
  }

  if (intent.action === "safe_autonomy") {
    await bot.sendMessage(message.chat.id, contractorInternals.buildWhatClawdiaCanDoWithoutChris());
    return true;
  }

  if (intent.action === "blocked") {
    await bot.sendMessage(message.chat.id, operatorCommandInternals.buildBlockedStatus());
    return true;
  }

  if (
    intent.action === "route_to_atlas" ||
    intent.action === "build_or_scope" ||
    intent.action === "next_build_task" ||
    intent.action === "next_companycam_dryrun_task"
  ) {
      const packet =
        intent.action === "next_build_task"
          ? contractorInternals.buildNextBacklogTask()
          : intent.action === "next_companycam_dryrun_task"
            ? contractorInternals.buildNextCompanyCamDryRunTask()
            : contractorInternals.buildContractorTaskPacket(message.text);
      const lowerText = toLowerText(message.text);
      const isCodexBuildRequest =
        intent.action !== "next_build_task" &&
        intent.action !== "next_companycam_dryrun_task" &&
        (includesAny(lowerText, ["build this", "route this to atlas", "route this to codex"]) ||
          includesAny(lowerText, ["/clawdia ping", "health check", "health-check", "ping response"]));

      const brainStatus = getClawdiaBrainConfigStatus();
      const queuedResult = brainStatus.configured
        ? await queueTaskThroughBrain({
            task_id: packet.task_id,
            title: packet.title,
            lane: packet.lane,
            front_door: "telegram",
            status: "queued",
            assigned_to: isCodexBuildRequest ? "codex_bridge" : "atlas",
            proof_expected: "proof package",
            blocker: "",
            next_action: isCodexBuildRequest
              ? "Worker loop will route this safe task through the Codex bridge."
              : "Worker loop will park or continue this task based on available execution paths.",
            goal: packet.goal,
            exact_work_requested: packet.exact_work_requested,
            repo_path: isCodexBuildRequest ? "C:\\Users\\Peyto\\clawdia-bot" : "",
            task_type: isCodexBuildRequest ? buildCodexBridgeTaskPacket(message.text).task_type : "status_audit",
            needs_chris_approval: packet.needs_chris_approval,
          })
        : null;
      const queuedTask =
        queuedResult?.ok && queuedResult.payload?.task
          ? null
          : enqueuePersistentTask({
              task_id: packet.task_id,
              title: packet.title,
              lane: packet.lane,
              front_door: "telegram",
              status: "queued",
              assigned_to: isCodexBuildRequest ? "codex_bridge" : "atlas",
              proof_expected: "proof package",
              blocker: "",
              next_action: isCodexBuildRequest
                ? "Worker loop will route this safe task through the Codex bridge."
                : "Worker loop will park or continue this task based on available execution paths.",
              goal: packet.goal,
              exact_work_requested: packet.exact_work_requested,
              repo_path: isCodexBuildRequest ? "C:\\Users\\Peyto\\clawdia-bot" : "",
              task_type: isCodexBuildRequest ? buildCodexBridgeTaskPacket(message.text).task_type : "status_audit",
              needs_chris_approval: packet.needs_chris_approval,
            });
      const effectiveTask =
        queuedResult?.ok && queuedResult.payload?.task
          ? queuedResult.payload.task
          : queuedTask;

      if (isCodexBuildRequest) {
        const bridgeTask = buildCodexBridgeTaskPacket(message.text);
        const bridgeStatus = getCodexBridgeConfigStatus();
        await bot.sendMessage(
          message.chat.id,
          [
            "CODEX BUILD QUEUED",
            `- task_id: ${effectiveTask.task_id}`,
            `- task_type: ${effectiveTask.task_type}`,
            `- repo: ${bridgeTask.repo_path}`,
            `- codex bridge configured: ${bridgeStatus.configured ? "yes" : "no"}`,
            `- unified brain configured: ${brainStatus.configured ? "yes" : "no"}`,
            "- next action: the background worker will pick this up, request proof, and report progress back to Telegram.",
          ].join("\n")
        );
        return true;
      }

      const queuePath = contractorInternals.appendTaskPacketToQueue(packet);
      await bot.sendMessage(
        message.chat.id,
      [
        "ATLAS TASK PACKET READY",
        `- job number: ${effectiveTask.job_number}`,
        `- task_id: ${packet.task_id}`,
        `- lane: ${packet.lane}`,
        `- title: ${packet.title}`,
        `- needs Chris approval: ${packet.needs_chris_approval ? "yes" : "no"}`,
        `- direct Atlas/Codex access available: ${packet.direct_atlas_access_available}`,
        `- queue path: ${queuePath || "local workspace required"}`,
        `- next action: ${packet.needs_chris_approval ? "ask Chris one approval question if needed, then route to Atlas" : effectiveTask.next_action}`,
      ].join("\n")
    );
    return true;
  }

  if (intent.action === "review_proof") {
    const brainStatus = getClawdiaBrainConfigStatus();
    const reviewResult = brainStatus.configured
      ? await invokeSharedBrainConsultOrAction(
          "reviewProofWithWilly",
          {
            question: message.text,
            autoTrigger: "proof_review",
          },
          "Willy proof review"
        )
      : await invokeLocalSharedAction(
          "reviewProofWithWilly",
          {
            question: message.text,
            autoTrigger: "proof_review",
          },
          "Embedded Willy proof review"
        );
    await sendOperationalReply(
      bot,
      message.chat.id,
      reviewResult.ok ? reviewResult.payload.response : reviewResult.message,
      {
        category: "goonie_consult",
        action: "review_proof",
        mode: brainStatus.configured ? "shared_brain" : "embedded_runtime",
      }
    );
    return true;
  }

  if (intent.action === "memory_update") {
    await bot.sendMessage(
      message.chat.id,
      [
        "MEMORY UPDATE ROUTE",
        "- Clawdia memory updates should record verified truth only.",
        `- source of truth: ${contractorInternals.getToolRegistryPath()}`,
        "- next action: give me the verified milestone or proof package to record.",
      ].join("\n")
    );
    return true;
  }

  if (intent.action === "park") {
    await bot.sendMessage(
      message.chat.id,
      [
        "PARK REQUEST RECEIVED",
        "- status: parked",
        "- next action: add the task to the queue as parked and move to the next active lane.",
      ].join("\n")
    );
    return true;
  }

  await bot.sendMessage(message.chat.id, buildContractorClarifyQuestion());
  return true;
}

async function handleNaturalGoonieConsultIntent({ bot, message, intent }) {
  const brainStatus = getClawdiaBrainConfigStatus();
  const actionName = intent.action === "named" ? "consultGoonie" : "autoSelectGoonieConsult";
  const actionPayload =
    intent.action === "named"
      ? {
          question: message.text,
          agentId: intent.agentId,
        }
      : {
          question: message.text,
        };
  const consultResult = brainStatus.configured
    ? await invokeSharedBrainConsultOrAction(
        actionName,
        actionPayload,
        intent.action === "named" ? `Goonie consult: ${intent.agentId || "named advisor"}` : "Goonie auto-select consult"
      )
    : await invokeLocalSharedAction(
        actionName,
        actionPayload,
        intent.action === "named" ? `Embedded Goonie consult: ${intent.agentId || "named advisor"}` : "Embedded Goonie auto-select consult"
      );

  await sendOperationalReply(
    bot,
    message.chat.id,
    consultResult.ok ? consultResult.payload.response : consultResult.message,
    {
      category: "goonie_consult",
      action: intent.action,
      mode: brainStatus.configured ? "shared_brain" : "embedded_runtime",
    }
  );
  return true;
}

async function handleNaturalSharedBrainIntent({ bot, message, intent }) {
  const brainStatus = getClawdiaBrainConfigStatus();
  if (intent.action === "test_task") {
    const result = brainStatus.configured
      ? await queueSharedBrainTaskAndWait(buildSharedBrainTestTaskPacket())
      : await queueLocalSharedBrainTaskAndWait(buildSharedBrainTestTaskPacket());
    await sendOperationalReply(
      bot,
      message.chat.id,
      result.ok
        ? buildResolvedSharedBrainTaskMessage("SHARED BRAIN TEST COMPLETE", result.task)
        : result.message,
      {
        category: "shared_brain",
        action: "test_task",
        mode: brainStatus.configured ? "shared_brain" : "embedded_runtime",
      }
    );
    return true;
  }

  if (intent.action === "test_only_task") {
    const result = brainStatus.configured
      ? await queueSharedBrainTaskAndWait(buildSharedBrainTestOnlyTaskPacket())
      : await queueLocalSharedBrainTaskAndWait(buildSharedBrainTestOnlyTaskPacket());
    await sendOperationalReply(
      bot,
      message.chat.id,
      result.ok
        ? buildResolvedSharedBrainTaskMessage("SHARED BRAIN TEST_ONLY COMPLETE", result.task)
        : result.message,
      {
        category: "shared_brain",
        action: "test_only_task",
        mode: brainStatus.configured ? "shared_brain" : "embedded_runtime",
      }
    );
    return true;
  }

  await bot.sendMessage(message.chat.id, buildContractorClarifyQuestion());
  return true;
}

export async function handleNaturalIntent({ bot, message, runCloudTransfer = runApprovedCloudTransfer }) {
  const text = normalizeText(message?.text);
  const intent = detectNaturalIntent(text);
  if (intent.category === "none") {
    return false;
  }

  console.log("[clawdia-bot] natural intent detected", {
    category: intent.category,
    action: intent.action || null,
    fromUserId: String(message?.from?.id || ""),
    chatId: message?.chat?.id || null,
  });

  if (intent.requiresOwner && !isAuthorizedOperatorUser(message) && !isAuthorizedCompanyCamUser(message)) {
    await sendAuthorizedOnlyMessage(bot, message);
    return true;
  }

  if (intent.category === "status") {
    return handleNaturalStatusIntent({ bot, message, intent });
  }

  if (intent.category === "companycam") {
    return handleNaturalCompanyCamIntent({ bot, message, intent, runCloudTransfer });
  }

  if (intent.category === "email") {
    return handleNaturalEmailIntent({ bot, message, intent });
  }

  if (intent.category === "bragi") {
    return handleNaturalBragiIntent({ bot, message, intent });
  }

  if (intent.category === "vgb") {
    return handleNaturalVgbIntent({ bot, message, intent });
  }

  if (intent.category === "contractor") {
    return handleNaturalContractorIntent({ bot, message, intent });
  }

  if (intent.category === "goonie_consult") {
    return handleNaturalGoonieConsultIntent({ bot, message, intent });
  }

  if (intent.category === "shared_brain") {
    return handleNaturalSharedBrainIntent({ bot, message, intent });
  }

  if (intent.category === "unknown") {
    await bot.sendMessage(message.chat.id, buildUnknownOperatorQuestion());
    return true;
  }

  return false;
}

export const intentRouterInternals = {
  CLOUD_TRANSFER_CONFIRMATION,
  buildCloudScopedPath,
  buildNamedGoonieRegex,
  buildCloudDryRunPlanMessage,
  buildCloudModeBlockedMessage,
  buildCloudTransferPreviewMessage,
  buildCodexBridgeTaskPacket,
  buildContractorClarifyQuestion,
  buildLocalRunnerFallbackMessage,
  buildResolvedSharedBrainTaskMessage,
  buildSharedBrainActionFailureMessage,
  buildSharedBrainTestTaskPacket,
  buildSharedBrainTestOnlyTaskPacket,
  buildSharedBrainUnavailableMessage,
  detectNaturalIntent,
  identifyNamedGoonieId,
  isGoonieRoleQuestionText,
  isGoonieConsultIntentText,
  getDropboxCloudConfigStatus,
  getDropboxCloudEnvNames,
  isApprovedDropboxRootPath,
  parseNaturalEmailRequest,
  queueSharedBrainTaskAndWait,
  runApprovedCloudTransfer,
  formatCloudTransferExecutionSummary,
};

```

### C:/Users/Peyto/clawdia-bot/package.json

```json
{
  "name": "clawdia-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Telegram bot for Clawdia using OpenAI GPT-4o.",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "start:brain": "node brainServer.js",
    "start:codex-bridge": "node codexBridgeServer.js",
    "smoke:companycam-router": "node smoke-companycam-router.mjs",
    "smoke:contractor-queue": "node smoke-contractor-queue.mjs",
    "smoke:codex-bridge": "node smoke-codex-bridge.mjs",
    "smoke:authoritative-queue-load": "node smoke-authoritative-queue-load.mjs",
    "smoke:dashboard-doc-maintenance": "node smoke-dashboard-doc-maintenance.mjs",
    "smoke:goonie-runtime": "node smoke-goonie-runtime.mjs",
    "smoke:railway-access": "node smoke-railway-access.mjs",
    "smoke:telegram-front-door": "node smoke-telegram-front-door.mjs",
    "smoke:willy-runtime": "node smoke-willy-runtime.mjs",
    "smoke:worker-loop": "node smoke-worker-loop.mjs",
    "smoke:one-brain": "node smoke-one-brain.mjs"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@openai/codex": "^0.125.0",
    "googleapis": "^154.1.0",
    "node-telegram-bot-api": "^0.66.0",
    "openai": "^4.104.0"
  }
}

```

### C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/services/gooniesConsultService.js

```js
const DEFAULT_BRAIN_PUBLIC_URL = "http://127.0.0.1:8788";
const GOONIE_META = {
  chunk: { id: "chunk", name: "Chunk", role: "Research / Facts / Case Studies", consult_lane: "research_facts" },
  mikey: { id: "mikey", name: "Mikey", role: "Executive Strategy / Leverage / Sequencing", consult_lane: "strategy_sequence" },
  mouth: { id: "mouth", name: "Mouth", role: "Sales / Messaging / Customer Communication", consult_lane: "messaging_sales" },
  brand: { id: "brand", name: "Brand", role: "Field Operations / Real-World Service Workflow", consult_lane: "field_operations" },
  data: { id: "data", name: "Data", role: "Technical Systems / Architecture / Integration", consult_lane: "systems_architecture" },
  andy: { id: "andy", name: "Andy", role: "Local Growth / SEO / Visibility", consult_lane: "local_growth_seo" },
  willy: { id: "willy", name: "One-Eyed Willy", role: "Nova-like Proof / Judgment / Next-Step Advisor", consult_lane: "proof_review_next_step" },
};

const GOONIE_KEYWORDS = {
  chunk: ["chunk", "research", "fact", "facts", "source", "sources", "citation", "citations", "compliance", "regulation", "docs", "case study"],
  mikey: ["mikey", "strategy", "leverage", "sequence", "sequencing", "priority", "prioritize", "order", "roadmap", "bottleneck"],
  mouth: ["mouth", "sales", "messaging", "message", "email", "copy", "subject", "opening", "wording", "outreach"],
  brand: ["brand", "field", "workflow", "technician", "operations", "service", "job flow", "practical"],
  data: ["data", "system", "systems", "architecture", "api", "bridge", "telegram", "codex", "railway", "integration", "runtime"],
  andy: ["andy", "seo", "visibility", "local growth", "google business", "gbp", "search", "organic", "service-area"],
  willy: ["willy", "one-eyed willy", "one eyed willy", "proof", "blocker", "reroute", "park", "next clue", "next step", "stepping away", "truth conflict", "stale status", "queue conflict"],
};

function normalizeText(value) {
  return String(value || "").trim();
}

function buildNamedGoonieRegex(agentId) {
  return new RegExp(`\\b${agentId}(?:'s|s)?\\b`, "i");
}

function getConfiguredBrainPublicUrl() {
  if (typeof import.meta !== "undefined" && import.meta?.env?.VITE_CLAWDIA_BRAIN_PUBLIC_URL) {
    return normalizeText(import.meta.env.VITE_CLAWDIA_BRAIN_PUBLIC_URL);
  }
  if (typeof process !== "undefined" && process?.env?.CLAWDIA_BRAIN_PUBLIC_URL) {
    return normalizeText(process.env.CLAWDIA_BRAIN_PUBLIC_URL);
  }
  return DEFAULT_BRAIN_PUBLIC_URL;
}

function scoreAgentMatch(question, agentId) {
  const lower = normalizeText(question).toLowerCase();
  return (GOONIE_KEYWORDS[agentId] || []).reduce(
    (score, keyword) => score + (lower.includes(keyword) ? 1 : 0),
    0
  );
}

function identifyNamedGoonieId(question) {
  const lower = normalizeText(question).toLowerCase();
  for (const agentId of Object.keys(GOONIE_KEYWORDS)) {
    const aliases = GOONIE_KEYWORDS[agentId].filter((keyword) =>
      ["chunk", "mikey", "mouth", "brand", "data", "andy", "willy", "one-eyed willy", "one eyed willy"].includes(keyword)
    );
    if (aliases.some((alias) => buildNamedGoonieRegex(alias).test(lower))) {
      return agentId;
    }
    if (
      aliases.some(
        (alias) =>
          lower.includes(`ask ${alias}`) ||
          lower.includes(` ${alias} `) ||
          lower.endsWith(alias)
      )
    ) {
      return agentId;
    }
  }
  return "";
}

function identifyBestGoonieId(question) {
  const named = identifyNamedGoonieId(question);
  if (named) {
    return named;
  }

  let bestAgentId = "";
  let bestScore = 0;
  for (const agentId of Object.keys(GOONIE_KEYWORDS)) {
    const score = scoreAgentMatch(question, agentId);
    if (score > bestScore) {
      bestScore = score;
      bestAgentId = agentId;
    }
  }
  return bestScore > 0 ? bestAgentId : "";
}

function isConsultRequest(question) {
  const lower = normalizeText(question).toLowerCase();
  if (!lower) {
    return false;
  }

  if (
    (Boolean(identifyNamedGoonieId(question)) &&
      /\b(what is|what's|who is|who's|what does|job|role|responsibilit|best at|what do)\b/i.test(lower)) ||
    lower.includes("ask chunk") ||
    lower.includes("ask mikey") ||
    lower.includes("ask mouth") ||
    lower.includes("ask brand") ||
    lower.includes("ask data") ||
    lower.includes("ask andy") ||
    lower.includes("ask willy") ||
    lower.includes("ask one-eyed willy") ||
    lower.includes("ask one eyed willy") ||
    lower.includes("which goonie should answer") ||
    lower.includes("which goonie") ||
    lower.includes("advisory bench") ||
    lower.includes("consult ") ||
    lower.includes("i am stepping away") ||
    lower.includes("i'm stepping away") ||
    lower.includes("step away") ||
    lower.includes("next clue") ||
    lower.includes("is this proof good") ||
    lower.includes("proof is good") ||
    lower.includes("park or reroute") ||
    lower.includes("reroute or park")
  ) {
    return true;
  }

  return lower.startsWith("clawdia,") && Boolean(identifyBestGoonieId(question));
}

function buildRuntimeUnavailableResponse(question, errorMessage) {
  return {
    handled: true,
    goonie: null,
    confidence: "LOW",
    response: [
      "GOONIE CONSULT RESPONSE",
      "",
      "GOONIE:",
      "- unavailable",
      "QUESTION:",
      `- ${normalizeText(question) || "No consult question provided."}`,
      "RECOMMENDATION:",
      "- Restore the local Clawdia shared-brain consult runtime before trusting a Goonie advisory result from this dashboard session.",
      "REASONING:",
      "- The dashboard tried to call the real shared-brain consult path, but the runtime was unavailable or returned an invalid response.",
      "CONFIDENCE:",
      "- LOW",
      "CONFIDENCE REASON:",
      "- A real named Goonie runtime response was not returned, so Clawdia should not pretend the consult succeeded.",
      "SOURCES USED:",
      "- internal | public_source: no | citation_ready: no | source_type: runtime_status | source_name: Shared brain consult runtime | source_url_or_path: http://127.0.0.1:8788/public/consult/goonie",
      "RISKS:",
      "- Falling back to a pretend consult would recreate the exact split-brain behavior we are trying to remove.",
      "WHAT CLAWDIA SHOULD DO NEXT:",
      "- Start or restore the local shared brain, then retry the consult through the live runtime path.",
      "ESCALATE TO CHRIS:",
      "- no",
      `- reason: runtime blocker only: ${normalizeText(errorMessage) || "unknown runtime failure"}`,
    ].join("\n"),
    runtimeAvailable: false,
  };
}

async function callConsultRuntime(question, explicitAgentId = "") {
  const response = await fetch(`${getConfiguredBrainPublicUrl()}/public/consult/goonie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: normalizeText(question),
      agent_id: normalizeText(explicitAgentId).toLowerCase() || undefined,
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload?.ok !== true || !normalizeText(payload?.response)) {
    throw new Error(normalizeText(payload?.error || payload?.message || "Consult runtime did not return a valid advisory response."));
  }

  return {
    handled: true,
    goonie: payload.goonie || null,
    confidence: payload.confidence || "LOW",
    response: payload.response,
    runtimeLoaded: payload.runtime_loaded || null,
    consultOnly: payload.consult_only === true,
    citationReady: payload.citation_ready === true,
    sourcesUsed: Array.isArray(payload.sources_used) ? payload.sources_used : [],
  };
}

export async function runNamedGoonieConsult(question, explicitAgentId = null) {
  const normalizedQuestion = normalizeText(question);
  const chosenAgentId = normalizeText(explicitAgentId).toLowerCase() || identifyBestGoonieId(normalizedQuestion);

  try {
    return await callConsultRuntime(normalizedQuestion, chosenAgentId);
  } catch (error) {
    return buildRuntimeUnavailableResponse(normalizedQuestion, error?.message || "Consult runtime failed.");
  }
}

export async function maybeRunGoonieConsult(question) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion || !isConsultRequest(normalizedQuestion)) {
    return null;
  }
  return runNamedGoonieConsult(normalizedQuestion);
}

export function identifyBestGoonie(question) {
  const agentId = identifyBestGoonieId(normalizeText(question));
  return agentId ? GOONIE_META[agentId] || null : null;
}

export const goonieConsultServiceInternals = {
  DEFAULT_BRAIN_PUBLIC_URL,
  buildNamedGoonieRegex,
  callConsultRuntime,
  getConfiguredBrainPublicUrl,
  identifyBestGoonieId,
  identifyNamedGoonieId,
  isConsultRequest,
};

```

### C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/services/gooniesRegistryService.js

```js
import registry from "../../../../docs/internal/goonies/GOONIES_DASHBOARD_REGISTRY.json";

import systemOverviewRaw from "../../../../docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md?raw";
import consultProtocolRaw from "../../../../docs/internal/goonies/CONSULT_PROTOCOL.md?raw";
import sourceStandardsRaw from "../../../../docs/internal/goonies/SOURCE_STANDARDS.md?raw";
import knowledgeSchemaRaw from "../../../../docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md?raw";
import onlineResearchRulesRaw from "../../../../docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md?raw";
import escalationRulesRaw from "../../../../docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md?raw";

import chunkSoulRaw from "../../../../docs/internal/goonies/chunk/SOUL.md?raw";
import chunkMemoryRaw from "../../../../docs/internal/goonies/chunk/MEMORY.md?raw";
import chunkKnowledgeBaseRaw from "../../../../docs/internal/goonies/chunk/KNOWLEDGE_BASE.md?raw";
import mikeySoulRaw from "../../../../docs/internal/goonies/mikey/SOUL.md?raw";
import mikeyMemoryRaw from "../../../../docs/internal/goonies/mikey/MEMORY.md?raw";
import mikeyKnowledgeBaseRaw from "../../../../docs/internal/goonies/mikey/KNOWLEDGE_BASE.md?raw";
import mouthSoulRaw from "../../../../docs/internal/goonies/mouth/SOUL.md?raw";
import mouthMemoryRaw from "../../../../docs/internal/goonies/mouth/MEMORY.md?raw";
import mouthKnowledgeBaseRaw from "../../../../docs/internal/goonies/mouth/KNOWLEDGE_BASE.md?raw";
import brandSoulRaw from "../../../../docs/internal/goonies/brand/SOUL.md?raw";
import brandMemoryRaw from "../../../../docs/internal/goonies/brand/MEMORY.md?raw";
import brandKnowledgeBaseRaw from "../../../../docs/internal/goonies/brand/KNOWLEDGE_BASE.md?raw";
import dataSoulRaw from "../../../../docs/internal/goonies/data/SOUL.md?raw";
import dataMemoryRaw from "../../../../docs/internal/goonies/data/MEMORY.md?raw";
import dataKnowledgeBaseRaw from "../../../../docs/internal/goonies/data/KNOWLEDGE_BASE.md?raw";
import andySoulRaw from "../../../../docs/internal/goonies/andy/SOUL.md?raw";
import andyMemoryRaw from "../../../../docs/internal/goonies/andy/MEMORY.md?raw";
import andyKnowledgeBaseRaw from "../../../../docs/internal/goonies/andy/KNOWLEDGE_BASE.md?raw";
import willySoulRaw from "../../../../docs/internal/goonies/willy/SOUL.md?raw";
import willyMemoryRaw from "../../../../docs/internal/goonies/willy/MEMORY.md?raw";
import willyKnowledgeBaseRaw from "../../../../docs/internal/goonies/willy/KNOWLEDGE_BASE.md?raw";
import willyPlaybookRaw from "../../../../docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md?raw";
import willySystemPromptRaw from "../../../../docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md?raw";

export const ADVISORY_PLACEHOLDER_ASSET = "/assets/goonies/advisory-placeholder.svg";

const DOC_CONTENT_BY_PATH = {
  "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md": systemOverviewRaw,
  "docs/internal/goonies/CONSULT_PROTOCOL.md": consultProtocolRaw,
  "docs/internal/goonies/SOURCE_STANDARDS.md": sourceStandardsRaw,
  "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md": knowledgeSchemaRaw,
  "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md": onlineResearchRulesRaw,
  "docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md": escalationRulesRaw,
  "docs/internal/goonies/chunk/SOUL.md": chunkSoulRaw,
  "docs/internal/goonies/chunk/MEMORY.md": chunkMemoryRaw,
  "docs/internal/goonies/chunk/KNOWLEDGE_BASE.md": chunkKnowledgeBaseRaw,
  "docs/internal/goonies/mikey/SOUL.md": mikeySoulRaw,
  "docs/internal/goonies/mikey/MEMORY.md": mikeyMemoryRaw,
  "docs/internal/goonies/mikey/KNOWLEDGE_BASE.md": mikeyKnowledgeBaseRaw,
  "docs/internal/goonies/mouth/SOUL.md": mouthSoulRaw,
  "docs/internal/goonies/mouth/MEMORY.md": mouthMemoryRaw,
  "docs/internal/goonies/mouth/KNOWLEDGE_BASE.md": mouthKnowledgeBaseRaw,
  "docs/internal/goonies/brand/SOUL.md": brandSoulRaw,
  "docs/internal/goonies/brand/MEMORY.md": brandMemoryRaw,
  "docs/internal/goonies/brand/KNOWLEDGE_BASE.md": brandKnowledgeBaseRaw,
  "docs/internal/goonies/data/SOUL.md": dataSoulRaw,
  "docs/internal/goonies/data/MEMORY.md": dataMemoryRaw,
  "docs/internal/goonies/data/KNOWLEDGE_BASE.md": dataKnowledgeBaseRaw,
  "docs/internal/goonies/andy/SOUL.md": andySoulRaw,
  "docs/internal/goonies/andy/MEMORY.md": andyMemoryRaw,
  "docs/internal/goonies/andy/KNOWLEDGE_BASE.md": andyKnowledgeBaseRaw,
  "docs/internal/goonies/willy/SOUL.md": willySoulRaw,
  "docs/internal/goonies/willy/MEMORY.md": willyMemoryRaw,
  "docs/internal/goonies/willy/KNOWLEDGE_BASE.md": willyKnowledgeBaseRaw,
  "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md": willyPlaybookRaw,
  "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md": willySystemPromptRaw,
};

const GOONIE_DOC_PATHS_BY_ID = {
  chunk: {
    soulPath: "docs/internal/goonies/chunk/SOUL.md",
    memoryPath: "docs/internal/goonies/chunk/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/chunk/KNOWLEDGE_BASE.md",
  },
  mikey: {
    soulPath: "docs/internal/goonies/mikey/SOUL.md",
    memoryPath: "docs/internal/goonies/mikey/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/mikey/KNOWLEDGE_BASE.md",
  },
  mouth: {
    soulPath: "docs/internal/goonies/mouth/SOUL.md",
    memoryPath: "docs/internal/goonies/mouth/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/mouth/KNOWLEDGE_BASE.md",
  },
  brand: {
    soulPath: "docs/internal/goonies/brand/SOUL.md",
    memoryPath: "docs/internal/goonies/brand/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/brand/KNOWLEDGE_BASE.md",
  },
  data: {
    soulPath: "docs/internal/goonies/data/SOUL.md",
    memoryPath: "docs/internal/goonies/data/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/data/KNOWLEDGE_BASE.md",
  },
  andy: {
    soulPath: "docs/internal/goonies/andy/SOUL.md",
    memoryPath: "docs/internal/goonies/andy/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/andy/KNOWLEDGE_BASE.md",
  },
  willy: {
    soulPath: "docs/internal/goonies/willy/SOUL.md",
    memoryPath: "docs/internal/goonies/willy/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/willy/KNOWLEDGE_BASE.md",
    playbookPath: "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md",
    systemPromptPath: "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md",
  },
};

export const GOONIES_SHARED_RULE_DOCS = [
  {
    id: "source-rules",
    label: "View Source Rules",
    path: "docs/internal/goonies/SOURCE_STANDARDS.md",
  },
  {
    id: "citation-rules",
    label: "View Citation Rules",
    path: "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md",
  },
  {
    id: "research-rules",
    label: "View Research Rules",
    path: "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md",
  },
];

export function getAdvisoryBenchAgents() {
  return (registry.agents || []).map((agent) => ({
    ...agent,
    statusLabel: agent.llm_backed ? "LLM-backed consult-only live" : String(agent.status || "docs_ready").replace(/_/g, " / "),
    placeholderAvatar: ADVISORY_PLACEHOLDER_ASSET,
  }));
}

export function getRegistryMeta() {
  return {
    version: registry.version,
    status: registry.status,
    group: registry.group,
  };
}

export function getDocContentByPath(path) {
  return DOC_CONTENT_BY_PATH[path] ?? null;
}

export function getAgentById(agentId) {
  return getAdvisoryBenchAgents().find((agent) => agent.id === agentId) ?? null;
}

export function getAdvisoryBenchOverview() {
  return {
    title: "Advisory Bench",
    overviewPath: "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md",
    overviewContent: systemOverviewRaw,
    consultProtocolPath: "docs/internal/goonies/CONSULT_PROTOCOL.md",
    consultProtocolContent: consultProtocolRaw,
  };
}

export function getSharedGoonieRuleBundle() {
  return {
    systemOverview: {
      path: "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md",
      content: systemOverviewRaw,
    },
    consultProtocol: {
      path: "docs/internal/goonies/CONSULT_PROTOCOL.md",
      content: consultProtocolRaw,
    },
    sourceStandards: {
      path: "docs/internal/goonies/SOURCE_STANDARDS.md",
      content: sourceStandardsRaw,
    },
    knowledgeSchema: {
      path: "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md",
      content: knowledgeSchemaRaw,
    },
    onlineResearchRules: {
      path: "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md",
      content: onlineResearchRulesRaw,
    },
    escalationRules: {
      path: "docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md",
      content: escalationRulesRaw,
    },
  };
}

export function getGoonieRuntimeContext(agentId) {
  const agent = getAgentById(agentId);
  const docPaths = GOONIE_DOC_PATHS_BY_ID[agentId];

  if (!agent || !docPaths) {
    return null;
  }

  return {
    agent,
    soul: {
      path: docPaths.soulPath,
      content: getDocContentByPath(docPaths.soulPath),
    },
    memory: {
      path: docPaths.memoryPath,
      content: getDocContentByPath(docPaths.memoryPath),
    },
    knowledgeBase: {
      path: docPaths.knowledgeBasePath,
      content: getDocContentByPath(docPaths.knowledgeBasePath),
    },
    playbook: docPaths.playbookPath
      ? {
          path: docPaths.playbookPath,
          content: getDocContentByPath(docPaths.playbookPath),
        }
      : null,
    systemPrompt: docPaths.systemPromptPath
      ? {
          path: docPaths.systemPromptPath,
          content: getDocContentByPath(docPaths.systemPromptPath),
        }
      : null,
    sharedRules: getSharedGoonieRuleBundle(),
  };
}

```

### C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/components/GooniesAdvisoryBench.jsx

```jsx
import { useMemo, useState } from "react";
import {
  ADVISORY_PLACEHOLDER_ASSET,
  GOONIES_SHARED_RULE_DOCS,
  getAdvisoryBenchAgents,
  getAgentById,
  getAdvisoryBenchOverview,
  getDocContentByPath,
} from "../services/gooniesRegistryService.js";
import { maybeRunGoonieConsult } from "../services/gooniesConsultService.js";

const S = {
  page: {
    minHeight: "100%",
    background: "#060D18",
    color: "#E2E8F0",
    padding: "28px 24px 40px",
  },
  shell: {
    maxWidth: 1240,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
    gap: 20,
    alignItems: "start",
  },
  mainCol: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0,
  },
  sideCol: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  panel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 48px rgba(3, 7, 18, 0.28)",
  },
  eyebrow: {
    margin: 0,
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0 10px",
    fontSize: 30,
    color: "#F8FAFC",
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: "#94A3B8",
    lineHeight: 1.7,
    fontSize: 14,
    maxWidth: 760,
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14,
  },
  badge: (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: bg,
    color,
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
  }),
  consultPanel: {
    display: "grid",
    gap: 12,
  },
  consultLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "#C4B5FD",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#020617",
    color: "#E2E8F0",
    padding: 14,
    fontSize: 14,
    lineHeight: 1.6,
    boxSizing: "border-box",
    outline: "none",
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "11px 16px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    color: "#CBD5E1",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "11px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  responseBox: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: 16,
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.65,
    color: "#E2E8F0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: 16,
  },
  card: {
    background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(10,15,28,0.98))",
    border: "1px solid #22314D",
    borderRadius: 18,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  cardHeader: {
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid #334155",
    background: "#0F172A",
    flexShrink: 0,
    position: "relative",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  initials: {
    position: "absolute",
    right: 6,
    bottom: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    background: "rgba(8,15,31,0.86)",
    color: "#E0F2FE",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  cardTitle: {
    margin: 0,
    fontSize: 21,
    color: "#F8FAFC",
    fontWeight: 800,
  },
  role: {
    margin: "4px 0 0",
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  desc: {
    margin: 0,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.65,
  },
  kvList: {
    display: "grid",
    gap: 8,
  },
  kvRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 12,
    lineHeight: 1.5,
  },
  kvKey: {
    color: "#64748B",
    fontWeight: 700,
    flexShrink: 0,
  },
  kvValue: {
    color: "#E2E8F0",
    textAlign: "right",
  },
  linkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  linkBtn: {
    background: "#111827",
    color: "#E2E8F0",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  previewMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  previewTitle: {
    margin: "2px 0 8px",
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: 800,
  },
  previewPath: {
    margin: 0,
    color: "#7DD3FC",
    fontSize: 12,
    wordBreak: "break-all",
  },
  previewBody: {
    margin: 0,
    whiteSpace: "pre-wrap",
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: "65vh",
    overflowY: "auto",
  },
  note: {
    margin: 0,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 1.6,
  },
};

function agentInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function buildDocLinks(agent) {
  const links = [
    { label: "View SOUL", path: agent.soul_path },
    { label: "View MEMORY", path: agent.memory_path },
    { label: "View KNOWLEDGE BASE", path: agent.knowledge_base_path },
  ];
  if (agent.playbook_path) {
    links.push({ label: "View PLAYBOOK", path: agent.playbook_path });
  }
  if (agent.system_prompt_path) {
    links.push({ label: "View SYSTEM PROMPT", path: agent.system_prompt_path });
  }
  return links;
}

export function GooniesAdvisoryBench() {
  const agents = useMemo(() => getAdvisoryBenchAgents(), []);
  const overview = useMemo(() => getAdvisoryBenchOverview(), []);
  const [consultInput, setConsultInput] = useState(
    "Clawdia, ask Chunk to research VGB compliance sources."
  );
  const [consultResult, setConsultResult] = useState(null);
  const [consulting, setConsulting] = useState(false);
  const [preview, setPreview] = useState({
    title: "Advisory Bench Overview",
    path: overview.overviewPath,
    content: overview.overviewContent,
  });

  function openDoc(label, path) {
    const content = getDocContentByPath(path);
    setPreview({
      title: label,
      path,
      content: content || "Document preview is not available yet.",
    });
  }

  function prepareConsult(agent) {
    setConsultInput(`Clawdia, ask ${agent.name} to help with the ${agent.consult_lane} lane.`);
    setConsultResult(null);
    openDoc(`${agent.name} SOUL`, agent.soul_path);
  }

  async function handleConsult() {
    setConsulting(true);
    const result = await maybeRunGoonieConsult(consultInput);
    if (!result) {
      setConsultResult(
        "GOONIE CONSULT RESPONSE\n\nGOONIE:\n- needs clarification\nQUESTION:\n- No consult request detected.\nRECOMMENDATION:\n- Ask Clawdia to consult a named Goonie or use clear advisory-bench wording.\nREASONING:\n- The request did not match the consult-only routing rules.\nCONFIDENCE:\n- LOW\nCONFIDENCE REASON:\n- No advisory routing signal was found.\nSOURCES USED:\n- internal | citation_ready: no | source_type: internal_doc | source_name: Consult Protocol | source_url_or_path: docs/internal/goonies/CONSULT_PROTOCOL.md\nRISKS:\n- A non-consult request could be mistaken for a Goonie advisory request.\nWHAT CLAWDIA SHOULD DO NEXT:\n- Rewrite the request as: Clawdia, ask <Goonie> to ...\nESCALATE TO CHRIS:\n- no\n- reason: this can be clarified safely in the dashboard."
      );
      setConsulting(false);
      return;
    }

    setConsultResult(result.response);
    if (result.goonie) {
      const registryAgent = getAgentById(result.goonie.id);
      if (registryAgent?.soul_path) {
        openDoc(`${registryAgent.name} SOUL`, registryAgent.soul_path);
      }
    }
    setConsulting(false);
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <div style={S.mainCol}>
          <section style={S.panel}>
            <p style={S.eyebrow}>Agents</p>
            <h1 style={S.title}>Advisory Bench</h1>
            <p style={S.subtitle}>
              The Goonies are visible live as real advisory agents. They can help Clawdia think,
              route, and pressure-test decisions, but they remain consult-only and cannot execute
              tools, contact clients, publish, send, delete, or trigger builds.
            </p>
            <div style={S.badgeRow}>
              <span style={S.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>registry-backed</span>
              <span style={S.badge("rgba(34,197,94,0.14)", "#86EFAC")}>consult-only</span>
              <span style={S.badge("rgba(245,158,11,0.14)", "#FCD34D")}>mixed live bench</span>
            </div>
          </section>

          <section style={{ ...S.panel, ...S.consultPanel }}>
            <p style={S.consultLabel}>Consult the bench</p>
            <p style={S.subtitle}>
              Ask Clawdia to consult one of the Goonies. The response stays advisory, cites its
              internal source basis, and keeps Clawdia as the operator.
            </p>
            <textarea
              style={S.textarea}
              value={consultInput}
              onChange={(event) => setConsultInput(event.target.value)}
            />
            <div style={S.actionRow}>
              <button type="button" style={S.primaryBtn} onClick={handleConsult}>
                {consulting ? "Consulting runtime..." : "Run consult-only sample"}
              </button>
              <button
                type="button"
                style={S.ghostBtn}
                onClick={() => {
                  setConsultInput("Clawdia, ask Data to review the safest architecture boundary.");
                  setConsultResult(null);
                }}
              >
                Load systems example
              </button>
              <button
                type="button"
                style={S.ghostBtn}
                onClick={() => {
                  setConsultInput("Clawdia, ask Mouth to tighten this outreach wording without overclaiming.");
                  setConsultResult(null);
                }}
              >
                Load messaging example
              </button>
            </div>
            {consultResult ? <div style={S.responseBox}>{consultResult}</div> : null}
          </section>

          <section style={S.grid}>
            {agents.map((agent) => (
              <article key={agent.id} style={S.card}>
                <div style={S.cardHeader}>
                  <div style={S.avatarWrap}>
                    <img
                      alt={`${agent.name} placeholder avatar`}
                      src={ADVISORY_PLACEHOLDER_ASSET}
                      style={S.avatarImg}
                    />
                    <span style={S.initials}>{agentInitials(agent.name)}</span>
                  </div>
                  <div>
                    <h2 style={S.cardTitle}>{agent.name}</h2>
                    <p style={S.role}>{agent.role}</p>
                    {agent.llm_backed ? (
                      <div style={{ ...S.badge("rgba(16,185,129,0.16)", "#6EE7B7"), marginTop: 8 }}>
                        LLM-backed
                      </div>
                    ) : null}
                  </div>
                </div>

                <p style={S.desc}>{agent.short_description}</p>

                <div style={S.cardActions}>
                  <button type="button" style={S.primaryBtn} onClick={() => prepareConsult(agent)}>
                    Consult
                  </button>
                </div>

                <div style={S.kvList}>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Consult lane</span>
                    <span style={S.kvValue}>{agent.consult_lane}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Status</span>
                    <span style={S.kvValue}>{agent.statusLabel}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Avatar status</span>
                    <span style={S.kvValue}>{agent.avatar_status}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>can_execute</span>
                    <span style={S.kvValue}>{String(agent.can_execute)}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>consult_only</span>
                    <span style={S.kvValue}>{String(agent.consult_only)}</span>
                  </div>
                </div>

                <div style={S.linkGrid}>
                  {buildDocLinks(agent).map((link) => (
                    <button
                      key={`${agent.id}-${link.path}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                  {GOONIES_SHARED_RULE_DOCS.slice(0, 1).map((link) => (
                    <button
                      key={`${agent.id}-${link.id}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                  {GOONIES_SHARED_RULE_DOCS.slice(1, 2).map((link) => (
                    <button
                      key={`${agent.id}-${link.id}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </div>

        <aside style={S.sideCol}>
          <section style={S.panel}>
            <p style={S.eyebrow}>Preview</p>
            <h2 style={S.previewTitle}>{preview.title}</h2>
            <div style={S.previewMeta}>
              <span style={S.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>registry truth</span>
              <span style={S.badge("rgba(245,158,11,0.14)", "#FCD34D")}>docs-backed</span>
            </div>
            <p style={S.previewPath}>{preview.path}</p>
            <pre style={S.previewBody}>{preview.content}</pre>
          </section>

          <section style={S.panel}>
            <p style={S.eyebrow}>Guardrails</p>
            <p style={S.note}>
              The Goonies are visible live, but they still cannot execute tools, send email,
              publish, schedule, contact clients, modify CompanyCam, write to Dropbox, trigger
              Codex, or override Clawdia.
            </p>
            <div style={{ ...S.linkGrid, gridTemplateColumns: "1fr" }}>
              {GOONIES_SHARED_RULE_DOCS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  style={S.linkBtn}
                  onClick={() => openDoc(link.label, link.path)}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

```

### C:/Users/Peyto/NexTeam-Studio/docs/internal/goonies/GOONIES_AGENT_INDEX.md

```md
# GOONIES_AGENT_INDEX
- version: 1.1
- status: active_consult_bench
- last_updated: 2026-05-02

| Goonie | Role | Purpose | Consult lane | SOUL | MEMORY | KNOWLEDGE_BASE | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chunk | General Research / Facts / Case Studies / Source Truth | Find source-backed truth across all NexTeam clients and internal projects so Clawdia does not guess | research_facts | `docs/internal/goonies/chunk/SOUL.md` | `docs/internal/goonies/chunk/MEMORY.md` | `docs/internal/goonies/chunk/KNOWLEDGE_BASE.md` | parked_docs_ready |
| Mikey | Executive Strategy / Leverage / Sequencing | Help Clawdia decide what matters most and what order to do it in | strategy_sequence | `docs/internal/goonies/mikey/SOUL.md` | `docs/internal/goonies/mikey/MEMORY.md` | `docs/internal/goonies/mikey/KNOWLEDGE_BASE.md` | parked_docs_ready |
| Mouth | Sales / Messaging / Customer Communication | Help Clawdia say the right thing clearly and honestly | messaging_sales | `docs/internal/goonies/mouth/SOUL.md` | `docs/internal/goonies/mouth/MEMORY.md` | `docs/internal/goonies/mouth/KNOWLEDGE_BASE.md` | parked_docs_ready |
| Brand | Field Operations / Real-World Service Workflow | Keep decisions grounded in service-business reality | field_operations | `docs/internal/goonies/brand/SOUL.md` | `docs/internal/goonies/brand/MEMORY.md` | `docs/internal/goonies/brand/KNOWLEDGE_BASE.md` | parked_docs_ready |
| Data | Technical Systems / Architecture / Integration | Help Clawdia reason through APIs, automation, and system failure points | systems_architecture | `docs/internal/goonies/data/SOUL.md` | `docs/internal/goonies/data/MEMORY.md` | `docs/internal/goonies/data/KNOWLEDGE_BASE.md` | parked_docs_ready |
| Andy | Local Growth / SEO / Visibility | Help Clawdia improve how clients get found, trusted, and chosen | local_growth_seo | `docs/internal/goonies/andy/SOUL.md` | `docs/internal/goonies/andy/MEMORY.md` | `docs/internal/goonies/andy/KNOWLEDGE_BASE.md` | parked_docs_ready |
| One-Eyed Willy | Nova-like Proof / Judgment / Next-Step Advisor | Help Clawdia judge proof, break loops, choose the next safe move, and decide when Chris is truly needed | proof_review_next_step | `docs/internal/goonies/willy/SOUL.md` | `docs/internal/goonies/willy/MEMORY.md` | `docs/internal/goonies/willy/KNOWLEDGE_BASE.md` | llm_backed_consult_only_live |

Notes:

- all six are consult-only
- One-Eyed Willy is an LLM-backed consult-only runtime advisor
- the rest of the bench remains consult-only and may be called through the advisory runtime without execution authority
- none may execute tools directly
- none outrank Clawdia
- Chunk supports all NexTeam clients and internal work, with client-tagged knowledge and jurisdiction-tagged research when location-specific rules matter

```

### C:/Users/Peyto/NexTeam-Studio/docs/internal/goonies/GOONIES_DASHBOARD_REGISTRY.json

```json
{
  "version": "1.1",
  "status": "active_consult_bench",
  "group": "advisory_bench",
  "agents": [
    {
      "id": "chunk",
      "name": "Chunk",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "General Research / Facts / Case Studies / Source Truth",
      "short_description": "All-client source-backed truth advisor for Clawdia's research and fact-checking decisions.",
      "consult_lane": "research_facts",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_chunk",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/chunk-avatar.png",
      "pronunciation": "CHUNK",
      "soul_path": "docs/internal/goonies/chunk/SOUL.md",
      "memory_path": "docs/internal/goonies/chunk/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/chunk/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "mikey",
      "name": "Mikey",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "Executive Strategy / Leverage / Sequencing",
      "short_description": "Strategy and sequencing advisor for Clawdia's priorities.",
      "consult_lane": "strategy_sequence",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_mikey",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/mikey-avatar.png",
      "pronunciation": "MY-key",
      "soul_path": "docs/internal/goonies/mikey/SOUL.md",
      "memory_path": "docs/internal/goonies/mikey/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/mikey/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "mouth",
      "name": "Mouth",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "Sales / Messaging / Customer Communication",
      "short_description": "Messaging and communication advisor for clear, honest sales language.",
      "consult_lane": "messaging_sales",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_mouth",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/mouth-avatar.png",
      "pronunciation": "MOWTH",
      "soul_path": "docs/internal/goonies/mouth/SOUL.md",
      "memory_path": "docs/internal/goonies/mouth/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/mouth/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "brand",
      "name": "Brand",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "Field Operations / Real-World Service Workflow",
      "short_description": "Field reality advisor for service-business workflow and constraints.",
      "consult_lane": "field_operations",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_brand",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/brand-avatar.png",
      "pronunciation": "BRAND",
      "soul_path": "docs/internal/goonies/brand/SOUL.md",
      "memory_path": "docs/internal/goonies/brand/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/brand/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "data",
      "name": "Data",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "Technical Systems / Architecture / Integration",
      "short_description": "Systems and integration advisor for technical decisions and failure points.",
      "consult_lane": "systems_architecture",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_data",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/data-avatar.png",
      "pronunciation": "DAY-tuh",
      "soul_path": "docs/internal/goonies/data/SOUL.md",
      "memory_path": "docs/internal/goonies/data/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/data/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "andy",
      "name": "Andy",
      "group": "advisory_bench",
      "status": "parked_docs_ready",
      "role": "Local Growth / SEO / Visibility",
      "short_description": "SEO and visibility advisor for local growth decisions.",
      "consult_lane": "local_growth_seo",
      "last_updated": "2026-04-28",
      "citation_status": "traceability_ready",
      "avatar_key": "goonie_andy",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/andy-avatar.png",
      "pronunciation": "AN-dee",
      "soul_path": "docs/internal/goonies/andy/SOUL.md",
      "memory_path": "docs/internal/goonies/andy/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/andy/KNOWLEDGE_BASE.md",
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    },
    {
      "id": "willy",
      "name": "One-Eyed Willy",
      "short_name": "Willy",
      "group": "advisory_bench",
      "status": "llm_backed_consult_only_live",
      "role": "Nova-like Proof / Judgment / Next-Step Advisor",
      "short_description": "LLM-backed internal judgment advisor for proof review, loop breaking, and next-step decisions.",
      "consult_lane": "proof_review_next_step",
      "last_updated": "2026-05-02",
      "citation_status": "internal_proof_traceability_ready",
      "avatar_key": "goonie_willy",
      "avatar_status": "needs_approved_asset",
      "avatar_asset_path": "docs/internal/goonies/assets/willy-avatar.png",
      "pronunciation": "WILL-ee",
      "callable_aliases": [
        "Willy",
        "One-Eyed Willy"
      ],
      "soul_path": "docs/internal/goonies/willy/SOUL.md",
      "memory_path": "docs/internal/goonies/willy/MEMORY.md",
      "knowledge_base_path": "docs/internal/goonies/willy/KNOWLEDGE_BASE.md",
      "playbook_path": "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md",
      "system_prompt_path": "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md",
      "llm_backed": true,
      "can_execute": false,
      "can_contact_clients": false,
      "can_send_messages": false,
      "can_publish": false,
      "can_use_tools_directly": false,
      "consult_only": true
    }
  ]
}

```

## 2. Exact registry proof

### Full Willy registry entry

```json
{
  "id": "willy",
  "name": "One-Eyed Willy",
  "short_name": "Willy",
  "group": "advisory_bench",
  "status": "llm_backed_consult_only_live",
  "role": "Nova-like Proof / Judgment / Next-Step Advisor",
  "short_description": "LLM-backed internal judgment advisor for proof review, loop breaking, and next-step decisions.",
  "consult_lane": "proof_review_next_step",
  "last_updated": "2026-05-02",
  "citation_status": "internal_proof_traceability_ready",
  "avatar_key": "goonie_willy",
  "avatar_status": "needs_approved_asset",
  "avatar_asset_path": "docs/internal/goonies/assets/willy-avatar.png",
  "pronunciation": "WILL-ee",
  "callable_aliases": [
    "Willy",
    "One-Eyed Willy"
  ],
  "soul_path": "docs/internal/goonies/willy/SOUL.md",
  "memory_path": "docs/internal/goonies/willy/MEMORY.md",
  "knowledge_base_path": "docs/internal/goonies/willy/KNOWLEDGE_BASE.md",
  "playbook_path": "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md",
  "system_prompt_path": "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md",
  "llm_backed": true,
  "can_execute": false,
  "can_contact_clients": false,
  "can_send_messages": false,
  "can_publish": false,
  "can_use_tools_directly": false,
  "consult_only": true
}
```

- advisory bench entry present: true
- consult_only: true
- can_execute: false
- llm_backed: true
- display name: One-Eyed Willy
- callable aliases: Willy, One-Eyed Willy

## 3. Exact runtime wiring proof

### Dashboard chat and consult composer route to Willy
- File: C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/services/gooniesConsultService.js

```
   1 | const DEFAULT_BRAIN_PUBLIC_URL = "http://127.0.0.1:8788";
   2 | const GOONIE_META = {
   3 |   chunk: { id: "chunk", name: "Chunk", role: "Research / Facts / Case Studies", consult_lane: "research_facts" },
   4 |   mikey: { id: "mikey", name: "Mikey", role: "Executive Strategy / Leverage / Sequencing", consult_lane: "strategy_sequence" },
   5 |   mouth: { id: "mouth", name: "Mouth", role: "Sales / Messaging / Customer Communication", consult_lane: "messaging_sales" },
   6 |   brand: { id: "brand", name: "Brand", role: "Field Operations / Real-World Service Workflow", consult_lane: "field_operations" },
   7 |   data: { id: "data", name: "Data", role: "Technical Systems / Architecture / Integration", consult_lane: "systems_architecture" },
   8 |   andy: { id: "andy", name: "Andy", role: "Local Growth / SEO / Visibility", consult_lane: "local_growth_seo" },
   9 |   willy: { id: "willy", name: "One-Eyed Willy", role: "Nova-like Proof / Judgment / Next-Step Advisor", consult_lane: "proof_review_next_step" },
  10 | };
  11 | 
  12 | const GOONIE_KEYWORDS = {
  13 |   chunk: ["chunk", "research", "fact", "facts", "source", "sources", "citation", "citations", "compliance", "regulation", "docs", "case study"],
...
 156 |     runtimeAvailable: false,
 157 |   };
 158 | }
 159 | 
 160 | async function callConsultRuntime(question, explicitAgentId = "") {
 161 |   const response = await fetch(`${getConfiguredBrainPublicUrl()}/public/consult/goonie`, {
 162 |     method: "POST",
 163 |     headers: {
 164 |       "Content-Type": "application/json",
...
 196 |     return buildRuntimeUnavailableResponse(normalizedQuestion, error?.message || "Consult runtime failed.");
 197 |   }
 198 | }
 199 | 
 200 | export async function maybeRunGoonieConsult(question) {
 201 |   const normalizedQuestion = normalizeText(question);
 202 |   if (!normalizedQuestion || !isConsultRequest(normalizedQuestion)) {
 203 |     return null;
 204 |   }
```

### Advisory Bench renders Willy with LLM-backed metadata and doc links
- File: C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/components/GooniesAdvisoryBench.jsx

```
   6 |   getAgentById,
   7 |   getAdvisoryBenchOverview,
   8 |   getDocContentByPath,
   9 | } from "../services/gooniesRegistryService.js";
  10 | import { maybeRunGoonieConsult } from "../services/gooniesConsultService.js";
  11 | 
  12 | const S = {
  13 |   page: {
  14 |     minHeight: "100%",
...
 302 |     { label: "View MEMORY", path: agent.memory_path },
 303 |     { label: "View KNOWLEDGE BASE", path: agent.knowledge_base_path },
 304 |   ];
 305 |   if (agent.playbook_path) {
 306 |     links.push({ label: "View PLAYBOOK", path: agent.playbook_path });
 307 |   }
 308 |   if (agent.system_prompt_path) {
 309 |     links.push({ label: "View SYSTEM PROMPT", path: agent.system_prompt_path });
 310 |   }
 311 |   return links;
 312 | }
 313 | 
 314 | export function GooniesAdvisoryBench() {
 315 |   const agents = useMemo(() => getAdvisoryBenchAgents(), []);
 316 |   const overview = useMemo(() => getAdvisoryBenchOverview(), []);
 317 |   const [consultInput, setConsultInput] = useState(
 318 |     "Clawdia, ask Chunk to research VGB compliance sources."
 319 |   );
 320 |   const [consultResult, setConsultResult] = useState(null);
 321 |   const [consulting, setConsulting] = useState(false);
 322 |   const [preview, setPreview] = useState({
 323 |     title: "Advisory Bench Overview",
 324 |     path: overview.overviewPath,
 325 |     content: overview.overviewContent,
...
 333 |       content: content || "Document preview is not available yet.",
 334 |     });
 335 |   }
 336 | 
 337 |   function prepareConsult(agent) {
 338 |     setConsultInput(`Clawdia, ask ${agent.name} to help with the ${agent.consult_lane} lane.`);
 339 |     setConsultResult(null);
 340 |     openDoc(`${agent.name} SOUL`, agent.soul_path);
 341 |   }
 342 | 
 343 |   async function handleConsult() {
 344 |     setConsulting(true);
 345 |     const result = await maybeRunGoonieConsult(consultInput);
 346 |     if (!result) {
 347 |       setConsultResult(
 348 |         "GOONIE CONSULT RESPONSE\n\nGOONIE:\n- needs clarification\nQUESTION:\n- No consult request detected.\nRECOMMENDATION:\n- Ask Clawdia to consult a named Goonie or use clear advisory-bench wording.\nREASONING:\n- The request did not match the consult-only routing rules.\nCONFIDENCE:\n- LOW\nCONFIDENCE REASON:\n- No advisory routing signal was found.\nSOURCES USED:\n- internal | citation_ready: no | source_type: internal_doc | source_name: Consult Protocol | source_url_or_path: docs/internal/goonies/CONSULT_PROTOCOL.md\nRISKS:\n- A non-consult request could be mistaken for a Goonie advisory request.\nWHAT CLAWDIA SHOULD DO NEXT:\n- Rewrite the request as: Clawdia, ask <Goonie> to ...\nESCALATE TO CHRIS:\n- no\n- reason: this can be clarified safely in the dashboard."
 349 |       );
 350 |       setConsulting(false);
 351 |       return;
 352 |     }
 353 | 
 354 |     setConsultResult(result.response);
 355 |     if (result.goonie) {
 356 |       const registryAgent = getAgentById(result.goonie.id);
 357 |       if (registryAgent?.soul_path) {
 358 |         openDoc(`${registryAgent.name} SOUL`, registryAgent.soul_path);
 359 |       }
 360 |     }
 361 |     setConsulting(false);
 362 |   }
 363 | 
 364 |   return (
 365 |     <div style={S.page}>
...
 380 |             </div>
 381 |           </section>
 382 | 
 383 |           <section style={{ ...S.panel, ...S.consultPanel }}>
 384 |             <p style={S.consultLabel}>Consult the bench</p>
 385 |             <p style={S.subtitle}>
 386 |               Ask Clawdia to consult one of the Goonies. The response stays advisory, cites its
 387 |               internal source basis, and keeps Clawdia as the operator.
 388 |             </p>
 389 |             <textarea
 390 |               style={S.textarea}
 391 |               value={consultInput}
 392 |               onChange={(event) => setConsultInput(event.target.value)}
 393 |             />
 394 |             <div style={S.actionRow}>
 395 |               <button type="button" style={S.primaryBtn} onClick={handleConsult}>
 396 |                 {consulting ? "Consulting runtime..." : "Run consult-only sample"}
 397 |               </button>
 398 |               <button
 399 |                 type="button"
 400 |                 style={S.ghostBtn}
 401 |                 onClick={() => {
 402 |                   setConsultInput("Clawdia, ask Data to review the safest architecture boundary.");
 403 |                   setConsultResult(null);
 404 |                 }}
 405 |               >
 406 |                 Load systems example
 407 |               </button>
 408 |               <button
 409 |                 type="button"
 410 |                 style={S.ghostBtn}
 411 |                 onClick={() => {
 412 |                   setConsultInput("Clawdia, ask Mouth to tighten this outreach wording without overclaiming.");
 413 |                   setConsultResult(null);
 414 |                 }}
 415 |               >
 416 |                 Load messaging example
 417 |               </button>
...
 433 |                   </div>
 434 |                   <div>
 435 |                     <h2 style={S.cardTitle}>{agent.name}</h2>
 436 |                     <p style={S.role}>{agent.role}</p>
 437 |                     {agent.llm_backed ? (
 438 |                       <div style={{ ...S.badge("rgba(16,185,129,0.16)", "#6EE7B7"), marginTop: 8 }}>
 439 |                         LLM-backed
 440 |                       </div>
 441 |                     ) : null}
...
 444 | 
 445 |                 <p style={S.desc}>{agent.short_description}</p>
 446 | 
 447 |                 <div style={S.cardActions}>
 448 |                   <button type="button" style={S.primaryBtn} onClick={() => prepareConsult(agent)}>
 449 |                     Consult
 450 |                   </button>
 451 |                 </div>
 452 | 
 453 |                 <div style={S.kvList}>
 454 |                   <div style={S.kvRow}>
 455 |                     <span style={S.kvKey}>Consult lane</span>
 456 |                     <span style={S.kvValue}>{agent.consult_lane}</span>
 457 |                   </div>
 458 |                   <div style={S.kvRow}>
 459 |                     <span style={S.kvKey}>Status</span>
```

### Registry service exposes Willy docs and bench status
- File: C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/services/gooniesRegistryService.js

```
  24 | import dataKnowledgeBaseRaw from "../../../../docs/internal/goonies/data/KNOWLEDGE_BASE.md?raw";
  25 | import andySoulRaw from "../../../../docs/internal/goonies/andy/SOUL.md?raw";
  26 | import andyMemoryRaw from "../../../../docs/internal/goonies/andy/MEMORY.md?raw";
  27 | import andyKnowledgeBaseRaw from "../../../../docs/internal/goonies/andy/KNOWLEDGE_BASE.md?raw";
  28 | import willySoulRaw from "../../../../docs/internal/goonies/willy/SOUL.md?raw";
  29 | import willyMemoryRaw from "../../../../docs/internal/goonies/willy/MEMORY.md?raw";
  30 | import willyKnowledgeBaseRaw from "../../../../docs/internal/goonies/willy/KNOWLEDGE_BASE.md?raw";
  31 | import willyPlaybookRaw from "../../../../docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md?raw";
  32 | import willySystemPromptRaw from "../../../../docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md?raw";
  33 | 
  34 | export const ADVISORY_PLACEHOLDER_ASSET = "/assets/goonies/advisory-placeholder.svg";
  35 | 
  36 | const DOC_CONTENT_BY_PATH = {
...
  57 |   "docs/internal/goonies/data/KNOWLEDGE_BASE.md": dataKnowledgeBaseRaw,
  58 |   "docs/internal/goonies/andy/SOUL.md": andySoulRaw,
  59 |   "docs/internal/goonies/andy/MEMORY.md": andyMemoryRaw,
  60 |   "docs/internal/goonies/andy/KNOWLEDGE_BASE.md": andyKnowledgeBaseRaw,
  61 |   "docs/internal/goonies/willy/SOUL.md": willySoulRaw,
  62 |   "docs/internal/goonies/willy/MEMORY.md": willyMemoryRaw,
  63 |   "docs/internal/goonies/willy/KNOWLEDGE_BASE.md": willyKnowledgeBaseRaw,
  64 |   "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md": willyPlaybookRaw,
  65 |   "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md": willySystemPromptRaw,
  66 | };
  67 | 
  68 | const GOONIE_DOC_PATHS_BY_ID = {
  69 |   chunk: {
...
  95 |     soulPath: "docs/internal/goonies/andy/SOUL.md",
  96 |     memoryPath: "docs/internal/goonies/andy/MEMORY.md",
  97 |     knowledgeBasePath: "docs/internal/goonies/andy/KNOWLEDGE_BASE.md",
  98 |   },
  99 |   willy: {
 100 |     soulPath: "docs/internal/goonies/willy/SOUL.md",
 101 |     memoryPath: "docs/internal/goonies/willy/MEMORY.md",
 102 |     knowledgeBasePath: "docs/internal/goonies/willy/KNOWLEDGE_BASE.md",
 103 |     playbookPath: "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md",
 104 |     systemPromptPath: "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md",
 105 |   },
 106 | };
 107 | 
 108 | export const GOONIES_SHARED_RULE_DOCS = [
...
 125 | 
 126 | export function getAdvisoryBenchAgents() {
 127 |   return (registry.agents || []).map((agent) => ({
 128 |     ...agent,
 129 |     statusLabel: agent.llm_backed ? "LLM-backed consult-only live" : String(agent.status || "docs_ready").replace(/_/g, " / "),
 130 |     placeholderAvatar: ADVISORY_PLACEHOLDER_ASSET,
 131 |   }));
 132 | }
 133 | 
```

### Shared brain exposes Willy consult, proof review, and stepping-away actions
- File: C:/Users/Peyto/clawdia-bot/sharedActionLayer.js

```
 422 | export function consultAndyAction({ question }) {
 423 |   return goonieConsultRuntime.consultAndy({ question });
 424 | }
 425 | 
 426 | export async function consultWillyAction({ question, taskId, proofPayload, situation, autoTrigger } = {}) {
 427 |   return willyConsultRuntime.consultWilly({
 428 |     question,
 429 |     taskId,
 430 |     proofPayload,
...
 475 | 
 476 | function getWorkerActionHandlers() {
 477 |   return {
 478 |     attachFileToEmailPreview: attachFileToEmailPreviewAction,
 479 |     autoSelectGoonieConsult: autoSelectGoonieConsultAction,
 480 |     appendApprovedDocText: appendApprovedDocTextAction,
 481 |     consultAndy: consultAndyAction,
 482 |     consultBrand: consultBrandAction,
 483 |     consultChunk: consultChunkAction,
 484 |     consultData: consultDataAction,
 485 |     consultGoonie: consultGoonieAction,
 486 |     consultMikey: consultMikeyAction,
 487 |     consultMouth: consultMouthAction,
 488 |     consultWilly: consultWillyAction,
 489 |     checkRailwayStatus: checkRailwayStatusAction,
 490 |     confirmRailwayWebhookHealth: confirmRailwayWebhookHealthAction,
 491 |     createEmailPreview: createEmailPreviewAction,
 492 |     createVgbEmailPreview: createVgbEmailPreviewAction,
...
 497 |     readTaskQueue: () => readTaskQueueAction(),
 498 |     readRailwayLogs: readRailwayLogsAction,
 499 |     reportStatus: () => reportStatusAction(),
 500 |     restartRailwayService: restartRailwayServiceAction,
 501 |     reviewProofWithWilly: reviewProofWithWillyAction,
 502 |     routeTaskToCodex: routeTaskToCodexAction,
 503 |     runWillySteppingAway: runWillySteppingAwayAction,
 504 |     runCompanyCamStatus: () => runCompanyCamStatusAction(),
 505 |     sendEmail: sendEmailAction,
 506 |     updateTaskQueue: (payload) => updateTaskQueueAction(payload),
 507 |     updateTaskQueueBatch: (payload) =>
...
 533 | }
 534 | 
 535 | export const sharedActionLayer = {
 536 |   attachFileToEmailPreview: attachFileToEmailPreviewAction,
 537 |   autoSelectGoonieConsult: autoSelectGoonieConsultAction,
 538 |   appendApprovedDocText: appendApprovedDocTextAction,
 539 |   consultAndy: consultAndyAction,
 540 |   consultBrand: consultBrandAction,
 541 |   consultChunk: consultChunkAction,
 542 |   consultData: consultDataAction,
 543 |   consultGoonie: consultGoonieAction,
 544 |   consultMikey: consultMikeyAction,
 545 |   consultMouth: consultMouthAction,
 546 |   consultWilly: consultWillyAction,
 547 |   checkRailwayStatus: checkRailwayStatusAction,
 548 |   confirmRailwayWebhookHealth: confirmRailwayWebhookHealthAction,
 549 |   createEmailPreview: createEmailPreviewAction,
 550 |   createVgbEmailPreview: createVgbEmailPreviewAction,
...
 557 |   readRailwayLogs: readRailwayLogsAction,
 558 |   readTaskQueue: readTaskQueueAction,
 559 |   reportStatus: reportStatusAction,
 560 |   restartRailwayService: restartRailwayServiceAction,
 561 |   reviewProofWithWilly: reviewProofWithWillyAction,
 562 |   routeTaskToCodex: routeTaskToCodexAction,
 563 |   runWillySteppingAway: runWillySteppingAwayAction,
 564 |   runCompanyCamStatus: runCompanyCamStatusAction,
 565 |   sendEmail: sendEmailAction,
 566 |   updateTaskQueue: updateTaskQueueAction,
 567 |   updateTaskQueueBatch: updateTaskQueueBatchAction,
```

### Worker proof review and repeated blocker flow call Willy
- File: C:/Users/Peyto/clawdia-bot/workerLoop.js

```
 211 |     now
 212 |   );
 213 | }
 214 | 
 215 | async function forceProgressPastBlocker(state, task, bot, now = new Date()) {
 216 |   const repeatCount = Number(task?.repeat_blocker_count || 0);
 217 |   const rerouteCount = Number(task?.reroute_count || 0);
 218 |   const willyReview = await sharedActionLayer.consultWilly({
 219 |     question: "Clawdia, ask Willy whether to park or reroute this.",
...
 230 |   if (willyRecommendation === "ASK CHRIS") {
 231 |     return markTaskParked(
 232 |       state,
 233 |       task,
 234 |       willyReason || "Willy advised asking Chris before continuing this blocker path.",
 235 |       willyNextAction || "Wait for Chris inspection before retrying or unparking this task.",
 236 |       bot,
 237 |       now
 238 |     );
...
 302 |     type: "stale_work_park_requested",
 303 |     task_id: staleTask.task_id,
 304 |     minutes_stale: Math.floor(minutesSince(staleTask.last_update, now)),
 305 |   });
 306 |   await forceProgressPastBlocker(state, blockedTask || staleTask, bot, now);
 307 |   return true;
 308 | }
 309 | 
 310 | async function processProofReview(state, bot, now = new Date()) {
 311 |   const proofTask = state.tasks
 312 |     .filter((task) => task.status === "proof_received")
 313 |     .sort((left, right) => left.job_number - right.job_number)[0];
 314 |   if (!proofTask) {
 315 |     return false;
 316 |   }
 317 | 
 318 |   const willyReview = await sharedActionLayer.reviewProofWithWilly({
 319 |     taskId: proofTask.task_id,
 320 |     proofPayload: proofTask.proof_payload || null,
 321 |     question: "Clawdia, ask Willy if this proof is good.",
 322 |     autoTrigger: "proof_review",
...
 330 |   if (willyRecommendation === "ASK CHRIS") {
 331 |     await markTaskParked(
 332 |       state,
 333 |       proofTask,
 334 |       willyReason || "Willy advised Chris inspection before this proof is accepted.",
 335 |       willyNextAction || "Wait for Chris inspection of the proof before continuing.",
 336 |       bot,
 337 |       now
 338 |     );
...
 346 |   if (willyRecommendation === "PARK") {
 347 |     await markTaskParked(
 348 |       state,
 349 |       proofTask,
 350 |       willyReason || "Willy advised parking this task instead of forcing a bad completion.",
 351 |       willyNextAction || "Park this task and continue to the next safe queued work.",
 352 |       bot,
 353 |       now
 354 |     );
...
 370 |     appendQueueEvent(state, {
 371 |       type: "proof_bad",
 372 |       task_id: proofTask.task_id,
 373 |     });
 374 |     await forceProgressPastBlocker(state, blockedTask || proofTask, bot, now);
 375 |     return true;
 376 |   }
 377 | 
 378 |   const completed = updateTaskInState(
...
 571 |       taskId: nextTask.task_id,
 572 |       jobNumber: nextTask.job_number,
 573 |       blocker: blockedMessage,
 574 |     });
 575 |     await forceProgressPastBlocker(state, updated || nextTask, bot, now);
 576 |     return true;
 577 |   }
 578 | 
 579 |   updateTaskInState(
...
 764 |   buildHeartbeatMessage,
 765 |   buildIdleMessage,
 766 |   buildProofSignature,
 767 |   detectStaleTruthConflict,
 768 |   forceProgressPastBlocker,
 769 |   hasUsableProof,
 770 |   createSerializedTaskQueueRunner,
 771 |   maybeSendEndOfDayReport,
 772 |   maybeSendHeartbeat,
```

### Telegram/dashboard routing and stepping-away trigger recognize Willy
- File: C:/Users/Peyto/clawdia-bot/intentRouter.js

```
  24 | const CLOUD_TRANSFER_CONFIRMATION = "CONFIRM COMPANYCAM CLOUD TRANSFER 2026";
  25 | const CLOUD_MANIFEST_FILENAME = "companycam_sync_manifest.json";
  26 | const CLOUD_TRANSFER_LOG_FILENAME = "companycam_2026_transfer_log.json";
  27 | const CLOUD_SYSTEM_SYNC_SEGMENTS = ["_System", "CompanyCam Sync"];
  28 | const GOONIE_IDS = ["chunk", "mikey", "mouth", "brand", "data", "andy", "willy"];
  29 | const GOONIE_ALIASES = {
  30 |   chunk: ["chunk"],
  31 |   mikey: ["mikey"],
  32 |   mouth: ["mouth"],
  33 |   brand: ["brand"],
...
 333 |   }
 334 |   return /\b(what is|what's|who is|who's|what does|job|role|responsibilit|best at|what do)\b/i.test(lower);
 335 | }
 336 | 
 337 | function isGoonieConsultIntentText(text) {
 338 |   const lower = toLowerText(text);
 339 |   return (
 340 |     isGoonieRoleQuestionText(lower) ||
 341 |     Boolean(identifyNamedGoonieId(lower)) ||
...
1188 |     );
1189 |     return true;
1190 |   }
1191 | 
1192 |   if (intent.action === "review_proof") {
1193 |     const brainStatus = getClawdiaBrainConfigStatus();
1194 |     const reviewResult = brainStatus.configured
1195 |       ? await invokeSharedBrainConsultOrAction(
1196 |           "reviewProofWithWilly",
...
1213 |       message.chat.id,
1214 |       reviewResult.ok ? reviewResult.payload.response : reviewResult.message,
1215 |       {
1216 |         category: "goonie_consult",
1217 |         action: "review_proof",
1218 |         mode: brainStatus.configured ? "shared_brain" : "embedded_runtime",
1219 |       }
1220 |     );
1221 |     return true;
```

### Willy runtime reads env names, calls OpenAI, and falls back through Railway by name only
- File: C:/Users/Peyto/clawdia-bot/willyConsultRuntime.js

```
 315 |     },
 316 |   };
 317 | }
 318 | 
 319 | function resolveWillyRuntimeConfig() {
 320 |   const enabledRaw = normalizeText(process.env.WILLY_ENABLED);
 321 |   const enabled = enabledRaw ? enabledRaw.toLowerCase() === "true" : true;
 322 |   const provider = normalizeLower(process.env.WILLY_LLM_PROVIDER || DEFAULT_WILLY_PROVIDER);
 323 |   const model = normalizeText(process.env.WILLY_MODEL || process.env.OPENAI_MODEL || DEFAULT_WILLY_MODEL);
...
 347 |   const envNames = Array.isArray(names) ? names.filter(Boolean) : [normalizeText(names)].filter(Boolean);
 348 |   return `Missing required env var name(s): ${envNames.join(", ")}`;
 349 | }
 350 | 
 351 | async function runOpenAiConsultDirect(promptPayload, config, systemPrompt) {
 352 |   const client = new OpenAI({ apiKey: normalizeText(process.env.OPENAI_API_KEY) });
 353 |   const completion = await client.chat.completions.create({
 354 |     model: config.model,
 355 |     temperature: 0.2,
...
 639 |     "should i ask chris",
 640 |   ].some((keyword) => lower.includes(keyword));
 641 | }
 642 | 
 643 | export async function consultWillyAction(payload = {}) {
 644 |   const context = buildWillyContextBundle(payload);
 645 |   const config = resolveWillyRuntimeConfig();
 646 | 
 647 |   if (!config.enabled) {
```

### Railway-backed Willy CLI accepts JSON and returns structured consult output
- File: C:/Users/Peyto/clawdia-bot/willyConsultCli.js

```
   1 | import { stdin, stdout } from "node:process";
   2 | import { consultWillyAction } from "./willyConsultRuntime.js";
   3 | 
   4 | function readStdin() {
   5 |   return new Promise((resolve, reject) => {
   6 |     let buffer = "";
...
  15 | 
  16 | async function main() {
  17 |   const rawInput = await readStdin();
  18 |   const parsed = rawInput ? JSON.parse(rawInput) : {};
  19 |   const result = await consultWillyAction({
  20 |     question: parsed?.promptPayload?.question || "",
  21 |     situation: parsed?.promptPayload?.situation || "",
  22 |     autoTrigger: parsed?.promptPayload?.autoTrigger || "",
  23 |     requestedBy: parsed?.promptPayload?.requestedBy || "Clawdia",
```

## 4. LLM-backed proof

Provider and config are read by name only in [clawdia-bot/willyConsultRuntime.js](C:/Users/Peyto/clawdia-bot/willyConsultRuntime.js).
- WILLY_ENABLED
- WILLY_LLM_PROVIDER
- WILLY_MODEL
- WILLY_SYSTEM_PROMPT_PATH
- WILLY_MEMORY_PATH
- OPENAI_API_KEY (name only; value never printed)
- OPENAI_MODEL fallback by name only

Live consult proof reported:
- runtime mode: railway_env_fallback
- provider_name: openai
- model_name: gpt-4o

## 5. Smoke test stdout excerpts

### npm run smoke:willy-runtime

```text
�� 
 >   c l a w d i a - b o t @ 1 . 0 . 0   s m o k e : w i l l y - r u n t i m e  
 >   n o d e   s m o k e - w i l l y - r u n t i m e . m j s  
  
 [ c l a w d i a - b o t ]   w o r k e r   l o o p   s t a r t e d   {   i n t e r v a l M s :   2 0 0 ,   h e a r t b e a t M i n u t e s :   4 5 ,   e n d O f D a y H o u r :   1 7   }  
 n o d e . e x e   :   ( n o d e : 1 7 9 0 0 )   [ D E P 0 1 9 0 ]   D e p r e c a t i o n W a r n i n g :   P a s s i n g   a r g s   t o   a   c h i l d   p r o c e s s   w i t h   s h e l l   o p t i o n   t r u e   c a n   l e a d    
 t o   s e c u r i t y   v u l n e r a b i l i t i e s ,   a s   t h e   a r g u m e n t s   a r e   n o t   e s c a p e d ,   o n l y   c o n c a t e n a t e d .  
 A t   l i n e : 1   c h a r : 1  
 +   &   " C : \ P r o g r a m   F i l e s \ n o d e j s / n o d e . e x e "   " C : \ P r o g r a m   F i l e s \ n o d e j s / n o d e _ m o   . . .  
 +   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~  
         +   C a t e g o r y I n f o                     :   N o t S p e c i f i e d :   ( ( n o d e : 1 7 9 0 0 )   [ D . . . y   c o n c a t e n a t e d . : S t r i n g )   [ ] ,   R e m o t e E x c e p t i o n  
         +   F u l l y Q u a l i f i e d E r r o r I d   :   N a t i v e C o m m a n d E r r o r  
    
 ( U s e   ` n o d e   - - t r a c e - d e p r e c a t i o n   . . . `   t o   s h o w   w h e r e   t h e   w a r n i n g   w a s   c r e a t e d )  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   a c t i v a t e d   {   t a s k I d :   ' w i l l y - s a f e - n e x t - t a s k ' ,   j o b N u m b e r :   1 ,   a s s i g n e d T o :   ' a t l a s '   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   r o u t e d   {   t a s k I d :   ' w i l l y - s a f e - n e x t - t a s k ' ,   j o b N u m b e r :   1 ,   a s s i g n e d T o :   ' a t l a s '   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   b l o c k e d   {  
     t a s k I d :   ' w i l l y - s a f e - n e x t - t a s k ' ,  
     j o b N u m b e r :   1 ,  
     b l o c k e r :   ' U n a u t h o r i z e d . '  
 }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   p a r k e d   {  
     t a s k I d :   ' w i l l y - s a f e - n e x t - t a s k ' ,  
     j o b N u m b e r :   1 ,  
     b l o c k e r :   ' W i l l y   a d v i s e d   P A R K   w i t h   h i g h   c o n f i d e n c e . '  
 }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   a c t i v a t e d   {   t a s k I d :   ' w i l l y - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   2 ,   a s s i g n e d T o :   ' c l a w d i a '   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   r o u t e d   {   t a s k I d :   ' w i l l y - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   2 ,   a s s i g n e d T o :   ' c l a w d i a '   }  
 [ c l a w d i a - b o t ]   w o r k e r   p r o o f   r e c e i v e d   {   t a s k I d :   ' w i l l y - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   2   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   c o m p l e t e   {   t a s k I d :   ' w i l l y - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   2 ,   t e s t s P a s s e d :   t r u e   }  
 w i l l y   r u n t i m e   s m o k e   t e s t s   p a s s e d  
 
```

### npm run smoke:goonie-runtime

```text
�� 
 >   c l a w d i a - b o t @ 1 . 0 . 0   s m o k e : g o o n i e - r u n t i m e  
 >   n o d e   s m o k e - g o o n i e - r u n t i m e . m j s  
  
 [ c l a w d i a - b o t ]   w o r k e r   l o o p   s t a r t e d   {   i n t e r v a l M s :   2 0 0 ,   h e a r t b e a t M i n u t e s :   4 5 ,   e n d O f D a y H o u r :   1 7   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   a c t i v a t e d   {   t a s k I d :   ' g o o n i e - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   1 ,   a s s i g n e d T o :   ' c l a w d i a '   }  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   r o u t e d   {   t a s k I d :   ' g o o n i e - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   1 ,   a s s i g n e d T o :   ' c l a w d i a '   }  
 [ c l a w d i a - b o t ]   w o r k e r   p r o o f   r e c e i v e d   {   t a s k I d :   ' g o o n i e - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   1   }  
 n o d e . e x e   :   ( n o d e : 4 8 5 6 )   [ D E P 0 1 9 0 ]   D e p r e c a t i o n W a r n i n g :   P a s s i n g   a r g s   t o   a   c h i l d   p r o c e s s   w i t h   s h e l l   o p t i o n   t r u e   c a n   l e a d    
 t o   s e c u r i t y   v u l n e r a b i l i t i e s ,   a s   t h e   a r g u m e n t s   a r e   n o t   e s c a p e d ,   o n l y   c o n c a t e n a t e d .  
 A t   l i n e : 1   c h a r : 1  
 +   &   " C : \ P r o g r a m   F i l e s \ n o d e j s / n o d e . e x e "   " C : \ P r o g r a m   F i l e s \ n o d e j s / n o d e _ m o   . . .  
 +   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~  
         +   C a t e g o r y I n f o                     :   N o t S p e c i f i e d :   ( ( n o d e : 4 8 5 6 )   [ D E . . . y   c o n c a t e n a t e d . : S t r i n g )   [ ] ,   R e m o t e E x c e p t i o n  
         +   F u l l y Q u a l i f i e d E r r o r I d   :   N a t i v e C o m m a n d E r r o r  
    
 ( U s e   ` n o d e   - - t r a c e - d e p r e c a t i o n   . . . `   t o   s h o w   w h e r e   t h e   w a r n i n g   w a s   c r e a t e d )  
 [ c l a w d i a - b o t ]   w o r k e r   t a s k   c o m p l e t e   {   t a s k I d :   ' g o o n i e - q u e u e - c o n s u l t ' ,   j o b N u m b e r :   1 ,   t e s t s P a s s e d :   t r u e   }  
 g o o n i e   r u n t i m e   s m o k e   t e s t s   p a s s e d  
 
```

### npm run build

```text
�� 
 >   b u i l d  
 >   v i t e   b u i l d  
  
  [ 3 6 m v i t e   v 5 . 4 . 1 1    [ 3 2 m b u i l d i n g   f o r   p r o d u c t i o n . . .  [ 3 6 m  [ 3 9 m  
 t r a n s f o r m i n g . . .  
  [ 3 2 m ' [ 3 9 m   1 5 8   m o d u l e s   t r a n s f o r m e d .  
 r e n d e r i n g   c h u n k s . . .  
 c o m p u t i n g   g z i p   s i z e . . .  
  [ 2 m d i s t /  [ 2 2 m  [ 3 2 m i n d e x . h t m l                                                              [ 3 9 m  [ 1 m  [ 2 m     0 . 3 3   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     0 . 2 4   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 2 m a s s e t s / a v a t a r - C H c - 9 1 a m . r i v                              [ 3 9 m  [ 1 m  [ 2 m 8 1 7 . 7 5   k B  [ 2 2 m  [ 1 m  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / n j o r d C o n f i g - D n d B v O n K . j s                      [ 3 9 m  [ 1 m  [ 2 m     0 . 2 9   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     0 . 2 2   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / a d m i n g a t e - d D L 5 7 R L l . j s                          [ 3 9 m  [ 1 m  [ 2 m     2 . 2 3   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     1 . 1 2   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / M i s s i o n C o n t r o l G a t e - B E T u U K W Y . j s        [ 3 9 m  [ 1 m  [ 2 m     2 . 7 3   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     1 . 2 8   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / S u c c e s s S c r e e n - p D U 8 K _ q 1 . j s                  [ 3 9 m  [ 1 m  [ 2 m     3 . 1 7   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     1 . 2 5   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / M i s s i o n C o n t r o l H o m e - D 4 _ S n Q V p . j s        [ 3 9 m  [ 1 m  [ 2 m     4 . 6 3   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     2 . 0 9   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / s e s s i o n s v i e w - m o E p _ 9 h K . j s                    [ 3 9 m  [ 1 m  [ 2 m     5 . 7 9   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     2 . 1 5   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / A q u a t r a c e D a s h b o a r d - D 0 D P X M d I . j s        [ 3 9 m  [ 1 m  [ 2 m     8 . 8 0   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     2 . 5 7   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / N j o r d M i s s i o n C o n t r o l - G J J u R T P N . j s      [ 3 9 m  [ 1 m  [ 2 m   1 7 . 5 0   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :     7 . 0 0   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / N j o r d S h e l l - D m z - m U M u . j s                        [ 3 9 m  [ 1 m  [ 2 m 1 8 8 . 8 7   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :   4 8 . 8 9   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / A g e n t A r c h i t e c t S h e l l - C G B V R 2 u 6 . j s      [ 3 9 m  [ 1 m  [ 2 m 2 2 4 . 3 5   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :   7 0 . 7 0   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / i n d e x - B Z M h u 2 I Q . j s                                  [ 3 9 m  [ 1 m  [ 2 m 2 3 4 . 7 4   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :   7 4 . 9 6   k B  [ 2 2 m  
  [ 2 m d i s t /  [ 2 2 m  [ 3 6 m a s s e t s / f i r e b a s e - B c m P x i E G . j s                            [ 3 9 m  [ 1 m  [ 2 m 3 4 3 . 3 4   k B  [ 2 2 m  [ 1 m  [ 2 2 m  [ 2 m   %  g z i p :   8 5 . 3 5   k B  [ 2 2 m  
  [ 3 2 m '  b u i l t   i n   2 . 1 6 s  [ 3 9 m  
 
```

### Exact Willy outputs captured from the runtime cases

#### named_willy_consult

```text
WILLY CONSULT RESPONSE

SITUATION:
- Clawdia, ask Willy if this proof is good. The proof is only a generic update with no files changed and no tests.
RECOMMENDATION:
- REJECT

REASON:
- The proof is generic with no files changed and no tests, indicating a lack of substantive evidence to support any meaningful progress or completion.
PROOF QUALITY:
- weak

NEXT ACTION FOR CLAWDIA:
- Move to the next safe task in the queue.
ASK CHRIS:
- no
- reason: There is no approval gate or owner decision required for this situation.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The absence of file changes and tests clearly indicates weak proof, aligning with standard judgment rules.
```

#### proof_review_consult

```text
WILLY CONSULT RESPONSE

SITUATION:
- Proof review requested. Decide whether Clawdia should accept, reject, reroute, park, continue, or ask Chris.
RECOMMENDATION:
- REJECT

REASON:
- The proof payload indicates that only a generic status note was returned, and no tests were run or passed. This constitutes missing proof, which should bias toward rejecting the task rather than accepting it as complete.
PROOF QUALITY:
- missing

NEXT ACTION FOR CLAWDIA:
- Reject the current proof and request a more detailed and specific proof package that includes test results.
ASK CHRIS:
- no
- reason: There is no indication that Chris's approval is needed for this decision as it does not involve an approval gate or a true owner decision.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The decision to reject is based on clear criteria from the Willy Playbook that missing proof should not be accepted as complete.
```

#### repeated_blocker_consult

```text
WILLY CONSULT RESPONSE

SITUATION:
- The same blocker repeated after one reroute and there is no new proof.
RECOMMENDATION:
- PARK

REASON:
- The task has already been rerouted once and the blocker has repeated without any new proof. According to the decision rules, parking is usually safer than repeating explanation in such cases.
PROOF QUALITY:
- missing

NEXT ACTION FOR CLAWDIA:
- Continue with the next safe task in the queue.
ASK CHRIS:
- no
- reason: There is no approval gate or true owner decision required in this situation.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The situation aligns with the established rule that repeated blockers after rerouting should be parked, and there is no new proof to suggest otherwise.
```

#### stepping_away_trigger

```text
WILLY CONSULT RESPONSE

SITUATION:
- Clawdia is stepping away and needs guidance on the next action.
RECOMMENDATION:
- PARK

REASON:
- The queue is idle with no safe tasks available to continue. The top blocker has been parked with high confidence, and there is no immediate action required from Chris.
PROOF QUALITY:
- not applicable

NEXT ACTION FOR CLAWDIA:
- Wait for the next safe queued task to become available.
ASK CHRIS:
- no
- reason: There is no approval gate or decision requiring Chris's input at this time.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The queue state clearly indicates no tasks are queued or working, and the top blocker is parked with a clear next action to wait.
```

#### queued_willy_worker_consult

```text
WILLY CONSULT RESPONSE

SITUATION:
- One safe queued task remains and no approval gate is active.
RECOMMENDATION:
- CONTINUE

REASON:
- There is a safe queued task available, and no approval gate is currently active. Continuing with the next safe task aligns with the default judgment rules to keep progress moving forward.
PROOF QUALITY:
- not applicable

NEXT ACTION FOR CLAWDIA:
- Proceed with the next safe task in the queue: Job 2 - Worker should execute Willy consult.
ASK CHRIS:
- no
- reason: No approval gate or owner decision is required for the next step.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The situation is straightforward with a clear next step and no conflicting information or approval requirements.
```

## 6. Safety proof in code

Safety is enforced in two places:
- Registry: Willy is declared consult_only true, can_execute false, can_contact_clients false, can_send_messages false, can_publish false, can_use_tools_directly false.
- Runtime payloads: Willy consult actions return consult_only true, can_execute false, llm_backed true, and do not expose any send/publish/execute path.

Proof references:
- [docs/internal/goonies/GOONIES_DASHBOARD_REGISTRY.json](C:/Users/Peyto/NexTeam-Studio/docs/internal/goonies/GOONIES_DASHBOARD_REGISTRY.json) Willy entry
- [clawdia-bot/sharedActionLayer.js](C:/Users/Peyto/clawdia-bot/sharedActionLayer.js) Willy action payloads
- [clawdia-bot/willyConsultRuntime.js](C:/Users/Peyto/clawdia-bot/willyConsultRuntime.js) runtime response object

## 7. Dashboard visibility proof

- Screenshot artifact: [WILLY_ADVISORY_BENCH_PROOF.png](C:/Users/Peyto/NexTeam-Studio/docs/internal/goonies/willy/WILLY_ADVISORY_BENCH_PROOF.png)
- Rendered page text observed: One-Eyed Willy | Nova-like Proof / Judgment / Next-Step Advisor | LLM-backed | proof_review_next_step | LLM-backed consult-only live | can_execute false | consult_only true | View SOUL | View MEMORY | View KNOWLEDGE BASE | View PLAYBOOK | View SYSTEM PROMPT

## 8. One live manual dashboard test result

### Manual dashboard invocation 1
- Prompt: Clawdia, ask Willy if this proof is good.

```text
WILLY CONSULT RESPONSE

SITUATION:
- Clawdia, ask Willy if this proof is good.
RECOMMENDATION:
- REJECT

REASON:
- The proof payload is missing, making it impossible to assess proof quality. Without proof, the task cannot be marked as complete or progressed.
PROOF QUALITY:
- missing

NEXT ACTION FOR CLAWDIA:
- Ensure that the proof payload is provided or request it from the responsible party before proceeding.
ASK CHRIS:
- no
- reason: Chris is not needed as this is a proof quality issue, not an approval gate or owner decision.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The absence of a proof payload is a clear and objective reason to reject the proof quality assessment.
```

### Manual dashboard invocation 2
- Prompt: Clawdia, ask One-Eyed Willy what the next clue is.

```text
WILLY CONSULT RESPONSE

SITUATION:
- Clawdia is asking for the next clue or action in a situation where the queue is idle and the top blocker is parked.
RECOMMENDATION:
- CONTINUE

REASON:
- The queue is currently idle with no active tasks, and the top blocker is parked with a recommendation to continue with the next safe task. Since there are no queued tasks, Clawdia should prepare for the next safe task or wait for new tasks to be added to the queue.
PROOF QUALITY:
- not applicable

NEXT ACTION FOR CLAWDIA:
- Monitor for new tasks to be added to the queue and prepare to continue with the next safe task when available.
ASK CHRIS:
- no
- reason: There is no approval gate or owner decision required at this moment.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The queue state clearly indicates no active tasks and a parked blocker with a clear next action to continue when possible.
```

### Manual dashboard invocation 3
- Prompt: Clawdia, I am stepping away.

```text
WILLY CONSULT RESPONSE

SITUATION:
- Clawdia is stepping away with no active tasks running and a parked task in the queue.
RECOMMENDATION:
- PARK

REASON:
- The queue is currently idle with no safe tasks available to continue. The top blocker is already parked with high confidence, and there are no new tasks queued or in progress.
PROOF QUALITY:
- not applicable

NEXT ACTION FOR CLAWDIA:
- Wait for the next safe queued task or new instructions.
ASK CHRIS:
- no
- reason: There is no approval gate or owner decision required at this time.

MEMORY UPDATE NEEDED:
- no
- what to save: nothing

CONFIDENCE:
- high

CONFIDENCE REASON:
- The queue state clearly indicates no active tasks and a parked status for the top blocker, aligning with previous high-confidence advice.
```

## 9. File placement clarification

Willy runtime lives in `C:/Users/Peyto/clawdia-bot` because that repo owns the shared brain, worker loop, queue state, proof review actions, Telegram front door, and the approved env-backed LLM execution path.

Willy dashboard/registry/docs live in `C:/Users/Peyto/NexTeam-Studio` because that repo owns the Advisory Bench UI, the dashboard consult composer, the rendered agent registry, and the internal truth docs used by mission control.

Invocation boundary:
- dashboard chat or Advisory Bench consult composer in NexTeam-Studio
- `maybeRunGoonieConsult(...)` in [src/features/missioncontrol/services/gooniesConsultService.js](C:/Users/Peyto/NexTeam-Studio/src/features/missioncontrol/services/gooniesConsultService.js)
- shared-brain/public consult path exposed by clawdia-bot
- [clawdia-bot/sharedActionLayer.js](C:/Users/Peyto/clawdia-bot/sharedActionLayer.js) routes Willy actions
- [clawdia-bot/willyConsultRuntime.js](C:/Users/Peyto/clawdia-bot/willyConsultRuntime.js) performs the live LLM consult
- WILLY CONSULT RESPONSE text returns to dashboard chat/composer

## 10. Acceptance checklist response

- Willy visible: yes (section 2 registry entry, section 7 screenshot/output proof)
- Willy LLM-backed: yes (section 3 willyConsultRuntime.js snippet, section 4 provider/model proof, section 5 runtime outputs)
- Willy callable: yes (section 3 routing snippets, section 8 manual invocations)
- stepping-away trigger works: yes (section 3 routing snippets, section 8 invocation 3)
- consult-only: yes (section 2 registry entry, section 6 safety proof)
- no execution authority: yes (section 2 registry entry, section 6 safety proof)
