import type { User } from "firebase/auth";
import type { PlatformTenantResponse } from "../../../shared/contracts/platform";

interface BackupResponse {
  ok: boolean;
  backup?: {
    storageRef: string;
  };
  error?: string;
}

async function authedFetch(user: User, path: string, init?: RequestInit): Promise<Response> {
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    }
  });
}

export async function fetchTenantOverview(user: User): Promise<NonNullable<PlatformTenantResponse["tenants"]>> {
  const body = await authedFetch(user, "/api/platform/tenants")
    .then((response) => response.json() as Promise<PlatformTenantResponse>);

  if (!body.ok) {
    throw new Error(body.error ?? "Tenant overview is unavailable.");
  }

  return body.tenants ?? [];
}

export async function runTenantBackup(user: User, tenantId: string): Promise<BackupResponse> {
  return authedFetch(
    user,
    `/api/platform/tenants/${encodeURIComponent(tenantId)}/backups/run`,
    { method: "POST", body: "{}" }
  ).then((response) => response.json() as Promise<BackupResponse>);
}
