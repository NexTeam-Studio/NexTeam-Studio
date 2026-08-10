import { randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const baseUrl = (process.env.NEXTEAM_STAGING_BASE_URL || "https://nexstage.nexteam.studio").replace(/\/$/, "");
const tenantA = process.env.P0_MATRIX_TENANT_A?.trim();
const tenantB = process.env.P0_MATRIX_TENANT_B?.trim();
const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim();

if (!tenantA || !tenantB || tenantA === tenantB || !apiKey) {
  throw new Error("P0 matrix requires two distinct tenant aliases and the staging Firebase web configuration.");
}

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) return JSON.parse(raw);
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

async function idTokenFor(auth, tenantId, uid, extraClaims = {}) {
  const customToken = await auth.createCustomToken(uid, { tenantId, tenantRole: "OWNER", ...extraClaims });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) throw new Error(`Temporary staging identity sign-in failed (${response.status}).`);
  return body.idToken;
}

function matrixCases(targetTenantId) {
  const foreign = "p0-matrix-foreign-id";
  const q = `tenantId=${encodeURIComponent(targetTenantId)}`;
  return [
    ["clients:list-query", "GET", `/api/crm/clients?${q}`], ["clients:direct-id", "GET", `/api/crm/clients/${foreign}?${q}`], ["clients:denied-mutation", "DELETE", `/api/crm/clients/${foreign}?${q}`],
    ["properties:list-query", "GET", `/api/crm/properties?${q}`], ["properties:direct-id", "PUT", `/api/crm/properties/${foreign}/assets?${q}`, { tenantId: targetTenantId, assets: [] }],
    ["requests:list-search", "GET", `/api/crm/requests?${q}&q=p0`], ["requests:direct-id", "GET", `/api/crm/requests/${foreign}?${q}`], ["requests:denied-mutation", "PATCH", `/api/crm/requests/${foreign}?${q}`, { tenantId: targetTenantId }],
    ["quotes:list-query", "GET", `/api/crm/quotes?${q}`], ["quotes:direct-id", "GET", `/api/crm/quotes/${foreign}?${q}`], ["quotes:denied-mutation", "PATCH", `/api/crm/quotes/${foreign}?${q}`, { tenantId: targetTenantId }],
    ["jobs:list-query", "GET", `/api/crm/jobs?${q}`], ["jobs:direct-id", "GET", `/api/crm/jobs/${foreign}?${q}`], ["jobs:denied-mutation", "PATCH", `/api/crm/jobs/${foreign}?${q}`, { tenantId: targetTenantId }],
    ["visits:schedule", "GET", `/api/scheduling/calendar?${q}`], ["visits:direct-id", "POST", `/api/crm/jobs/visits/${foreign}/move?${q}`, { tenantId: targetTenantId, start: "2030-01-01T12:00:00.000Z", end: "2030-01-01T13:00:00.000Z" }],
    ["invoices:list-query", "GET", `/api/crm/invoices?${q}`], ["invoices:direct-id", "GET", `/api/crm/invoices/${foreign}?${q}`], ["invoices:denied-mutation", "PATCH", `/api/crm/invoices/${foreign}?${q}`, { tenantId: targetTenantId }],
    ["payments:list-query", "GET", `/api/crm/payments?${q}`], ["payments:direct-id", "GET", `/api/crm/payments/${foreign}?${q}`], ["payments:denied-mutation", "POST", `/api/crm/invoices/${foreign}/checkout?${q}`, { tenantId: targetTenantId, provider: "stripe" }],
    ["receipts:list-query", "GET", `/api/crm/receipts?${q}`], ["receipts:direct-id", "GET", `/api/crm/receipts/${foreign}?${q}`],
    ["fielddocs:search", "GET", `/api/fielddocs/search?${q}&q=p0`], ["fielddocs:direct-id", "GET", `/api/fielddocs/media/${foreign}?${q}`], ["fielddocs:denied-mutation", "DELETE", `/api/nexdocs/clients/${foreign}/folders/${foreign}?${q}`, { tenantId: targetTenantId, clientId: foreign }],
    ["communications:list-query", "GET", `/api/comms/threads?${q}`], ["communications:direct-id", "GET", `/api/comms/threads/${foreign}?${q}`],
    ["imports:denied-mutation", "POST", `/api/crm/imports?${q}`, { tenantId: targetTenantId }], ["exports:query", "GET", `/api/platform/tenants/${encodeURIComponent(targetTenantId)}/export?${q}`],
    ["global-search", "GET", `/api/crm/search?${q}&q=p0`], ["approval-queue", "GET", `/api/approval-queue?${q}`], ["content", "GET", `/api/content/queue?${q}`], ["reputation", "GET", `/api/reputation/reviews?${q}`],
    ["nexportal:invalid-session", "GET", `/nexportal/session/${foreign}?${q}&token=p0-invalid-token`], ["nexportal:denied-mutation", "POST", `/api/nexportal/visits/${foreign}/confirm?${q}`, { tenantId: targetTenantId }]
  ];
}

async function probe(token, source, target) {
  const results = [];
  for (const [endpointClass, method, path, body] of matrixCases(target)) {
    const response = await fetch(`${baseUrl}${path}`, { method, redirect: "manual", headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const safe = response.status === 403 || response.status === 401 || response.status === 404;
    results.push({ endpointClass, direction: `${source}->${target}`, method, status: response.status, safe });
  }
  return results;
}

const app = initializeApp({ credential: cert(credentials()) }, `p0-matrix-${randomUUID()}`);
const auth = getAuth(app);
const uids = [`p0-matrix-${randomUUID()}`, `p0-matrix-${randomUUID()}`, `p0-matrix-${randomUUID()}`];
let summary;
let runError;
try {
  const [tokenA, tokenB, operatorToken] = await Promise.all([idTokenFor(auth, tenantA, uids[0]), idTokenFor(auth, tenantB, uids[1]), idTokenFor(auth, tenantA, uids[2], { platform_operator: true })]);
  const results = [...await probe(tokenA, "TENANT_A", "TENANT_B"), ...await probe(tokenB, "TENANT_B", "TENANT_A")];
  const controllerResponse = await fetch(`${baseUrl}/api/platform/admin/live-build-status`, { headers: { authorization: `Bearer ${operatorToken}` } });
  const controller = await controllerResponse.json().catch(() => ({}));
  const controllerFields = ["currentBuild", "currentTask", "actualState", "runId", "pid", "lastHeartbeat", "progress", "completedTasks", "remainingTasks", "blocker", "lastActivity"];
  const controllerSafe = controllerResponse.ok && controllerFields.every((field) => Object.hasOwn(controller, field)) && (controller.actualState === "ACTIVE" || controller.actualState === "IDLE") && (controller.actualState !== "IDLE" || controller.lastHeartbeat === null);
  summary = { jobId: "NEXTEAM-P0-TENANT-ISOLATION-STAGING-MATRIX-20260810", stagingOnly: true, temporaryIdentitiesDeleted: false, total: results.length, safe: results.filter((item) => item.safe).length, failures: results.filter((item) => !item.safe).map(({ endpointClass, direction, method, status }) => ({ endpointClass, direction, method, status })), liveBuildStatus: { status: controllerResponse.status, actualState: controller.actualState ?? null, safe: controllerSafe }, results };
} catch (error) {
  runError = error;
} finally {
  const cleanup = await Promise.all(uids.map(async (uid) => {
    try {
      await auth.deleteUser(uid);
      await auth.getUser(uid);
      return false;
    } catch (error) {
      return error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found";
    }
  }));
  if (summary) summary.temporaryIdentitiesDeleted = cleanup.every(Boolean);
  await deleteApp(app).catch(() => {});
}
if (runError) throw runError;
console.log(JSON.stringify(summary, null, 2));
if (!summary.temporaryIdentitiesDeleted || summary.failures.length || !summary.liveBuildStatus.safe) process.exitCode = 1;
