import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { RailError } from "@nexteam/core";
import { synthesizeElevenLabsSpeech } from "./elevenLabs.js";

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  voiceId: z.string().min(1).max(128).optional()
});

function sendVoiceError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown voice route error";
  res.status(status).json({ ok: false, error: message });
}

export function createVoiceRouter(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Router {
  const router = Router();

  router.post("/tts", async (req: Request, res: Response) => {
    try {
      const input = ttsRequestSchema.parse(req.body);
      const result = await synthesizeElevenLabsSpeech(input, env, fetchImpl);
      res.setHeader("content-type", result.mime);
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-voice-provider", result.provider);
      res.setHeader("x-voice-id", result.voiceId);
      res.send(result.audio);
    } catch (error) {
      sendVoiceError(res, error);
    }
  });

  return router;
}
