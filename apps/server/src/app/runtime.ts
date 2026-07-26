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
import { InMemoryContentRepository, type ContentRepository } from "../content/repository.js";
import { FirestoreNativeCrmRepository } from "../crm/nativeRepository.js";
import { getAdminDb } from "../firebase.js";
import { MemoryStorageWriter, type StorageWriter } from "../platform/backup.js";
import { FirestorePlatformRepository, InMemoryPlatformRepository, type PlatformRepository } from "../platform/repository.js";
import { FirebaseStorageWriter } from "../platform/storage.js";
import { InMemorySchedulingRepository, type SchedulingRepository } from "../scheduling/repository.js";

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
  if (env.ALLOW_IN_MEMORY_PERSISTENCE?.trim().toLowerCase() !== "true") {
    throw new Error("Durable persistence is required. Set ALLOW_IN_MEMORY_PERSISTENCE=true only for local or staging development.");
  }
  const adminDb = getAdminDb(env);
  const commsRail = createCommsRailFromEnv(env);
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CommsApprovalExecutor(commsRail)
  );
  const contentRepository = new InMemoryContentRepository();
  const schedulingRepository = new InMemorySchedulingRepository();
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
