export interface TapToPaySession {
  tenantId: string;
  invoiceId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  tipAmount: number;
  locationId: string;
  merchantDisplayName: string;
  simulated: boolean;
}

export interface TapToPayStatusMessage {
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "error";
}

type StripeLikeError = {
  code?: string;
  message?: string;
  apiError?: {
    code?: string;
    declineCode?: string;
    message?: string;
  };
  underlyingError?: {
    message?: string;
  };
};

function normalizedMessage(error: StripeLikeError | undefined): string {
  return error?.apiError?.message?.trim()
    || error?.underlyingError?.message?.trim()
    || error?.message?.trim()
    || "Tap to Pay did not finish.";
}

export function tapToPayDevicePlatform(os: string, version: string | number): string {
  return `${os}/${String(version)}`;
}

export function tapToPayDeviceLabel(readerLabel: string | undefined, fallback: string): string {
  return readerLabel?.trim() || fallback.trim();
}

export function describeTapToPayFailure(
  error: unknown,
  context: {
    stage?: "initialize" | "discover" | "connect" | "collect" | "confirm" | "finalize";
    disconnectReason?: string | undefined;
  } = {}
): TapToPayStatusMessage {
  const typed = (typeof error === "object" && error !== null ? error : {}) as StripeLikeError;
  const code = typed.apiError?.code?.toLowerCase() || typed.code?.toLowerCase() || "";
  const declineCode = typed.apiError?.declineCode?.toLowerCase() || "";
  if (context.disconnectReason?.trim()) {
    return {
      title: "Reader disconnected",
      detail: `The phone stopped acting as the reader (${context.disconnectReason.trim()}). Reconnect and try again.`,
      tone: "error"
    };
  }
  if (code.includes("declined") || declineCode.length > 0) {
    return {
      title: "Card declined",
      detail: normalizedMessage(typed),
      tone: "warning"
    };
  }
  if (code.includes("connection") || code.includes("network") || context.stage === "discover" || context.stage === "connect") {
    return {
      title: "Connection lost",
      detail: `${normalizedMessage(typed)} Check signal, keep NFC on, and retry the Tap to Pay connection.`,
      tone: "error"
    };
  }
  if (context.stage === "finalize") {
    return {
      title: "Payment needs review",
      detail: `${normalizedMessage(typed)} Stripe finished the card step, but NexOps could not write the ledger record yet.`,
      tone: "error"
    };
  }
  return {
    title: "Tap to Pay failed",
    detail: normalizedMessage(typed),
    tone: "error"
  };
}
