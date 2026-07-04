import {
  RailError,
  type DocRef,
  type Media,
  type MediaProvider,
  type ProjectRef
} from "@nexteam/core";
import { asArray, asRecord, railFetchJson, text } from "../railFetch.js";

const COMPANYCAM_BASE_URL = "https://api.companycam.com/v2";

export interface CompanyCamAdapterConfig {
  tenantId: string;
  token: string | undefined;
}

function companyCamHeaders(token: string): HeadersInit {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": "NexTeam-Studio/CompanyCamProvider"
  };
}

function mapProject(raw: unknown): ProjectRef {
  const record = asRecord(raw);
  const address = asRecord(record.address);
  const mappedAddress: Partial<ProjectRef["address"]> = {
    street1: text(address.street_address_1),
    city: text(address.city),
    province: text(address.state),
    postalCode: text(address.postal_code),
    country: text(address.country) || "US"
  };
  const street2 = text(address.street_address_2);
  if (street2) {
    mappedAddress.street2 = street2;
  }
  return {
    id: text(record.id),
    name: text(record.name) || "Unnamed CompanyCam project",
    externalIds: { companycam: text(record.id) },
    address: mappedAddress
  };
}

function mapMedia(raw: unknown, tenantId: string, projectId: string): Media {
  const record = asRecord(raw);
  const id = text(record.id);
  const capturedAt = text(record.captured_at) || text(record.created_at);
  const media: Media = {
    id,
    tenantId,
    jobId: projectId,
    type: "photo",
    storageRef: `companycam:${id}`,
    aiTags: [],
    externalIds: { companycam: id }
  };
  if (capturedAt) {
    media.exif = { ts: capturedAt };
  }
  const description = text(record.description);
  if (description) {
    media.aiCaption = description;
  }
  return media;
}

function mapDocument(raw: unknown, tenantId: string): DocRef {
  const record = asRecord(raw);
  const id = text(record.id);
  return {
    id,
    tenantId,
    label: text(record.name) || text(record.title) || `CompanyCam document ${id}`,
    storageRef: `companycam-doc:${id}`,
    externalIds: { companycam: id }
  };
}

function pickPhotoUrl(photo: Record<string, unknown>): string {
  const uris = asArray(photo.uris);
  for (const uri of uris) {
    const record = asRecord(uri);
    const url = text(record.url) || text(record.uri);
    if (url) {
      return url;
    }
  }
  return text(photo.photo_url) || text(photo.url);
}

export class CompanyCamAdapter implements MediaProvider {
  constructor(private readonly config: CompanyCamAdapterConfig) {}

  static fromEnv(env: NodeJS.ProcessEnv, tenantId = env.TENANT_ID || "aquatrace"): CompanyCamAdapter {
    return new CompanyCamAdapter({ tenantId, token: env.COMPANYCAM_API_TOKEN });
  }

  isConfigured(): boolean {
    return Boolean(this.config.token);
  }

  async findProjects(q: string): Promise<ProjectRef[]> {
    if (!this.config.token) {
      throw new RailError("CompanyCam token is not configured.", { provider: "companycam", op: "findProjects", status: 400 });
    }
    const url = new URL(`${COMPANYCAM_BASE_URL}/projects`);
    url.searchParams.set("per_page", "10");
    if (q.trim()) {
      url.searchParams.set("query", q.trim());
    }
    const payload = await railFetchJson(url.toString(), {
      provider: "companycam",
      op: "findProjects",
      headers: companyCamHeaders(this.config.token)
    }, (value) => value);
    const items = Array.isArray(payload) ? payload : asArray(asRecord(payload).projects);
    return items.map(mapProject).filter((project) => Boolean(project.id));
  }

  async getMedia(projectRef: ProjectRef): Promise<Media[]> {
    if (!this.config.token) {
      throw new RailError("CompanyCam token is not configured.", { provider: "companycam", op: "getMedia", status: 400 });
    }
    const url = new URL(`${COMPANYCAM_BASE_URL}/projects/${encodeURIComponent(projectRef.id)}/photos`);
    url.searchParams.set("per_page", "25");
    const payload = await railFetchJson(url.toString(), {
      provider: "companycam",
      op: "getMedia",
      headers: companyCamHeaders(this.config.token)
    }, (value) => value);
    const items = Array.isArray(payload) ? payload : asArray(asRecord(payload).photos);
    return items.map((item) => mapMedia(item, this.config.tenantId, projectRef.id));
  }

  async getDocuments(projectRef: ProjectRef): Promise<DocRef[]> {
    if (!this.config.token) {
      throw new RailError("CompanyCam token is not configured.", { provider: "companycam", op: "getDocuments", status: 400 });
    }
    const payload = await railFetchJson(`${COMPANYCAM_BASE_URL}/projects/${encodeURIComponent(projectRef.id)}/documents`, {
      provider: "companycam",
      op: "getDocuments",
      headers: companyCamHeaders(this.config.token)
    }, (value) => value);
    const items = Array.isArray(payload) ? payload : asArray(asRecord(payload).documents);
    return items.map((item) => mapDocument(item, this.config.tenantId));
  }

  async fetchBinary(mediaId: string): Promise<{ stream: ReadableStream<Uint8Array>; mime: string }> {
    if (!this.config.token) {
      throw new RailError("CompanyCam token is not configured.", { provider: "companycam", op: "fetchBinary", status: 400 });
    }
    const id = mediaId.startsWith("companycam:") ? mediaId.slice("companycam:".length) : mediaId;
    const photo = await railFetchJson(`${COMPANYCAM_BASE_URL}/photos/${encodeURIComponent(id)}`, {
      provider: "companycam",
      op: "fetchPhotoMetadata",
      headers: companyCamHeaders(this.config.token)
    }, asRecord);
    const url = pickPhotoUrl(photo);
    if (!url) {
      throw new RailError("CompanyCam photo did not include a fetchable URL.", { provider: "companycam", op: "fetchBinary", status: 404 });
    }
    const response = await fetch(url, { headers: companyCamHeaders(this.config.token) });
    if (!response.ok || !response.body) {
      throw new RailError(`CompanyCam binary fetch failed with status ${response.status}.`, {
        provider: "companycam",
        op: "fetchBinary",
        status: response.status
      });
    }
    return {
      stream: response.body,
      mime: response.headers.get("content-type") || "application/octet-stream"
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    if (!this.config.token) {
      return { ok: true, detail: "CompanyCam not configured; skipped." };
    }
    await this.findProjects("");
    return { ok: true, detail: "CompanyCam projects read succeeded." };
  }
}
