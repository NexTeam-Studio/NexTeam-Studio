import { getStorage } from "firebase-admin/storage";
import type { StorageWriter } from "./backup.js";

export class FirebaseStorageWriter implements StorageWriter {
  constructor(private readonly bucketName?: string | undefined) {}

  async writeJson(path: string, data: unknown): Promise<void> {
    const bucket = this.bucketName ? getStorage().bucket(this.bucketName) : getStorage().bucket();
    await bucket.file(path).save(JSON.stringify(data, null, 2), {
      contentType: "application/json; charset=utf-8",
      resumable: false
    });
  }
}
