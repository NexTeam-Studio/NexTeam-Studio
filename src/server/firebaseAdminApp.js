import { applicationDefault, cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const FIREBASE_ADMIN_APP_NAME = "nexteam-studio-admin";

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

export function isFirebaseAdminEmulatorMode(env = process.env) {
  return Boolean(env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST);
}

export function resolveFirebaseAdminProjectId(env = process.env) {
  return String(
    env.FIREBASE_ADMIN_PROJECT_ID ||
      env.GOOGLE_CLOUD_PROJECT ||
      env.GCLOUD_PROJECT ||
      env.VITE_FIREBASE_PROJECT_ID ||
      ""
  ).trim();
}

export function buildFirebaseAdminOptions(env = process.env) {
  const projectId = resolveFirebaseAdminProjectId(env);
  if (!projectId) {
    throw new Error(
      "Firebase Admin project ID is not configured. Set FIREBASE_ADMIN_PROJECT_ID or GOOGLE_CLOUD_PROJECT."
    );
  }

  const clientEmail = String(env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (clientEmail && privateKey) {
    return {
      projectId,
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    };
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_ADMIN_USE_APPLICATION_DEFAULT === "true") {
    return {
      projectId,
      credential: applicationDefault(),
    };
  }

  if (isFirebaseAdminEmulatorMode(env)) {
    return { projectId };
  }

  throw new Error(
    "Firebase Admin credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY."
  );
}

export function getFirebaseAdminApp(env = process.env) {
  const existing = getApps().find((app) => app.name === FIREBASE_ADMIN_APP_NAME);
  if (existing) {
    return existing;
  }

  return initializeApp(buildFirebaseAdminOptions(env), FIREBASE_ADMIN_APP_NAME);
}

export function getFirebaseAdminAuth(env = process.env) {
  return getAuth(getFirebaseAdminApp(env));
}

export function getFirebaseAdminDb(env = process.env) {
  return getFirestore(getFirebaseAdminApp(env));
}

export async function resetFirebaseAdminAppForTests() {
  const existing = getApps().filter((app) => app.name === FIREBASE_ADMIN_APP_NAME);
  await Promise.all(existing.map((app) => deleteApp(app)));
}
