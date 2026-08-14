import { randomUUID } from "node:crypto";
import { RailError, type PlatformBackupRecord, type TenantDataExport } from "@nexteam/core";
import type { PlatformRepository } from "./repository.js";

export interface StorageWriter {
  writeJson(path: string, data: unknown): Promise<void>;
  writeImage(path: string, data: Buffer, contentType: "image/png" | "image/jpeg" | "image/webp"): Promise<string>;
}

export class MemoryStorageWriter implements StorageWriter {
  readonly files = new Map<string, unknown>();

  async writeJson(path: string, data: unknown): Promise<void> {
    this.files.set(path, data);
  }

  async writeImage(path: string, data: Buffer, contentType: "image/png" | "image/jpeg" | "image/webp"): Promise<string> {
    this.files.set(path, { data, contentType });
    return path;
  }
}

export async function runTenantBackup(input: {
  tenantId: string;
  repository: PlatformRepository;
  storage: StorageWriter | null;
  now?: string | undefined;
}): Promise<{ record: PlatformBackupRecord; exportData: TenantDataExport }> {
  if (!input.storage) {
    throw new RailError("Firebase Storage is not configured for platform backups.", { provider: "firebase", op: "tenantBackup", status: 503 });
  }
  const createdAt = input.now ?? new Date().toISOString();
  const exportData = await input.repository.exportTenantData(input.tenantId);
  const storageRef = `backups/${input.tenantId}/${createdAt.replace(/[:.]/g, "-")}.json`;
  await input.storage.writeJson(storageRef, exportData);
  const collectionCounts = Object.fromEntries(
    Object.entries(exportData.collections).map(([collectionName, records]) => [collectionName, records.length])
  );
  const record = await input.repository.recordBackup({
    id: `backup_${randomUUID()}`,
    tenantId: input.tenantId,
    storageRef,
    collectionCounts,
    createdAt
  });
  return { record, exportData };
}
