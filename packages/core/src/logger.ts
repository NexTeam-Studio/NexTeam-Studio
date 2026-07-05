import pino from "pino";

export interface LogEvent {
  tenantId: string;
  module: string;
  op: string;
  latencyMs: number;
  ok: boolean;
  detail?: string;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

export function logOperation(event: LogEvent): void {
  logger.info(event);
}

export async function withOperationLog<T>(
  event: Omit<LogEvent, "latencyMs" | "ok">,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    logOperation({ ...event, latencyMs: Date.now() - startedAt, ok: true });
    return result;
  } catch (error) {
    logOperation({
      ...event,
      latencyMs: Date.now() - startedAt,
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  }
}
