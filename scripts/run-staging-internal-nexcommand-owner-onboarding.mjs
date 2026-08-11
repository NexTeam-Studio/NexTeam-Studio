import { randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GmailSendAdapter } from "@nexteam/providers";

const EMAIL = "nexteamstudioai@gmail.com";
const JOB_ID = "NEXTEAM-DAY1-CREATE-INTERNAL-OWNER-ONBOARDING-20260810";
const SENT_AUDIT_DETAIL = "Staging internal NexCommand onboarding dispatch was accepted by the provider; delivery metadata only.";
const STARTED_AUDIT_DETAIL = "Staging internal NexCommand onboarding dispatch was initiated; do not retry automatically.";

function credentials() {
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

function operatorUid() {
  const uid = String(process.env.FIREBASE_PLATFORM_OPERATOR_UIDS || "").split(",")[0]?.trim();
  if (!uid) throw new Error("The staging platform operator UID is unavailable.");
  return uid;
}

function safeErrorCode(error) {
  return String(error && typeof error === "object" && "code" in error ? error.code : "UNKNOWN").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "UNKNOWN";
}

function safeResult(result) {
  console.log(JSON.stringify(result));
}

const app = initializeApp({ credential: cert(credentials()) }, `staging-internal-owner-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const actorUid = operatorUid();

try {
  if (String(process.env.NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED || "").trim().toLowerCase() === "true") throw new Error("The staging mail rail is quarantined.");
  if (String(process.env.GMAIL_SEND_MAILBOX_EMAIL || "").trim().toLowerCase() !== EMAIL) throw new Error("The approved staging sender identity is not configured.");
  for (const key of ["GMAIL_SEND_MAILBOX_CLIENT_ID", "GMAIL_SEND_MAILBOX_CLIENT_SECRET", "GMAIL_SEND_MAILBOX_REFRESH_TOKEN"]) {
    if (!String(process.env[key] || "").trim()) throw new Error("The staging owner-onboarding mail rail is incomplete.");
  }

  let firebaseUser;
  try { firebaseUser = await auth.getUserByEmail(EMAIL); } catch (error) { if (safeErrorCode(error) !== "auth_user-not-found") throw error; }
  const uid = firebaseUser?.uid;
  const existingProfile = uid ? (await db.collection("platformUsers").where("authUid", "==", uid).limit(1).get()).docs[0] : undefined;
  const existingAudits = existingProfile ? await db.collection("platformUserAudits").where("userId", "==", existingProfile.id).get() : undefined;
  const dispatchAlreadyRecorded = existingAudits?.docs.some((doc) => [SENT_AUDIT_DETAIL, STARTED_AUDIT_DETAIL].includes(String(doc.data().detail || ""))) ?? false;
  if (dispatchAlreadyRecorded) throw new Error("A staging internal onboarding dispatch was already recorded; refusing a duplicate send.");

  if (firebaseUser) {
    const tenantMembership = await db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get();
    const claims = firebaseUser.customClaims || {};
    if (!tenantMembership.empty || claims.tenantId || claims.tenantRole) throw new Error("The target Firebase identity has tenant access; refusing this internal-only operation.");
  }

  const now = new Date().toISOString();
  if (!firebaseUser) {
    firebaseUser = await auth.createUser({ email: EMAIL, emailVerified: false, disabled: false, displayName: "NexTeam Studio" });
    await auth.setCustomUserClaims(firebaseUser.uid, { platform_operator: true, roles: ["platform_operator"] });
  }

  let profileId = existingProfile?.id;
  if (!existingProfile) {
    profileId = `platform_user_${randomUUID()}`;
    await db.collection("platformUsers").doc(profileId).create({
      id: profileId,
      authUid: firebaseUser.uid,
      firstName: "NexTeam",
      lastName: "Studio",
      email: EMAIL,
      role: "Owner",
      capabilityOverrides: { grant: [], deny: [] },
      accountStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid
    });
    await db.collection("platformUserAudits").doc(`platform_user_audit_${randomUUID()}`).create({
      id: `platform_user_audit_${randomUUID()}`,
      userId: profileId,
      action: "platform_user.added",
      actorUid,
      createdAt: now,
      detail: "Staging internal NexCommand Owner profile created by authorized onboarding job."
    });
  }

  await db.collection("platformUserAudits").doc(`platform_user_audit_${randomUUID()}`).create({
    id: `platform_user_audit_${randomUUID()}`,
    userId: profileId,
    action: "platform_user.updated",
    actorUid,
    createdAt: new Date().toISOString(),
    detail: STARTED_AUDIT_DETAIL
  });

  const baseUrl = String(process.env.PUBLIC_BASE_URL || "https://nexstage.nexteam.studio").replace(/\/$/, "");
  const setupLink = await auth.generatePasswordResetLink(EMAIL, { url: `${baseUrl}/nexcommand`, handleCodeInApp: false });
  const sender = new GmailSendAdapter({
    mailbox: "NEXCOMMAND_INTERNAL_OWNER",
    tenantId: "platform-internal",
    clientId: String(process.env.GMAIL_SEND_MAILBOX_CLIENT_ID),
    clientSecret: String(process.env.GMAIL_SEND_MAILBOX_CLIENT_SECRET),
    refreshToken: String(process.env.GMAIL_SEND_MAILBOX_REFRESH_TOKEN)
  });
  const receipt = await sender.sendEmail({
    tenantId: "platform-internal",
    mailbox: sender.mailbox,
    to: [EMAIL],
    subject: "Set up your NexCommand account",
    bodyText: `Hello,\n\nYour NexCommand internal Owner account is ready. Set your password using this secure link: ${setupLink}\n\nAfterward, sign in to NexCommand. If you did not expect this onboarding email, you can ignore it.`
  });
  await db.collection("platformUserAudits").doc(`platform_user_audit_${randomUUID()}`).create({
    id: `platform_user_audit_${randomUUID()}`,
    userId: profileId,
    action: "platform_user.updated",
    actorUid,
    createdAt: new Date().toISOString(),
    detail: SENT_AUDIT_DETAIL
  });

  const savedProfile = await db.collection("platformUsers").doc(profileId).get();
  const tenantMembershipAfter = await db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get();
  const refreshedUser = await auth.getUser(firebaseUser.uid);
  safeResult({
    jobId: JOB_ID,
    environment: "staging",
    firebaseIdentity: refreshedUser.email?.toLowerCase() === EMAIL && !refreshedUser.disabled ? "CREATED_ACTIVE" : "NOT_VERIFIED",
    platformProfile: savedProfile.exists && savedProfile.data()?.role === "Owner" && savedProfile.data()?.accountStatus === "ACTIVE" && savedProfile.data()?.email === EMAIL ? "ACTIVE_OWNER" : "NOT_VERIFIED",
    tenantMembership: tenantMembershipAfter.empty && !refreshedUser.customClaims?.tenantId && !refreshedUser.customClaims?.tenantRole ? "ABSENT" : "PRESENT",
    providerAcceptance: receipt.provider === "gmail" && Boolean(receipt.id) ? "ACCEPTED" : "NOT_ACCEPTED",
    provider: receipt.provider,
    messageIdentifierRecorded: Boolean(receipt.id),
    passwordOrActionMaterialReturned: false,
    productionChanged: false
  });
} finally {
  await deleteApp(app).catch(() => undefined);
}
