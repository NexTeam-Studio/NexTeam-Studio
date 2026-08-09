import { randomUUID } from "node:crypto";
import { RailError, type EmailSendProvider } from "@nexteam/core";

export type OwnerInviteDeliveryStatus = "SENT_TO_PROVIDER" | "FAILED" | "NOT_SENT";

/** This record deliberately contains delivery metadata only. Reset links are never persisted. */
export interface TenantOwnerInvite {
  id: string;
  tenantId: string;
  ownerUserId: string;
  ownerEmail: string;
  status: OwnerInviteDeliveryStatus;
  attemptCount: number;
  provider?: string | undefined;
  providerMessageId?: string | undefined;
  lastError?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseOwnerInviteAuth {
  generatePasswordResetLink(email: string, settings: { url: string; handleCodeInApp: false }): Promise<string>;
}

export interface OwnerInviteSender {
  send(input: { tenantId: string; ownerEmail: string; ownerName: string; tenantName: string }): Promise<{ provider: string; messageId: string }>;
}

export function ownerInviteDocumentId(tenantId: string, ownerUserId: string): string {
  return `owner_invite_${tenantId}_${ownerUserId}`;
}

export function createOwnerInviteSender(input: { auth: FirebaseOwnerInviteAuth; email: EmailSendProvider | null; continueUrl: string }): OwnerInviteSender {
  return {
    async send({ tenantId, ownerEmail, ownerName, tenantName }) {
      if (!input.email) {
        throw new RailError("Owner invite email delivery is not configured.", { provider: "gmail", op: "sendOwnerInvite", status: 503 });
      }
      const setupLink = await input.auth.generatePasswordResetLink(ownerEmail, { url: input.continueUrl, handleCodeInApp: false });
      const receipt = await input.email.sendEmail({
        tenantId,
        mailbox: input.email.mailbox,
        to: [ownerEmail],
        subject: `Set up your ${tenantName} NexTeam account`,
        bodyText: `Hello ${ownerName},\n\nYour ${tenantName} NexTeam workspace is ready. Set your password here: ${setupLink}\n\nThis secure link opens the same NexTeam account used for NexOps and Nexi.\n\nIf you did not expect this invitation, you can ignore this email.`
      });
      return { provider: receipt.provider, messageId: receipt.id };
    }
  };
}

export function newOwnerInvite(input: Omit<TenantOwnerInvite, "id" | "createdAt" | "updatedAt"> & { now?: string }): TenantOwnerInvite {
  const timestamp = input.now ?? new Date().toISOString();
  return { ...input, id: ownerInviteDocumentId(input.tenantId, input.ownerUserId), createdAt: timestamp, updatedAt: timestamp };
}

export function generatedTenantId(): string {
  return `tenant-${randomUUID()}`;
}
