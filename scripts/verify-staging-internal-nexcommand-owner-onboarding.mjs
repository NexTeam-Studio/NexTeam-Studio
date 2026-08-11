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
  const audits = profile ? await db.collection("platformUserAudits").where("userId", "==", profile.id).get() : null;
  const details = audits?.docs.map((doc) => String(doc.data().detail || "")) ?? [];
  console.log(JSON.stringify({
    environment: "staging",
    firebaseEmailMatches: firebaseUser.email?.toLowerCase() === EMAIL,
    firebaseActive: !firebaseUser.disabled,
    activeInternalProfileCount: activeProfiles.length,
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
  }));
} finally {
  await deleteApp(app).catch(() => undefined);
}
