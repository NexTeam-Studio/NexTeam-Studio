import type { User } from "firebase/auth";
import type { NexiResponse } from "../../../shared/contracts/nexi";

export async function fetchJobDeskHealth(): Promise<boolean> {
  const body = await fetch("/api/health").then((response) => response.json() as Promise<{ ok?: boolean }>);
  return body.ok === true;
}

export async function sendNexiMessage(input: {
  user: User;
  tenantId: string;
  conversationId: string;
  message: string;
}): Promise<NexiResponse> {
  const idToken = await input.user.getIdToken();
  const response = await fetch("/api/nexi/message", {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      message: input.message
    })
  });
  return response.json() as Promise<NexiResponse>;
}
