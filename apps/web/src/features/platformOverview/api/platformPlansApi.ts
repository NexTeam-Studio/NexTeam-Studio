import type { User } from "firebase/auth";
import type { PlatformPlansResponse } from "../../../shared/contracts/platform";

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

export async function fetchPlatformPlans(user: User): Promise<NonNullable<PlatformPlansResponse["plans"]>> {
  const body = await authedFetch(user, "/api/platform/plans")
    .then((response) => response.json() as Promise<PlatformPlansResponse>);

  if (!body.ok) {
    throw new Error(body.error ?? "Platform plans are unavailable.");
  }

  return body.plans ?? [];
}
