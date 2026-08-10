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
          setUser(nextUser);
          setAuthReady(true);
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
    markFreshNexCommandAuthentication();
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

function requireFirebaseAuth(auth: Auth | null): Auth {
  if (!auth) throw new Error("Firebase auth is not configured.");
  return auth;
}

export function useAuthSession(): AuthSessionValue {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider.");
  return context;
}
