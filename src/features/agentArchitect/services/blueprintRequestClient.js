function normalizeText(value = "") {
  return String(value || "").trim();
}

async function parseJsonSafe(response) {
  return response.json().catch(() => ({}));
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(normalizeText(payload?.error) || normalizeText(payload?.errors?.join(" ")) || `Request failed (${response.status}).`);
  }

  return payload;
}

export function buildStripeRedirectUrl({
  paymentLink,
  appUrl,
  requestId,
  sessionId,
  tenantId = "nexteam-studio",
} = {}) {
  const baseLink = normalizeText(paymentLink);
  if (!baseLink) {
    throw new Error("paymentLink is required to build a Stripe redirect URL.");
  }

  const successUrl = new URL("/success", normalizeText(appUrl) || window.location.origin);
  if (requestId) successUrl.searchParams.set("requestId", requestId);
  if (sessionId) successUrl.searchParams.set("sessionId", sessionId);
  if (tenantId) successUrl.searchParams.set("tenantId", tenantId);

  const cancelUrl = new URL("/agent-architect", normalizeText(appUrl) || window.location.origin);
  if (requestId) cancelUrl.searchParams.set("requestId", requestId);
  if (sessionId) cancelUrl.searchParams.set("sessionId", sessionId);

  const separator = baseLink.includes("?") ? "&" : "?";
  return `${baseLink}${separator}success_url=${encodeURIComponent(successUrl.toString())}&cancel_url=${encodeURIComponent(cancelUrl.toString())}`;
}

export async function createBlueprintRequest(payload) {
  return postJson("/api/public/blueprint-requests", payload);
}

export async function markBlueprintCheckoutStarted(requestId, payload = {}) {
  return postJson(`/api/public/blueprint-requests/${encodeURIComponent(requestId)}/checkout-started`, payload);
}

export async function markBlueprintSuccessPageViewed(requestId, payload = {}) {
  return postJson(`/api/public/blueprint-requests/${encodeURIComponent(requestId)}/success-page-viewed`, payload);
}
