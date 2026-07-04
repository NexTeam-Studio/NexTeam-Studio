import {
  getIdTokenResult,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../../../firebase.js";
import { PLATFORM_OPERATOR_ROLES } from "../../tenancy/services/tenantAccessPolicy.js";
import { assertSafeTenantId } from "../../tenancy/services/tenantPathUtils.js";

const FIREBASE_AUTH_BOOTSTRAP_ENDPOINT = "/api/internal/firebase-auth/tenant-bootstrap";
const FIREBASE_AUTH_ME_ENDPOINT = "/api/internal/firebase-auth/me";
const FIREBASE_PUBLIC_SESSION_ENDPOINT = "/api/public/firebase-auth/session";
let bootstrapPromise = null;

function buildBootstrapHeaders(idToken) {
  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

async function postTenantBootstrap({ idToken, tenantId }) {
  const response = await fetch(FIREBASE_AUTH_BOOTSTRAP_ENDPOINT, {
    method: "POST",
    headers: buildBootstrapHeaders(idToken),
    body: JSON.stringify({ tenantId }),
  });

  if (response.status === 404) {
    return { ok: false, skipped: true, reason: "backend-route-unavailable" };
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Firebase tenant bootstrap failed.");
  }

  return payload;
}

async function requestPublicFirebaseSession() {
  const response = await fetch(FIREBASE_PUBLIC_SESSION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.customToken) {
    throw new Error(payload?.error || "Firebase public session bootstrap failed.");
  }

  return payload;
}

export async function ensurePublicFirebaseSession() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (!auth.currentUser) {
      const session = await requestPublicFirebaseSession();
      await signInWithCustomToken(auth, session.customToken);
    }

    return getIdTokenResult(auth.currentUser, true);
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function ensureTenantFirebaseSession({
  tenantId,
  bootstrapRoute = FIREBASE_AUTH_BOOTSTRAP_ENDPOINT,
} = {}) {
  if (!tenantId) {
    throw new Error("tenantId is required for Firebase tenant bootstrap.");
  }

  assertSafeTenantId(tenantId);

  if (bootstrapRoute !== FIREBASE_AUTH_BOOTSTRAP_ENDPOINT) {
    throw new Error("Custom bootstrap routes are not supported in this build.");
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (!auth.currentUser) {
      const session = await requestPublicFirebaseSession();
      await signInWithCustomToken(auth, session.customToken);
    }

    let tokenResult = await getIdTokenResult(auth.currentUser);
    if (tokenResult.claims?.tenantId === tenantId || PLATFORM_OPERATOR_ROLES.has(String(tokenResult.claims?.role || ""))) {
      return tokenResult;
    }

    const idToken = await auth.currentUser.getIdToken();
    const bootstrap = await postTenantBootstrap({ idToken, tenantId });
    if (!bootstrap.skipped) {
      tokenResult = await getIdTokenResult(auth.currentUser, true);
    }

    return tokenResult;
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function signInFirebaseOperator({ email, password, tenantId = null } = {}) {
  if (!email || !password) {
    throw new Error("Operator email and password are required.");
  }

  await signInWithEmailAndPassword(auth, String(email).trim(), String(password));
  const idToken = await auth.currentUser.getIdToken();
  const bootstrap = await postTenantBootstrap({ idToken, tenantId });
  if (bootstrap.skipped) {
    throw new Error("Firebase operator bootstrap route is unavailable.");
  }

  const tokenResult = await getIdTokenResult(auth.currentUser, true);
  const role = String(tokenResult.claims?.role || "");
  if (!PLATFORM_OPERATOR_ROLES.has(role)) {
    throw new Error("Signed-in Firebase user does not have a platform operator role.");
  }

  return {
    bootstrap,
    tokenResult,
  };
}

export async function loadFirebaseActorProfile() {
  if (!auth.currentUser) {
    return null;
  }

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(FIREBASE_AUTH_ME_ENDPOINT, {
    headers: buildBootstrapHeaders(idToken),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function signOutFirebaseSession() {
  if (auth.currentUser) {
    await signOut(auth);
  }
}
