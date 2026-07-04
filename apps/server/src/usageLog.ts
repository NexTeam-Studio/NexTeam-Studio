import type { Firestore } from "firebase-admin/firestore";
import type { UsageLogRecord } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";

export class FirestoreUsageLogWriter implements UsageLogWriter {
  constructor(private readonly db: Firestore) {}

  async write(record: UsageLogRecord): Promise<void> {
    await this.db.collection("usageLog").add(record);
  }
}

export class MemoryUsageLogWriter implements UsageLogWriter {
  readonly records: UsageLogRecord[] = [];

  async write(record: UsageLogRecord): Promise<void> {
    this.records.push(record);
  }
}

