import { InMemoryEventBus, RailError, type ApprovalQueueService, type EventBus } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, type NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../../comms/gmailRegistry.js";
import type { NexReachService } from "../../../../content/nexreachService.js";
import { getAdminDb } from "../../../../firebase.js";
import { FieldDocsService } from "../../../../fielddocs/fieldDocsService.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "../../../../fielddocs/mediaRepository.js";
import { NexDocsService } from "../../../../fielddocs/nexDocsService.js";
import type { PlatformRepository } from "../../../../platform/repository.js";
import type { ReviewSequenceService } from "../../../../reputation/reviewSequenceService.js";
import type { SitesRepository } from "../../../../sites/repository.js";
import type { OperationsHubService } from "../../areas/home/components/operationsHub/server/operationsHubService.js";
import type { LedgerService } from "../../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { JobLifecycleService } from "../../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { PortalHubService } from "../../../nexportal/components/portalCore/server/portalHubService.js";
import { FirestoreNativeCrmRepository } from "../persistence/nativeRepository.js";
import { AgreementService, MemoryAgreementRepository, type AgreementRepository } from "../agreements/agreementFoundation.js";
import { FirestoreAgreementRepository } from "../agreements/agreementRepository.js";
import { JobCostingService, MemoryJobCostingRepository, type JobCostingRepository } from "../jobCosting/jobCostingFoundation.js";
import { FirestoreJobCostingRepository } from "../jobCosting/jobCostingRepository.js";

export interface CrmRouteDeps {
  approvalQueue: ApprovalQueueService;
  eventBus?: EventBus | undefined;
  memoryRepository?: NativeCrmRepository | undefined;
  fieldDocsRepository?: MediaRepository | undefined;
  nexDocsService?: NexDocsService | undefined;
  platformRepository?: Pick<PlatformRepository, "getTenant" | "listTenantUsers" | "getTenantBranding"> | undefined;
  sitesRepository?: Pick<SitesRepository, "listLeads"> | undefined;
  commsRail?: CommsRail | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService, "getInvoice" | "getInvoiceDetail" | "updateInvoiceDraft" | "sendInvoice" | "updateReceiptReviewDraft" | "sendReceiptReview" | "listInvoices" | "listPayments" | "listDeposits" | "listRefunds" | "listCredits" | "listReceiptReviews" | "getPaymentDetail" | "recordInvoicePayment" | "performLedgerAction" | "createPendingStripeCheckout" | "markStripeCheckoutPaid" | "syncQuoteDepositBridge" | "syncInvoiceAfterCreate" | "composeInvoiceFromJobs"> | undefined;
  portalHubService?: PortalHubService | undefined;
  reviewSequenceService?: ReviewSequenceService | undefined;
  nexReachService?: Pick<NexReachService, "handleConsentChange"> | undefined;
  operationsHubService?: OperationsHubService | undefined;
  agreementRepository?: AgreementRepository | undefined;
  jobCostingRepository?: JobCostingRepository | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function createCrmRouteServices(deps: CrmRouteDeps) {
  const env = deps.env ?? process.env;
  const fallbackRepository = deps.memoryRepository ?? new MemoryNativeCrmRepository();
  const fallbackFieldDocsRepository = deps.fieldDocsRepository ?? new MemoryMediaRepository();
  const eventBus = deps.eventBus ?? new InMemoryEventBus();
  const fallbackAgreementRepository = deps.agreementRepository ?? new MemoryAgreementRepository();
  const fallbackJobCostingRepository = deps.jobCostingRepository ?? new MemoryJobCostingRepository();

  function repositoryForTenant(): NativeCrmRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreNativeCrmRepository(db) : fallbackRepository;
  }

  function providerForTenant(tenantId: string): NativeAdapter {
    return new NativeAdapter(repositoryForTenant(), tenantId);
  }

  function agreementService(): AgreementService {
    const db = getAdminDb(env);
    return new AgreementService(db ? new FirestoreAgreementRepository(db) : fallbackAgreementRepository);
  }

  function jobCostingService(): JobCostingService {
    const db = getAdminDb(env);
    return new JobCostingService(db ? new FirestoreJobCostingRepository(db) : fallbackJobCostingRepository);
  }

  function fieldDocsRepository(): MediaRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreMediaRepository(db) : fallbackFieldDocsRepository;
  }

  function fieldDocsService(): FieldDocsService {
    return new FieldDocsService({ mediaRepository: fieldDocsRepository(), crmRepository: repositoryForTenant() });
  }

  function nexDocsService(): NexDocsService {
    return deps.nexDocsService ?? new NexDocsService({
      mediaRepository: fieldDocsRepository(),
      crmRepository: repositoryForTenant(),
      ledgerService: deps.ledgerService
    });
  }

  function jobLifecycle(): JobLifecycleService {
    if (!deps.jobLifecycleService) throw new RailError("Job lifecycle service is not wired for this tenant yet.", { provider: "native", op: "jobLifecycle", status: 501 });
    return deps.jobLifecycleService;
  }

  function ledger() {
    if (!deps.ledgerService) throw new RailError("Ledger service is not wired for this tenant yet.", { provider: "native", op: "ledger", status: 501 });
    return deps.ledgerService;
  }

  function operationsHub(): OperationsHubService {
    if (!deps.operationsHubService) throw new RailError("Operations hub service is not wired for this tenant yet.", { provider: "native", op: "operationsHub", status: 501 });
    return deps.operationsHubService;
  }

  function portalHub(): PortalHubService {
    if (!deps.portalHubService) throw new RailError("Portal hub service is not wired for this tenant yet.", { provider: "native", op: "portalHub", status: 501 });
    return deps.portalHubService;
  }

  function reviewSequences(): ReviewSequenceService {
    if (!deps.reviewSequenceService) throw new RailError("Review sequence service is not wired for this tenant yet.", { provider: "native", op: "reviewSequence", status: 501 });
    return deps.reviewSequenceService;
  }

  return {
    env,
    agreementService,
    eventBus,
    fallbackFieldDocsRepository,
    fallbackRepository,
    fieldDocsRepository,
    fieldDocsService,
    jobLifecycle,
    jobCostingService,
    ledger,
    nexDocsService,
    operationsHub,
    portalHub,
    providerForTenant,
    repositoryForTenant,
    reviewSequences
  };
}
