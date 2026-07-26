import AsyncStorageModule, { type AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from "firebase/auth";
import {
  mobileRoleSchema,
  mobileServerAccessSchema,
  mobileSessionSchema,
  type MobileRole,
  type MobileRuntimeConfig,
  type MobileServerAccess,
  type MobileSession
} from "./captureModels.js";

const DEV_SESSION_STORAGE_KEY = "nexteam.mobile.devSession";
const MOBILE_FIREBASE_APP = "nexteam-mobile";
const AsyncStorage = AsyncStorageModule as unknown as AsyncStorageStatic;

export type DevHeaderProfile = {
  tenantUserId: string;
  role: MobileRole;
  email: string;
  label: string;
};

export const LOCAL_DEV_PROFILES: DevHeaderProfile[] = [
  {
    tenantUserId: "tenant_user_chris",
    role: "OWNER",
    email: "owner@local.dev",
    label: "Owner"
  },
  {
    tenantUserId: "office_catherine",
    role: "OFFICE_ADMIN",
    email: "catherine@local.dev",
    label: "Catherine Office"
  },
  {
    tenantUserId: "tech_chris",
    role: "TECHNICIAN",
    email: "chris@aquatraceleak.com",
    label: "Chris Tech"
  },
  {
    tenantUserId: "tech_logan",
    role: "TECHNICIAN",
    email: "logan@aquatraceleak.com",
    label: "Logan Tech"
  }
];

export type MobileFirebaseBundle = {
  app: FirebaseApp;
  auth: Auth;
};

function firebaseEnabled(runtime: MobileRuntimeConfig): boolean {
  return runtime.authRequired && runtime.firebaseConfigured;
}

export function initMobileFirebase(runtime: MobileRuntimeConfig): MobileFirebaseBundle | null {
  if (!firebaseEnabled(runtime)) {
    return null;
  }
  const app = getApps().some((candidate) => candidate.name === MOBILE_FIREBASE_APP)
    ? getApp(MOBILE_FIREBASE_APP)
    : initializeApp(runtime.firebase, MOBILE_FIREBASE_APP);
  let auth: Auth;
  try {
    auth = initializeAuth(app);
  } catch {
    auth = getAuth(app);
  }
  return { app, auth };
}

export function waitForFirebaseUser(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function signInMobileFirebase(runtime: MobileRuntimeConfig, email: string, password: string): Promise<string> {
  const bundle = initMobileFirebase(runtime);
  if (!bundle) {
    throw new Error("Firebase staff auth is not active in this mobile runtime.");
  }
  const credentials = await signInWithEmailAndPassword(bundle.auth, email.trim(), password);
  return credentials.user.getIdToken();
}

export async function currentMobileIdToken(runtime: MobileRuntimeConfig): Promise<string | null> {
  const bundle = initMobileFirebase(runtime);
  if (!bundle) {
    return null;
  }
  const user = bundle.auth.currentUser ?? await waitForFirebaseUser(bundle.auth);
  return user ? user.getIdToken() : null;
}

export async function signOutMobileFirebase(runtime: MobileRuntimeConfig): Promise<void> {
  const bundle = initMobileFirebase(runtime);
  if (!bundle) {
    return;
  }
  await firebaseSignOut(bundle.auth);
}

export async function restoreLocalDevSession(): Promise<MobileSession | null> {
  const raw = await AsyncStorage.getItem(DEV_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return mobileSessionSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    await AsyncStorage.removeItem(DEV_SESSION_STORAGE_KEY);
    return null;
  }
}

export async function saveLocalDevSession(session: MobileSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(DEV_SESSION_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(DEV_SESSION_STORAGE_KEY, JSON.stringify(mobileSessionSchema.parse(session)));
}

export function createLocalDevSession(input: {
  tenantId: string;
  tenantUserId: string;
  role: MobileRole;
  email: string;
  label: string;
}): MobileSession {
  return mobileSessionSchema.parse({
    mode: "local_dev",
    tenantId: input.tenantId,
    tenantUserId: input.tenantUserId,
    role: mobileRoleSchema.parse(input.role),
    email: input.email,
    userId: input.tenantUserId,
    label: input.label,
    idToken: null,
    lastAuthenticatedAt: new Date().toISOString()
  });
}

export function mobileSessionFromAccess(input: {
  mode: MobileSession["mode"];
  access: MobileServerAccess;
  userId: string;
  label?: string | undefined;
  idToken?: string | null | undefined;
}): MobileSession {
  const access = mobileServerAccessSchema.parse(input.access);
  return mobileSessionSchema.parse({
    mode: input.mode,
    tenantId: access.tenantId,
    tenantUserId: access.tenantUserId,
    role: access.role,
    ...(access.email ? { email: access.email } : {}),
    userId: input.userId,
    label: input.label?.trim() || access.email || access.tenantUserId,
    idToken: input.idToken ?? null,
    lastAuthenticatedAt: new Date().toISOString()
  });
}
