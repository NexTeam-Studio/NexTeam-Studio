const GBP_API_BASE = "/api/gbp";

async function parseResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data?.error || "Google Business Profile request failed.");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function buildGoogleBusinessProfileConnectUrl({
  accountLabel,
  loginHint,
  returnTo = "/mission-control/google-business-profile",
}) {
  const params = new URLSearchParams({
    accountLabel: String(accountLabel || "").trim(),
    returnTo,
  });

  if (String(loginHint || "").trim()) {
    params.set("loginHint", String(loginHint).trim());
  }

  return `/auth/google/gbp/connect?${params.toString()}`;
}

export async function fetchGoogleBusinessProfileConnections() {
  const response = await fetch(`${GBP_API_BASE}/connections`);
  const data = await parseResponse(response);
  return data.connections || [];
}

export async function syncGoogleBusinessProfileConnection(accountKey) {
  const response = await fetch(`${GBP_API_BASE}/connections/${encodeURIComponent(accountKey)}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return parseResponse(response);
}
