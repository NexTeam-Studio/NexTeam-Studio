import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SENDER = "nexteamstudioai@gmail.com";
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REDIRECT_URI = "http://localhost:53682/oauth2callback";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FIVE_MINUTES = 5 * 60 * 1000;

function codeVerifier() {
  return crypto.randomBytes(48).toString("base64url");
}

function codeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function safeError(error) {
  const text = String(error instanceof Error ? error.message : error || "unknown failure");
  return text.replace(/(client_secret|refresh_token|access_token|authorization|code)=([^\s&]+)/gi, "$1=[REDACTED]");
}

export function stagingOwnerInvitationConfiguration(env = process.env) {
  // Owner invitations have their own OAuth client. Do not reuse the general
  // Gmail metadata rail, which is intentionally configured separately.
  const clientId = String(env.GMAIL_SEND_MAILBOX_CLIENT_ID || "").trim();
  const clientSecret = String(env.GMAIL_SEND_MAILBOX_CLIENT_SECRET || "").trim();
  const sender = String(env.GMAIL_SEND_MAILBOX_EMAIL || "").trim().toLowerCase();
  const missing = [];
  if (!clientId) missing.push("GMAIL_SEND_MAILBOX_CLIENT_ID");
  if (!clientSecret) missing.push("GMAIL_SEND_MAILBOX_CLIENT_SECRET");
  if (!sender) missing.push("GMAIL_SEND_MAILBOX_EMAIL");
  if (sender && sender !== SENDER) missing.push("approved staging sender identity");
  return {
    clientId,
    clientSecret,
    sender: SENDER,
    secretDestination: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN",
    missing,
    configured: missing.length === 0,
  };
}

export function createAuthorizationUrl({ clientId, state, verifier }) {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
    access_type: "offline",
    login_hint: SENDER,
    // Always show Google's account chooser. The staging sender is a specific
    // mailbox and must never be silently inherited from an unrelated Google
    // session already open in the browser.
    prompt: "select_account consent",
  }).toString();
  return url;
}

export function preflightStagingOwnerInvitation(env = process.env) {
  const config = stagingOwnerInvitationConfiguration(env);
  const refreshCredentialPresent = Boolean(env.GMAIL_SEND_MAILBOX_REFRESH_TOKEN);
  return {
    ok: config.configured && Boolean(env.RAILWAY_TOKEN),
    sender: config.sender,
    scope: SCOPE,
    redirectUri: REDIRECT_URI,
    clientIdPresent: Boolean(config.clientId),
    clientSecretPresent: Boolean(config.clientSecret),
    railwayWriterPresent: Boolean(env.RAILWAY_TOKEN),
    refreshCredentialPresent,
    secretDestination: config.secretDestination,
    missing: config.missing,
  };
}

function callbackServer(expectedState) {
  const redirect = new URL(REDIRECT_URI);
  let resolveCode;
  let rejectCode;
  const result = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  const server = http.createServer((request, response) => {
    try {
      const received = new URL(request.url || "/", REDIRECT_URI);
      if (received.pathname !== redirect.pathname || received.searchParams.get("state") !== expectedState) throw new Error("OAuth callback did not match this authorization attempt.");
      const oauthError = received.searchParams.get("error");
      if (oauthError) throw new Error(`Google authorization was declined: ${oauthError}.`);
      const code = received.searchParams.get("code");
      if (!code) throw new Error("Google authorization did not return a code.");
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("Gmail authorization received. Secure staging verification is still in progress; return to NexTeam.");
      resolveCode(code);
    } catch (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Gmail authorization was not saved.");
      rejectCode(error);
    }
  });
  return { result, start: () => new Promise((resolve) => server.listen(Number(redirect.port), redirect.hostname, resolve)), close: () => server.close() };
}

async function exchangeCode({ clientId, clientSecret, code, verifier, fetchImpl = fetch }) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: REDIRECT_URI });
  const response = await fetchImpl(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json();
  if (!response.ok || !payload.refresh_token) throw new Error("Google did not return a usable staging refresh credential.");
  return payload;
}

async function exchangeRefreshCredential({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    const reason = /^[a-z_]+$/i.test(String(payload.error || "")) ? payload.error : "unknown";
    throw new Error(`The stored staging sender credential is not usable (${reason}).`);
  }
  return payload.access_token;
}

function writeStagingRefreshToken(refreshToken, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const appData = process.env.APPDATA || "";
    const railwayExecutable = path.join(appData, "npm", "node_modules", "@railway", "cli", "bin", "railway.exe");
    const child = spawnImpl(railwayExecutable, ["variable", "set", "GMAIL_SEND_MAILBOX_REFRESH_TOKEN", "--stdin", "--service", "NexTeam-Studio", "--environment", "staging"], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    child.once("error", () => reject(new Error("Unable to store the staging refresh credential.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Railway rejected the staging refresh credential update.")));
    child.stdin.end(refreshToken);
  });
}

function openBrowser(url, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const launcher = fileURLToPath(new URL("./open-staging-gmail-authorization.ps1", import.meta.url));
    const child = spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-File", launcher, url.toString()], { windowsHide: true, stdio: "ignore" });
    child.once("error", () => reject(new Error("Could not open the Google authorization page.")));
    child.once("spawn", resolve);
  });
}

export async function authorizeStagingOwnerInvitation({ env = process.env, fetchImpl = fetch, spawnImpl = spawn, log = console.log, showUrl = false } = {}) {
  const config = stagingOwnerInvitationConfiguration(env);
  if (!config.configured) throw new Error(`Staging owner-invitation OAuth is not configured: ${config.missing.join(", ")}.`);
  if (!env.RAILWAY_TOKEN) throw new Error("Railway staging credential is unavailable to the secure writer.");
  const verifier = codeVerifier();
  const state = crypto.randomBytes(32).toString("base64url");
  const callback = callbackServer(state);
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("Google authorization timed out after five minutes.")), FIVE_MINUTES); });
  try {
    await callback.start();
    const authorizationUrl = createAuthorizationUrl({ clientId: config.clientId, state, verifier });
    if (showUrl) {
      // This is a short-lived user-authorization URL, not a credential. It is
      // intentionally emitted only when a local operator explicitly requests it.
      log(`STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_URL ${authorizationUrl.toString()}`);
    } else {
      await openBrowser(authorizationUrl, spawnImpl);
    }
    log("STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_WAITING");
    const code = await Promise.race([callback.result, timeout]);
    const tokens = await exchangeCode({ ...config, code, verifier, fetchImpl });
    await writeStagingRefreshToken(tokens.refresh_token, spawnImpl);
    log("STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_STORED");
  } finally {
    clearTimeout(timeoutId);
    callback.close();
  }
}

export async function verifyStagingOwnerInvitationMailbox({ env = process.env, fetchImpl = fetch } = {}) {
  const config = stagingOwnerInvitationConfiguration(env);
  const refreshToken = String(env.GMAIL_SEND_MAILBOX_REFRESH_TOKEN || "").trim();
  if (!config.configured || !refreshToken) throw new Error("Staging owner-invitation mailbox verification is not configured.");
  await exchangeRefreshCredential({ ...config, refreshToken, fetchImpl });
  return { ok: true, sender: SENDER, scope: SCOPE, refreshCredentialPresent: true };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.includes("--preflight")) {
    const result = preflightStagingOwnerInvitation();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } else if (process.argv.includes("--verify-mailbox")) {
    verifyStagingOwnerInvitationMailbox().then((result) => console.log(JSON.stringify(result))).catch((error) => {
      console.error(`STAGING_GMAIL_OWNER_INVITATION_MAILBOX_VERIFY_FAILED: ${safeError(error)}`);
      process.exitCode = 1;
    });
  } else {
    const urlFileArgument = process.argv.indexOf("--authorization-url-file");
    const authorizationUrlFile = urlFileArgument >= 0 ? process.argv[urlFileArgument + 1] : null;
    const resultFileArgument = process.argv.indexOf("--authorization-result-file");
    const authorizationResultFile = resultFileArgument >= 0 ? process.argv[resultFileArgument + 1] : null;
    const writeResult = (status) => {
      if (authorizationResultFile) fs.writeFileSync(authorizationResultFile, status, { encoding: "utf8", flag: "wx" });
    };
    authorizeStagingOwnerInvitation({
      showUrl: process.argv.includes("--show-url"),
      log: (message) => {
        if (authorizationUrlFile && message.startsWith("STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_URL ")) {
          fs.writeFileSync(authorizationUrlFile, message.slice("STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_URL ".length), { encoding: "utf8", flag: "wx" });
          return;
        }
        console.log(message);
      },
    }).then(() => {
      writeResult("STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_STORED");
    }).catch((error) => {
      writeResult(`STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_FAILED: ${safeError(error)}`);
      console.error(`STAGING_GMAIL_OWNER_INVITATION_AUTHORIZATION_FAILED: ${safeError(error)}`);
      process.exitCode = 1;
    });
  }
}
