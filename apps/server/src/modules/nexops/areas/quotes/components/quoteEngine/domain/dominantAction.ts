import { dominantActionStateSchema, type DominantActionState, type QuoteClientResponseStatus, type QuoteLifecycleStatus } from "@nexteam/core";

export function deriveQuoteDominantAction(input: {
  quoteStatus: QuoteLifecycleStatus;
  clientResponseStatus: QuoteClientResponseStatus;
  requireDeposit: boolean;
  expired: boolean;
  missingSignature?: boolean | undefined;
  missingDepositMethod?: boolean | undefined;
}): DominantActionState {
  if (input.expired || input.quoteStatus === "expired") {
    return dominantActionStateSchema.parse({
      label: "Renew quote",
      tone: "blocked",
      reason: "The quote is viewable but approval is hard-blocked until renewal.",
      blockedBy: "Quote expired",
      nextCommandId: "quote.renew"
    });
  }
  if (input.clientResponseStatus === "changes_requested") {
    return dominantActionStateSchema.parse({
      label: "Revise quote",
      tone: "dominant",
      reason: "The customer asked for changes, so the next move is a revision.",
      nextCommandId: "quote.revise"
    });
  }
  if (input.quoteStatus === "draft") {
    return dominantActionStateSchema.parse({
      label: "Send quote",
      tone: "dominant",
      reason: "Draft quotes are waiting to be sent.",
      nextCommandId: "quote.send"
    });
  }
  if (input.quoteStatus === "sent") {
    if (input.missingSignature) {
      return dominantActionStateSchema.parse({
        label: "Approve quote",
        tone: "blocked",
        reason: "The client has not signed yet.",
        blockedBy: "Signature required",
        nextCommandId: input.requireDeposit ? "portal.quote_approve_and_pay_deposit" : "portal.quote_approve"
      });
    }
    if (input.requireDeposit && input.missingDepositMethod) {
      return dominantActionStateSchema.parse({
        label: "Approve and pay deposit",
        tone: "blocked",
        reason: "A full deposit must clear before approval can stick.",
        blockedBy: "Deposit payment details missing",
        nextCommandId: "portal.quote_approve_and_pay_deposit"
      });
    }
    return dominantActionStateSchema.parse({
      label: input.requireDeposit ? "Approve and pay deposit" : "Approve quote",
      tone: "dominant",
      reason: "The quote is out with the customer and ready for portal approval.",
      nextCommandId: input.requireDeposit ? "portal.quote_approve_and_pay_deposit" : "portal.quote_approve"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View approval",
    tone: "quiet",
    reason: "Accepted quotes are immutable and shift the next work into job operations."
  });
}
