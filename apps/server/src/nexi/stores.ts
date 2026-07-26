import { RailError } from "@nexteam/core";
import { getAdminDb } from "../firebase.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "../usageLog.js";
import { FirestoreNexiRepository, MemoryNexiRepository, type NexiRepository } from "./nexiRepository.js";

const memoryRepository = new MemoryNexiRepository();
const memoryUsageLog = new MemoryUsageLogWriter();

export interface NexiStores {
  repository: NexiRepository;
  usageLog: FirestoreUsageLogWriter | MemoryUsageLogWriter;
}

export function resolveNexiStores(env: NodeJS.ProcessEnv): NexiStores {
  const db = getAdminDb(env);
  if (db) {
    return { repository: new FirestoreNexiRepository(db), usageLog: new FirestoreUsageLogWriter(db) };
  }
  if (env.ALLOW_IN_MEMORY_PERSISTENCE?.trim().toLowerCase() !== "true") {
    throw new RailError("Firestore persistence is required. ALLOW_IN_MEMORY_PERSISTENCE=true is local/staging-only.", { provider: "firebase", op: "nexiStores", status: 503 });
  }
  return { repository: memoryRepository, usageLog: memoryUsageLog };
}

export function debugMemoryNexiStores(): { conversations: unknown[]; failureLog: unknown[]; siteJobBlueprints: unknown[]; usageLog: unknown[] } {
  return {
    conversations: memoryRepository.conversations,
    failureLog: memoryRepository.failureLog,
    siteJobBlueprints: memoryRepository.siteJobBlueprints,
    usageLog: memoryUsageLog.records
  };
}
