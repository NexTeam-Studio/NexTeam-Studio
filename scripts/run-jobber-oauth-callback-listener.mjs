import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { exchangeJobberAuthorizationCode } from "../src/server/jobberService.js";

const PORT = Number(process.env.PORT || 3012);
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "C:\\Users\\Peyto\\Downloads\\nexteam-studio-firebase-adminsdk-fbsvc-0332c5dd61.json";
const CAPTURE_COLLECTION = "integrationAuthCaptures";
const CAPTURE_DOC_ID = "jobber";

function loadLocalEnv() {
  const envPath = new URL("../.env", import.meta.url);
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

function getFirestoreAdmin() {
  const existing = getApps().find((app) => app.name === "jobber-oauth-listener");
  if (existing) {
    return getFirestore(existing);
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  const app = initializeApp(
    {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    },
    "jobber-oauth-listener"
  );
  return getFirestore(app);
}

function sendHtml(res, statusCode, heading, body) {
  res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  res.end(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0;">
      <h2 style="color:${statusCode >= 400 ? "#f87171" : "#22c55e"}">${heading}</h2>
      <p>${body}</p>
    </body></html>
  `);
}

async function handleCallback(req, res, url) {
  const code = String(url.searchParams.get("code") || "").trim();
  const state = String(url.searchParams.get("state") || "").trim();

  if (!code) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Missing code");
    return;
  }

  try {
    const tokenPackage = await exchangeJobberAuthorizationCode({
      code,
      env: process.env,
    });

    await getFirestoreAdmin()
      .collection(CAPTURE_COLLECTION)
      .doc(CAPTURE_DOC_ID)
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
        source: "local_jobber_oauth_callback_listener",
      });

    sendHtml(
      res,
      200,
      "Jobber authorization captured",
      "NexTeam received the Jobber authorization code and exchanged it successfully. You can close this tab and return to Codex."
    );
  } catch (error) {
    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Jobber OAuth exchange failed.";
    console.error("[jobber-oauth-listener] callback error:", message, error?.payload || "");
    sendHtml(res, 500, "Jobber authorization failed", message);
  }
}

async function main() {
  loadLocalEnv();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "jobber-oauth-callback-listener",
          port: PORT,
          redirectUri: process.env.JOBBER_REDIRECT_URI || "",
        })
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobber/oauth/callback") {
      await handleCallback(req, res, url);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[jobber-oauth-listener] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((error) => {
  console.error("[jobber-oauth-listener] fatal:", error);
  process.exit(1);
});
