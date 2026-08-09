import type { Response } from "express";
import { logger } from "@nexteam/core";
import { publicErrorResponse } from "./publicError.js";

export function sendHttpError(res: Response, error: unknown): void {
  const { status, message } = publicErrorResponse(error);
  logger.error({
    status,
    errorType: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : "Unknown server error"
  });
  res.status(status).json({ ok: false, error: message });
}
