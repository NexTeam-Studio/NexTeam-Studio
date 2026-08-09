import type { User } from "firebase/auth";
export interface PilotSubscriptionPackage {
  id: string;
  version: string;
  name: string;
  priceCents: number;
  currency: string;
  includedModules: string[];
  active: boolean;
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

export async function fetchPilotSubscriptionPackages(user: User): Promise<PilotSubscriptionPackage[]> {
  const response = await authedFetch(user, "/api/platform/admin/subscription-packages");
  const body = await response.json() as { ok?: boolean; packages?: PilotSubscriptionPackage[]; error?: string };

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? "Pilot subscription package is unavailable.");
  }

  return (body.packages ?? []).filter((entry) => entry.active);
}
