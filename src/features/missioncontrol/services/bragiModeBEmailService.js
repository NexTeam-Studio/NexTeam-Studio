import { existsSync, readFileSync } from "fs";
import { google } from "googleapis";
import { join } from "path";

const REPO_ROOT = process.cwd();
const OAUTH_PATH = join(REPO_ROOT, "credentials", "nexteam-gmail-oauth.json");
const DEFAULT_TO_ADDRESS = "aquatraceleak@gmail.com";
const DEFAULT_FROM_NAME = "Chris Sears - Aquatrace Swimming Pool Leak Detection";

function getBrandName(config) {
  return String(config?.displayName || config?.brandName || config?.profile?.brandName || "the client").trim();
}

function getReviewRecipient(config) {
  return String(config?.approval?.reviewRecipient || config?.profile?.contact?.email || DEFAULT_TO_ADDRESS).trim();
}

function getFromName(config) {
  const brandName = getBrandName(config);
  const contactName = String(config?.profile?.contact?.primaryName || "Operator").trim();
  return `${contactName} - ${brandName}`;
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

function buildRawMessage({ fromName, fromAddress, toAddress, subject, body }) {
  return Buffer.from([
    `From: "${String(fromName || DEFAULT_FROM_NAME).replace(/"/g, "").trim()}" <${fromAddress}>`,
    `To: <${toAddress}>`,
    `Subject: ${String(subject || "").replace(/\r?\n/g, " ").trim()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    String(body || "").replace(/\r?\n/g, "\r\n"),
  ].join("\r\n")).toString("base64url");
}

export function buildBragiModeBReviewEmail({ topic, location, articlePackage, draftResult, config = null }) {
  const brandName = getBrandName(config);
  const subjectPrefix = String(config?.approval?.subjectPrefix || "[Bragi Mode B Draft Review]").trim();
  const subject = `${subjectPrefix} ${location.display} | ${topic}`;
  const body = [
    "Chris,",
    "",
    `Bragi created a new ${brandName} WordPress draft for review.`,
    "",
    `Title: ${articlePackage.title}`,
    `Draft URL: ${draftResult.url}`,
  ].join("\n");

  return {
    subject,
    body,
    toAddress: getReviewRecipient(config),
    fromName: getFromName(config),
  };
}

export async function sendBragiModeBReviewEmail({ subject, body, toAddress = DEFAULT_TO_ADDRESS, fromName = DEFAULT_FROM_NAME }) {
  const oauth = loadGoogleOAuthSettings();
  const clientId = process.env.GOOGLE_CLIENT_ID || oauth.clientId;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || oauth.clientSecret;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || oauth.redirectUri;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";
  const fromAddress = process.env.GMAIL_SEND_FROM || "";

  if (!clientId || !clientSecret || !redirectUri || !refreshToken || !fromAddress) {
    throw new Error("Google Gmail sender settings are not configured.");
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = buildRawMessage({
    fromName,
    fromAddress,
    toAddress,
    subject,
    body,
  });

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    toAddress,
    messageId: response.data.id,
    sentAt: new Date().toISOString(),
  };
}
