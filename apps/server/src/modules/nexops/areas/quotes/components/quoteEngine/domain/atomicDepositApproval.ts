import { RailError, type Quote } from "@nexteam/core";

/**
 * A quote that requires a deposit must not become approved until the deposit
 * bridge has succeeded.  Keeping this ordering here makes the portal routes
 * prove the same all-or-nothing rule without persisting an approval first.
 */
export async function approveQuoteAfterDepositPreflight(input: {
  originalQuote: Quote;
  approvedQuote: Quote;
  syncDeposit?: ((quote: Quote) => Promise<unknown>) | undefined;
  persistApproval: () => Promise<Quote>;
}): Promise<Quote> {
  if (input.originalQuote.approvalRules.requireDeposit) {
    if (!input.syncDeposit) {
      throw new RailError("Deposit collection is not available. The quote is still waiting for approval.", {
        provider: "native",
        op: "quoteDepositPreflight",
        status: 503
      });
    }
    await input.syncDeposit(input.approvedQuote);
  }

  return input.persistApproval();
}
