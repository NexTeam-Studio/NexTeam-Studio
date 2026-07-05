import { RailError, type RailProvider } from "@nexteam/core";

export interface RailFetchOptions extends RequestInit {
  provider: RailProvider;
  op: string;
  timeoutMs?: number;
  retry401?: () => Promise<void>;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    const message = nested?.message ?? record.message ?? record.error_description ?? record.error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export async function railFetchJson<T>(
  url: string,
  options: RailFetchOptions,
  parse: (payload: unknown) => T
): Promise<T> {
  const attempts = [0, 1];
  let did401Retry = false;
  let lastError: unknown = null;

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await readJsonOrText(response);

      if (response.status === 401 && options.retry401 && !did401Retry) {
        did401Retry = true;
        await options.retry401();
        continue;
      }

      if (response.ok) {
        return parse(payload);
      }

      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      if (retryable && attempt === 0) {
        await sleep(250 + Math.floor(Math.random() * 250));
        continue;
      }

      throw new RailError(errorMessage(payload, `${options.provider} ${options.op} failed.`), {
        provider: options.provider,
        op: options.op,
        status: response.status,
        retryable
      });
    } catch (error) {
      lastError = error;
      if (error instanceof RailError) {
        throw error;
      }
      if (attempt === 0) {
        await sleep(250 + Math.floor(Math.random() * 250));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new RailError(`${options.provider} ${options.op} failed after retry.`, {
    provider: options.provider,
    op: options.op,
    retryable: true,
    cause: lastError
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

