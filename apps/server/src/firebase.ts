import { cert, getApps, initializeApp } from "firebase-admin/app";
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
  if (!raw) {
    return null;
  }
  if (getApps().length === 0) {
    initializeApp({ credential: cert(parseServiceAccount(raw)) });
  }
  return getFirestore();
}

