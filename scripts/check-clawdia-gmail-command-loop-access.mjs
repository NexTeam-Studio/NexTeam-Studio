import https from "https";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { google } from "googleapis";

const REPO_ROOT = "C:/Users/Peyto/NexTeam-Studio";
const ENV_PATH = join(REPO_ROOT, ".env");
const OAUTH_PATH = join(REPO_ROOT, "credentials", "nexteam-gmail-oauth.json");
const REAUTH_URL = "http://127.0.0.1:3001/auth/google/start?mode=clawdia-command-loop";

loadLocalEnv();

const googleOAuthSettings = loadGoogleOAuthSettings();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || googleOAuthSettings.clientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || googleOAuthSettings.clientSecret;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || googleOAuthSettings.redirectUri;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
const GMAIL_SEND_FROM = process.env.GMAIL_SEND_FROM || "";

await main();

async function main() {
  const baseResult = {
    checkedAt: new Date().toISOString(),
    accessMethod: "Gmail OAuth via Gmail API",
    configuredFromAddress: GMAIL_SEND_FROM || null,
    secureStorage: {
      oauthClientFile: OAUTH_PATH,
      oauthClientFileExists: existsSync(OAUTH_PATH),
      refreshTokenSource: ENV_PATH,
      refreshTokenLoaded: Boolean(GOOGLE_REFRESH_TOKEN),
    },
    reauthorization: {
      required: false,
      helperUrl: REAUTH_URL,
      requestedScopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
    },
  };

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !GOOGLE_REFRESH_TOKEN) {
    console.log(JSON.stringify({
      ok: false,
      ...baseResult,
      canSend: false,
      canReadInbox: false,
      error: "Google OAuth settings are incomplete in the local repo environment.",
    }, null, 2));
    process.exit(1);
  }

  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );

  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  const accessToken = (await client.getAccessToken()).token;
  const tokenInfo = await fetchTokenInfo(accessToken);
  const scopeList = String(tokenInfo.scope || "")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const canSendByScope = includesAnyScope(scopeList, [
    "https://www.googleapis.com/auth/gmail.send",
    "https://mail.google.com/",
  ]);

  const canReadByScope = includesAnyScope(scopeList, [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://mail.google.com/",
  ]);

  const readCheck = canReadByScope
    ? await attemptInboxRead(client)
    : {
        ok: false,
        error: "Current token does not include a Gmail inbox read scope.",
      };

  const result = {
    ok: true,
    ...baseResult,
    currentScopes: scopeList,
    canSend: canSendByScope,
    canReadInbox: readCheck.ok,
    inboxReadProof: readCheck,
    reauthorization: {
      ...baseResult.reauthorization,
      required: !readCheck.ok,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

function loadLocalEnv() {
  if (!existsSync(ENV_PATH)) {
    return;
  }

  const raw = readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value;
  }
}

function loadGoogleOAuthSettings() {
  if (!existsSync(OAUTH_PATH)) {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }

  try {
    const parsed = JSON.parse(readFileSync(OAUTH_PATH, "utf8"));
    const credentials = parsed.web || parsed.installed || {};
    return {
      clientId: credentials.client_id || "",
      clientSecret: credentials.client_secret || "",
      redirectUri: credentials.redirect_uris?.[0] || "",
    };
  } catch {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }
}

function includesAnyScope(scopeList, requiredScopes) {
  return requiredScopes.some((scope) => scopeList.includes(scope));
}

async function attemptInboxRead(client) {
  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 5,
      q: "newer_than:30d",
    });

    return {
      ok: true,
      profileEmailAddress: profile.data.emailAddress || null,
      inboxSampleCount: (list.data.messages || []).length,
      messagesTotal: profile.data.messagesTotal ?? null,
      threadsTotal: profile.data.threadsTotal ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      code: error?.code || null,
      status: error?.status || null,
    };
  }
}

async function fetchTokenInfo(accessToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let raw = "";
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}
