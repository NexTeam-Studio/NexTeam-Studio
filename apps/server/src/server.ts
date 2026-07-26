import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalQueueService,
  FirestoreEventBus,
  InMemoryEventBus,
  InMemoryApprovalQueueRepository,
  RailError,
  approvalItemSchema,
  logger
} from "@nexteam/core";
import { getBuildInfo } from "./buildInfo.js";
import { createNexiRouter } from "./nexi/nexiRoutes.js";
import { buildHealth } from "./health.js";
import {
  actorIdForAccess,
  createLocalDevSession,
  listLocalDevWebProfiles,
  readLocalDevSession,
  requireTenantRole
} from "./auth/accessContext.js";
import { CompositeApprovalExecutor } from "./approval/compositeExecutor.js";
import { FirestoreApprovalQueueRepository } from "./approval/firestoreRepository.js";
import { createApprovalNexiTools } from "./approval/nexiTools.js";
import { createCampaignNexiTools } from "./campaigns/nexiTools.js";
import { InMemoryCampaignRepository } from "./campaigns/repository.js";
import { registerCampaignRoutes } from "./campaigns/routes.js";
import { JobLifecycleService } from "./crm/jobLifecycle.js";
import { FirestoreJobLifecycleRepository, MemoryJobLifecycleRepository } from "./crm/jobLifecycleRepository.js";
import { LedgerService } from "./crm/ledgerFoundation.js";
import { FirestoreNotificationStateRepository, InMemoryNotificationStateRepository } from "./crm/notificationStateRepository.js";
import { FirestoreLedgerRepository, MemoryLedgerRepository } from "./crm/ledgerRepository.js";
import { OperationsHubService } from "./crm/operationsHub.js";
import { FirestorePortalHubRepository, InMemoryPortalHubRepository } from "./crm/portalHubRepository.js";
import { PortalHubService } from "./crm/portalHubService.js";
import { FirestoreReviewSequenceRepository, InMemoryReviewSequenceRepository } from "./crm/reviewSequenceRepository.js";
import { ReviewSequenceService } from "./crm/reviewSequenceService.js";
import { registerCrmRoutes } from "./crm/routes.js";
import { getAdminDb, getAdminStorageBucket } from "./firebase.js";
import { FieldDocsApprovalExecutor } from "./fielddocs/approvalExecutor.js";
import { FieldDocsService } from "./fielddocs/fieldDocsService.js";
import { NexDocsService } from "./fielddocs/nexDocsService.js";
import { registerFieldDocsRoutes } from "./fielddocs/routes.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "./fielddocs/mediaRepository.js";
import { createFieldDocsTools } from "./fielddocs/nexiTools.js";
import { CommsApprovalExecutor } from "./comms/approvalExecutor.js";
import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";
import { createCommsNexiTools } from "./comms/nexiTools.js";
import { createContextNexiTools } from "./context/nexiTools.js";
import { ContentApprovalExecutor } from "./content/approvalExecutor.js";
import { createContentNexiTools } from "./content/nexiTools.js";
import { registerNexReachRoutes } from "./content/nexreachRoutes.js";
import { NexReachService } from "./content/nexreachService.js";
import { FirestoreContentRepository, InMemoryContentRepository } from "./content/repository.js";
import { registerContentRoutes } from "./content/routes.js";
import { CrmApprovalExecutor } from "./crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "./crm/nexiTools.js";
import { FirestoreNativeCrmRepository } from "./crm/nativeRepository.js";
import { createEvaporationNexiTools } from "./evaporation/nexiTools.js";
import { MemoryEvaporationRepository } from "./evaporation/repository.js";
import { registerEvaporationRoutes } from "./evaporation/routes.js";
import { IntakeApprovalExecutor } from "./intake/approvalExecutor.js";
import { createIntakeNexiTools } from "./intake/nexiTools.js";
import { FirestoreIntakeRepository, InMemoryIntakeRepository } from "./intake/repository.js";
import { registerIntakeRoutes } from "./intake/routes.js";
import { IntakeService } from "./intake/service.js";
import { InMemoryMobileRepository } from "./mobile/repository.js";
import { registerMobileRoutes } from "./mobile/routes.js";
import { createSchedulingNexiTools } from "./scheduling/nexiTools.js";
import { FirestoreSchedulingRepository, InMemorySchedulingRepository } from "./scheduling/repository.js";
import { registerSchedulingRoutes } from "./scheduling/routes.js";
import { EnvGbpReviewProvider } from "./reputation/gbpProvider.js";
import { createReputationNexiTools } from "./reputation/nexiTools.js";
import { FirestoreReputationRepository, InMemoryReputationRepository } from "./reputation/repository.js";
import { registerReputationRoutes } from "./reputation/routes.js";
import { createSeoNexiTools } from "./seo/nexiTools.js";
import { FirestoreSeoRepository, InMemorySeoRepository } from "./seo/repository.js";
import { registerSeoRoutes } from "./seo/routes.js";
import { enforceToolEntitlements } from "./platform/entitlements.js";
import { MemoryStorageWriter } from "./platform/backup.js";
import { FirebaseStorageWriter } from "./platform/storage.js";
import { FirestorePlatformRepository, InMemoryPlatformRepository } from "./platform/repository.js";
import { loadTenantFromPlatform, registerPlatformRoutes } from "./platform/routes.js";
import { FirestoreSitesRepository, InMemorySitesRepository } from "./sites/repository.js";
import { registerSitesRoutes } from "./sites/routes.js";
import { createSitesNexiTools } from "./sites/nexiTools.js";
import { FirestoreSelfRepairRepository, InMemorySelfRepairRepository } from "./selfrepair/repository.js";
import { registerSelfRepairRoutes } from "./selfrepair/routes.js";
import { SelfRepairService } from "./selfrepair/service.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "./usageLog.js";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createVoiceRouter } from "./voice/routes.js";

const app = express();
const commsRail = createCommsRailFromEnv(process.env);
const adminDb = getAdminDb();
const fieldDocsUsageLog = adminDb ? new FirestoreUsageLogWriter(adminDb) : new MemoryUsageLogWriter();
const contentRepository = adminDb ? new FirestoreContentRepository(adminDb) : new InMemoryContentRepository();
const schedulingRepository = adminDb ? new FirestoreSchedulingRepository(adminDb) : new InMemorySchedulingRepository();
const campaignRepository = new InMemoryCampaignRepository(process.env.TENANT_ID || "aquatrace");
const gbpReviewProvider = new EnvGbpReviewProvider(process.env);
const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const eventBus = adminDb ? new FirestoreEventBus(adminDb) : new InMemoryEventBus();
const fallbackMediaRepository = new MemoryMediaRepository();
const mediaRepository: MediaRepository = adminDb ? new FirestoreMediaRepository(adminDb) : fallbackMediaRepository;
const nativeCrmRepository = adminDb ? new FirestoreNativeCrmRepository(adminDb) : new MemoryNativeCrmRepository();
const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository: nativeCrmRepository });
const nativeCrmProvider = new NativeAdapter(nativeCrmRepository, process.env.TENANT_ID || "aquatrace");
const platformRepository = adminDb ? new FirestorePlatformRepository(adminDb) : new InMemoryPlatformRepository();
const platformStorage = adminDb ? new FirebaseStorageWriter(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET) : new MemoryStorageWriter();
const intakeRepository = adminDb ? new FirestoreIntakeRepository(adminDb) : new InMemoryIntakeRepository();
const intakeService = new IntakeService(intakeRepository, platformRepository);
const jobLifecycleRepository = adminDb ? new FirestoreJobLifecycleRepository(adminDb) : new MemoryJobLifecycleRepository();
const notificationStateRepository = adminDb ? new FirestoreNotificationStateRepository(adminDb) : new InMemoryNotificationStateRepository();
const ledgerRepository = adminDb ? new FirestoreLedgerRepository(adminDb) : new MemoryLedgerRepository();
const portalHubRepository = adminDb ? new FirestorePortalHubRepository(adminDb) : new InMemoryPortalHubRepository();
const reviewSequenceRepository = adminDb ? new FirestoreReviewSequenceRepository(adminDb) : new InMemoryReviewSequenceRepository();
const reviewSequenceService = new ReviewSequenceService({
  crmRepository: nativeCrmRepository,
  ledgerRepository,
  repository: reviewSequenceRepository,
  eventBus,
  commsRail,
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175"
});
const ledgerService = new LedgerService({
  crmRepository: nativeCrmRepository,
  ledgerRepository,
  fieldDocsRepository: mediaRepository,
  commsRail,
  eventBus,
  reviewSequenceService
});
const nexDocsService = new NexDocsService({
  mediaRepository,
  crmRepository: nativeCrmRepository,
  ledgerService,
  usageLog: fieldDocsUsageLog
});
const jobLifecycleService = new JobLifecycleService({
  crmRepository: nativeCrmRepository,
  schedulingRepository,
  lifecycleRepository: jobLifecycleRepository,
  platformRepository,
  commsRail,
  eventBus,
  ledgerService
});
const portalHubService = new PortalHubService({
  crmRepository: nativeCrmRepository,
  ledgerRepository,
  schedulingRepository,
  repository: portalHubRepository,
  fieldDocsRepository: mediaRepository,
  eventBus,
  platformRepository,
  commsRail,
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175"
});
const operationsHubService = new OperationsHubService({
  crmRepository: nativeCrmRepository,
  schedulingRepository,
  lifecycleRepository: jobLifecycleRepository,
  jobLifecycleService,
  eventBus,
  notificationStateRepository,
  mediaRepository,
  platformRepository
});
let nexReachService!: NexReachService;
const approvalQueueRepository = adminDb ? new FirestoreApprovalQueueRepository(adminDb) : new InMemoryApprovalQueueRepository();
const approvalQueue = new ApprovalQueueService(approvalQueueRepository, new CompositeApprovalExecutor([
  {
    canExecute: (item) => item.execute.service === "comms" && item.execute.op === "sendEmail",
    executor: new CommsApprovalExecutor(commsRail)
  },
  {
    canExecute: (item) => item.execute.service === "fielddocs" && [
      "createNexDocsFolder",
      "uploadNexDocsDocument"
    ].includes(item.execute.op),
    executor: new FieldDocsApprovalExecutor(nexDocsService, process.env)
  },
  {
    canExecute: (item) => item.execute.service === "content" && [
      "publishGbpPost",
      "publishSocialPost",
      "publishSeoArticle"
    ].includes(item.execute.op),
    executor: new ContentApprovalExecutor(() => nexReachService)
  },
  {
    canExecute: (item) => item.execute.service === "crm" && [
      "createClient",
      "createQuote",
      "createJob",
      "performJobAction",
      "scheduleJobVisitSeries",
      "moveJobVisitSeries",
      "performLedgerAction",
      "composeInvoiceFromJobs",
      "sendInvoice",
      "recordInvoicePayment",
      "sendReceiptReview"
    ].includes(item.execute.op),
    executor: new CrmApprovalExecutor(nativeCrmProvider, jobLifecycleService, ledgerService)
  },
  {
    canExecute: (item) => item.execute.service === "intake" && item.execute.op === "provisionTenant",
    executor: new IntakeApprovalExecutor(intakeService)
  }
]));
const evaporationRepository = new MemoryEvaporationRepository();
const mobileRepository = new InMemoryMobileRepository();
const sitesRepository = adminDb ? new FirestoreSitesRepository(adminDb) : new InMemorySitesRepository();
const selfRepairRepository = adminDb ? new FirestoreSelfRepairRepository(adminDb) : new InMemorySelfRepairRepository();
const selfRepairUsageLog = adminDb ? new FirestoreUsageLogWriter(adminDb) : new MemoryUsageLogWriter();
const selfRepairService = new SelfRepairService({
  dataReader: platformRepository,
  repository: selfRepairRepository,
  approvalQueue,
  usageLog: selfRepairUsageLog,
  env: process.env
});
const reputationRepository = adminDb ? new FirestoreReputationRepository(adminDb) : new InMemoryReputationRepository();
const seoRepository = adminDb ? new FirestoreSeoRepository(adminDb) : new InMemorySeoRepository();
nexReachService = new NexReachService({
  repository: contentRepository,
  crmRepository: nativeCrmRepository,
  mediaRepository,
  platformRepository,
  reputationRepository,
  approvalQueue
});

app.use(express.json({
  limit: "150mb",
  verify: (req, _res, buf) => {
    const request = req as Request & { rawBody?: Buffer };
    if (request.originalUrl === "/api/stripe/webhook") {
      request.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: false }));

async function resolveNexiOperatorAccess(req: Request, tenantId: string) {
  return await requireTenantRole(req, process.env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
    requestedTenantId: tenantId,
    op: "nexiOperatorContext"
  });
}

app.use("/api/nexi", createNexiRouter(process.env, {
  loadTenant: async (req) => {
    const body = req.body as { tenantId?: unknown };
    const tenantId = typeof body?.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : process.env.TENANT_ID || "aquatrace";
    return loadTenantFromPlatform(platformRepository, tenantId, process.env);
  },
  loadRequestorContext: async (req, tenant) => {
    try {
      const access = await resolveNexiOperatorAccess(req, tenant.id);
      const tenantUsers = await platformRepository.listTenantUsers(tenant.id);
      const tenantUser = tenantUsers.find((entry) => entry.id === access.tenantUserId)
        ?? tenantUsers.find((entry) => entry.email?.toLowerCase() === access.email?.toLowerCase());
      return {
        tenantUserId: access.tenantUserId,
        displayName: tenantUser?.displayName ?? access.email ?? access.tenantUserId,
        email: tenantUser?.email ?? access.email,
        phones: tenantUser?.phones,
        address: tenantUser?.address
      };
    } catch (error) {
      if (error instanceof RailError && (error.status === 401 || error.status === 403)) {
        return null;
      }
      throw error;
    }
  },
  filterTools: (tenant, tools) => enforceToolEntitlements(tenant, tools).tools,
  extraTools: [
    ...createCrmToolsWithOptions(nativeCrmProvider, approvalQueue, {
      requestRepository: nativeCrmRepository,
      platformRepository,
      commsRail,
      jobLifecycleService,
      ledgerService,
      operationsHubService,
      portalHubService,
      reviewSequenceService
    }),
    ...createCommsNexiTools(commsRail, approvalQueue),
    ...createSchedulingNexiTools({ repository: schedulingRepository, approvalQueue, env: process.env, jobLifecycleService }),
    ...createEvaporationNexiTools({ repository: evaporationRepository, env: process.env })
  ],
  extraToolsForRequest: async (req, tenant) => {
    let access;
    try {
      access = await resolveNexiOperatorAccess(req, tenant.id);
    } catch (error) {
      if (error instanceof RailError && (error.status === 401 || error.status === 403)) {
        return [];
      }
      throw error;
    }
    const contextTools = createContextNexiTools({ env: process.env });
    const fieldDocsTools = createFieldDocsTools({
      mediaRepository,
      crmRepository: nativeCrmRepository,
      fieldDocsService,
      nexDocsService,
      approvalQueue,
      viewerRole: access.role,
      viewerUserId: access.tenantUserId,
      env: process.env
    });
    if (access.role === "TECHNICIAN") {
      return contextTools.concat(fieldDocsTools);
    }
    return contextTools.concat(fieldDocsTools).concat(createCampaignNexiTools({
      repository: campaignRepository,
      approvalQueue,
      env: process.env,
      actorId: actorIdForAccess(access)
    })).concat(createApprovalNexiTools({
      approvalQueue,
      actorId: actorIdForAccess(access),
      actorRole: access.role,
      crmRepository: nativeCrmRepository,
      jobLifecycleService,
      ledgerService,
      publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175"
    })).concat(createSitesNexiTools({
      repository: sitesRepository,
      access
    })).concat(createReputationNexiTools({
      repository: reputationRepository,
      approvalQueue,
      gbpProvider: gbpReviewProvider,
      eventBus,
      actorId: actorIdForAccess(access)
    })).concat(createSeoNexiTools({
      repository: seoRepository,
      sitesRepository,
      approvalQueue,
      access,
      env: process.env
    })).concat(createIntakeNexiTools({
      service: intakeService,
      approvalQueue,
      access
    })).concat(createContentNexiTools({
      service: nexReachService,
      actorRole: access.role,
      actorId: actorIdForAccess(access)
    }));
  }
}));
app.use("/api/voice", createVoiceRouter(process.env));

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown server error";
  logger.error({ status, message });
  res.status(status).json({ ok: false, error: message });
}

app.get("/api/version", (_req: Request, res: Response) => {
  res.json(getBuildInfo());
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    res.json(await buildHealth());
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/public/local-auth/sign-in", (req: Request, res: Response) => {
  try {
    const body = req.body as { email?: unknown; password?: unknown; tenantId?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : process.env.TENANT_ID || "aquatrace";
    if (!email) {
      throw new RailError("Email is required.", {
        provider: "native",
        op: "localAuthSignIn",
        status: 400
      });
    }
    const session = createLocalDevSession(email, password, tenantId, process.env);
    res.json({ ok: true, token: session.token, profile: session.profile });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/public/local-auth/session", (req: Request, res: Response) => {
  try {
    const header = req.header("authorization") ?? "";
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
    if (!token) {
      throw new RailError("Sign in is required.", {
        provider: "native",
        op: "localAuthSession",
        status: 401
      });
    }
    const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? req.query.tenantId.trim() : process.env.TENANT_ID || "aquatrace";
    const session = readLocalDevSession(token, tenantId, process.env, "localAuthSession");
    if (!session) {
      throw new RailError("That session is not a local sign-in.", {
        provider: "native",
        op: "localAuthSession",
        status: 401
      });
    }
    res.json({ ok: true, token, profile: session.profile });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/public/runtime-config", (_req: Request, res: Response) => {
  const firebase = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.VITE_FIREBASE_APP_ID || ""
  };
  res.json({
    ok: true,
    firebase,
    firebaseConfigured: Object.values(firebase).every((value) => value.length > 0),
    authRequired: process.env.NEXI_FIREBASE_AUTH_REQUIRED !== "false",
    localAuthEnabled: process.env.NEXI_FIREBASE_AUTH_REQUIRED === "false",
    localProfiles: listLocalDevWebProfiles(process.env.TENANT_ID || "aquatrace")
  });
});

function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
  const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return match?.[1] && match[2] ? { bucketName: match[1], objectPath: match[2] } : null;
}

function nativeMediaContentType(type: string): string {
  if (type === "video") {
    return "video/mp4";
  }
  if (type === "audio") {
    return "audio/m4a";
  }
  if (type === "pdf") {
    return "application/pdf";
  }
  return "image/jpeg";
}

async function trySendNativeMedia(req: Request, res: Response, mediaId: string): Promise<boolean> {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : process.env.TENANT_ID || "aquatrace";
  const media = await mediaRepository.getMedia(tenantId, mediaId);
  if (!media) {
    return false;
  }
  const storageRef = parseStorageRef(media.storageRef);
  if (!storageRef) {
    return false;
  }
  const bucket = getAdminStorageBucket(process.env);
  if (!bucket) {
    throw new RailError("Firebase Storage is not configured for native media reads.", { provider: "firebase", op: "mediaFetch", status: 503 });
  }
  if (bucket.name !== storageRef.bucketName) {
    throw new RailError("Native media is stored in a different Firebase bucket.", { provider: "firebase", op: "mediaFetch", status: 409 });
  }
  const file = bucket.file(storageRef.objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new RailError("Native media file was not found in Storage.", { provider: "firebase", op: "mediaFetch", status: 404 });
  }
  const [metadata] = await file.getMetadata();
  res.setHeader("content-type", String(metadata.contentType ?? nativeMediaContentType(media.type)));
  if (req.query.download === "1") {
    res.setHeader("content-disposition", `attachment; filename="${path.posix.basename(storageRef.objectPath).replace(/"/g, "")}"`);
  }
  file.createReadStream().pipe(res);
  return true;
}

app.get("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.id;
    if (!mediaId) {
      throw new RailError("Media id is required.", { provider: "native", op: "fetchBinary", status: 400 });
    }
    if (await trySendNativeMedia(req, res, mediaId)) {
      return;
    }
    throw new RailError("Native media file was not found.", { provider: "native", op: "fetchBinary", status: 404 });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue", async (req: Request, res: Response) => {
  try {
    const item = await approvalQueue.create(req.body as Parameters<typeof approvalQueue.create>[0]);
    res.status(201).json(approvalItemSchema.parse(item));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/approval-queue", async (req: Request, res: Response) => {
  try {
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : process.env.TENANT_ID || "aquatrace";
    const includeHistory = String(req.query.includeHistory ?? "").toLowerCase() === "true";
    const items = includeHistory ? await approvalQueue.listByTenant(tenantId) : await approvalQueue.listPending(tenantId);
    res.json({ ok: true, items });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue/:id/approve", async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.id;
    if (!approvalId) {
      throw new RailError("Approval id is required.", { provider: "approval", op: "approve", status: 400 });
    }
    const pending = await approvalQueue.get(approvalId);
    if (!pending) {
      throw new RailError(`Approval item ${approvalId} was not found.`, { provider: "approval", op: "approve", status: 404 });
    }
    const access = await requireTenantRole(req, process.env, ["OWNER", "OFFICE_ADMIN"], {
      requestedTenantId: pending.tenantId,
      op: "approvalQueueApprove"
    });
    const item = await approvalQueue.approve(approvalId, actorIdForAccess(access));
    res.json({ ok: true, item });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue/:id/reject", async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.id;
    if (!approvalId) {
      throw new RailError("Approval id is required.", { provider: "approval", op: "reject", status: 400 });
    }
    const pending = await approvalQueue.get(approvalId);
    if (!pending) {
      throw new RailError(`Approval item ${approvalId} was not found.`, { provider: "approval", op: "reject", status: 404 });
    }
    const access = await requireTenantRole(req, process.env, ["OWNER", "OFFICE_ADMIN"], {
      requestedTenantId: pending.tenantId,
      op: "approvalQueueReject"
    });
    const item = await approvalQueue.reject(approvalId, actorIdForAccess(access));
    res.json({ ok: true, item });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue/:id/execute", async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.id;
    if (!approvalId) {
      throw new RailError("Approval id is required.", { provider: "approval", op: "execute", status: 400 });
    }
    const pending = await approvalQueue.get(approvalId);
    if (!pending) {
      throw new RailError(`Approval item ${approvalId} was not found.`, { provider: "approval", op: "execute", status: 404 });
    }
    const access = await requireTenantRole(req, process.env, ["OWNER", "OFFICE_ADMIN"], {
      requestedTenantId: pending.tenantId,
      op: "approvalQueueExecute"
    });
    const result = await approvalQueue.executeApproved(approvalId, actorIdForAccess(access));
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
});

registerCrmRoutes(app, {
  approvalQueue,
  eventBus,
  memoryRepository: nativeCrmRepository,
  platformRepository,
  sitesRepository,
  commsRail,
  jobLifecycleService,
  ledgerService,
  portalHubService,
  reviewSequenceService,
  nexReachService,
  operationsHubService,
  env: process.env
});
registerFieldDocsRoutes(app, {
  eventBus,
  repository: mediaRepository,
  crmRepository: nativeCrmRepository,
  ledgerService,
  usageLog: fieldDocsUsageLog
});
registerContentRoutes(app, { repository: contentRepository, approvalQueue, eventBus, env: process.env });
registerNexReachRoutes(app, { service: nexReachService, eventBus, env: process.env });
registerCampaignRoutes(app, { repository: campaignRepository, approvalQueue, env: process.env });
registerReputationRoutes(app, { repository: reputationRepository, approvalQueue, eventBus, gbpProvider: gbpReviewProvider, env: process.env });
registerSchedulingRoutes(app, { repository: schedulingRepository, approvalQueue, env: process.env, jobLifecycleService });
registerEvaporationRoutes(app, { repository: evaporationRepository, env: process.env });
registerIntakeRoutes(app, { service: intakeService, approvalQueue, env: process.env });
registerMobileRoutes(app, {
  repository: mobileRepository,
  approvalQueue,
  crmRepository: nativeCrmRepository,
  schedulingRepository,
  mediaRepository,
  fieldDocsService,
  ledgerService,
  platformRepository,
  usageLog: fieldDocsUsageLog,
  env: process.env
});
registerPlatformRoutes(app, { repository: platformRepository, storage: platformStorage, env: process.env });
registerSitesRoutes(app, {
  repository: sitesRepository,
  approvalQueue,
  crmRepository: nativeCrmRepository,
  platformRepository,
  commsRail,
  eventBus,
  env: process.env
});
registerSelfRepairRoutes(app, { service: selfRepairService, env: process.env });
registerSeoRoutes(app, { repository: seoRepository, sitesRepository, approvalQueue, env: process.env });
registerSelfRepairRoutes(app, { service: selfRepairService, env: process.env });
app.use(express.static(webDistDir));

app.get(/^\/(?:nexops|nexcam|nexreach|platform)(?:\/.*)?$/, (_req: Request, res: Response) => {
  res.sendFile(path.join(webDistDir, "index.html"));
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "nexteam-studio-server", version: getBuildInfo() });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    logger.info({ tenantId: process.env.TENANT_ID || "platform", module: "server", op: "listen", latencyMs: 0, ok: true, port });
  });
}


