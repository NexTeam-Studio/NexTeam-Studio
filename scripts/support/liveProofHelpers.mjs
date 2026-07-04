import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { cert, deleteApp as deleteAdminApp, getApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function loadLocalEnvOnce() {
  if (loadLocalEnvOnce.loaded) {
    return;
  }

  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    loadLocalEnvOnce.loaded = true;
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

  loadLocalEnvOnce.loaded = true;
}
loadLocalEnvOnce.loaded = false;
loadLocalEnvOnce();

export function requireEnv(name, fallback = "") {
  const value = normalizeText(process.env[name] || fallback);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

export function optionalEnv(name, fallback = "") {
  return normalizeText(process.env[name] || fallback);
}

export function resolveOperatorProofIdentity() {
  const email =
    optionalEnv("NEXTEAM_OPERATOR_EMAIL") ||
    optionalEnv("FIREBASE_PLATFORM_OPERATOR_EMAILS").split(",")[0]?.trim() ||
    "owner@aquatrace.com";
  const password = optionalEnv("NEXTEAM_OPERATOR_PASSWORD");
  const uid =
    optionalEnv("NEXTEAM_OPERATOR_UID") ||
    optionalEnv("FIREBASE_PLATFORM_OPERATOR_UIDS").split(",")[0]?.trim() ||
    "H7ht0iJdWqhQjPaKozon5ndmonJ2";
  const role = optionalEnv("FIREBASE_PLATFORM_OPERATOR_ROLE", "platform_operator") || "platform_operator";
  const tenantId = optionalEnv("FIREBASE_DEFAULT_TENANT_ID", "nexteam-studio") || "nexteam-studio";

  return {
    email,
    password,
    uid,
    role,
    tenantId,
  };
}

export function resolveBaseUrl() {
  return requireEnv("NEXTEAM_BASE_URL", "https://nexteam-studio-production.up.railway.app");
}

export function resolveFirebaseWebConfig() {
  return {
    apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
    authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN", "nexteam-studio.firebaseapp.com"),
    projectId: requireEnv("VITE_FIREBASE_PROJECT_ID", "nexteam-studio"),
    storageBucket: optionalEnv("VITE_FIREBASE_STORAGE_BUCKET", "nexteam-studio.appspot.com"),
    messagingSenderId: optionalEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv("VITE_FIREBASE_APP_ID"),
  };
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json,
  };
}

export async function signInWithPasswordRest({ apiKey, email, password }) {
  const response = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok || !response.json?.idToken) {
    throw new Error(
      `Firebase email/password sign-in failed (${response.status}): ${response.json?.error?.message || response.text}`
    );
  }

  return response.json;
}

export async function signInWithCustomTokenRest({ apiKey, token }) {
  const response = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok || !response.json?.idToken) {
    throw new Error(
      `Firebase custom-token sign-in failed (${response.status}): ${response.json?.error?.message || response.text}`
    );
  }

  return response.json;
}

export async function createOperatorProofSession({
  firebaseConfig = resolveFirebaseWebConfig(),
  identity = resolveOperatorProofIdentity(),
} = {}) {
  if (identity.email && identity.password) {
    const signIn = await signInWithPasswordRest({
      apiKey: firebaseConfig.apiKey,
      email: identity.email,
      password: identity.password,
    });

    return {
      mode: "email-password",
      idToken: signIn.idToken,
      customToken: null,
      identity,
      async dispose() {},
    };
  }

  if (!identity.uid) {
    throw new Error(
      "Missing operator proof identity. Set NEXTEAM_OPERATOR_EMAIL/NEXTEAM_OPERATOR_PASSWORD or NEXTEAM_OPERATOR_UID/FIREBASE_PLATFORM_OPERATOR_UIDS."
    );
  }

  const minter = createAdminTokenMinter();
  const customToken = await minter.mint(identity.uid, {
    tenantId: identity.tenantId,
    role: identity.role,
  });
  const signIn = await signInWithCustomTokenRest({
    apiKey: firebaseConfig.apiKey,
    token: customToken,
  });

  return {
    mode: "custom-token",
    idToken: signIn.idToken,
    customToken,
    identity,
    async dispose() {
      await minter.dispose();
    },
  };
}

export function resolveServiceAccountPath() {
  return requireEnv("GOOGLE_APPLICATION_CREDENTIALS");
}

export function createAdminTokenMinter({ serviceAccountPath = resolveServiceAccountPath() } = {}) {
  const credentials = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  const appName = `live-proof-admin-${randomUUID()}`;
  const app = initializeAdminApp(
    {
      credential: cert(credentials),
      projectId: credentials.project_id,
    },
    appName
  );
  const auth = getAdminAuth(app);

  return {
    async mint(uid, claims = {}) {
      return auth.createCustomToken(uid, claims);
    },
    async dispose() {
      await deleteAdminApp(app);
    },
  };
}

export async function createFirestoreClientSession({
  firebaseConfig = resolveFirebaseWebConfig(),
  customToken,
  appName = `live-proof-client-${randomUUID()}`,
} = {}) {
  const app = initializeClientApp(firebaseConfig, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithCustomToken(auth, customToken);

  return {
    app,
    auth,
    db,
    async getDocument(path) {
      const snapshot = await getDoc(doc(db, path));
      return {
        exists: snapshot.exists(),
        id: snapshot.id,
        data: snapshot.exists() ? snapshot.data() : null,
      };
    },
    async dispose() {
      try {
        if (auth.currentUser) {
          await signOut(auth);
        }
      } finally {
        await deleteClientApp(app);
      }
    },
  };
}

export async function disposeAllNamedFirebaseApps() {
  await Promise.all(getApps().map((app) => deleteAdminApp(app).catch(() => {})));
}
