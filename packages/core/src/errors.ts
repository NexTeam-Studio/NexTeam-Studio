export type RailProvider = "jobber" | "companycam" | "anthropic" | "firebase" | "native" | "approval" | "stripe" | "gmail" | "elevenlabs";

export interface RailErrorOptions {
  provider: RailProvider;
  op: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class RailError extends Error {
  readonly provider: RailProvider;
  readonly op: string;
  readonly status: number | undefined;
  readonly retryable: boolean;
  override readonly cause: unknown;

  constructor(message: string, options: RailErrorOptions) {
    super(message);
    this.name = "RailError";
    this.provider = options.provider;
    this.op = options.op;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }

  toJSON(): Record<string, string | number | boolean | undefined> {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      op: this.op,
      status: this.status,
      retryable: this.retryable
    };
  }
}

export class NotSupportedError extends Error {
  constructor(op: string) {
    super(`${op} is not supported by this adapter yet.`);
    this.name = "NotSupportedError";
  }
}

export function isRailError(value: unknown): value is RailError {
  return value instanceof RailError;
}

