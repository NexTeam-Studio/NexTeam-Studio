import { auth } from "../../../firebase.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

async function getOperatorIdToken() {
  if (!auth.currentUser) {
    throw new Error("Firebase operator sign-in is required.");
  }

  return auth.currentUser.getIdToken();
}

export async function sendNexiV1Question({
  question,
  tenantId = "aquatrace",
  conversationId = "",
} = {}) {
  const idToken = await getOperatorIdToken();
  const response = await fetch("/api/nexi/v1/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: normalizeText(question),
      tenantId,
      conversationId: normalizeText(conversationId),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(normalizeText(payload?.error || payload?.answer || "Nexi v1 request failed."));
    error.payload = payload;
    error.status = response.status;
    throw error;
  }

  return payload;
}
