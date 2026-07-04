import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { setTimeout as delay } from "timers/promises";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../src/server/firebaseAdminApp.js";
import {
  nexiConversationLogCollectionPath,
  nexiFailureLogCollectionPath,
} from "../src/features/missioncontrol/services/firestorePaths.js";

const PORT = 3012;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "C:\\Users\\Peyto\\Downloads\\nexteam-studio-firebase-adminsdk-fbsvc-0332c5dd61.json";
const TENANT_ID = "aquatrace";
const OPERATOR_EMAIL = "owner@aquatrace.com";
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function loadServiceAccount() {
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
}

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

async function waitForHealth(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const serviceAccount = loadServiceAccount();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || serviceAccount.project_id || "nexteam-studio",
      FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || serviceAccount.client_email,
      FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY || serviceAccount.private_key,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[nexi-v1-server] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[nexi-v1-server] ${chunk}`));
  return child;
}

async function createOperatorIdToken() {
  const serviceAccount = loadServiceAccount();
  const adminAuth = getFirebaseAdminAuth({
    ...process.env,
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || serviceAccount.project_id || "nexteam-studio",
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || serviceAccount.client_email,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY || serviceAccount.private_key,
  });
  const user = await adminAuth.getUserByEmail(OPERATOR_EMAIL);
  const customToken = await adminAuth.createCustomToken(user.uid, {
    tenantId: TENANT_ID,
    role: "platform_operator",
  });
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(
      process.env.VITE_FIREBASE_API_KEY
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    }
  );
  const payload = await response.json();
  if (!response.ok || !payload.idToken) {
    throw new Error(payload?.error?.message || "Failed to exchange Firebase custom token.");
  }
  return payload.idToken;
}

async function postChat(idToken, question, conversationId = "") {
  const response = await fetch(`${BASE_URL}/api/nexi/v1/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      question,
      conversationId,
    }),
  });
  const payload = await response.json();
  return {
    status: response.status,
    payload,
  };
}

async function readLatestLogCounts() {
  const serviceAccount = loadServiceAccount();
  const db = getFirebaseAdminDb({
    ...process.env,
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || serviceAccount.project_id || "nexteam-studio",
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || serviceAccount.client_email,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY || serviceAccount.private_key,
  });
  const [conversationsSnap, failuresSnap] = await Promise.all([
    db.collection(nexiConversationLogCollectionPath(TENANT_ID)).limit(5).get(),
    db.collection(nexiFailureLogCollectionPath(TENANT_ID)).limit(5).get(),
  ]);
  return {
    conversationLogCount: conversationsSnap.size,
    failureLogCount: failuresSnap.size,
  };
}

async function main() {
  loadLocalEnv();
  const server = startServer();
  try {
    await waitForHealth(`${BASE_URL}/health`);
    const idToken = await createOperatorIdToken();

    const gallons = await postChat(idToken, "What is the pool gallonage for Camp Mikell in Toccoa GA?");
    const photos = await postChat(
      idToken,
      "Show me photos from Camp Mikell.",
      gallons.payload.conversationId || ""
    );
    const schedule = await postChat(
      idToken,
      "What jobs do I have today?",
      gallons.payload.conversationId || ""
    );
    const jobDetail = await postChat(
      idToken,
      "Show me the Deborah Justice job.",
      gallons.payload.conversationId || ""
    );

    const logCounts = await readLatestLogCounts();

    console.log(
      JSON.stringify(
        {
          ok: true,
          gallons: {
            status: gallons.status,
            answer: gallons.payload.answer,
            source: gallons.payload.source,
          },
          photos: {
            status: photos.status,
            answer: photos.payload.answer,
            photoCount: Array.isArray(photos.payload.photos) ? photos.payload.photos.length : 0,
            source: photos.payload.source,
          },
          schedule: {
            status: schedule.status,
            answer: schedule.payload.answer || schedule.payload.error,
          },
          jobDetail: {
            status: jobDetail.status,
            answer: jobDetail.payload.answer || jobDetail.payload.error,
            source: jobDetail.payload.source || null,
          },
          logCounts,
        },
        null,
        2
      )
    );
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
