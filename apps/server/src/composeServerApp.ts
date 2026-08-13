import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalQueueService,
  FirestoreEventBus,
  InMemoryEventBus,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { getBuildInfo } from "./buildInfo.js";
import { listLocalDevWebProfiles } from "./auth/accessContext.js";
import { registerLocalDevAuthRoutes } from "./auth/localDevRoutes.js";
import { CompositeApprovalExecutor } from "./approval/compositeExecutor.js";
import { FirestoreApprovalQueueRepository } from "./approval/firestoreRepository.js";
import { registerApprovalQueueRoutes } from "./approval/routes.js";
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
import { registerCrmRoutes } from "./modules/nexops/routes.js";
import { getAdminAuth, getAdminDb } from "./firebase.js";
import { registerWorkspaceLinkRoutes } from "./auth/workspaceLinkRoutes.js";
import { FieldDocsApprovalExecutor } from "./fielddocs/approvalExecutor.js";
import { FieldDocsService } from "./fielddocs/fieldDocsService.js";
import { NexDocsService } from "./fielddocs/nexDocsService.js";
import { registerFieldDocsRoutes } from "./fielddocs/routes.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "./fielddocs/mediaRepository.js";
import { registerNativeMediaRoutes } from "./fielddocs/nativeMediaRoutes.js";
import { CommsApprovalExecutor } from "./comms/approvalExecutor.js";
import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";
import { ContentApprovalExecutor } from "./content/approvalExecutor.js";
import { registerNexReachRoutes } from "./content/nexreachRoutes.js";
import { NexReachService } from "./content/nexreachService.js";
import { FirestoreContentRepository, InMemoryContentRepository } from "./content/repository.js";
import { registerContentRoutes } from "./content/routes.js";
import { CrmApprovalExecutor } from "./modules/nexops/shared/approval/executor.js";
import { FirestoreNativeCrmRepository } from "./modules/nexops/shared/persistence/nativeRepository.js";
import { MemoryEvaporationRepository } from "./evaporation/repository.js";
import { registerEvaporationRoutes } from "./evaporation/routes.js";
import { IntakeApprovalExecutor } from "./intake/approvalExecutor.js";
import { FirestoreIntakeRepository, InMemoryIntakeRepository } from "./intake/repository.js";
import { registerIntakeRoutes } from "./intake/routes.js";
import { IntakeService } from "./intake/service.js";
import { InMemoryMobileRepository } from "./mobile/repository.js";
import { registerMobileRoutes } from "./mobile/routes.js";
import { FirestoreSchedulingRepository, InMemorySchedulingRepository } from "./scheduling/repository.js";
import { registerSchedulingRoutes } from "./scheduling/routes.js";
import { EnvGbpReviewProvider } from "./reputation/gbpProvider.js";
import { FirestoreReputationRepository, InMemoryReputationRepository } from "./reputation/repository.js";
import { registerReputationRoutes } from "./reputation/routes.js";
import { FirestoreSeoRepository, InMemorySeoRepository } from "./seo/repository.js";
import { registerSeoRoutes } from "./seo/routes.js";
import { MemoryStorageWriter } from "./platform/backup.js";
import { FirebaseStorageWriter } from "./platform/storage.js";
import { FirestorePlatformRepository, InMemoryPlatformRepository } from "./platform/repository.js";
import { registerPlatformRoutes } from "./platform/routes.js";
import { createOwnerInviteSender, ownerInviteContinueUrl } from "./platform/tenantOwnerInvite.js";
import {
  createStripeConnectExpressAccount,
  createStripeConnectOnboardingLink,
  retrieveStripeConnectAccount
} from "./modules/nexops/areas/invoices/components/paymentRails/server/stripe.js";
import { FirestoreSitesRepository, InMemorySitesRepository } from "./sites/repository.js";
import { registerSitesRoutes } from "./sites/routes.js";
import { FirestoreSelfRepairRepository, InMemorySelfRepairRepository } from "./selfrepair/repository.js";
import { HourlySelfRepairScheduler } from "./selfrepair/hourlyScheduler.js";
import { registerSelfRepairRoutes } from "./selfrepair/routes.js";
import { SelfRepairService } from "./selfrepair/service.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "./usageLog.js";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createVoiceRouter } from "./voice/routes.js";
import { configuredTenantId } from "./core/tenantConfig.js";
import { registerSystemRoutes } from "./core/systemRoutes.js";
import { assertRequiredPersistence, assertTenantRuntimePersistence } from "./app/persistencePolicy.js";
import { registerIntegratedNexiRoutes } from "./nexi/integratedRoutes.js";
import { registerUsersRoutes } from "./modules/nexops/areas/users/routes.js";

const app = express();
const runtimeTenantId = configuredTenantId(process.env, "serverBootstrap");
const commsRail = createCommsRailFromEnv(process.env);
const adminDb = getAdminDb();
assertTenantRuntimePersistence(process.env, Boolean(adminDb));
assertRequiredPersistence(process.env, {
  ApprovalQueue: Boolean(adminDb),
  Content: Boolean(adminDb),
  Scheduling: Boolean(adminDb)
});
const fieldDocsUsageLog = adminDb ? new FirestoreUsageLogWriter(adminDb) : new MemoryUsageLogWriter();
const contentRepository = adminDb ? new FirestoreContentRepository(adminDb) : new InMemoryContentRepository();
const schedulingRepository = adminDb ? new FirestoreSchedulingRepository(adminDb) : new InMemorySchedulingRepository();
const campaignRepository = new InMemoryCampaignRepository(runtimeTenantId, false);
const gbpReviewProvider = new EnvGbpReviewProvider(process.env);
const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const eventBus = adminDb ? new FirestoreEventBus(adminDb) : new InMemoryEventBus();
const fallbackMediaRepository = new MemoryMediaRepository();
const mediaRepository: MediaRepository = adminDb ? new FirestoreMediaRepository(adminDb) : fallbackMediaRepository;
const nativeCrmRepository = adminDb ? new FirestoreNativeCrmRepository(adminDb) : new MemoryNativeCrmRepository();
const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository: nativeCrmRepository });
const nativeCrmProvider = new NativeAdapter(nativeCrmRepository, runtimeTenantId);
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
  schedulingRepository,
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
      "deleteClient",
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
    executor: new CrmApprovalExecutor(nativeCrmProvider, jobLifecycleService, ledgerService, nativeCrmRepository)
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
const hourlySelfRepairSender = process.env.SELF_REPAIR_HOURLY_EMAIL_ENABLED?.trim().toLowerCase() === "true"
  ? commsRail.sendAdapter
  : null;
const selfRepairReportMailer = hourlySelfRepairSender
  ? {
      send: async ({ tenantId, to, subject, bodyText }: { tenantId: string; to: string; subject: string; bodyText: string }) => {
        if (tenantId !== commsRail.tenantId) {
          throw new Error("Self-repair report tenant does not match the configured send mailbox.");
        }
        await hourlySelfRepairSender.sendEmail({
          tenantId,
          mailbox: hourlySelfRepairSender.mailbox,
          to: [to],
          subject,
          bodyText
        });
      }
    }
  : undefined;
const selfRepairService = new SelfRepairService({
  dataReader: platformRepository,
  repository: selfRepairRepository,
  approvalQueue,
  usageLog: selfRepairUsageLog,
  reportMailer: selfRepairReportMailer,
  env: process.env
});
new HourlySelfRepairScheduler({
  service: selfRepairService,
  tenantId: runtimeTenantId,
  env: process.env,
  reportEmail: commsRail.operatorEmail
}).start();
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

// This is the Railway server entry point. Keep Firebase membership linking on
// the composed app rather than only on the legacy createServerApp path.
registerWorkspaceLinkRoutes(app, { env: process.env, platformRepository });

registerIntegratedNexiRoutes(app, {
  env: process.env,
  tenantId: runtimeTenantId,
  platformRepository,
  crm: {
    createProvider: (tenantId) => new NativeAdapter(nativeCrmRepository, tenantId),
    approvalQueue,
    options: {
      requestRepository: nativeCrmRepository,
      platformRepository,
      commsRail,
      jobLifecycleService,
      ledgerService,
      operationsHubService,
      portalHubService,
      reviewSequenceService
    }
  },
  comms: { rail: commsRail, approvalQueue },
  scheduling: { repository: schedulingRepository, approvalQueue, env: process.env, jobLifecycleService },
  evaporation: { repository: evaporationRepository, env: process.env },
  fieldDocs: {
    mediaRepository,
    crmRepository: nativeCrmRepository,
    fieldDocsService,
    nexDocsService,
    approvalQueue,
    env: process.env
  },
  campaign: { repository: campaignRepository, approvalQueue, env: process.env },
  approval: {
    approvalQueue,
    crmRepository: nativeCrmRepository,
    jobLifecycleService,
    ledgerService,
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175"
  },
  sites: { repository: sitesRepository },
  reputation: { repository: reputationRepository, approvalQueue, gbpProvider: gbpReviewProvider, eventBus },
  seo: { repository: seoRepository, sitesRepository, approvalQueue, env: process.env },
  intake: { service: intakeService, approvalQueue },
  content: { service: nexReachService }
});
app.use("/api/voice", createVoiceRouter(process.env));

registerSystemRoutes(app, { env: process.env, tenantId: runtimeTenantId, localProfiles: listLocalDevWebProfiles });
registerLocalDevAuthRoutes(app, { env: process.env, tenantId: runtimeTenantId });
registerUsersRoutes(app, process.env);
registerNativeMediaRoutes(app, { env: process.env, tenantId: runtimeTenantId, repository: mediaRepository });
registerApprovalQueueRoutes(app, { env: process.env, tenantId: runtimeTenantId, approvalQueue });

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
registerPlatformRoutes(app, {
  repository: platformRepository,
  storage: platformStorage,
  ownerInviteSender: getAdminAuth()
    ? createOwnerInviteSender({ auth: getAdminAuth()!, email: commsRail.sendAdapter, continueUrl: ownerInviteContinueUrl(process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175") })
    : undefined,
  stripeConnect: {
    createExpressAccount: createStripeConnectExpressAccount,
    createOnboardingLink: createStripeConnectOnboardingLink,
    retrieveAccount: retrieveStripeConnectAccount
  },
  env: process.env
});
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

// Nexi has its own top-level workspace. Preserve the short-lived preview path
// by sending it to the canonical Nexi URL instead of rendering NexOps there.
app.get("/nexops/nexi", (_req: Request, res: Response) => {
  res.redirect(302, "/nexi");
});

app.use(express.static(webDistDir));

app.get("/nexops/sign-in", (_req: Request, res: Response) => {
  res.sendFile(path.join(webDistDir, "index.html"));
});

app.get(/^\/(?:nexi|nexops|nexcam|nexreach|platform|nexcommand)(?:\/.*)?$/, (_req: Request, res: Response) => {
  res.sendFile(path.join(webDistDir, "index.html"));
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "nexteam-studio-server", version: getBuildInfo() });
});

export { app };
