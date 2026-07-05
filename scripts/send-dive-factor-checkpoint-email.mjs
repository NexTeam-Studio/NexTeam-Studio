import { existsSync, readFileSync } from "fs";
import { google } from "googleapis";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DEFAULT_TO_ADDRESS = "chris@aquatraceleak.com";
const DEFAULT_SUBJECT = "Dive Factor Review Checkpoint Complete";
const CHECKPOINT_FROM_NAME = "Chris Sears - Aquatrace Swimming Pool Leak Detection";
const GOOGLE_OAUTH_CREDENTIALS_PATH = join(REPO_ROOT, "credentials", "nexteam-gmail-oauth.json");
const DEFAULT_LANE_PATH = join(REPO_ROOT, "docs", "clients", "dive-factor-underwater-services");

loadLocalEnv();

const googleOAuthSettings = loadGoogleOAuthSettings();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || googleOAuthSettings.clientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || googleOAuthSettings.clientSecret;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || googleOAuthSettings.redirectUri;
const GMAIL_SEND_FROM = process.env.GMAIL_SEND_FROM;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const options = parseArgs(process.argv.slice(2));
const toAddress = (options.toAddress || DEFAULT_TO_ADDRESS).trim().toLowerCase();

if (toAddress !== DEFAULT_TO_ADDRESS) {
  throw new Error(`Only ${DEFAULT_TO_ADDRESS} is allowed for this checkpoint sender.`);
}

const subject = options.subject || DEFAULT_SUBJECT;
const lanePath = options.lanePath || DEFAULT_LANE_PATH;
const body = resolveBody({ options, lanePath });
const sent = await sendGmailMessage({ toAddress, subject, body });

console.log(JSON.stringify({
  ok: true,
  toAddress,
  subject,
  lanePath,
  messageId: sent.messageId,
  sentAt: sent.sentAt,
}, null, 2));

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return {
    body: parsed.body || "",
    bodyFile: parsed["body-file"] || "",
    lanePath: parsed["lane-path"] || "",
    subject: parsed.subject || "",
    toAddress: parsed.to || "",
  };
}

function resolveBody({ options, lanePath }) {
  if (options.bodyFile) {
    return readFileSync(options.bodyFile, "utf8");
  }

  if (options.body) {
    return options.body;
  }

  return buildCheckpointBody({ lanePath });
}

function buildCheckpointBody({ lanePath }) {
  const milestonePath = join(lanePath, "01_MASTER_PLAN", "MILESTONE_STATUS_TRACKER.md");
  const autoRunLogPath = join(lanePath, "10_PROOF_LOGS", "AUTO_RUN_LOG.md");

  const milestoneText = safeReadFile(milestonePath);
  const autoRunLogText = safeReadFile(autoRunLogPath);
  const overallState = extractCurrentOverallState(milestoneText);
  const latestRun = extractLatestRunEntry(autoRunLogText);
  const today = new Date().toISOString();

  return [
    "Hi Chris,",
    "",
    "This is the Dive Factor Review Checkpoint email from the repo-local NexTeam Gmail path.",
    "",
    `Generated at: ${today}`,
    "",
    "Current overall state:",
    overallState || "Current overall state section was not available.",
    "",
    "Latest auto-run summary:",
    latestRun || "Latest auto-run entry was not available.",
    "",
    "This message is internal-only and does not publish, route leads, or trigger outreach.",
  ].join("\n");
}

function extractCurrentOverallState(markdown) {
  const heading = "## Current overall state";
  const headingIndex = markdown.indexOf(heading);

  if (headingIndex === -1) {
    return "";
  }

  const afterHeading = markdown.slice(headingIndex + heading.length).trim();
  const nextHeadingMatch = afterHeading.match(/\n##\s+/);
  const section = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index).trim()
    : afterHeading.trim();

  return section;
}

function extractLatestRunEntry(markdown) {
  const lines = markdown.split(/\r?\n/);
  let startIndex = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith("### ")) {
      startIndex = index;
      break;
    }
  }

  if (startIndex === -1) {
    return "";
  }

  const entryLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    entryLines.push(lines[index]);
  }

  return entryLines.join("\n").trim();
}

function safeReadFile(filePath) {
  if (!existsSync(filePath)) {
    return "";
  }

  return readFileSync(filePath, "utf8");
}

async function sendGmailMessage({ toAddress, subject, body }) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !GMAIL_SEND_FROM || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google email settings are not configured for the checkpoint sender.");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = buildGmailRawMessage({
    fromName: CHECKPOINT_FROM_NAME,
    fromAddress: GMAIL_SEND_FROM,
    toAddress,
    subject,
    body,
  });

  const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return {
    messageId: response.data.id,
    sentAt: new Date().toISOString(),
  };
}

function buildGmailRawMessage({ fromName, fromAddress, toAddress, subject, body }) {
  const safeSubject = subject.replace(/\r?\n/g, " ").trim();
  const safeBody = body.replace(/\r?\n/g, "\r\n");
  const headers = [
    `From: ${formatEmailHeaderName(fromName)} <${fromAddress}>`,
    `To: <${toAddress}>`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    safeBody,
  ];

  return Buffer.from(headers.join("\r\n")).toString("base64url");
}

function formatEmailHeaderName(name) {
  const safeName = (name || "").replace(/"/g, "").trim();
  return safeName ? `"${safeName}"` : "";
}

function loadLocalEnv() {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
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
  if (!existsSync(GOOGLE_OAUTH_CREDENTIALS_PATH)) {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }

  try {
    const parsed = JSON.parse(readFileSync(GOOGLE_OAUTH_CREDENTIALS_PATH, "utf8"));
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
