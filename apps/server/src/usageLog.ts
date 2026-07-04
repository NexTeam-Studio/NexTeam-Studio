import type { Firestore } from "firebase-admin/firestore";
import { usageLogRecordSchema, type UsageLogRecord } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";

export class FirestoreUsageLogWriter implements UsageLogWriter {
  constructor(private readonly db: Firestore) {}

  async write(record: UsageLogRecord): Promise<void> {
    await this.db.collection("usageLog").add(usageLogRecordSchema.parse(record));
  }
}

export class MemoryUsageLogWriter implements UsageLogWriter {
  readonly records: UsageLogRecord[] = [];

  async write(record: UsageLogRecord): Promise<void> {
    this.records.push(usageLogRecordSchema.parse(record));
  }
}

