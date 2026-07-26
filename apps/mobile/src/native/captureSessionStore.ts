import AsyncStorageModule, { type AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import {
  captureSessionDraftSchema,
  type CaptureSessionDraft
} from "./captureModels.js";
import type { CaptureSessionStore } from "./captureQueue.js";

const STORAGE_KEY = "nexteam.mobile.captureSessions";
const AsyncStorage = AsyncStorageModule as unknown as AsyncStorageStatic;

async function readSessions(): Promise<CaptureSessionDraft[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((session) => captureSessionDraftSchema.parse(session));
  } catch {
    return [];
  }
}

async function writeSessions(sessions: CaptureSessionDraft[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.map((session) => captureSessionDraftSchema.parse(session))));
}

export class AsyncStorageCaptureSessionStore implements CaptureSessionStore {
  async list(): Promise<CaptureSessionDraft[]> {
    return (await readSessions()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async get(sessionId: string): Promise<CaptureSessionDraft | null> {
    return (await readSessions()).find((session) => session.id === sessionId) ?? null;
  }

  async save(session: CaptureSessionDraft): Promise<CaptureSessionDraft> {
    const parsed = captureSessionDraftSchema.parse(session);
    const existing = await readSessions();
    const index = existing.findIndex((candidate) => candidate.id === parsed.id);
    if (index === -1) {
      existing.push(parsed);
    } else {
      existing[index] = parsed;
    }
    await writeSessions(existing);
    return parsed;
  }

  async remove(sessionId: string): Promise<void> {
    const existing = await readSessions();
    await writeSessions(existing.filter((session) => session.id !== sessionId));
  }
}
