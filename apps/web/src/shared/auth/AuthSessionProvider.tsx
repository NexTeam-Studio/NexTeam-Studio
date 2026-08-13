import React, { useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, type Auth, type User } from "firebase/auth";
import { loadAuthBootstrap, markFreshNexCommandAuthentication, signInWithLocalCredentials, signOutOperator } from "./authBootstrap";
import type { LocalAuthProfileSummary } from "./types";

export interface AuthSessionValue {
  auth: Auth | null;
  authReady: boolean;
  localAuthEnabled: boolean;
  localProfiles: LocalAuthProfileSummary[];
  localTenantId: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  user: User | null;
}

export const VERIFIED_EMAIL_REQUIRED_MESSAGE = "Verify the email address for this account before opening NexOps.";

function usesPlatformIdentityPath(pathname = window.location.pathname): boolean {
  return pathname.startsWith("/platform") || pathname.startsWith("/nexcommand");
}

export function isVerifiedEmailRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === VERIFIED_EMAIL_REQUIRED_MESSAGE;
}

export function authFailureMessage(error: unknown, localAuthEnabled: boolean): string {
  if (localAuthEnabled) return "We couldn't sign you in with that local profile.";
  if (isVerifiedEmailRequiredError(error)) return VERIFIED_EMAIL_REQUIRED_MESSAGE;
  if (error instanceof Error && error.message === "This authenticated account is not assigned to an active NexOps workspace.") return error.message;
  if (error instanceof Error && error.message === "This account is a NexCommand account. Open NexCommand to continue.") return error.message;
  return "We couldn't sign you in. Check your email and password, or reset your password.";
}

const AuthSessionContext = React.createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider(props: { children: React.ReactNode }): React.ReactElement {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [localProfiles, setLocalProfiles] = useState<LocalAuthProfileSummary[]>([]);
  const [localTenantId, setLocalTenantId] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    loadAuthBootstrap()
      .then((bootstrap) => {
        if (cancelled) return;
        setAuth(bootstrap.auth);
        setLocalAuthEnabled(bootstrap.localAuthEnabled);
        setLocalProfiles(bootstrap.localProfiles);
        setLocalTenantId(bootstrap.localTenantId);
        if (bootstrap.localUser) {
          setUser(bootstrap.localUser);
          setAuthReady(true);
          return;
        }
        if (bootstrap.localAuthEnabled || !bootstrap.auth) {
          setAuthReady(true);
          return;
        }
        unsubscribe = onAuthStateChanged(bootstrap.auth, (nextUser) => {
          void (async () => {
            if (nextUser && !usesPlatformIdentityPath()) await ensureWorkspaceLink(nextUser);
            if (!cancelled) setUser(nextUser);
            if (!cancelled) setAuthReady(true);
          })().catch(() => {
            if (!cancelled) setUser(null);
            if (!cancelled) setAuthReady(true);
          });
        });
      })
      .catch(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    const nextUser = localAuthEnabled
      ? await signInWithLocalCredentials(email, localTenantId)
      : (await signInWithEmailAndPassword(requireFirebaseAuth(auth), email, password)).user;
    if (!localAuthEnabled && usesPlatformIdentityPath()) {
      markFreshNexCommandAuthentication();
    } else if (!localAuthEnabled) {
      await ensureWorkspaceLink(nextUser);
    }
    setUser(nextUser);
  }

  async function signOut(): Promise<void> {
    await signOutOperator(auth);
    setUser(null);
  }

  return (
    <AuthSessionContext.Provider value={{ auth, authReady, localAuthEnabled, localProfiles, localTenantId, signIn, signOut, user }}>
      {props.children}
    </AuthSessionContext.Provider>
  );
}

async function ensureWorkspaceLink(user: User): Promise<void> {
  // Refresh first so a recently verified account presents its current Firebase claim.
  const token = await user.getIdToken(true);
  const response = await fetch("/api/auth/workspace-link", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (response.ok) return;
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  const error = typeof body?.error === "string" ? body.error : "";
  if (error === "A verified email is required to open this workspace.") throw new Error(VERIFIED_EMAIL_REQUIRED_MESSAGE);
  if (error === "Platform identities do not use tenant workspace linking.") throw new Error("This account is a NexCommand account. Open NexCommand to continue.");
  if (error === "No active workspace membership matches this verified email.") throw new Error("This authenticated account is not assigned to an active NexOps workspace.");
  throw new Error("Workspace unavailable.");
}

function requireFirebaseAuth(auth: Auth | null): Auth {
  if (!auth) throw new Error("Firebase auth is not configured.");
  return auth;
}

export function useAuthSession(): AuthSessionValue {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider.");
  return context;
}
