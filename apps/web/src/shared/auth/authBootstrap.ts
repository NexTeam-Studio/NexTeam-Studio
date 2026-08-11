import { getApps, initializeApp } from "firebase/app";
import { getAuth, signOut, type Auth, type User } from "firebase/auth";
import type { FirebasePublicConfig } from "../contracts/runtime";
import type { AuthBootstrap, LocalAuthProfileSummary } from "./types";

interface RuntimeConfigResponse {
  ok: boolean;
  firebase: FirebasePublicConfig;
  firebaseConfigured: boolean;
  authRequired?: boolean;
  localAuthEnabled?: boolean;
  localProfiles?: LocalAuthProfileSummary[];
}

interface LocalAuthSessionResponse {
  ok: boolean;
  token?: string;
  profile?: LocalAuthProfileSummary;
  error?: string;
}

const buildTimeFirebaseConfig: FirebasePublicConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || "",
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || "",
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || "",
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || "",
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || "",
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || ""
};

export const CONFIGURED_TENANT_ID = (import.meta.env.VITE_TENANT_ID as string | undefined)?.trim() ?? "";
const LOCAL_SESSION_TOKEN_KEY = "nexops.local-auth-token";
const NEXCOMMAND_SESSION_TOKEN_KEY = "nexcommand.session-token";
const NEXCOMMAND_FRESH_AUTH_KEY = "nexcommand.fresh-auth";

function completeFirebaseConfig(config: FirebasePublicConfig): boolean {
  return Object.values(config).every((value) => value.length > 0);
}

function createFirebaseAuth(config: FirebasePublicConfig): Auth | null {
  if (!completeFirebaseConfig(config)) {
    return null;
  }
  const existingApp = getApps()[0];
  return getAuth(existingApp ?? initializeApp(config));
}

function readLocalSessionToken(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLocalSessionToken(token: string): void {
  try {
    window.localStorage.setItem(LOCAL_SESSION_TOKEN_KEY, token);
  } catch {
    // Local storage is optional in explicit local-development mode.
  }
}

function clearLocalSessionToken(): void {
  try {
    window.localStorage.removeItem(LOCAL_SESSION_TOKEN_KEY);
  } catch {
    // Local storage is optional in explicit local-development mode.
  }
}

function readNexCommandSessionToken(): string | null { try { return window.sessionStorage.getItem(NEXCOMMAND_SESSION_TOKEN_KEY); } catch { return null; } }
function clearNexCommandSession(): void { try { window.sessionStorage.removeItem(NEXCOMMAND_SESSION_TOKEN_KEY); window.sessionStorage.removeItem(NEXCOMMAND_FRESH_AUTH_KEY); } catch { /* session storage is optional */ } }
export function markFreshNexCommandAuthentication(): void { try { window.sessionStorage.setItem(NEXCOMMAND_FRESH_AUTH_KEY, "1"); } catch { /* session storage is optional */ } }
export function hasFreshNexCommandAuthentication(): boolean { try { return window.sessionStorage.getItem(NEXCOMMAND_FRESH_AUTH_KEY) === "1"; } catch { return false; } }
export function hasNexCommandSession(): boolean { return Boolean(readNexCommandSessionToken()); }
export async function establishNexCommandSession(user: User): Promise<void> {
  const firebaseToken = await user.getIdToken();
  const response = await fetch("/api/platform/admin/session", { method: "POST", headers: { authorization: `Bearer ${firebaseToken}` } });
  const body = await response.json() as { ok?: boolean; token?: string };
  if (!response.ok || !body.ok || !body.token) throw new Error("NexCommand session could not be created.");
  try { window.sessionStorage.setItem(NEXCOMMAND_SESSION_TOKEN_KEY, body.token); window.sessionStorage.removeItem(NEXCOMMAND_FRESH_AUTH_KEY); } catch { throw new Error("NexCommand requires browser session storage."); }
}

/**
 * NexCommand has a small number of legacy platform routes outside the
 * `/admin` namespace.  They are still internal-console routes and must use
 * the same short-lived NexCommand session; a Firebase browser session alone
 * is never sufficient authorization for them.
 */
function isNexCommandApiRequest(requestUrl: string): boolean {
  return requestUrl.includes("/api/platform/")
    && !requestUrl.endsWith("/api/platform/admin/session");
}

function installSessionFetchBridge(auth: Auth | null): void {
  const bridgeWindow = window as Window & {
    __nexopsLocalFetchBridgeInstalled?: boolean;
    __nexopsOriginalFetch?: typeof window.fetch;
  };
  if (bridgeWindow.__nexopsLocalFetchBridgeInstalled) {
    return;
  }
  const originalFetch = window.fetch.bind(window);
  bridgeWindow.__nexopsOriginalFetch = originalFetch;
  bridgeWindow.__nexopsLocalFetchBridgeInstalled = true;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const nexCommandToken = isNexCommandApiRequest(requestUrl) ? readNexCommandSessionToken() : null;
    const token = nexCommandToken ?? readLocalSessionToken() ?? await auth?.currentUser?.getIdToken();
    if (!token) {
      return originalFetch(input, init);
    }
    if (!requestUrl.startsWith("/") && !requestUrl.startsWith(window.location.origin)) {
      return originalFetch(input, init);
    }
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    if (nexCommandToken || !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return originalFetch(input, { ...init, headers });
  }) as typeof window.fetch;
}

function localSessionUser(token: string, profile: LocalAuthProfileSummary): User {
  return {
    uid: profile.tenantUserId,
    email: profile.email,
    async getIdToken() {
      return token;
    },
    async getIdTokenResult() {
      return {
        token,
        authTime: "",
        issuedAtTime: "",
        expirationTime: "",
        signInProvider: "custom",
        signInSecondFactor: null,
        claims: {
          tenantId: profile.tenantId,
          tenantUserId: profile.tenantUserId,
          tenantRole: profile.role,
          role: profile.role
        }
      };
    }
  } as unknown as User;
}

async function restoreLocalSession(tenantId: string): Promise<User | null> {
  const token = readLocalSessionToken();
  if (!token) {
    return null;
  }
  try {
    const response = await fetch(`/api/public/local-auth/session?tenantId=${encodeURIComponent(tenantId)}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const body = response.ok ? await response.json() as LocalAuthSessionResponse : null;
    if (!body?.ok || !body.token || !body.profile) {
      clearLocalSessionToken();
      return null;
    }
    writeLocalSessionToken(body.token);
    return localSessionUser(body.token, body.profile);
  } catch {
    clearLocalSessionToken();
    return null;
  }
}

export async function signInWithLocalCredentials(email: string, tenantId: string): Promise<User> {
  const response = await fetch("/api/public/local-auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, tenantId })
  });
  const body = await response.json() as LocalAuthSessionResponse;
  if (!response.ok || !body.ok || !body.token || !body.profile) {
    throw new Error(body.error || "Local sign-in failed.");
  }
  writeLocalSessionToken(body.token);
  return localSessionUser(body.token, body.profile);
}

export async function signOutOperator(auth: Auth | null, destination = "/nexops/sign-in"): Promise<void> {
  const nexCommandToken = readNexCommandSessionToken();
  if (nexCommandToken) await fetch("/api/platform/admin/session/sign-out", { method: "POST", headers: { authorization: `Bearer ${nexCommandToken}` } }).catch(() => undefined);
  clearNexCommandSession();
  clearLocalSessionToken();
  if (auth) {
    await signOut(auth);
  }
  window.location.assign(destination);
}

export async function loadAuthBootstrap(): Promise<AuthBootstrap> {
  let runtime: RuntimeConfigResponse | null = null;
  try {
    runtime = await fetch("/api/public/runtime-config").then((response) => response.json() as Promise<RuntimeConfigResponse>);
  } catch {
    runtime = null;
  }
  const config = completeFirebaseConfig(buildTimeFirebaseConfig)
    ? buildTimeFirebaseConfig
    : runtime?.ok && runtime.firebaseConfigured
      ? runtime.firebase
      : buildTimeFirebaseConfig;
  const localAuthEnabled = runtime?.ok && runtime.localAuthEnabled === true;
  const localProfiles = runtime?.ok ? runtime.localProfiles ?? [] : [];
  const localTenantId = localProfiles[0]?.tenantId ?? CONFIGURED_TENANT_ID;
  const auth = createFirebaseAuth(config);
  installSessionFetchBridge(auth);
  return {
    auth,
    authRequired: runtime?.ok ? runtime.authRequired !== false : true,
    localAuthEnabled,
    localProfiles,
    localTenantId,
    localUser: localAuthEnabled ? await restoreLocalSession(localTenantId) : null
  };
}
