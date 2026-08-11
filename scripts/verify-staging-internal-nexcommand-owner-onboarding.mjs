import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const EMAIL = "nexteamstudioai@gmail.com";
function credentials() {
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

const app = initializeApp({
  credential: cert(credentials())
}, "staging-internal-owner-readback");

try {
  const auth = getAuth(app);
  const db = getFirestore(app);
  const firebaseUser = await auth.getUserByEmail(EMAIL);
  const profiles = await db.collection("platformUsers").where("authUid", "==", firebaseUser.uid).get();
  const activeProfiles = profiles.docs.filter((doc) => doc.data().accountStatus === "ACTIVE");
  const profile = activeProfiles[0];
  const membership = await db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get();
  const result = {
    environment: "staging",
    firebaseEmailMatches: firebaseUser.email?.toLowerCase() === EMAIL,
    firebaseActive: !firebaseUser.disabled,
    activeInternalProfileCount: activeProfiles.length,
    platformProfileAuthUidMatches: profile?.data()?.authUid === firebaseUser.uid,
    platformProfileEmailMatches: profile?.data()?.email === EMAIL,
    platformProfileNameMatches: profile?.data()?.firstName === "Chris" && profile?.data()?.lastName === "Sears",
    platformRole: profile?.data()?.role || "MISSING",
    accountClass: profile?.data()?.accountClass || "MISSING",
    platformStatus: profile?.data()?.accountStatus || "MISSING",
    tenantMembershipAbsent: membership.empty,
    tenantClaimsAbsent: !firebaseUser.customClaims?.tenantId && !firebaseUser.customClaims?.tenantRole,
    actionMaterialReturned: false,
    emailOrResetSent: false,
    productionChanged: false
  };
  console.log(JSON.stringify(result));

  const failedChecks = [
    ["firebaseEmailMatches", result.firebaseEmailMatches],
    ["firebaseActive", result.firebaseActive],
    ["activeInternalProfileCount", result.activeInternalProfileCount === 1],
    ["platformProfileAuthUidMatches", result.platformProfileAuthUidMatches],
    ["platformProfileEmailMatches", result.platformProfileEmailMatches],
    ["platformProfileNameMatches", result.platformProfileNameMatches],
    ["platformRole", result.platformRole === "Owner"],
    ["accountClass", result.accountClass === "internal"],
    ["platformStatus", result.platformStatus === "ACTIVE"],
    ["tenantMembershipAbsent", result.tenantMembershipAbsent],
    ["tenantClaimsAbsent", result.tenantClaimsAbsent],
    ["actionMaterialReturned", result.actionMaterialReturned === false],
    ["emailOrResetSent", result.emailOrResetSent === false],
    ["productionChanged", result.productionChanged === false]
  ].filter(([, passed]) => !passed).map(([name]) => name);
  if (failedChecks.length > 0) throw new Error(`Internal Owner profile compatibility failed: ${failedChecks.join(", ")}`);
} finally {
  await deleteApp(app).catch(() => undefined);
}
