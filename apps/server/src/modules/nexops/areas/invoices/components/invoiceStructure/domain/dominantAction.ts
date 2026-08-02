import { dominantActionStateSchema, type DominantActionState, type InvoiceBalanceStatus, type InvoiceDeliveryStatus, type InvoiceLifecycleStatus } from "@nexteam/core";

export function deriveInvoiceDominantAction(input: {
  lifecycle: InvoiceLifecycleStatus;
  deliveryStatus: InvoiceDeliveryStatus;
  balanceStatus: InvoiceBalanceStatus;
  paymentScheduleActive: boolean;
}): DominantActionState {
  if (input.deliveryStatus === "failed") {
    return dominantActionStateSchema.parse({
      label: "Retry send",
      tone: "danger",
      reason: "Customer delivery failed and needs staff attention.",
      nextCommandId: "invoice.send"
    });
  }
  if (input.lifecycle === "draft") {
    return dominantActionStateSchema.parse({
      label: "Send invoice",
      tone: "dominant",
      reason: "Draft invoices need delivery before payment can be requested.",
      nextCommandId: "invoice.send"
    });
  }
  if (input.lifecycle === "open" && input.balanceStatus !== "paid") {
    return dominantActionStateSchema.parse({
      label: input.paymentScheduleActive ? "Collect scheduled payment" : "Collect payment",
      tone: "dominant",
      reason: "The invoice is open with balance remaining.",
      nextCommandId: "payment.collect"
    });
  }
  return dominantActionStateSchema.parse({
    label: "View receipt",
    tone: "quiet",
    reason: "Paid or closed invoices no longer need a dominant financial action."
  });
}
