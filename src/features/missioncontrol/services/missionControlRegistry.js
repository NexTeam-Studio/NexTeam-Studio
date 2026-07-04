import { auth } from "../../../firebase.js";

const MISSION_CONTROL_CLIENTS_ENDPOINT = "/api/internal/mission-control/clients";

export async function fetchMissionControlClients(maxResults = 50) {
  if (!auth.currentUser) {
    throw new Error("Operator session is required to load Mission Control clients.");
  }

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(
    `${MISSION_CONTROL_CLIENTS_ENDPOINT}?maxResults=${encodeURIComponent(Math.max(1, Number(maxResults) || 50))}`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load Mission Control clients.");
  }

  return Array.isArray(payload?.clients) ? payload.clients : [];
}
