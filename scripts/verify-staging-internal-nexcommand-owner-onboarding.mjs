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
  const profile = (await db.collection("platformUsers").where("authUid", "==", firebaseUser.uid).limit(1).get()).docs[0];
  const membership = await db.collection("tenantUsers").where("authUid", "==", firebaseUser.uid).limit(1).get();
  const audits = profile ? await db.collection("platformUserAudits").where("userId", "==", profile.id).get() : null;
  const details = audits?.docs.map((doc) => String(doc.data().detail || "")) ?? [];
  console.log(JSON.stringify({
    environment: "staging",
    firebaseEmailMatches: firebaseUser.email?.toLowerCase() === EMAIL,
    firebaseActive: !firebaseUser.disabled,
    platformProfileEmailMatches: profile?.data()?.email === EMAIL,
    platformRole: profile?.data()?.role || "MISSING",
    platformStatus: profile?.data()?.accountStatus || "MISSING",
    tenantMembershipAbsent: membership.empty,
    tenantClaimsAbsent: !firebaseUser.customClaims?.tenantId && !firebaseUser.customClaims?.tenantRole,
    onboardingDispatchStartedCount: details.filter((detail) => detail.includes("onboarding dispatch was initiated")).length,
    onboardingProviderAcceptedCount: details.filter((detail) => detail.includes("onboarding dispatch was accepted")).length,
    actionMaterialReturned: false,
    productionChanged: false
  }));
} finally {
  await deleteApp(app).catch(() => undefined);
}
