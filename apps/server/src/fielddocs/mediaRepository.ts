import type { Media } from "@nexteam/core";

export interface MediaRepository {
  listMedia(tenantId: string): Promise<Media[]>;
  saveMedia?(media: Media): Promise<Media>;
}

export class MemoryMediaRepository implements MediaRepository {
  constructor(private readonly records: Media[] = []) {}

  async listMedia(tenantId: string): Promise<Media[]> {
    return this.records.filter((record) => record.tenantId === tenantId);
  }

  async saveMedia(media: Media): Promise<Media> {
    this.records.push(media);
    return media;
  }
}
