import { PLATFORM_OPERATOR_ROLES, createTenantActorScope } from "../features/tenancy/services/tenantAccessPolicy.js";
import { assertSafeTenantId } from "../features/tenancy/services/tenantPathUtils.js";
import { getFirebaseAdminAuth } from "./firebaseAdminApp.js";

function parseCsvList(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  )];
}

export function resolveDefaultBootstrapTenantId(env = process.env) {
  const tenantId = String(env.FIREBASE_DEFAULT_TENANT_ID || env.VITE_TENANT_ID || "").trim();
  if (!tenantId) {
    return null;
  }

  assertSafeTenantId(tenantId);
  return tenantId;
}

export function resolvePlatformOperatorRole(env = process.env) {
  const requestedRole = String(env.FIREBASE_PLATFORM_OPERATOR_ROLE || "platform_operator").trim();
  if (!PLATFORM_OPERATOR_ROLES.has(requestedRole)) {
    throw new Error(
      `Invalid FIREBASE_PLATFORM_OPERATOR_ROLE "${requestedRole}". Expected one of: ${[
        ...PLATFORM_OPERATOR_ROLES,
      ].join(", ")}.`
    );
  }
  return requestedRole;
}

export function isPlatformOperatorIdentity({ uid = "", email = "" } = {}, env = process.env) {
  const allowedEmails = new Set(parseCsvList(env.FIREBASE_PLATFORM_OPERATOR_EMAILS));
  const allowedUids = new Set(parseCsvList(env.FIREBASE_PLATFORM_OPERATOR_UIDS));
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUid = String(uid || "").trim().toLowerCase();

  return (normalizedEmail && allowedEmails.has(normalizedEmail)) || (normalizedUid && allowedUids.has(normalizedUid));
}

export function buildFirebaseTenantClaims({ tenantId = null, role = null } = {}) {
  const claims = {};

  if (tenantId != null) {
    assertSafeTenantId(tenantId);
    claims.tenantId = tenantId;
  }

  if (role != null) {
    if (!PLATFORM_OPERATOR_ROLES.has(role)) {
      throw new Error(`Invalid Firebase platform role "${role}".`);
    }
    claims.role = role;
  }

  return claims;
}

export async function setFirebaseCustomClaims({ uid, tenantId = null, role = null, env = process.env }) {
  if (!uid) {
    throw new Error("uid is required to set Firebase custom claims.");
  }

  const auth = getFirebaseAdminAuth(env);
  const user = await auth.getUser(uid);
  const nextClaims = buildFirebaseTenantClaims({ tenantId, role });
  const mergedClaims = { ...(user.customClaims || {}) };

  if ("tenantId" in nextClaims) {
    mergedClaims.tenantId = nextClaims.tenantId;
  } else {
    delete mergedClaims.tenantId;
  }

  if ("role" in nextClaims) {
    mergedClaims.role = nextClaims.role;
  } else {
    delete mergedClaims.role;
  }

  await auth.setCustomUserClaims(uid, mergedClaims);
  return mergedClaims;
}

export async function verifyFirebaseIdToken(idToken, env = process.env) {
  if (!idToken) {
    throw new Error("Firebase ID token is required.");
  }

  const auth = getFirebaseAdminAuth(env);
  return auth.verifyIdToken(idToken);
}

export function readBearerTokenFromAuthorizationHeader(headerValue) {
  const header = String(headerValue || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing Bearer authorization header.");
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw new Error("Bearer authorization header did not include a token.");
  }

  return token;
}

export function createTenantActorScopeFromVerifiedToken(decodedToken = {}) {
  const tenantId = typeof decodedToken.tenantId === "string" ? decodedToken.tenantId : null;
  const roles = typeof decodedToken.role === "string" ? [decodedToken.role] : [];
  return createTenantActorScope({ tenantId, roles });
}

export async function verifyFirebaseIdTokenFromAuthorizationHeader(headerValue, env = process.env) {
  const token = readBearerTokenFromAuthorizationHeader(headerValue);
  const decodedToken = await verifyFirebaseIdToken(token, env);
  return {
    decodedToken,
    actorScope: createTenantActorScopeFromVerifiedToken(decodedToken),
  };
}

export function resolveRequestedBootstrapTenant({
  requestedTenantId = null,
  decodedToken = {},
  env = process.env,
} = {}) {
  const defaultTenantId = resolveDefaultBootstrapTenantId(env);
  const normalizedRequestedTenantId = requestedTenantId == null ? null : String(requestedTenantId).trim();
  const isOperator = isPlatformOperatorIdentity(
    { uid: decodedToken.uid, email: decodedToken.email },
    env
  );

  if (normalizedRequestedTenantId) {
    assertSafeTenantId(normalizedRequestedTenantId);
  }

  if (isOperator) {
    return normalizedRequestedTenantId || defaultTenantId || decodedToken.tenantId || null;
  }

  if (!defaultTenantId) {
    throw new Error(
      "FIREBASE_DEFAULT_TENANT_ID must be configured before non-operator users can bootstrap Firestore tenant access."
    );
  }

  if (normalizedRequestedTenantId && normalizedRequestedTenantId !== defaultTenantId) {
    throw new Error("Non-operator users cannot request arbitrary tenant access.");
  }

  return defaultTenantId;
}

export async function applyTenantBootstrapClaims({
  idToken,
  requestedTenantId = null,
  env = process.env,
} = {}) {
  const decodedToken = await verifyFirebaseIdToken(idToken, env);
  const tenantId = resolveRequestedBootstrapTenant({
    requestedTenantId,
    decodedToken,
    env,
  });

  if (!tenantId) {
    throw new Error("No tenantId was resolved for Firebase bootstrap claims.");
  }

  const role = isPlatformOperatorIdentity(
    { uid: decodedToken.uid, email: decodedToken.email },
    env
  )
    ? resolvePlatformOperatorRole(env)
    : null;

  const claims = await setFirebaseCustomClaims({
    uid: decodedToken.uid,
    tenantId,
    role,
    env,
  });

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || "",
    claims,
    actorScope: createTenantActorScopeFromVerifiedToken({
      ...decodedToken,
      ...claims,
    }),
  };
}
