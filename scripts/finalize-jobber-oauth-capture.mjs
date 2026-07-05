import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CAPTURE_COLLECTION = "integrationAuthCaptures";
const CAPTURE_DOC_ID = "jobber";
const DEFAULT_ENV_PATH = resolve(process.cwd(), ".env");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return String(process.argv[index + 1] || "").trim();
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const entries = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    entries[key] = value;
  }
  return entries;
}

function upsertEnvKey(filePath, key, value) {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  let found = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    nextLines.push(`${key}=${value}`);
  }

  writeFileSync(filePath, nextLines.join("\n"));
}

function maskSecret(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function runRailwayVariablesSet(entries) {
  const args = ["variables", "set"];
  for (const [key, value] of Object.entries(entries)) {
    args.push(`${key}=${value}`);
  }

  const result = spawnSync("railway", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "railway variables set failed.");
  }

  return result.stdout.trim();
}

function resolveServiceAccountPath() {
  return (
    readArg("--service-account") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  );
}

async function main() {
  const serviceAccountPath = resolveServiceAccountPath();
  if (!serviceAccountPath) {
    throw new Error("Missing service account path. Pass --service-account <path> or set GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  const projectId = String(serviceAccount.project_id || "").trim();
  if (!projectId) {
    throw new Error("Service account JSON is missing project_id.");
  }

  const existing = getApps().find((app) => app.name === "jobber-oauth-finalizer");
  const app =
    existing ||
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId,
      },
      "jobber-oauth-finalizer"
    );

  const db = getFirestore(app);
  const captureRef = db.collection(CAPTURE_COLLECTION).doc(CAPTURE_DOC_ID);
  const captureSnap = await captureRef.get();
  if (!captureSnap.exists) {
    throw new Error(`No Jobber OAuth capture found at ${CAPTURE_COLLECTION}/${CAPTURE_DOC_ID}.`);
  }

  const capture = captureSnap.data() || {};
  const refreshToken = String(capture.refreshToken || "").trim();
  const redirectUri = String(capture.redirectUri || "").trim();
  if (!refreshToken) {
    throw new Error("Captured Jobber OAuth package does not contain a refresh token.");
  }

  upsertEnvKey(DEFAULT_ENV_PATH, "JOBBER_REFRESH_TOKEN", refreshToken);
  if (redirectUri) {
    upsertEnvKey(DEFAULT_ENV_PATH, "JOBBER_REDIRECT_URI", redirectUri);
  }

  runRailwayVariablesSet({
    JOBBER_REFRESH_TOKEN: refreshToken,
  });

  await captureRef.delete();

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        capturePath: `${CAPTURE_COLLECTION}/${CAPTURE_DOC_ID}`,
        capturedAt: capture.capturedAt || null,
        redirectUri: redirectUri || null,
        refreshTokenFingerprint: maskSecret(refreshToken),
        localEnvUpdated: true,
        railwayUpdated: true,
        captureDeleted: true,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
