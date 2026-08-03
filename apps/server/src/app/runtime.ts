import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalQueueService,
  FirestoreEventBus,
  InMemoryEventBus,
  InMemoryApprovalQueueRepository,
  type EventBus
} from "@nexteam/core";
import { MemoryNativeCrmRepository, type NativeCrmRepository } from "@nexteam/providers";
import type { Firestore } from "firebase-admin/firestore";
import { CommsApprovalExecutor } from "../comms/approvalExecutor.js";
import { createCommsRailFromEnv, type CommsRail } from "../comms/gmailRegistry.js";
import { FirestoreApprovalQueueRepository } from "../approval/firestoreRepository.js";
import { FirestoreContentRepository, InMemoryContentRepository, type ContentRepository } from "../content/repository.js";
import { FirestoreNativeCrmRepository } from "../modules/nexops/shared/persistence/nativeRepository.js";
import { getAdminDb } from "../firebase.js";
import { MemoryStorageWriter, type StorageWriter } from "../platform/backup.js";
import { FirestorePlatformRepository, InMemoryPlatformRepository, type PlatformRepository } from "../platform/repository.js";
import { FirebaseStorageWriter } from "../platform/storage.js";
import { FirestoreSchedulingRepository, InMemorySchedulingRepository, type SchedulingRepository } from "../scheduling/repository.js";
import { assertRequiredPersistence, assertTenantRuntimePersistence } from "./persistencePolicy.js";

export interface ServerRuntime {
  env: NodeJS.ProcessEnv;
  webDistDir: string;
  adminDb: Firestore | null;
  approvalQueue: ApprovalQueueService;
  commsRail: CommsRail;
  contentRepository: ContentRepository;
  schedulingRepository: SchedulingRepository;
  eventBus: EventBus;
  nativeCrmRepository: NativeCrmRepository;
  platformRepository: PlatformRepository;
  platformStorage: StorageWriter;
}

export function createServerRuntime(env: NodeJS.ProcessEnv = process.env): ServerRuntime {
  const adminDb = getAdminDb(env);
  assertTenantRuntimePersistence(env, Boolean(adminDb));
  assertRequiredPersistence(env, {
    ApprovalQueue: Boolean(adminDb),
    Content: Boolean(adminDb),
    Scheduling: Boolean(adminDb)
  });
  const commsRail = createCommsRailFromEnv(env);
  const approvalQueue = new ApprovalQueueService(
    adminDb ? new FirestoreApprovalQueueRepository(adminDb) : new InMemoryApprovalQueueRepository(),
    new CommsApprovalExecutor(commsRail)
  );
  const contentRepository = adminDb ? new FirestoreContentRepository(adminDb) : new InMemoryContentRepository();
  const schedulingRepository = adminDb ? new FirestoreSchedulingRepository(adminDb) : new InMemorySchedulingRepository();
  const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../web/dist");
  const eventBus = adminDb ? new FirestoreEventBus(adminDb) : new InMemoryEventBus();
  const nativeCrmRepository = adminDb ? new FirestoreNativeCrmRepository(adminDb) : new MemoryNativeCrmRepository();
  const platformRepository = adminDb ? new FirestorePlatformRepository(adminDb) : new InMemoryPlatformRepository();
  const platformStorage = adminDb
    ? new FirebaseStorageWriter(env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET)
    : new MemoryStorageWriter();

  return {
    env,
    webDistDir,
    adminDb,
    approvalQueue,
    commsRail,
    contentRepository,
    schedulingRepository,
    eventBus,
    nativeCrmRepository,
    platformRepository,
    platformStorage
  };
}
