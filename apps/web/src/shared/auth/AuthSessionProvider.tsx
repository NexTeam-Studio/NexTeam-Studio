import React, { useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from "firebase/auth";
import { recordBrowserEvent } from "../telemetry/browserTelemetry";
import { loadFirebaseAuth } from "./firebaseAuth";

interface AuthSessionValue {
  auth: Auth | null;
  user: User | null;
  authReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthSessionContext = React.createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider(props: { children: React.ReactNode }): React.ReactElement {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    loadFirebaseAuth()
      .then((nextAuth) => {
        if (cancelled) {
          return;
        }
        setAuth(nextAuth);
        if (!nextAuth) {
          setAuthReady(true);
          return;
        }
        unsubscribe = onAuthStateChanged(nextAuth, (nextUser) => {
          setUser(nextUser);
          setAuthReady(true);
        });
      })
      .catch((error) => {
        recordBrowserEvent("auth.load_failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        if (!cancelled) {
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    if (!auth) {
      throw new Error("Firebase auth is not configured.");
    }
    const result = await signInWithEmailAndPassword(auth, email, password);
    setUser(result.user);
  }

  async function signOut(): Promise<void> {
    if (!auth) {
      return;
    }
    await firebaseSignOut(auth);
    setUser(null);
  }

  return (
    <AuthSessionContext.Provider value={{ auth, authReady, signIn, signOut, user }}>
      {props.children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider.");
  }
  return context;
}
