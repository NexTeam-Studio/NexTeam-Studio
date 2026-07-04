import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  buildBragiPackageSkeleton,
  getBragiContinuitySchedule,
  loadAquatraceBragiLibrary,
  maybeGenerateBragiArticlePackage,
  selectBragiTopic,
} from "../src/features/missioncontrol/services/bragiContinuityService.js";

const SOUL_PATH = join(process.cwd(), "docs", "BRAGI_SOUL.md");
const LOG_DIR = join(process.cwd(), "tmp-proof");
const LOG_PATH = join(LOG_DIR, "bragi-cron-dry-run.json");
const DEFAULT_INTERVAL_MINUTES = 1440;
const DEFAULT_SERVER_BASE_URL = process.env.BRAGI_SERVER_BASE_URL || "http://127.0.0.1:3001";

function parseArgs(argv) {
  const args = new Set(argv);
  const intervalArg = argv.find((value) => value.startsWith("--interval-minutes="));
  const topicArg = argv.find((value) => value.startsWith("--topic="));
  const serverBaseArg = argv.find((value) => value.startsWith("--server-base-url="));
  const intervalMinutes = intervalArg ? Number(intervalArg.split("=")[1]) : DEFAULT_INTERVAL_MINUTES;

  return {
    dryRun: !args.has("--live"),
    schedule: args.has("--schedule"),
    intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_INTERVAL_MINUTES,
    topicOverride: topicArg ? topicArg.slice("--topic=".length).trim() : "",
    serverBaseUrl: normalizeBaseUrl(serverBaseArg ? serverBaseArg.slice("--server-base-url=".length) : DEFAULT_SERVER_BASE_URL),
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function loadBragiSoul() {
  const soul = readFileSync(SOUL_PATH, "utf8");
  return {
    sourcePath: "docs/BRAGI_SOUL.md",
    sourceLoaded: true,
    mentionsLockedBuildOrder: soul.includes("## Locked Build Order"),
    mentionsFirstProofOfLife: soul.includes("## First Proof of Life"),
    excerpt: soul.split("\n").slice(0, 12).join("\n")
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("\n");
}

function buildPlannedArticleJob(topicOverride = "") {
  const now = new Date();
  const runId = `bragi-dry-run-${now.toISOString().replaceAll(":", "-")}`;
  const library = loadAquatraceBragiLibrary();
  const topic = selectBragiTopic({ topicOverride, library });
  const packageSkeleton = buildBragiPackageSkeleton({ topic, library });
  const schedule = getBragiContinuitySchedule();

  return {
    runId,
    lane: "Bragi Content Exception",
    mode: "dry-run",
    generatedAt: now.toISOString(),
    identitySource: "docs/BRAGI_SOUL.md",
    workflowStage: "cron-foundation",
    action: "planned-article-job-created",
    publishAction: "disabled",
    wordpressExecution: "draft-ready-but-not-triggered",
    emailDeliveryPath: "verified-server-route-available-when-live",
    dailyTopicCheck: schedule.dailyTopicCheck,
    weeklyDraftCreation: schedule.weeklyDraftCreation,
    plannedJob: {
      clientId: "aquatrace",
      topicSeed: topic.title,
      focusKeyphrase: packageSkeleton.focusKeyphrase,
      whyTopicChosen: packageSkeleton.whyTopicChosen,
      searchIntent: packageSkeleton.searchIntent,
      targetAudience: "local pool owners, hotel and HOA managers, property managers",
      requestedOutput: "article package planning only",
      nextUnlockedStep: "weekly draft creation",
      author: packageSkeleton.author,
      category: packageSkeleton.category,
      secondaryCategory: packageSkeleton.secondaryCategory,
    },
  };
}

async function readJsonOrText(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function executeLiveDraft(options) {
  const generated = await maybeGenerateBragiArticlePackage({
    topicOverride: options.topicOverride || undefined,
    dryRun: false,
  });
  const articlePackage = generated?.package || {};
  const contentHtml = articlePackage.contentHtml || normalizeParagraphs(articlePackage.articleText);

  if (!contentHtml) {
    throw new Error("Bragi live cron did not produce article content.");
  }

  const payload = {
    articlePackage: {
      ...articlePackage,
      contentHtml,
      commentStatus: articlePackage.commentStatus || "closed",
      pingStatus: articlePackage.pingStatus || "closed",
    },
    notifyEmail: true,
    notifyTelegram: false,
  };

  const response = await fetch(`${options.serverBaseUrl}/api/bragi/wordpress/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonOrText(response);

  if (!response.ok || !data?.ok) {
    const detail = typeof data === "string" ? data.slice(0, 300) : data?.error || `status ${response.status}`;
    throw new Error(`Live Bragi cron execution failed: ${detail}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    topic: generated?.topic || null,
    articlePackage: {
      title: articlePackage.title || null,
      slug: articlePackage.slug || null,
      focusKeyphrase: articlePackage.yoast?.focusKeyphrase || articlePackage.focusKeyphrase || null,
      contentHtmlPresent: Boolean(contentHtml),
    },
    route: `${options.serverBaseUrl}/api/bragi/wordpress/execute`,
    result: data.result,
  };
}

function persistPayload(payload) {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(LOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function persistDryRun(job, soulContext, options) {
  return persistPayload({
    ok: true,
    scheduler: {
      enabled: false,
      dryRunDefault: true,
      manualTriggerAvailable: true,
      scheduleRequested: options.schedule,
      intervalMinutes: options.intervalMinutes
    },
    soulContext,
    job
  });
}

async function persistLiveRun(soulContext, options) {
  const execution = await executeLiveDraft(options);
  return persistPayload({
    ok: true,
    scheduler: {
      enabled: options.schedule,
      dryRunDefault: false,
      liveMode: true,
      manualTriggerAvailable: true,
      scheduleRequested: options.schedule,
      intervalMinutes: options.intervalMinutes,
    },
    soulContext,
    execution,
  });
}

function logDryRunSummary(payload) {
  console.log(`[bragi-cron] governing source loaded: ${payload.soulContext.sourcePath}`);
  console.log(`[bragi-cron] dry-run safe: ${payload.scheduler.dryRunDefault ? "yes" : "no"}`);
  console.log(`[bragi-cron] planned job created: ${payload.job.runId}`);
  console.log(`[bragi-cron] log written: ${LOG_PATH}`);
}

function logLiveSummary(payload) {
  const notification = payload?.execution?.result?.notification?.email || {};
  console.log(`[bragi-cron] governing source loaded: ${payload.soulContext.sourcePath}`);
  console.log(`[bragi-cron] live draft route: ${payload.execution.route}`);
  console.log(`[bragi-cron] draft post id: ${payload.execution.result?.postId || "unknown"}`);
  console.log(`[bragi-cron] email attempted: ${notification.attempted === true ? "yes" : "no"}`);
  console.log(`[bragi-cron] email ok: ${notification.ok === true ? "yes" : "no"}`);
  console.log(`[bragi-cron] log written: ${LOG_PATH}`);
}

function startScheduleLoop(options, runOnceFactory) {
  const intervalMs = options.intervalMinutes * 60 * 1000;
  console.log(`[bragi-cron] schedule armed in ${options.dryRun ? "dry-run" : "live"} mode every ${options.intervalMinutes} minute(s)`);
  runOnceFactory();
  setInterval(runOnceFactory, intervalMs);
}

async function runOnce(options) {
  const soulContext = loadBragiSoul();

  if (options.dryRun) {
    const job = buildPlannedArticleJob(options.topicOverride);
    const payload = persistDryRun(job, soulContext, options);
    logDryRunSummary(payload);
    return payload;
  }

  const payload = await persistLiveRun(soulContext, options);
  logLiveSummary(payload);
  return payload;
}

const options = parseArgs(process.argv.slice(2));

if (options.schedule) {
  startScheduleLoop(options, () => {
    runOnce(options).catch((error) => {
      console.error(`[bragi-cron] ${error.message}`);
    });
  });
} else {
  runOnce(options).catch((error) => {
    console.error(`[bragi-cron] ${error.message}`);
    process.exitCode = 1;
  });
}
