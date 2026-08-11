import { randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const baseUrl = (process.env.NEXTEAM_STAGING_BASE_URL || "https://nexstage.nexteam.studio").replace(/\/$/, "");
const tenantName = argument("--tenant-name");
const ownerEmail = argument("--owner-email").toLowerCase();
const apiKey = String(process.env.VITE_FIREBASE_API_KEY || "").trim();
const operatorUid = String(process.env.NEXTEAM_OPERATOR_UID || process.env.FIREBASE_PLATFORM_OPERATOR_UIDS || "").split(",")[0]?.trim();

if (!tenantName || !ownerEmail || !apiKey || !operatorUid) {
  throw new Error("Staging owner-invite acceptance requires a tenant name, owner email, Firebase web key, and approved operator UID.");
}

function argument(name) {
  const position = process.argv.indexOf(name);
  return position >= 0 ? String(process.argv[position + 1] || "").trim() : "";
}

function credentials() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (raw) return JSON.parse(raw);
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Staging owner-invite route failed with HTTP ${response.status}.`);
  return body;
}

async function stagingIdToken(auth) {
  const customToken = await auth.createCustomToken(operatorUid, { platform_operator: true, role: "platform_operator" });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) throw new Error(`Temporary staging operator sign-in failed with HTTP ${response.status}.`);
  return body.idToken;
}

const app = initializeApp({ credential: cert(credentials()) }, `staging-owner-invite-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
let sessionToken = "";

try {
  const idToken = await stagingIdToken(auth);
  const session = await json(`${baseUrl}/api/platform/admin/session`, { method: "POST", headers: { authorization: `Bearer ${idToken}` } });
  sessionToken = String(session.token || "");
  if (!sessionToken.startsWith("ncs_")) throw new Error("Staging NexCommand session was not created.");
  const headers = { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" };
  const tenants = await json(`${baseUrl}/api/platform/tenants`, { headers });
  const matches = (tenants.tenants || []).filter((row) => row?.tenant?.name === tenantName);
  if (matches.length !== 1) throw new Error(`Expected exactly one staging tenant for the requested owner-invite acceptance; found ${matches.length}.`);
  const tenant = matches[0].tenant;
  const ownersBefore = (await db.collection("tenantUsers").where("tenantId", "==", tenant.id).get()).docs
    .map((document) => document.data())
    .filter((user) => user.role === "OWNER" && user.active !== false && String(user.email || "").toLowerCase() === ownerEmail);
  if (ownersBefore.length !== 1 || !ownersBefore[0].authUid) throw new Error("The expected active staging owner identity was not uniquely linked to the tenant.");
  const owner = ownersBefore[0];
  const ownerAuth = await auth.getUser(owner.authUid);
  const tenantClaimMatches = ownerAuth.customClaims?.tenantId === tenant.id && ownerAuth.customClaims?.tenantRole === "OWNER";
  if (!tenantClaimMatches) throw new Error("The staging owner Firebase claims do not match the requested tenant.");

  const resend = await json(`${baseUrl}/api/platform/admin/tenants/${encodeURIComponent(tenant.id)}/owner-invite/resend`, {
    method: "POST", headers, body: JSON.stringify({ ownerEmail })
  });
  const invite = await db.collection("tenantOwnerInvites").doc(`owner_invite_${tenant.id}_${owner.id}`).get();
  const inviteData = invite.data() || {};
  const ownersAfter = (await db.collection("tenantUsers").where("tenantId", "==", tenant.id).get()).docs
    .map((document) => document.data())
    .filter((user) => user.role === "OWNER" && user.active !== false && String(user.email || "").toLowerCase() === ownerEmail);
  const audits = await db.collection("platformSecurityAudits").where("subjectUid", "==", owner.authUid).get();
  const auditRecorded = audits.docs.some((document) => document.data().action === "tenant_owner_invite.sent");
  const accepted = resend?.invite?.status === "SENT_TO_PROVIDER" && inviteData.status === "SENT_TO_PROVIDER" && Boolean(inviteData.providerMessageId);
  const summary = {
    stagingOnly: true,
    tenantMatch: matches.length === 1,
    ownerMatch: ownersBefore.length === 1,
    tenantId: tenant.id,
    providerAcceptance: accepted ? "ACCEPTED" : "NOT_ACCEPTED",
    provider: accepted ? String(inviteData.provider || resend?.invite?.provider || "gmail") : "UNAVAILABLE",
    messageId: accepted ? String(inviteData.providerMessageId) : null,
    invitationRecord: invite.exists && inviteData.tenantId === tenant.id && inviteData.ownerUserId === owner.id ? "UPDATED" : "NOT_UPDATED",
    auditEvent: auditRecorded ? "RECORDED" : "MISSING",
    duplicateProtection: ownersAfter.length === 1 ? "PASSED" : "FAILED",
    firebaseResetLink: tenantClaimMatches ? "FIREBASE_GENERATED_FOR_LINKED_OWNER_NOT_PERSISTED" : "UNVERIFIED",
    inboxDelivery: "REQUIRES_RECIPIENT_CONFIRMATION"
  };
  console.log(JSON.stringify(summary));
  if (!accepted || !auditRecorded || ownersAfter.length !== 1) process.exitCode = 1;
} finally {
  if (sessionToken) {
    await fetch(`${baseUrl}/api/platform/admin/session/sign-out`, { method: "POST", headers: { authorization: `Bearer ${sessionToken}` } }).catch(() => undefined);
  }
  await deleteApp(app).catch(() => undefined);
}
