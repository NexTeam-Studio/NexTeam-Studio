import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function parseServiceAccount(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function getAdminDb(env: NodeJS.ProcessEnv = process.env): Firestore | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!raw && (!projectId || !clientEmail || !privateKey)) {
    return null;
  }
  if (getApps().length === 0) {
    const storageBucket = env.FIREBASE_STORAGE_BUCKET?.trim();
    initializeApp({
      credential: cert(raw ? parseServiceAccount(raw) : { projectId, clientEmail, privateKey }),
      ...(storageBucket ? { storageBucket } : {})
    });
  }
  return getFirestore();
}

export function getAdminAuth(env: NodeJS.ProcessEnv = process.env): Auth | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!raw && (!projectId || !clientEmail || !privateKey)) {
    return null;
  }
  if (getApps().length === 0) {
    const storageBucket = env.FIREBASE_STORAGE_BUCKET?.trim();
    initializeApp({
      credential: cert(raw ? parseServiceAccount(raw) : { projectId, clientEmail, privateKey }),
      ...(storageBucket ? { storageBucket } : {})
    });
  }
  return getAuth();
}

