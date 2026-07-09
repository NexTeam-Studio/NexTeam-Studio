import { Readable } from "node:stream";
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
import { CompanyCamAdapter } from "@nexteam/providers";
import { getBuildInfo } from "./buildInfo.js";
import { createNexiRouter } from "./nexi/nexiRoutes.js";
import { buildHealth } from "./health.js";
import { actorIdForAccess, requireTenantRole } from "./auth/accessContext.js";
import { CompositeApprovalExecutor } from "./approval/compositeExecutor.js";
import { createCampaignNexiTools } from "./campaigns/nexiTools.js";
import { InMemoryCampaignRepository } from "./campaigns/repository.js";
import { registerCampaignRoutes } from "./campaigns/routes.js";
import { registerCrmRoutes } from "./crm/routes.js";
import { getAdminDb } from "./firebase.js";
import { registerFieldDocsRoutes } from "./fielddocs/routes.js";
import { CommsApprovalExecutor } from "./comms/approvalExecutor.js";
import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";
import { createCommsNexiTools } from "./comms/nexiTools.js";
import { createContextNexiTools } from "./context/nexiTools.js";
import { createContentNexiTools } from "./content/nexiTools.js";
import { InMemoryContentRepository } from "./content/repository.js";
import { registerContentRoutes } from "./content/routes.js";
import { CrmApprovalExecutor } from "./crm/approvalExecutor.js";
import { createCrmTools } from "./crm/nexiTools.js";
import { FirestoreNativeCrmRepository } from "./crm/nativeRepository.js";
import { createEvaporationNexiTools } from "./evaporation/nexiTools.js";
import { MemoryEvaporationRepository } from "./evaporation/repository.js";
import { registerEvaporationRoutes } from "./evaporation/routes.js";
import { InMemoryMobileRepository } from "./mobile/repository.js";
import { registerMobileRoutes } from "./mobile/routes.js";
import { createSchedulingNexiTools } from "./scheduling/nexiTools.js";
import { InMemorySchedulingRepository } from "./scheduling/repository.js";
import { registerSchedulingRoutes } from "./scheduling/routes.js";
import { EnvGbpReviewProvider } from "./reputation/gbpProvider.js";
import { createReputationNexiTools } from "./reputation/nexiTools.js";
import { FirestoreReputationRepository, InMemoryReputationRepository } from "./reputation/repository.js";
import { registerReputationRoutes } from "./reputation/routes.js";
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
const contentRepository = new InMemoryContentRepository();
const schedulingRepository = new InMemorySchedulingRepository();
const campaignRepository = new InMemoryCampaignRepository(process.env.TENANT_ID || "aquatrace");
const gbpReviewProvider = new EnvGbpReviewProvider(process.env);
const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const adminDb = getAdminDb();
const eventBus = adminDb ? new FirestoreEventBus(adminDb) : new InMemoryEventBus();
const nativeCrmRepository = adminDb ? new FirestoreNativeCrmRepository(adminDb) : new MemoryNativeCrmRepository();
const nativeCrmProvider = new NativeAdapter(nativeCrmRepository, process.env.TENANT_ID || "aquatrace");
const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CompositeApprovalExecutor([
  {
    canExecute: (item) => item.execute.service === "comms" && item.execute.op === "sendEmail",
    executor: new CommsApprovalExecutor(commsRail)
  },
  {
    canExecute: (item) => item.execute.service === "crm" && item.execute.op === "createClient",
    executor: new CrmApprovalExecutor(nativeCrmProvider)
  }
]));
const evaporationRepository = new MemoryEvaporationRepository();
const mobileRepository = new InMemoryMobileRepository();
const platformRepository = adminDb ? new FirestorePlatformRepository(adminDb) : new InMemoryPlatformRepository();
const platformStorage = adminDb ? new FirebaseStorageWriter(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET) : new MemoryStorageWriter();
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

app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    const request = req as Request & { rawBody?: Buffer };
    if (request.originalUrl === "/api/stripe/webhook") {
      request.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use("/api/nexi", createNexiRouter(process.env, {
  loadTenant: async (req) => {
    const body = req.body as { tenantId?: unknown };
    const tenantId = typeof body?.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : process.env.TENANT_ID || "aquatrace";
    return loadTenantFromPlatform(platformRepository, tenantId, process.env);
  },
  filterTools: (tenant, tools) => enforceToolEntitlements(tenant, tools).tools,
  extraTools: [
    ...createContextNexiTools({ env: process.env }),
    ...createCrmTools(nativeCrmProvider, approvalQueue),
    ...createCommsNexiTools(commsRail, approvalQueue),
    ...createContentNexiTools({ repository: contentRepository, approvalQueue }),
    ...createSchedulingNexiTools({ repository: schedulingRepository, approvalQueue, env: process.env }),
    ...createEvaporationNexiTools({ repository: evaporationRepository, env: process.env })
  ],
  extraToolsForRequest: async (req, tenant) => {
    let access;
    try {
      access = await requireTenantRole(req, process.env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenant.id,
        op: "campaignToolRegistry"
      });
    } catch (error) {
      if (error instanceof RailError && (error.status === 401 || error.status === 403)) {
        return [];
      }
      throw error;
    }
    return createCampaignNexiTools({
      repository: campaignRepository,
      approvalQueue,
      env: process.env,
      actorId: actorIdForAccess(access)
    }).concat(createSitesNexiTools({
      repository: sitesRepository,
      access
    })).concat(createReputationNexiTools({
      repository: reputationRepository,
      approvalQueue,
      gbpProvider: gbpReviewProvider,
      eventBus,
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
    firebaseConfigured: Object.values(firebase).every((value) => value.length > 0)
  });
});

app.get("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.id;
    if (!mediaId) {
      throw new RailError("Media id is required.", { provider: "companycam", op: "fetchBinary", status: 400 });
    }
    const companyCam = CompanyCamAdapter.fromEnv(process.env);
    const binary = await companyCam.fetchBinary(mediaId);
    res.setHeader("content-type", binary.mime);
    if (req.query.download === "1") {
      res.setHeader("content-disposition", `attachment; filename="companycam-${mediaId.replace(/[^a-z0-9_-]/gi, "_")}.jpg"`);
    }
    if (binary.stream instanceof Readable) {
      binary.stream.pipe(res);
      return;
    }
    Readable.from(binary.stream as AsyncIterable<Uint8Array>).pipe(res);
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
    res.json({ ok: true, items: await approvalQueue.listPending(tenantId) });
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
    const item = await approvalQueue.approve(approvalId);
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
    const result = await approvalQueue.executeApproved(approvalId);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
});

registerCrmRoutes(app, { approvalQueue, eventBus });
registerFieldDocsRoutes(app, { eventBus });
registerContentRoutes(app, { repository: contentRepository, approvalQueue, eventBus, env: process.env });
registerCampaignRoutes(app, { repository: campaignRepository, approvalQueue, env: process.env });
registerReputationRoutes(app, { repository: reputationRepository, approvalQueue, eventBus, gbpProvider: gbpReviewProvider, env: process.env });
registerSchedulingRoutes(app, { repository: schedulingRepository, approvalQueue, env: process.env });
registerEvaporationRoutes(app, { repository: evaporationRepository, env: process.env });
registerMobileRoutes(app, { repository: mobileRepository, approvalQueue, env: process.env });
registerPlatformRoutes(app, { repository: platformRepository, storage: platformStorage, env: process.env });
registerSitesRoutes(app, { repository: sitesRepository, approvalQueue, eventBus, env: process.env });
registerSelfRepairRoutes(app, { service: selfRepairService, env: process.env });
app.use(express.static(webDistDir));

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


