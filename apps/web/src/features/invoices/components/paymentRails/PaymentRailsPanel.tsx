import type React from "react";

export type PaymentProvider = "stripe" | "paypal" | "manual" | "quote_bridge";
export type PaymentMethodKind = "card" | "ach" | "cash" | "check" | "bank_transfer" | "other" | "paypal" | "venmo";
export type PaymentStatus = "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded";

export interface SavedBillingCard {
  id: string;
  label: string;
  last4?: string | undefined;
}

export interface PaymentRecord {
  id: string;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  status: PaymentStatus;
  amount: number;
  appliedAmount: number;
  createdAt: string;
}

export interface RefundDraftState {
  paymentId: string;
  amount: number;
  reason: string;
}

export interface PaymentDraftState {
  amount: number;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  note: string;
  savedCardId: string;
  payerName: string;
  checkNumber: string;
  bankTransferReference: string;
  otherReference: string;
  failureMessage: string;
  status: "succeeded" | "failed";
}

interface PaymentRailsPanelProps {
  invoiceStatus: string;
  paymentDraft: PaymentDraftState;
  setPaymentDraft: React.Dispatch<React.SetStateAction<PaymentDraftState | null>>;
  refundDraft: RefundDraftState;
  setRefundDraft: React.Dispatch<React.SetStateAction<RefundDraftState>>;
  cards: SavedBillingCard[];
  payments: PaymentRecord[];
  refundCount: number;
  busy: string | null;
  recoveryHint: string;
  selectedPayment: PaymentRecord | undefined;
  onCollect: () => void;
  onLaunchCheckout: (provider: "stripe" | "paypal", method: "card" | "paypal" | "venmo") => void;
  onSendPayLink: () => void;
  onRefund: () => void;
  onVoid: () => void;
  onBadDebt: () => void;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function paymentMethodsForProvider(provider: PaymentProvider): PaymentMethodKind[] {
  if (provider === "paypal") return ["paypal", "venmo"];
  if (provider === "stripe") return ["card", "ach"];
  if (provider === "manual") return ["cash", "check", "bank_transfer", "other"];
  return ["card"];
}

export function reconcilePaymentDraftProvider(
  draft: PaymentDraftState,
  provider: PaymentProvider
): PaymentDraftState {
  const methods = paymentMethodsForProvider(provider);
  const method = methods.includes(draft.method) ? draft.method : methods[0]!;

  return {
    ...draft,
    provider,
    method,
    // A saved card only belongs to the saved-card collection path. Keeping it
    // on another provider could accidentally submit the wrong payment details.
    savedCardId: provider === "stripe" && method === "card" ? draft.savedCardId : ""
  };
}

export function PaymentRailsPanel(props: PaymentRailsPanelProps): React.ReactElement {
  const update = (patch: Partial<PaymentDraftState>): void => {
    props.setPaymentDraft((current) => current ? { ...current, ...patch } : current);
  };

  return (
    <details className="nexops-quote-panel nexops-density-disclosure-panel payment-rails-panel" open={props.invoiceStatus !== "paid" || Boolean(props.recoveryHint)}>
      <summary>
        <div className="nexops-density-disclosure-copy">
          <h3>Collect and recover</h3>
          <small>Open for saved-card collection, hosted checkout, refunds, and recovery paths.</small>
        </div>
        <span className="nexops-density-disclosure-caret">Open</span>
      </summary>
      <div className="nexops-density-disclosure-body">
        <div className="nexops-two-column">
          <section className="nexops-quote-panel">
            <div className="nexops-quote-section-head">
              <h3>Collect payment</h3>
              <button type="button" onClick={props.onCollect} disabled={Boolean(props.busy)}>
                {props.busy === "collect-payment" || props.busy === "checkout" ? "Processing..." : "Collect payment"}
              </button>
            </div>
            <div className="nexops-request-builder-grid">
              <label className="nexops-field"><span>Amount</span><input type="number" min="0.01" step="0.01" value={props.paymentDraft.amount} onChange={(event) => update({ amount: Math.max(0.01, Number(event.target.value || 0.01)) })} /></label>
              <label className="nexops-field"><span>Provider</span><select value={props.paymentDraft.provider} onChange={(event) => {
                const provider = event.target.value as PaymentProvider;
                props.setPaymentDraft((current) => current ? reconcilePaymentDraftProvider(current, provider) : current);
              }}><option value="stripe">Stripe</option><option value="paypal">PayPal / Venmo</option><option value="manual">Manual / offline</option></select></label>
              <label className="nexops-field"><span>Method</span><select value={props.paymentDraft.method} onChange={(event) => update({ method: event.target.value as PaymentMethodKind })}>
                {props.paymentDraft.provider === "paypal" ? <><option value="paypal">PayPal</option><option value="venmo">Venmo</option></> : props.paymentDraft.provider === "stripe" ? <><option value="card">Saved card</option><option value="ach">ACH</option></> : <><option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></>}
              </select></label>
            </div>
            {props.paymentDraft.provider === "stripe" && props.paymentDraft.method === "card" ? <label className="nexops-field"><span>Saved card</span><select value={props.paymentDraft.savedCardId} onChange={(event) => update({ savedCardId: event.target.value })}><option value="">Use hosted checkout instead</option>{props.cards.map((card) => <option value={card.id} key={card.id}>{card.label}{card.last4 ? ` .... ${card.last4}` : ""}</option>)}</select></label> : null}
            <div className="nexops-request-builder-grid">
              <label className="nexops-field"><span>Payer name</span><input value={props.paymentDraft.payerName} onChange={(event) => update({ payerName: event.target.value })} /></label>
              {props.paymentDraft.method === "check" ? <label className="nexops-field"><span>Check number</span><input value={props.paymentDraft.checkNumber} onChange={(event) => update({ checkNumber: event.target.value })} /></label> : props.paymentDraft.method === "bank_transfer" ? <label className="nexops-field"><span>Reference number</span><input value={props.paymentDraft.bankTransferReference} onChange={(event) => update({ bankTransferReference: event.target.value })} /></label> : props.paymentDraft.method === "other" ? <label className="nexops-field"><span>Reference</span><input value={props.paymentDraft.otherReference} onChange={(event) => update({ otherReference: event.target.value })} /></label> : <div className="payment-rails-spacer" />}
            </div>
            <label className="nexops-field"><span>Internal note</span><input value={props.paymentDraft.note} onChange={(event) => update({ note: event.target.value })} /></label>
            <div className="nexops-quote-toggle-grid"><label className="nexops-check-field inline"><input type="radio" name="payment-status" checked={props.paymentDraft.status === "succeeded"} onChange={() => update({ status: "succeeded" })} /> Succeeded</label><label className="nexops-check-field inline"><input type="radio" name="payment-status" checked={props.paymentDraft.status === "failed"} onChange={() => update({ status: "failed" })} /> Failed charge</label></div>
            {props.paymentDraft.status === "failed" ? <label className="nexops-field"><span>Failure message</span><input value={props.paymentDraft.failureMessage} onChange={(event) => update({ failureMessage: event.target.value })} placeholder="Card declined, insufficient funds, etc." /></label> : null}
            <div className="nexops-inline-actions"><button type="button" onClick={() => props.onLaunchCheckout("stripe", "card")} disabled={Boolean(props.busy)}>Open Stripe checkout</button><button type="button" onClick={() => props.onLaunchCheckout("paypal", "paypal")} disabled={Boolean(props.busy)}>Open PayPal</button><button type="button" onClick={() => props.onLaunchCheckout("paypal", "venmo")} disabled={Boolean(props.busy)}>Open Venmo</button></div>
            {props.recoveryHint ? <div className="nexops-recovery-box"><strong>Recovery path</strong><p>{props.recoveryHint}</p><div className="nexops-inline-actions"><button type="button" onClick={() => update({ status: "succeeded" })}>Retry same card</button><button type="button" onClick={() => update({ provider: "stripe", method: "card", savedCardId: props.cards[1]?.id ?? props.paymentDraft.savedCardId })}>Switch saved card</button><button type="button" onClick={() => update({ provider: "manual", method: "cash" })}>Take manual payment</button><button type="button" onClick={props.onSendPayLink}>Send pay link</button></div></div> : null}
          </section>
          <section className="nexops-quote-panel">
            <div className="nexops-quote-section-head"><h3>Payment history</h3><span>{props.payments.length} payments / {props.refundCount} refunds</span></div>
            <div className="nexops-jobs-sublist">
              {props.payments.map((payment) => <label className="nexops-jobs-sublist-item" key={payment.id}><div><strong>{payment.provider} {payment.method}</strong><span>{formatTimestamp(payment.createdAt)}</span></div><div><span className={`nexops-job-status status-${payment.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{payment.status.replaceAll("_", " ")}</span><small>{money(payment.amount)}</small><input type="radio" name="refund-payment" checked={props.refundDraft.paymentId === payment.id} onChange={() => props.setRefundDraft({ paymentId: payment.id, amount: payment.appliedAmount || payment.amount, reason: "" })} /></div></label>)}
              {!props.payments.length ? <p className="nexops-empty-copy">No payments recorded yet.</p> : null}
            </div>
            <div className="nexops-request-builder-grid"><label className="nexops-field"><span>Refund amount</span><input type="number" min="0.01" step="0.01" value={props.refundDraft.amount} onChange={(event) => props.setRefundDraft((current) => ({ ...current, amount: Math.max(0.01, Number(event.target.value || 0.01)) }))} /></label><label className="nexops-field"><span>Refund reason</span><input value={props.refundDraft.reason} onChange={(event) => props.setRefundDraft((current) => ({ ...current, reason: event.target.value }))} /></label></div>
            <div className="nexops-inline-actions"><button type="button" onClick={props.onRefund} disabled={Boolean(props.busy) || !props.selectedPayment}>{props.busy === "refund" ? "Refunding..." : "Refund selected payment"}</button><button type="button" onClick={props.onVoid} disabled={Boolean(props.busy) || props.invoiceStatus === "paid"}>{props.busy === "void" ? "Voiding..." : "Void invoice"}</button><button type="button" onClick={props.onBadDebt} disabled={Boolean(props.busy) || props.invoiceStatus === "paid"}>{props.busy === "bad_debt" ? "Writing off..." : "Mark bad debt"}</button></div>
          </section>
        </div>
      </div>
    </details>
  );
}
