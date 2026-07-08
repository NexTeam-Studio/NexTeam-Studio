import {
  CachedDayScheduleSchema,
  MobilePushRegistrationSchema,
  MobileSyncRequestSchema,
  MobileSyncResultSchema,
  type CachedDaySchedule,
  type MobilePushRegistration,
  type OfflineOperation
} from "../offline/schemas.js";
import type { MobileRemoteAdapter, PreloadDayScheduleInput, RemoteApplyResult } from "../offline/syncEngine.js";

export interface MobileApiClientOptions {
  baseUrl: string;
  tokenProvider: () => Promise<string | null>;
}

type JsonRecord = Record<string, unknown>;

async function parseJson(response: Response): Promise<JsonRecord> {
  const body = await response.json() as JsonRecord;
  if (!response.ok || body.ok === false) {
    const error = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return body;
}

export class MobileApiClient implements MobileRemoteAdapter {
  constructor(private readonly options: MobileApiClientOptions) {}

  async fetchDaySchedule(input: PreloadDayScheduleInput): Promise<CachedDaySchedule> {
    const params = new URLSearchParams({
      tenantId: input.tenantId,
      date: input.date,
      technicianId: input.technicianId
    });
    const body = await this.request(`/api/mobile/day-schedule?${params.toString()}`);
    return CachedDayScheduleSchema.parse(body.schedule);
  }

  async applyOperation(operation: OfflineOperation): Promise<RemoteApplyResult> {
    const body = await this.request(`/api/mobile/sync?tenantId=${encodeURIComponent(operation.tenantId)}`, {
      method: "POST",
      body: JSON.stringify(MobileSyncRequestSchema.parse({ operations: [operation] }))
    });
    const results = Array.isArray(body.results) ? body.results : [];
    const first = MobileSyncResultSchema.parse(results[0]);
    if (!first.ok) {
      throw new Error(first.error ?? "Mobile sync failed.");
    }
    return {
      remoteUpdatedAt: first.remoteUpdatedAt ?? new Date().toISOString(),
      ...(first.remoteUrl ? { remoteUrl: first.remoteUrl } : {}),
      conflicts: first.conflicts.map((conflict) => ({
        field: conflict.field,
        localValue: conflict.localValue,
        remoteValue: conflict.remoteValue,
        remoteUpdatedAt: conflict.remoteUpdatedAt
      }))
    };
  }

  async registerPushToken(input: Omit<MobilePushRegistration, "registeredAt" | "tenantUserId" | "role"> & { tenantUserId?: string; role?: MobilePushRegistration["role"] }): Promise<MobilePushRegistration> {
    const body = await this.request("/api/mobile/push-token", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return MobilePushRegistrationSchema.parse(body.registration);
  }

  async listApprovals(tenantId: string): Promise<JsonRecord[]> {
    const body = await this.request(`/api/mobile/approvals?tenantId=${encodeURIComponent(tenantId)}`);
    return Array.isArray(body.items) ? body.items.filter((item): item is JsonRecord => typeof item === "object" && item !== null) : [];
  }

  private async request(path: string, init: RequestInit = {}): Promise<JsonRecord> {
    const token = await this.options.tokenProvider();
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return parseJson(await fetch(`${this.options.baseUrl}${path}`, { ...init, headers }));
  }
}

export function createMobileRemoteAdapter(options: MobileApiClientOptions): MobileApiClient {
  return new MobileApiClient(options);
}
