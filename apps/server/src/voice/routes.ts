import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { RailError } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";
import { getAdminDb } from "../firebase.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "../usageLog.js";
import { buildElevenLabsUsageLogRecord, synthesizeElevenLabsSpeech } from "./elevenLabs.js";

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  tenantId: z.string().min(1).max(128).optional(),
  voiceId: z.string().min(1).max(128).optional()
});

const memoryUsageLog = new MemoryUsageLogWriter();

function sendVoiceError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown voice route error";
  res.status(status).json({ ok: false, error: message });
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "Unknown voice route error";
}

function usageLogWriter(env: NodeJS.ProcessEnv): FirestoreUsageLogWriter | MemoryUsageLogWriter {
  const db = getAdminDb(env);
  return db ? new FirestoreUsageLogWriter(db) : memoryUsageLog;
}

export interface VoiceRouterDeps {
  usageLog?: UsageLogWriter | undefined;
}

export function createVoiceRouter(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, deps: VoiceRouterDeps = {}): Router {
  const router = Router();

  router.post("/tts", async (req: Request, res: Response) => {
    let input: z.infer<typeof ttsRequestSchema> | null = null;
    const usageLog = deps.usageLog ?? usageLogWriter(env);
    try {
      input = ttsRequestSchema.parse(req.body);
      const result = await synthesizeElevenLabsSpeech(input, env, fetchImpl);
      await usageLog.write(buildElevenLabsUsageLogRecord({
        tenantId: input.tenantId ?? env.TENANT_ID ?? "aquatrace",
        routeActionName: "/api/voice/tts",
        taskType: "voice_tts",
        model: result.model,
        characterCount: result.characterCount,
        audioBytes: result.audioBytes,
        estimatedCostUsd: result.estimatedCostUsd,
        ok: true
      }));
      res.setHeader("content-type", result.mime);
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-voice-provider", result.provider);
      res.setHeader("x-voice-id", result.voiceId);
      res.setHeader("x-voice-character-count", String(result.characterCount));
      res.setHeader("x-voice-audio-bytes", String(result.audioBytes));
      res.setHeader("x-voice-estimated-cost-usd", String(result.estimatedCostUsd));
      res.send(result.audio);
    } catch (error) {
      if (input) {
        await usageLog.write(buildElevenLabsUsageLogRecord({
          tenantId: input.tenantId ?? env.TENANT_ID ?? "aquatrace",
          routeActionName: "/api/voice/tts",
          taskType: "voice_tts",
          model: env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
          characterCount: input.text.trim().length,
          audioBytes: 0,
          estimatedCostUsd: 0,
          ok: false,
          errorSummary: errorSummary(error)
        })).catch(() => undefined);
      }
      sendVoiceError(res, error);
    }
  });

  return router;
}
