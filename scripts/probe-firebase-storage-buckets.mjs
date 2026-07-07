import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { Storage } from "@google-cloud/storage";

function credentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return {
      ...parsed,
      project_id: parsed.project_id || parsed.projectId,
      client_email: parsed.client_email || parsed.clientEmail,
      private_key: parsed.private_key || parsed.privateKey
    };
  }
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    private_key: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
}

const project = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const candidates = [...new Set([
  process.env.FIREBASE_STORAGE_BUCKET,
  process.env.VITE_FIREBASE_STORAGE_BUCKET,
  project ? `${project}.appspot.com` : "",
  project ? `${project}.firebasestorage.app` : ""
].filter(Boolean))];

const app = initializeApp({ credential: cert(credentials()) }, `bucket-probe-${Date.now()}`);
const results = [];
for (const name of candidates) {
  try {
    const [exists] = await getStorage(app).bucket(name).exists();
    results.push({ name, exists });
  } catch (error) {
    results.push({ name, error: error instanceof Error ? error.message : String(error) });
  }
}
await deleteApp(app);

let listedBuckets = [];
let listError = null;
try {
  const [buckets] = await new Storage({
    projectId: project,
    credentials: credentials()
  }).getBuckets();
  listedBuckets = buckets.map((bucket) => bucket.name).sort();
} catch (error) {
  listError = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify({ project, candidates: results, listedBuckets, listError }, null, 2));
