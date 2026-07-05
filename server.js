import express from "express";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { createServer } from "http";
import { createReadStream, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { executeBragiWordpressDraft } from "./src/features/missioncontrol/services/bragiWordpressService.js";
import {
  GOOGLE_BUSINESS_PROFILE_LIVE_TEST_BLOCK_NOTE,
  createGoogleBusinessProfileRailService,
} from "./src/features/missioncontrol/services/googleBusinessProfileRailService.js";
import {
  attachTelegramMessageToDraft,
  buildDraftApprovalMessage,
  getBragiApprovalStatePath,
  handleTelegramApproval,
  loadApprovalState,
  registerPendingDraft,
  sendTelegramMessage,
} from "./src/features/missioncontrol/services/bragiTelegramApprovalService.js";
import {
  approveVgbCampaign,
  buildVgbDryRun,
  getVgbCampaignStatePath,
  loadVgbCampaignState,
  logVgbSendResult,
  verifyControlledSendProtection,
} from "./src/features/missioncontrol/services/vgbControlledCampaignService.js";
import { buildBragiNotificationEmail } from "./src/features/missioncontrol/services/bragiContinuityService.js";
import {
  applyTenantBootstrapClaims,
  resolveDefaultBootstrapTenantId,
  verifyFirebaseIdTokenFromAuthorizationHeader,
} from "./src/server/firebaseAuthClaimsService.js";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./src/server/firebaseAdminApp.js";
import { createFirebaseBlueprintRequestRepository } from "./src/server/firebaseBlueprintRequestRepository.js";
import { createBlueprintRequestLifecycleService } from "./src/server/blueprintRequestLifecycleService.js";
import {
  assertActorCanProvisionAgentSession,
  createFirebaseConversationTenantProvisioner,
  createFirebaseConversationTenantProvisioningDependencies,
} from "./src/server/firebaseConversationTenantProvisioningRepository.js";
import { createMissionControlOpsService } from "./src/server/missionControlOpsService.js";
import { answerNexiOperatorQuestion } from "./src/server/nexiOperatorQueryService.js";
import { createNexiV1Service } from "./src/server/nexiV1Service.js";
import { buildJobberAuthorizeUrl, exchangeJobberAuthorizationCode } from "./src/server/jobberService.js";
import { writeAnthropicUsageLog } from "./src/server/anthropicUsageLogService.js";
import { createOperationalQuestionService } from "./src/server/operationalQuestionService.js";
import { createCompanyCamRail } from "./src/features/missioncontrol/services/companyCamRailService.js";
import {
  answerCompanyCamReportQuestion,
  formatCompanyCamReportAnswer,
} from "./src/features/missioncontrol/services/companyCamQuestionService.js";
import { resolveCompanyCamProjectDetailQuestion } from "./src/server/companyCamProjectDetailLookupService.js";
import { assertTenantAccess, isPlatformOperator } from "./src/features/tenancy/services/tenantAccessPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadLocalEnv();
const app = express();
const PORT = process.env.PORT || 3001;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USERNAME = process.env.SMTP_USERNAME;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS;
const DEFAULT_OPERATIONAL_FROM_NAME = "Chris Sears - Aquatrace Swimming Pool Leak Detection";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || DEFAULT_OPERATIONAL_FROM_NAME;
const GOOGLE_OAUTH_CREDENTIALS_PATH = join(__dirname, "credentials", "nexteam-gmail-oauth.json");
const googleOAuthSettings = loadGoogleOAuthSettings();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || googleOAuthSettings.clientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || googleOAuthSettings.clientSecret;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || googleOAuthSettings.redirectUri;
const googleBusinessProfileRailService = createGoogleBusinessProfileRailService({
  appRoot: __dirname,
});
const GMAIL_SEND_FROM = process.env.GMAIL_SEND_FROM;
const GMAIL_SEND_AS_NAME = process.env.GMAIL_SEND_AS_NAME || DEFAULT_OPERATIONAL_FROM_NAME;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const CLAWDIA_REFERENCE_MANIFEST_PATH = join(__dirname, "docs", "internal", "clawdia", "reference-files.json");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHRIS_CHAT_ID = process.env.TELEGRAM_CHRIS_CHAT_ID;
const BRAGI_TELEGRAM_WEBHOOK_SECRET = process.env.BRAGI_TELEGRAM_WEBHOOK_SECRET || "";
const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || "";
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || "";
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || "";
const WORDPRESS_EDITOR_USERNAME = process.env.WORDPRESS_EDITOR_USERNAME || "";
const WORDPRESS_EDITOR_PASSWORD = process.env.WORDPRESS_EDITOR_PASSWORD || "";
const GMAIL_ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const GMAIL_ATTACHMENT_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
const GOOGLE_OAUTH_SCOPE_PRESETS = {
  "gmail-send": ["https://www.googleapis.com/auth/gmail.send"],
  "clawdia-command-loop": [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
};

let cachedConversationTenantProvisioner = null;
let cachedConversationTenantProvisioningDependencies = null;
let cachedBlueprintRequestLifecycleService = null;
let cachedMissionControlOpsService = null;
let cachedNexiV1Service = null;
const JOBBER_OAUTH_CAPTURE_COLLECTION = "integrationAuthCaptures";
const JOBBER_OAUTH_CAPTURE_DOC_ID = "jobber";

app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => {
  return res.json({
    ok: true,
    service: "nexteam-studio",
    timestamp: new Date().toISOString(),
    firebaseAuthRoutesLive: true,
    publicBlueprintRoutesLive: true,
    missionControlOpsRoutesLive: true,
  });
});

app.get("/api/jobber/oauth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";

  if (!code) {
    return res.status(400).send("Missing code");
  }

  try {
    const tokenPackage = await exchangeJobberAuthorizationCode({
      code,
      env: process.env,
    });

    await getFirebaseAdminDb(process.env)
      .collection(JOBBER_OAUTH_CAPTURE_COLLECTION)
      .doc(JOBBER_OAUTH_CAPTURE_DOC_ID)
      .set({
        provider: "jobber",
        clientId: process.env.JOBBER_CLIENT_ID || "",
        redirectUri: process.env.JOBBER_REDIRECT_URI || "",
        accessToken: tokenPackage.accessToken,
        refreshToken: tokenPackage.refreshToken,
        expiresIn: tokenPackage.expiresIn || null,
        tokenType: tokenPackage.tokenType || "Bearer",
        scope: tokenPackage.scope || "",
        state,
        capturedAt: new Date().toISOString(),
        source: "nexteam_product_plane_callback",
      });

    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0;">
        <h2 style="color:#22c55e">Jobber authorization captured</h2>
        <p>NexTeam received the Jobber authorization code and exchanged it successfully.</p>
        <p>You can close this tab and return to Codex.</p>
      </body></html>
    `);
  } catch (error) {
    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Jobber OAuth exchange failed.";
    console.error("[jobber/oauth/callback] error:", message, error?.payload || "");
    return res.status(500).send(`Jobber OAuth failed: ${message}`);
  }
});

app.get("/runtime-env.js", (_req, res) => {
  const runtimeConfig = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("VITE_"))
  );

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  return res.send(`window.__NEXTEAM_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`);
});

function filterProxyResponseHeader(name) {
  const lower = String(name || "").toLowerCase();
  return !["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding"].includes(lower);
}

function buildCachedAnthropicSystem(system) {
  if (Array.isArray(system)) {
    return system;
  }

  const text = String(system || "").trim();
  if (!text) {
    return system;
  }

  return [
    {
      type: "text",
      text,
      cache_control: {
        type: "ephemeral",
      },
    },
  ];
}

function normalizeAnthropicProxyBody(body = {}) {
  if (!body || typeof body !== "object") {
    return body;
  }

  return {
    ...body,
    system: buildCachedAnthropicSystem(body.system),
  };
}

function getConversationTenantProvisioner() {
  if (!cachedConversationTenantProvisioner) {
    cachedConversationTenantProvisioner = createFirebaseConversationTenantProvisioner();
  }
  return cachedConversationTenantProvisioner;
}

function getConversationTenantProvisioningDependencies() {
  if (!cachedConversationTenantProvisioningDependencies) {
    cachedConversationTenantProvisioningDependencies = createFirebaseConversationTenantProvisioningDependencies();
  }
  return cachedConversationTenantProvisioningDependencies;
}

function buildActorSummary({ decodedToken = {}, actorScope = {} } = {}) {
  return {
    uid: decodedToken.uid || "",
    email: decodedToken.email || "",
    tenantId: actorScope.tenantId || decodedToken.tenantId || null,
    role: decodedToken.role || null,
  };
}

function getBlueprintRequestLifecycleService() {
  if (!cachedBlueprintRequestLifecycleService) {
    const dependencies = getConversationTenantProvisioningDependencies();
    cachedBlueprintRequestLifecycleService = createBlueprintRequestLifecycleService({
      repository: createFirebaseBlueprintRequestRepository(),
      provisioner: getConversationTenantProvisioner(),
      readAgentSession: dependencies.readAgentSession,
    });
  }
  return cachedBlueprintRequestLifecycleService;
}

function getMissionControlOpsService() {
  if (!cachedMissionControlOpsService) {
    const companyCamRail = createCompanyCamRail();
    const operationalQuestionService = createOperationalQuestionService({
      companyCamRail,
    });
    cachedMissionControlOpsService = createMissionControlOpsService({
      fastLookupResolver: async ({ tenantId, question }) => {
        const result = await operationalQuestionService.answerQuestion({
          tenantId,
          question,
        });
        return {
          ...(result.result || {}),
          ok: result.ok,
          handled: result.handled,
          answerText: result.response,
          route: result.route,
          classification: result.classification,
        };
      },
      workResolver: async ({ tenantId, question }) => {
        const result = await operationalQuestionService.answerQuestion({
          tenantId,
          question,
        });
        return {
          ...(result.result || {}),
          ok: result.ok,
          handled: result.handled,
          answerText: result.response,
          route: result.route,
          classification: result.classification,
        };
      },
    });
  }
  return cachedMissionControlOpsService;
}

function getNexiV1Service() {
  if (!cachedNexiV1Service) {
    cachedNexiV1Service = createNexiV1Service();
  }
  return cachedNexiV1Service;
}

async function listMissionControlRegistryClients({ maxResults = 50 } = {}) {
  const snapshot = await getFirebaseAdminDb(process.env)
    .collection("tenants")
    .orderBy("updatedAt", "desc")
    .limit(maxResults)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || doc.id,
        avatarName: data.avatarName || "Nexi",
        industry: data.industry || "field-service",
        accentColor: data.accentColor || "#4F46E5",
        missionControlEnabled: data.missionControlEnabled === true,
        registryVisible: data.registryVisible !== false,
        hostAgent: data.hostAgent || null,
        caseStudyMode: data.caseStudyMode === true,
        updatedAt: data.updatedAt || null,
        route:
          typeof data.route === "string" && data.route.trim()
            ? data.route.trim()
            : `/mission-control/${data.tenantId || doc.id}`,
      };
    })
    .filter((client) => client.registryVisible && client.missionControlEnabled);
}

async function requireVerifiedActorFromRequest(req) {
  const authorization = req.get("authorization") || "";
  const { decodedToken, actorScope } = await verifyFirebaseIdTokenFromAuthorizationHeader(authorization);
  return {
    decodedToken,
    actorScope,
    actor: buildActorSummary({ decodedToken, actorScope }),
  };
}

function renderDevServerUnavailablePage({ targetUrl, requestPath }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>NexTeam GBP Rail Dev Server</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #07111f;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 24px;
      }
      main {
        max-width: 720px;
        background: rgba(2, 6, 23, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 18px;
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        line-height: 1.6;
        color: #cbd5e1;
      }
      code {
        background: rgba(15, 23, 42, 0.95);
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>GBP rail callback caught the OAuth redirect, but the Vite app is not running.</h1>
      <p>The backend on port <code>${PORT}</code> is live, so the OAuth callback path is reachable. The frontend dev server expected at <code>${targetUrl}</code> is unavailable for <code>${requestPath}</code>.</p>
      <p>Start the local GBP dev command with <code>npm run dev:gbp</code>, then reopen <code>http://127.0.0.1:5173/mission-control/google-business-profile</code>.</p>
    </main>
  </body>
</html>`;
}

async function proxyDevRequestToVite(req, res) {
  if (!VITE_DEV_SERVER_URL || !["GET", "HEAD"].includes(req.method)) {
    return false;
  }

  const targetUrl = new URL(req.originalUrl || req.url, VITE_DEV_SERVER_URL).toString();

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Accept: req.headers.accept || "*/*",
        "User-Agent": req.headers["user-agent"] || "NexTeam-Studio/GBP-Dev-Proxy",
      },
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (filterProxyResponseHeader(key)) {
        res.setHeader(key, value);
      }
    });

    if (req.method === "HEAD") {
      res.end();
      return true;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
    return true;
  } catch (error) {
    console.error("[vite-dev-proxy] error:", error.message);
    res
      .status(502)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(
        renderDevServerUnavailablePage({
          targetUrl: VITE_DEV_SERVER_URL,
          requestPath: req.originalUrl || req.url,
        })
      );
    return true;
  }
}

// Anthropic proxy — POST /api/anthropic/v1/messages
app.post("/api/anthropic/v1/messages", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Anthropic API key not configured." });
  }

  const upstreamBody = normalizeAnthropicProxyBody(req.body);
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(upstreamBody)
    });

    const upstreamForLogging = upstream.clone();
    const usageLogPromise = (async () => {
      try {
        const responseBuffer = Buffer.from(await upstreamForLogging.arrayBuffer());
        let parsedPayload = null;
        try {
          parsedPayload = JSON.parse(responseBuffer.toString("utf8"));
        } catch {
          parsedPayload = null;
        }

        if (parsedPayload) {
          await writeAnthropicUsageLog({
            env: process.env,
            tenantId: String(req.body?.metadata?.tenantId || req.body?.tenantId || "platform").trim() || "platform",
            routeActionName: String(req.body?.metadata?.routeActionName || "anthropic_proxy").trim() || "anthropic_proxy",
            taskType: String(req.body?.metadata?.taskType || "proxy_request").trim() || "proxy_request",
            model: String(upstreamBody?.model || "").trim(),
            usage: parsedPayload?.usage || null,
            success: upstream.ok,
            errorSummary: upstream.ok ? "" : String(parsedPayload?.error?.message || parsedPayload?.error || parsedPayload?.message || "").trim(),
            metadata: {
              source: "api_proxy",
              stream: upstreamBody?.stream === true,
            },
          });
        }
      } catch (loggingError) {
        console.error("[proxy/anthropic] usage log error:", loggingError.message);
      }
    })();

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      // Forward content-type so the client can handle SSE or JSON correctly
      if (key.toLowerCase() === "content-type") res.setHeader(key, value);
    });

    if (!upstream.body) {
      await usageLogPromise;
      return res.end();
    }

    const reader = upstream.body.getReader();
    const pump = async () => {
      const { value, done } = await reader.read();
      if (done) {
        await usageLogPromise;
        return res.end();
      }
      res.write(value);
      return pump();
    };
    await pump();
  } catch (err) {
    console.error("[proxy/anthropic] error:", err.message);
    res.status(502).json({ error: "Upstream Anthropic request failed." });
  }
});

// ElevenLabs proxy — POST /elevenlabs/v1/text-to-speech/:voiceId/stream
app.post("/elevenlabs/v1/text-to-speech/:voiceId/stream", async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ElevenLabs API key not configured." });
  }

  const { voiceId } = req.params;

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req.body)
      }
    );

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (["content-type", "transfer-encoding"].includes(lower)) {
        res.setHeader(key, value);
      }
    });

    if (!upstream.body) {
      return res.end();
    }

    const reader = upstream.body.getReader();
    const pump = async () => {
      const { value, done } = await reader.read();
      if (done) return res.end();
      res.write(value);
      return pump();
    };
    await pump();
  } catch (err) {
    console.error("[proxy/elevenlabs] error:", err.message);
    res.status(502).json({ error: "Upstream ElevenLabs request failed." });
  }
});

// Njord test-email endpoint — POST /api/njord/send-test-email
// Sends a single test/review email to the configured test address.
// ONLY used for case-study operator review — never sends to the full list.
app.post("/api/njord/send-test-email", async (req, res) => {
  if (!RESEND_API_KEY) {
    return res.status(500).json({ ok: false, error: "RESEND_API_KEY not configured on the server." });
  }

  const { campaignId, subject, html, toAddress } = req.body || {};

  if (!campaignId || !subject || !html || !toAddress) {
    return res.status(400).json({ ok: false, error: "Missing required fields: campaignId, subject, html, toAddress." });
  }

  // Safety: this endpoint may only send to the configured test email.
  // Reject any attempt to send to a different address via this route.
  const allowedTo = process.env.VITE_NJORD_TEST_EMAIL || "";
  if (!allowedTo) {
    return res.status(500).json({ ok: false, error: "VITE_NJORD_TEST_EMAIL not configured. Set it in Railway env vars." });
  }
  if (toAddress.toLowerCase().trim() !== allowedTo.toLowerCase().trim()) {
    return res.status(403).json({
      ok: false,
      error: `Test email may only be sent to the configured test address. Received: ${toAddress}`
    });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [toAddress],
        subject: `[Njord Test Review] ${subject}`,
        html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[njord/send-test-email] Resend error:", data);
      return res.status(502).json({ ok: false, error: data?.message || "Resend API error.", detail: data });
    }

    console.log(`[njord/send-test-email] ✅ test email sent — campaignId: ${campaignId} to: ${toAddress} resendId: ${data.id}`);
    return res.json({ ok: true, resendId: data.id, to: toAddress });
  } catch (err) {
    console.error("[njord/send-test-email] fetch error:", err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/bragi/wordpress/execute", async (req, res) => {
  try {
    const body = req.body || {};
    const articlePackage = body.articlePackage || body;
    const credentials = body.credentials || getAquatraceWordpressCredentials();
    const notifyEmail = body.notifyEmail !== false;
    let emailNotification = {
      ok: false,
      attempted: false,
      blocker: "",
    };

    const result = await executeBragiWordpressDraft({
      postId: articlePackage.postId,
      title: articlePackage.title,
      content: articlePackage.contentHtml,
      slug: articlePackage.slug,
      excerpt: articlePackage.excerpt,
      commentStatus: articlePackage.commentStatus || "closed",
      pingStatus: articlePackage.pingStatus || "closed",
      author: articlePackage.authorId,
      categories: articlePackage.categoryIds,
      featuredMedia: articlePackage.featuredMediaId,
      yoast: articlePackage.yoast,
      credentials,
    });

    if (body.notifyTelegram && result?.postId) {
      const pendingDraft = registerPendingDraft({
        postId: result.postId,
        title: result.wordpress?.title || articlePackage.title || "Bragi Draft",
        draftUrl: result.draftUrl,
        status: result.wordpress?.status || "draft",
        focusKeyphrase: result.yoast?.focusKeyphrase || articlePackage.yoast?.focusKeyphrase || "",
        summary: articlePackage.summary || articlePackage.excerpt || result.wordpress?.title || "",
      });

      const telegramResult = await sendTelegramMessage({
        botToken: TELEGRAM_BOT_TOKEN,
        chatId: TELEGRAM_CHRIS_CHAT_ID,
        text: buildDraftApprovalMessage(pendingDraft),
      });

      attachTelegramMessageToDraft({
        postId: pendingDraft.postId,
        messageId: telegramResult.message_id,
        chatId: TELEGRAM_CHRIS_CHAT_ID,
      });
    }

    if (notifyEmail && result?.postId) {
      try {
        const sent = await sendBragiDraftNotificationEmail({
          articlePackage,
          draftResult: result,
        });
        emailNotification = {
          ok: true,
          attempted: true,
          ...sent,
        };
      } catch (error) {
        emailNotification = {
          ok: false,
          attempted: true,
          blocker: String(error?.message || "Bragi review email failed."),
        };
      }
    }

    return res.json({
      ok: true,
      result: {
        ...result,
        notification: {
          email: emailNotification,
        },
        credentialSource: body.credentials ? "request_payload" : credentials.credentialSource || "unknown",
        editorCredentialSource: body.credentials ? "request_payload" : credentials.editorCredentialSource || "unknown",
      },
    });
  } catch (err) {
    console.error("[bragi/wordpress/execute] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/bragi/notify-email", async (req, res) => {
  try {
    const { articlePackage, draftResult } = req.body || {};
    const result = await sendBragiDraftNotificationEmail({ articlePackage, draftResult });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[bragi/notify-email] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/bragi/telegram/notify-draft", async (req, res) => {
  try {
    const { postId, title, draftUrl, status, focusKeyphrase, summary } = req.body || {};
    if (!postId || !title || !draftUrl) {
      return res.status(400).json({ ok: false, error: "Missing required fields: postId, title, draftUrl." });
    }

    const pendingDraft = registerPendingDraft({
      postId,
      title,
      draftUrl,
      status: status || "draft",
      focusKeyphrase: focusKeyphrase || "",
      summary: summary || "",
    });

    const telegramResult = await sendTelegramMessage({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHRIS_CHAT_ID,
      text: buildDraftApprovalMessage(pendingDraft),
    });

    const storedDraft = attachTelegramMessageToDraft({
      postId: pendingDraft.postId,
      messageId: telegramResult.message_id,
      chatId: TELEGRAM_CHRIS_CHAT_ID,
    });

    return res.json({
      ok: true,
      postId: storedDraft.postId,
      telegramMessageId: storedDraft.telegramMessageId,
      statePath: getBragiApprovalStatePath(),
    });
  } catch (err) {
    console.error("[bragi/telegram/notify-draft] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/bragi/telegram/webhook", async (req, res) => {
  try {
    if (BRAGI_TELEGRAM_WEBHOOK_SECRET) {
      const providedSecret = req.get("x-telegram-bot-api-secret-token") || "";
      if (providedSecret !== BRAGI_TELEGRAM_WEBHOOK_SECRET) {
        return res.status(403).json({ ok: false, error: "Invalid Telegram webhook secret." });
      }
    }

    const result = await handleTelegramApproval({
      message: req.body?.message,
      botToken: TELEGRAM_BOT_TOKEN,
      expectedChatId: TELEGRAM_CHRIS_CHAT_ID,
      credentials: getAquatraceWordpressCredentials(),
    });

    return res.json({ ok: true, result });
  } catch (err) {
    console.error("[bragi/telegram/webhook] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/bragi/telegram/test-command", async (req, res) => {
  try {
    const state = loadApprovalState();
    const latestPending = [...state.pendingDrafts]
      .filter((entry) => entry.approvalStatus === "pending" && entry.telegramMessageId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!latestPending) {
      return res.status(400).json({ ok: false, error: "No pending Bragi draft with a Telegram message ID is available for testing." });
    }

    const text = req.body?.text || "REVISE tighten the opening paragraph";
    const result = await handleTelegramApproval({
      message: {
        message_id: Date.now(),
        text,
        chat: { id: TELEGRAM_CHRIS_CHAT_ID },
        reply_to_message: { message_id: latestPending.telegramMessageId },
      },
      botToken: TELEGRAM_BOT_TOKEN,
      expectedChatId: TELEGRAM_CHRIS_CHAT_ID,
      credentials: getAquatraceWordpressCredentials(),
    });

    return res.json({ ok: true, result });
  } catch (err) {
    console.error("[bragi/telegram/test-command] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/auth/google/start", (req, res) => {
  try {
    const client = createGoogleOAuthClient();
    const { mode, scopes } = resolveGoogleOAuthScopeSelection(req.query);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: scopes,
      state: mode,
    });
    return res.redirect(url);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

app.get("/auth/google/gbp/connect", (req, res) => {
  try {
    const request = googleBusinessProfileRailService.createConnectRequest({
      accountLabel: req.query.accountLabel,
      loginHint: req.query.loginHint,
      returnTo: req.query.returnTo,
    });

    return res.redirect(request.url);
  } catch (err) {
    return res.status(400).send(err.message);
  }
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const rawState = typeof req.query.state === "string" ? req.query.state : "";
    const googleError = typeof req.query.error === "string" ? req.query.error : "";

    if (rawState.includes(".")) {
      const parsedState = googleBusinessProfileRailService.parseState(rawState);
      const returnTo = parsedState?.returnTo || "/mission-control/google-business-profile";
      const redirectUrl = new URL(returnTo, "http://127.0.0.1:5173");

      if (googleError) {
        redirectUrl.searchParams.set("oauth", "error");
        redirectUrl.searchParams.set("message", googleError);
        return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
      }

      const code = req.query.code;
      if (!code) {
        redirectUrl.searchParams.set("oauth", "error");
        redirectUrl.searchParams.set("message", "Missing authorization code.");
        return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
      }

      const callbackResult = await googleBusinessProfileRailService.handleOAuthCallback({
        code,
        state: rawState,
      });

      try {
        await googleBusinessProfileRailService.syncConnectionDirectory(callbackResult.accountKey);
        redirectUrl.searchParams.set("oauth", "connected");
        redirectUrl.searchParams.set("accountKey", callbackResult.accountKey);
      } catch (syncError) {
        redirectUrl.searchParams.set(
          "oauth",
          syncError?.snapshot?.blockedByGoogleApproval ? "inventory-blocked" : "error"
        );
        redirectUrl.searchParams.set("accountKey", callbackResult.accountKey);
        redirectUrl.searchParams.set(
          "message",
          syncError?.snapshot?.error?.detail ||
            syncError?.message ||
            GOOGLE_BUSINESS_PROFILE_LIVE_TEST_BLOCK_NOTE
        );
      }

      return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
    }

    const client = createGoogleOAuthClient();
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing authorization code.");
    const { tokens } = await client.getToken(code);
    return res.send(
      '<html><body style="font-family:sans-serif;padding:24px;background:#08111F;color:#E2E8F0"><h2>Google authorization complete</h2><p>Set this as GOOGLE_REFRESH_TOKEN:</p><pre style="white-space:pre-wrap;background:#111827;padding:16px;border-radius:12px">' + (tokens.refresh_token || 'NO_REFRESH_TOKEN_RETURNED') + '</pre></body></html>'
    );
  } catch (err) {
    return res.status(500).send('OAuth callback failed: ' + err.message);
  }
});

app.get("/api/gbp/connections", (_req, res) => {
  try {
    return res.json({
      ok: true,
      connections: googleBusinessProfileRailService.listConnections(),
    });
  } catch (err) {
    console.error("[gbp/connections] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/gbp/connections/:accountKey/sync", async (req, res) => {
  try {
    const result = await googleBusinessProfileRailService.syncConnectionDirectory(req.params.accountKey);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[gbp/connections/sync] error:", err.message);
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message,
      snapshot: err.snapshot || null,
    });
  }
});

app.get("/api/vgb/campaign/state", (_req, res) => {
  return res.json({ ok: true, state: loadVgbCampaignState(), statePath: getVgbCampaignStatePath() });
});

app.post("/api/vgb/campaign/dry-run", (req, res) => {
  try {
    const { contacts = [], subject = "", bodyPreview = "" } = req.body || {};
    if (!Array.isArray(contacts)) {
      return res.status(400).json({ ok: false, error: "contacts must be an array." });
    }

    const result = buildVgbDryRun({ contacts, subject, bodyPreview });
    return res.json({ ok: true, result, statePath: getVgbCampaignStatePath() });
  } catch (err) {
    console.error("[vgb/campaign/dry-run] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/vgb/campaign/approve", (req, res) => {
  try {
    const { approvedBy = "Chris" } = req.body || {};
    const state = approveVgbCampaign({ approvedBy });
    return res.json({ ok: true, approvedByChris: state.approvedByChris, approvedAt: state.approvedAt });
  } catch (err) {
    console.error("[vgb/campaign/approve] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/vgb/send-email", async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !GMAIL_SEND_FROM || !GOOGLE_REFRESH_TOKEN) {
    return res.status(500).json({ ok: false, error: "Google email settings are not configured on the server." });
  }

  const { toAddress, subject, body, propertyName, attachments, campaignMode = "single-test", contactId, controlledBatchCount = 1 } = req.body || {};
  if (!toAddress || !subject || !body) {
    return res.status(400).json({ ok: false, error: "Missing required email fields." });
  }

  if (campaignMode === "controlled-send") {
    const protection = verifyControlledSendProtection({ requestedCount: Number(controlledBatchCount || 1) });
    if (!protection.ok) {
      return res.status(403).json({ ok: false, error: protection.reason });
    }
  }

  try {
    const client = createGoogleOAuthClient();
    client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: client });
    const safeAttachments = sanitizeEmailAttachments(attachments);
    const raw = buildGmailRawMessage({
      fromName: GMAIL_SEND_AS_NAME,
      fromAddress: GMAIL_SEND_FROM,
      toAddress,
      subject,
      body,
      attachments: safeAttachments,
    });
    const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    if (campaignMode === "controlled-send") {
      logVgbSendResult({
        contactId: contactId || toAddress,
        email: toAddress,
        propertyName,
        messageId: response.data.id,
        sentAt: new Date().toISOString(),
        subject,
      });
    }
    return res.json({
      ok: true,
      messageId: response.data.id,
      propertyName: propertyName || null,
      sentAt: new Date().toISOString(),
      attachmentCount: safeAttachments.length,
    });
  } catch (err) {
    console.error("[vgb/send-email] error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/internal/firebase-auth/tenant-bootstrap", async (req, res) => {
  try {
    const authorization = req.get("authorization") || "";
    const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : null;
    const { decodedToken } = await verifyFirebaseIdTokenFromAuthorizationHeader(authorization);
    const result = await applyTenantBootstrapClaims({
      idToken: authorization.replace(/^Bearer\s+/i, "").trim(),
      requestedTenantId,
    });

    return res.json({
      ok: true,
      uid: result.uid,
      email: result.email,
      claims: result.claims,
      actorScope: result.actorScope,
      verifiedUser: {
        uid: decodedToken.uid,
        email: decodedToken.email || "",
      },
    });
  } catch (err) {
    const message = String(err?.message || "Firebase tenant bootstrap failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /tenant access|arbitrary tenant/i.test(message) ? 403 :
      500;

    console.error("[firebase-auth/tenant-bootstrap] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/public/firebase-auth/session", async (_req, res) => {
  try {
    const tenantId = resolveDefaultBootstrapTenantId(process.env);
    if (!tenantId) {
      throw new Error("FIREBASE_DEFAULT_TENANT_ID must be configured before public Firebase sessions can be issued.");
    }

    const uid = `public-web-${crypto.randomUUID()}`;
    const customToken = await getFirebaseAdminAuth(process.env).createCustomToken(uid, {
      publicSession: true,
    });

    return res.status(201).json({
      ok: true,
      uid,
      tenantId,
      customToken,
    });
  } catch (err) {
    const message = String(err?.message || "Public Firebase session bootstrap failed.");
    console.error("[public/firebase-auth/session] error:", message);
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post("/api/public/blueprint-requests", async (req, res) => {
  try {
    const result = await getBlueprintRequestLifecycleService().createRequest(req.body || {});
    return res.status(201).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Blueprint request creation failed.");
    const status = /required|must be valid/i.test(message) ? 400 : 500;
    console.error("[public/blueprint-requests] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/public/blueprint-requests/:requestId/checkout-started", async (req, res) => {
  try {
    const result = await getBlueprintRequestLifecycleService().markCheckoutStarted({
      requestId: req.params.requestId,
      source: "stripe-payment-link",
      metadata: req.body || {},
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const message = String(err?.message || "Blueprint request checkout-started failed.");
    const status =
      /not found/i.test(message) ? 404 :
      /cannot transition/i.test(message) ? 409 :
      /required/i.test(message) ? 400 :
      500;
    console.error("[public/blueprint-requests/checkout-started] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/public/blueprint-requests/:requestId/success-page-viewed", async (req, res) => {
  try {
    const result = await getBlueprintRequestLifecycleService().markSuccessPageViewed({
      requestId: req.params.requestId,
      source: "success-screen",
      metadata: req.body || {},
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const message = String(err?.message || "Blueprint request success-page-viewed failed.");
    const status =
      /not found/i.test(message) ? 404 :
      /cannot transition/i.test(message) ? 409 :
      /required/i.test(message) ? 400 :
      500;
    console.error("[public/blueprint-requests/success-page-viewed] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.get("/api/internal/firebase-auth/me", async (req, res) => {
  try {
    const authorization = req.get("authorization") || "";
    const { decodedToken, actorScope } = await verifyFirebaseIdTokenFromAuthorizationHeader(authorization);
    return res.json({
      ok: true,
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      claims: {
        tenantId: decodedToken.tenantId || null,
        role: decodedToken.role || null,
      },
      actorScope,
    });
  } catch (err) {
    const message = String(err?.message || "Firebase token verification failed.");
    console.error("[firebase-auth/me] error:", message);
    return res.status(401).json({ ok: false, error: message });
  }
});

app.get("/api/internal/blueprint-requests/:requestId", async (req, res) => {
  try {
    const { actorScope } = await requireVerifiedActorFromRequest(req);
    const request = await getBlueprintRequestLifecycleService().loadRequest(req.params.requestId);
    if (!isPlatformOperator(actorScope)) {
      assertTenantAccess({
        actorScope,
        targetTenantId: request.tenantId || "nexteam-studio",
        action: "read blueprint request for",
      });
    }

    return res.json({
      ok: true,
      request,
    });
  } catch (err) {
    const message = String(err?.message || "Blueprint request load failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /tenant access denied/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      500;
    console.error("[internal/blueprint-requests/get] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/blueprint-requests/:requestId/confirm-paid", async (req, res) => {
  try {
    const { actorScope, actor } = await requireVerifiedActorFromRequest(req);
    if (!isPlatformOperator(actorScope)) {
      return res.status(403).json({
        ok: false,
        error: "Platform operator role is required to confirm paid blueprint requests.",
      });
    }

    const result = await getBlueprintRequestLifecycleService().confirmPaidAndProvision({
      requestId: req.params.requestId,
      actor,
      paymentMode: "stripe-payment-link-manual-confirm",
      source: "operator-paid-confirmation",
      metadata: req.body || {},
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Blueprint request paid-confirm failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /platform operator/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      /cannot transition/i.test(message) ? 409 :
      /required|references missing agent session/i.test(message) ? 400 :
      500;
    console.error("[internal/blueprint-requests/confirm-paid] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/tenants/provision-from-session", async (req, res) => {
  try {
    const authorization = req.get("authorization") || "";
    const { decodedToken, actorScope } = await verifyFirebaseIdTokenFromAuthorizationHeader(authorization);

    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "sessionId is required." });
    }

    const dependencies = getConversationTenantProvisioningDependencies();
    const session = await dependencies.readAgentSession(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, error: `Agent session "${sessionId}" was not found.` });
    }

    assertActorCanProvisionAgentSession({ actorScope, decodedToken, session });

    const result = await getConversationTenantProvisioner().provisionSession(session);
    return res.json(result);
  } catch (err) {
    const message = String(err?.message || "Tenant provisioner failed.");
    const status =
      /not found/i.test(message) ? 404 :
      /owned by a different firebase user|tenant access denied|self-provisioned because owneruid is missing/i.test(message) ? 403 :
      /required|cannot provision|refusing to provision/i.test(message) ? 400 :
      /authorization|token|auth/i.test(message) ? 401 :
      500;

    console.error("[tenants/provision-from-session] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/mission-control/dispatch", async (req, res) => {
  try {
    const { actorScope } = await requireVerifiedActorFromRequest(req);
    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "";
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

    if (!tenantId || !question) {
      return res.status(400).json({ ok: false, error: "tenantId and question are required." });
    }

    assertTenantAccess({
      actorScope,
      targetTenantId: tenantId,
      action: "dispatch Mission Control request for",
    });

    const result = await getMissionControlOpsService().dispatch({ tenantId, question });
    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Mission Control dispatch failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /tenant access denied/i.test(message) ? 403 :
      /required/i.test(message) ? 400 :
      500;
    console.error("[internal/mission-control/dispatch] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.get("/api/internal/mission-control/clients", async (req, res) => {
  try {
    const { actorScope } = await requireVerifiedActorFromRequest(req);
    if (!isPlatformOperator(actorScope)) {
      return res.status(403).json({
        ok: false,
        error: "Platform operator role is required to read the Mission Control registry.",
      });
    }

    const maxResults = Math.min(Math.max(Number(req.query?.maxResults || 50), 1), 100);
    const clients = await listMissionControlRegistryClients({ maxResults });

    return res.json({
      ok: true,
      clients,
    });
  } catch (err) {
    const message = String(err?.message || "Mission Control registry load failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /platform operator/i.test(message) ? 403 :
      500;
    console.error("[internal/mission-control/clients] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.get("/api/internal/mission-control/work-items/:workItemId", async (req, res) => {
  try {
    const { actorScope } = await requireVerifiedActorFromRequest(req);
    const workItemId = String(req.params.workItemId || "").trim();
    if (!workItemId) {
      return res.status(400).json({ ok: false, error: "workItemId is required." });
    }

    const workItem = getMissionControlOpsService().getWorkItem(workItemId);
    if (!workItem) {
      return res.status(404).json({ ok: false, error: `Mission Control work item "${workItemId}" was not found.` });
    }

    assertTenantAccess({
      actorScope,
      targetTenantId: workItem.tenantId,
      action: "read Mission Control work item for",
    });

    return res.json({
      ok: true,
      workItem,
    });
  } catch (err) {
    const message = String(err?.message || "Mission Control work item lookup failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /tenant access denied/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      /required/i.test(message) ? 400 :
      500;
    console.error("[internal/mission-control/work-item] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/companycam/report-question", async (req, res) => {
  try {
    const expectedSecret = String(process.env.NEXTEAM_INTERNAL_SERVICE_SECRET || "").trim();
    const receivedSecret = String(req.get("x-nexteam-service-secret") || "").trim();
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized internal CompanyCam service request." });
    }

    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "";
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!tenantId || !question) {
      return res.status(400).json({ ok: false, error: "tenantId and question are required." });
    }

    const result = await answerCompanyCamReportQuestion({
      companyCamRail: createCompanyCamRail(),
      tenantId,
      question,
    });

    return res.json({
      ok: true,
      result: {
        ...result,
        answerText: formatCompanyCamReportAnswer(result),
      },
    });
  } catch (err) {
    const message = String(err?.message || "Internal CompanyCam report question failed.");
    const status =
      /not approved|scope denied|tenant/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      /required|unsupported/i.test(message) ? 400 :
      500;
    console.error("[internal/companycam/report-question] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/companycam/project-detail-question", async (req, res) => {
  try {
    const expectedSecret = String(process.env.NEXTEAM_INTERNAL_SERVICE_SECRET || "").trim();
    const receivedSecret = String(req.get("x-nexteam-service-secret") || "").trim();
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized internal CompanyCam service request." });
    }

    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "";
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!tenantId || !question) {
      return res.status(400).json({ ok: false, error: "tenantId and question are required." });
    }

    const result = await resolveCompanyCamProjectDetailQuestion({
      companyCamRail: createCompanyCamRail(),
      tenantId,
      question,
      projectQuery: req.body?.projectQuery,
      projectId: req.body?.projectId,
    });

    return res.json({
      ok: true,
      result,
    });
  } catch (err) {
    const message = String(err?.message || "Internal CompanyCam project detail question failed.");
    const status =
      /not approved|scope denied|tenant/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      /required|unsupported/i.test(message) ? 400 :
      500;
    console.error("[internal/companycam/project-detail-question] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/internal/nexi/v1/chat", async (req, res) => {
  try {
    const expectedSecret = String(process.env.NEXTEAM_INTERNAL_SERVICE_SECRET || "").trim();
    const receivedSecret = String(req.get("x-nexteam-service-secret") || "").trim();
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "NexTeam internal service secret is invalid." });
    }

    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "aquatrace";
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
    const actor = typeof req.body?.actor === "object" && req.body.actor
      ? req.body.actor
      : {
          uid: "nexteam-internal-service",
          email: "nexteam-internal-service@nexteam.local",
          tenantId,
          roles: ["internal_service"],
        };

    const result = await getNexiV1Service().answerQuestion({
      tenantId,
      question,
      actor,
      conversationId,
    });

    return res.status(result.ok === false ? 400 : 200).json({
      ok: result.ok !== false,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Internal Nexi v1 chat failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /tenant access denied/i.test(message) ? 403 :
      /incomplete|not found/i.test(message) ? 404 :
      /required/i.test(message) ? 400 :
      Number(err?.status || 500);
    console.error("[internal/nexi/v1/chat] error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/nexi/operator/query", async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "aquatrace";
    const result = await answerNexiOperatorQuestion({ question, tenantId });
    if (result?.handled && result?.ok === false) {
      const message = String(result?.response || result?.reason || "Nexi operator query was blocked.");
      const status =
        /not approved|tenant|blocked/i.test(message) ? 403 :
        result?.status || 400;
      return res.status(status).json({
        ok: false,
        ...result,
      });
    }

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Nexi operator query failed.");
    const status = Number(err?.status || 500);
    console.error("[nexi/operator/query] error:", message);
    return res.status(status).json({
      ok: false,
      error: message,
      payload: err?.payload || null,
    });
  }
});

app.post("/api/nexi/v1/chat", async (req, res) => {
  try {
    const { actorScope, actor } = await requireVerifiedActorFromRequest(req);
    if (!isPlatformOperator(actorScope)) {
      return res.status(403).json({ ok: false, error: "Nexi v1 is limited to platform operators in this build." });
    }

    const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "aquatrace";
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
    assertTenantAccess({
      actorScope,
      targetTenantId: tenantId,
      action: "access Nexi v1 chat for",
    });

    const result = await getNexiV1Service().answerQuestion({
      tenantId,
      question,
      actor,
      conversationId,
    });

    return res.status(result.ok === false ? 400 : 200).json({
      ok: result.ok !== false,
      ...result,
    });
  } catch (err) {
    const message = String(err?.message || "Nexi v1 chat failed.");
    const status =
      /authorization|token|auth/i.test(message) ? 401 :
      /platform operators|tenant access denied/i.test(message) ? 403 :
      /incomplete|not found/i.test(message) ? 404 :
      /required/i.test(message) ? 400 :
      Number(err?.status || 500);
    console.error("[nexi/v1/chat] error:", message);
    return res.status(status).json({
      ok: false,
      error: message,
    });
  }
});

function loadClawdiaReferenceManifest() {
  return JSON.parse(readFileSync(CLAWDIA_REFERENCE_MANIFEST_PATH, "utf8"));
}

function sanitizeEmailAttachments(attachments) {
  if (!attachments) {
    return [];
  }
  if (!Array.isArray(attachments)) {
    throw new Error("Attachments must be an array.");
  }

  return attachments.map((attachment, index) => {
    const filename = String(attachment?.filename || "").trim();
    const mimeType = String(attachment?.mimeType || "").trim().toLowerCase();
    const contentBase64 = String(attachment?.contentBase64 || "").trim();

    if (!filename || !mimeType || !contentBase64) {
      throw new Error(`Attachment ${index + 1} is missing filename, mimeType, or contentBase64.`);
    }

    if (!GMAIL_ALLOWED_ATTACHMENT_TYPES.has(mimeType)) {
      throw new Error(`Attachment ${filename} has an unsupported MIME type.`);
    }

    const buffer = Buffer.from(contentBase64, "base64");
    if (!buffer.length) {
      throw new Error(`Attachment ${filename} is empty.`);
    }

    if (buffer.byteLength > GMAIL_ATTACHMENT_SIZE_LIMIT_BYTES) {
      throw new Error(`Attachment ${filename} exceeds the ${GMAIL_ATTACHMENT_SIZE_LIMIT_BYTES} byte limit.`);
    }

    return {
      filename,
      mimeType,
      contentBase64: buffer.toString("base64"),
    };
  });
}

function normalizeOperationalEmailText(value) {
  return String(value || "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/â€‹/g, "")
    .replace(/â€™|’/g, "'")
    .replace(/â€œ|â€|“|”/g, '"')
    .replace(/â€”|â€“|—|–/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/Â/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function toAsciiOperationalEmailText(value) {
  return normalizeOperationalEmailText(value)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeEmailHeaderValue(value) {
  return toAsciiOperationalEmailText(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeEmailBodyValue(value) {
  return toAsciiOperationalEmailText(value)
    .replace(/\n/g, "\r\n");
}

function buildGmailRawMessage({ fromName, fromAddress, toAddress, subject, body, attachments = [] }) {
  const safeFromName = sanitizeEmailHeaderValue(fromName);
  const safeFromAddress = sanitizeEmailHeaderValue(fromAddress);
  const safeToAddress = sanitizeEmailHeaderValue(toAddress);
  const safeSubject = sanitizeEmailHeaderValue(subject);
  const safeBody = sanitizeEmailBodyValue(body);

  if (!attachments.length) {
    const lines = [
      `From: ${safeFromName} <${safeFromAddress}>`,
      `To: ${safeToAddress}`,
      `Subject: ${safeSubject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      safeBody,
    ];

    return Buffer.from(lines.join("\r\n")).toString("base64url");
  }

  const boundary = `nexteam-${Date.now().toString(36)}`;
  const lines = [
    `From: ${safeFromName} <${safeFromAddress}>`,
    `To: ${safeToAddress}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    safeBody,
  ];

  for (const attachment of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      attachment.contentBase64.match(/.{1,76}/g)?.join("\r\n") || attachment.contentBase64
    );
  }

  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

async function sendGmailMessage({ toAddress, subject, body, attachments = [] }) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !GMAIL_SEND_FROM || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google email settings are not configured on the server.");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: client });
  const safeAttachments = sanitizeEmailAttachments(attachments);
  const raw = buildGmailRawMessage({
    fromName: GMAIL_SEND_AS_NAME,
    fromAddress: GMAIL_SEND_FROM,
    toAddress,
    subject,
    body,
    attachments: safeAttachments,
  });

  const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return {
    messageId: response.data.id,
    attachmentCount: safeAttachments.length,
    sentAt: new Date().toISOString(),
  };
}

async function sendBragiDraftNotificationEmail({ articlePackage, draftResult }) {
  const toAddress = "chris@aquatraceleak.com";
  const { subject, body } = buildBragiNotificationEmail({ articlePackage, draftResult });
  const sent = await sendGmailMessage({ toAddress, subject, body });
  return {
    toAddress,
    subject,
    ...sent,
  };
}

function loadLocalEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = value;
  }
}

function getReferenceText(relativePath) {
  return readFileSync(join(__dirname, relativePath), "utf8");
}

function loadGoogleOAuthSettings() {
  if (!existsSync(GOOGLE_OAUTH_CREDENTIALS_PATH)) {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }

  try {
    const parsed = JSON.parse(String(readFileSync(GOOGLE_OAUTH_CREDENTIALS_PATH, "utf8")).replace(/^\uFEFF/, ""));
    const credentials = parsed.web || parsed.installed || {};

    return {
      clientId: credentials.client_id || "",
      clientSecret: credentials.client_secret || "",
      redirectUri: credentials.redirect_uris?.[0] || "",
    };
  } catch (error) {
    console.error("[google-oauth] credentials file load error:", error.message);
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }
}

function createGoogleOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth settings are not configured.");
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function resolveGoogleOAuthScopeSelection(query = {}) {
  const rawMode = typeof query.mode === "string" ? query.mode.trim().toLowerCase() : "";
  const rawScopes = typeof query.scopes === "string" ? query.scopes.trim() : "";

  if (rawScopes) {
    const scopes = [...new Set(
      rawScopes
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )];

    if (scopes.length > 0) {
      return {
        mode: rawMode || "custom",
        scopes,
      };
    }
  }

  const mode = rawMode && GOOGLE_OAUTH_SCOPE_PRESETS[rawMode] ? rawMode : "gmail-send";
  return {
    mode,
    scopes: GOOGLE_OAUTH_SCOPE_PRESETS[mode],
  };
}

function getAquatraceWordpressCredentials() {
  if (WORDPRESS_BASE_URL && WORDPRESS_USERNAME && WORDPRESS_APP_PASSWORD) {
    return {
      siteUrl: WORDPRESS_BASE_URL,
      apiUsername: WORDPRESS_USERNAME,
      apiPassword: WORDPRESS_APP_PASSWORD,
      editorUsername: WORDPRESS_EDITOR_USERNAME || fallbackEditorUsername || WORDPRESS_USERNAME,
      editorPassword: WORDPRESS_EDITOR_PASSWORD || fallbackEditorPassword || "",
      credentialSource: "named_env_vars",
      editorCredentialSource: WORDPRESS_EDITOR_PASSWORD
        ? "named_env_editor_credentials"
        : fallbackEditorUsername && fallbackEditorPassword
          ? "reference_editor_fallback"
        : "none",
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Aquatrace WordPress credentials must be supplied through environment variables in production.");
  }

  const appPasswordRaw = getReferenceText("docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-application-password.txt");
  const editorLoginRaw = getReferenceText("docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-editor-login.txt");

  const fallbackApiPassword = appPasswordRaw.match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";
  const fallbackEditorUsername = editorLoginRaw.match(/Username\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";
  const fallbackEditorPassword = editorLoginRaw.match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";

  const apiPassword = fallbackApiPassword;
  const editorUsername = fallbackEditorUsername;
  const editorPassword = fallbackEditorPassword;

  if (!apiPassword || !editorUsername || !editorPassword) {
    throw new Error("Aquatrace WordPress credentials are incomplete.");
  }

  return {
    siteUrl: "https://aquatraceleak.com",
    apiUsername: editorUsername,
    apiPassword,
    editorUsername,
    editorPassword,
    credentialSource: "reference_files_fallback",
    editorCredentialSource: "reference_editor_fallback",
  };
}

app.get("/api/internal/clawdia/reference-files", (_req, res) => {
  try {
    res.json(loadClawdiaReferenceManifest());
  } catch (err) {
    console.error("[clawdia/reference-files] manifest error:", err.message);
    res.status(500).json({ error: "Clawdia reference manifest is unavailable." });
  }
});

app.get("/api/internal/clawdia/reference-files/:fileId", (req, res) => {
  try {
    const manifest = loadClawdiaReferenceManifest();
    const file = manifest.files.find((entry) => entry.id === req.params.fileId);

    if (!file) {
      return res.status(404).json({ error: "Reference file not found." });
    }

    const absolutePath = join(__dirname, file.relativePath);
    res.setHeader("Content-Type", file.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    createReadStream(absolutePath).pipe(res);
  } catch (err) {
    console.error("[clawdia/reference-files] file error:", err.message);
    res.status(500).json({ error: "Clawdia reference file is unavailable." });
  }
});

// Serve built Vite app
if (!VITE_DEV_SERVER_URL) {
  app.use(express.static(join(__dirname, "dist")));

  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(join(__dirname, "dist", "index.html"));
  });
} else {
  app.get("*", async (req, res) => {
    const handled = await proxyDevRequestToVite(req, res);
    if (!handled) {
      res.status(404).send("Not found.");
    }
  });
}

createServer(app).listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
