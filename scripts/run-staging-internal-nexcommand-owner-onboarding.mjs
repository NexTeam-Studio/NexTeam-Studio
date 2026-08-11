import { randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const JOB_ID = "NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : String(process.argv[index + 1] || "").trim();
}

function authorizedInput() {
  const input = {
    environment: argument("--environment"),
    email: argument("--authorized-email").toLowerCase(),
    firstName: argument("--first-name"),
    lastName: argument("--last-name"),
    role: argument("--role"),
    confirmation: argument("--confirm-job")
  };
  if (input.environment !== "staging") throw new Error("This repair is staging-only; pass --environment staging.");
  if (!/^\S+@\S+\.\S+$/.test(input.email) || !input.firstName || !input.lastName || input.role !== "Owner") throw new Error("Explicit authorized Owner input is required.");
  if (input.confirmation !== JOB_ID) throw new Error("The authorized job confirmation does not match.");
  return input;
}

function credentials() {
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

function operatorUid() {
  const uid = String(process.env.FIREBASE_PLATFORM_OPERATOR_UIDS || "").split(",")[0]?.trim();
  if (!uid) throw new Error("The staging bootstrap operator UID is unavailable.");
  return uid;
}

function withoutTenantClaims(claims) {
  const repaired = { ...claims };
  delete repaired.tenantId;
  delete repaired.tenantRole;
  delete repaired.tenantUserId;
  delete repaired.tenantCapabilities;
  return repaired;
}

const input = authorizedInput();
const app = initializeApp({ credential: cert(credentials()) }, `staging-internal-owner-link-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const actorUid = operatorUid();

try {
  const firebaseUser = await auth.getUserByEmail(input.email);
  if (firebaseUser.disabled) throw new Error("The existing Firebase identity is disabled; refusing to create a replacement identity.");

  const membership = await db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get();
  if (!membership.empty) throw new Error("The existing Firebase identity has tenant membership; refusing to alter tenant access in this internal-profile repair.");

  const now = new Date().toISOString();
  const profiles = await db.collection("platformUsers").where("authUid", "==", firebaseUser.uid).get();
  const profileId = profiles.docs.find((entry) => entry.data().accountStatus === "ACTIVE")?.id ?? profiles.docs[0]?.id ?? `platform_user_${randomUUID()}`;
  const auditId = `platform_user_audit_${randomUUID()}`;

  await db.runTransaction(async (transaction) => {
    const linkedProfiles = await transaction.get(db.collection("platformUsers").where("authUid", "==", firebaseUser.uid));
    const primary = linkedProfiles.docs.find((entry) => entry.id === profileId);
    const primaryData = primary?.data() || {};
    transaction.set(db.collection("platformUsers").doc(profileId), {
      ...primaryData,
      id: profileId,
      authUid: firebaseUser.uid,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      role: "Owner",
      accountClass: "internal",
      capabilityOverrides: primaryData.capabilityOverrides || { grant: [], deny: [] },
      accountStatus: "ACTIVE",
      createdAt: primaryData.createdAt || now,
      updatedAt: now,
      createdBy: primaryData.createdBy || actorUid,
      updatedBy: actorUid
    });
    for (const duplicate of linkedProfiles.docs.filter((entry) => entry.id !== profileId && entry.data().accountStatus !== "DISABLED")) {
      transaction.update(duplicate.ref, { accountStatus: "DISABLED", updatedAt: now, updatedBy: actorUid });
    }
    transaction.create(db.collection("platformUserAudits").doc(auditId), {
      id: auditId,
      userId: profileId,
      action: primary ? "platform_user.updated" : "platform_user.added",
      actorUid,
      createdAt: now,
      detail: "Staging authorized existing Firebase identity linked to one active internal NexCommand Owner profile; no password or email action was performed."
    });
  });

  await auth.setCustomUserClaims(firebaseUser.uid, withoutTenantClaims(firebaseUser.customClaims || {}));
  const [refreshedUser, savedProfiles, membershipAfter] = await Promise.all([
    auth.getUser(firebaseUser.uid),
    db.collection("platformUsers").where("authUid", "==", firebaseUser.uid).get(),
    db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get()
  ]);
  const activeProfiles = savedProfiles.docs.filter((entry) => entry.data().accountStatus === "ACTIVE");
  const owner = activeProfiles[0]?.data();
  console.log(JSON.stringify({
    jobId: JOB_ID,
    environment: "staging",
    firebaseIdentityResolved: refreshedUser.email?.toLowerCase() === input.email && !refreshedUser.disabled,
    activeInternalProfileCount: activeProfiles.length,
    profileMatchesAuthorizedIdentity: owner?.authUid === refreshedUser.uid && owner?.email === input.email,
    profileNameMatches: owner?.firstName === input.firstName && owner?.lastName === input.lastName,
    platformRole: owner?.role || "MISSING",
    accountClass: owner?.accountClass || "MISSING",
    tenantMembershipAbsent: membershipAfter.empty,
    tenantClaimsAbsent: !refreshedUser.customClaims?.tenantId && !refreshedUser.customClaims?.tenantRole,
    passwordOrActionMaterialReturned: false,
    emailOrResetSent: false,
    productionChanged: false
  }));
} finally {
  await deleteApp(app).catch(() => undefined);
}
