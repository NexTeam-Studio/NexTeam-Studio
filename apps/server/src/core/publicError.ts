import { RailError } from "@nexteam/core";

const clientMessages: Record<number, string> = {
  400: "The request could not be processed.",
  401: "Sign in is required.",
  403: "You do not have permission to perform that action.",
  404: "The requested record was not found.",
  409: "This record changed before the request could be completed.",
  429: "Too many requests. Please try again shortly."
};

/**
 * Errors may contain provider responses, identifiers, or configuration
 * details.  Never send those details back over a product HTTP boundary.
 * RailError status codes are intentionally preserved so clients can still
 * take the correct recovery action without learning internal state.
 */
export function publicErrorResponse(error: unknown): { status: number; message: string } {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  return {
    status,
    message: clientMessages[status] ?? "Something went wrong. Please try again."
  };
}
