import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { RailError } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";
import { getAdminDb } from "../firebase.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "../usageLog.js";
import { buildElevenLabsUsageLogRecord, synthesizeElevenLabsSpeech } from "./elevenLabs.js";
import {
  FIRST_AUDIO_TARGET_MS,
  VoiceSessionStore,
  interruptVoiceSessionSchema,
  recordVoiceTurnSchema,
  startVoiceSessionSchema
} from "./fullDuplex.js";

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  tenantId: z.string().min(1).max(128).optional(),
  voiceId: z.string().min(1).max(128).optional()
});

const memoryUsageLog = new MemoryUsageLogWriter();
const memoryVoiceSessions = new VoiceSessionStore();

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
  sessions?: VoiceSessionStore | undefined;
}

export function createVoiceRouter(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, deps: VoiceRouterDeps = {}): Router {
  const router = Router();
  const sessions = deps.sessions ?? memoryVoiceSessions;

  router.post("/session/start", (req: Request, res: Response) => {
    try {
      const input = startVoiceSessionSchema.parse(req.body);
      res.status(201).json({ ok: true, session: sessions.start(input) });
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

  router.get("/session/:id", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new RailError("Voice session id is required.", { provider: "elevenlabs", op: "voiceSession", status: 400 });
      }
      res.json({ ok: true, session: sessions.get(sessionId) });
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

  router.post("/session/:id/turn", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new RailError("Voice session id is required.", { provider: "elevenlabs", op: "voiceTurn", status: 400 });
      }
      const input = recordVoiceTurnSchema.parse(req.body);
      res.json({ ok: true, session: sessions.recordTurn(sessionId, input) });
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

  router.post("/session/:id/interrupt", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new RailError("Voice session id is required.", { provider: "elevenlabs", op: "voiceInterrupt", status: 400 });
      }
      interruptVoiceSessionSchema.parse(req.body ?? {});
      res.json({ ok: true, session: sessions.interrupt(sessionId) });
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

  router.post("/session/:id/listen", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new RailError("Voice session id is required.", { provider: "elevenlabs", op: "voiceListen", status: 400 });
      }
      res.json({ ok: true, session: sessions.listen(sessionId) });
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

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
      res.setHeader("x-voice-first-audio-target-ms", String(FIRST_AUDIO_TARGET_MS));
      res.setHeader("x-voice-streaming-mode", "interruptible_turn_audio");
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
