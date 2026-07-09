import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError } from "@nexteam/core";

export const FIRST_AUDIO_TARGET_MS = 1200;
export const AVATAR_PROVIDER_SLOT = "provider_agnostic";

export const voiceSessionStateSchema = z.enum([
  "listening",
  "thinking",
  "speaking",
  "interrupted",
  "ended"
]);

export const voiceSessionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  tenantUserId: z.string().min(1).optional(),
  state: voiceSessionStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  targetFirstAudioMs: z.literal(FIRST_AUDIO_TARGET_MS),
  avatarProviderSlot: z.literal(AVATAR_PROVIDER_SLOT),
  turnCount: z.number().int().min(0),
  interruptionCount: z.number().int().min(0),
  lastFirstAudioLatencyMs: z.number().min(0).optional(),
  lastEstimatedCostUsd: z.number().min(0).optional(),
  lastCharacterCount: z.number().int().min(0).optional(),
  lastAudioBytes: z.number().int().min(0).optional()
});

export type VoiceSession = z.infer<typeof voiceSessionSchema>;
export type VoiceSessionState = z.infer<typeof voiceSessionStateSchema>;

export const startVoiceSessionSchema = z.object({
  tenantId: z.string().min(1).max(128),
  tenantUserId: z.string().min(1).max(128).optional()
});

export const recordVoiceTurnSchema = z.object({
  firstAudioLatencyMs: z.number().min(0).max(60000),
  estimatedCostUsd: z.number().min(0).max(100),
  characterCount: z.number().int().min(0).max(10000),
  audioBytes: z.number().int().min(0).max(50_000_000)
});

export const interruptVoiceSessionSchema = z.object({
  reason: z.string().min(1).max(120).default("operator_interrupt")
});

export class VoiceSessionStore {
  private readonly sessions = new Map<string, VoiceSession>();

  start(input: z.infer<typeof startVoiceSessionSchema>): VoiceSession {
    const now = new Date().toISOString();
    const session: VoiceSession = {
      id: `voice_${randomUUID()}`,
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      state: "listening",
      createdAt: now,
      updatedAt: now,
      targetFirstAudioMs: FIRST_AUDIO_TARGET_MS,
      avatarProviderSlot: AVATAR_PROVIDER_SLOT,
      turnCount: 0,
      interruptionCount: 0
    };
    this.sessions.set(session.id, session);
    return voiceSessionSchema.parse(session);
  }

  get(sessionId: string): VoiceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RailError("Voice session was not found.", { provider: "elevenlabs", op: "voiceSession", status: 404 });
    }
    return voiceSessionSchema.parse(session);
  }

  recordTurn(sessionId: string, input: z.infer<typeof recordVoiceTurnSchema>): VoiceSession {
    const session = this.get(sessionId);
    const next: VoiceSession = {
      ...session,
      state: "speaking",
      updatedAt: new Date().toISOString(),
      turnCount: session.turnCount + 1,
      lastFirstAudioLatencyMs: input.firstAudioLatencyMs,
      lastEstimatedCostUsd: input.estimatedCostUsd,
      lastCharacterCount: input.characterCount,
      lastAudioBytes: input.audioBytes
    };
    this.sessions.set(sessionId, next);
    return voiceSessionSchema.parse(next);
  }

  interrupt(sessionId: string): VoiceSession {
    const session = this.get(sessionId);
    const next: VoiceSession = {
      ...session,
      state: "interrupted",
      updatedAt: new Date().toISOString(),
      interruptionCount: session.interruptionCount + 1
    };
    this.sessions.set(sessionId, next);
    return voiceSessionSchema.parse(next);
  }

  listen(sessionId: string): VoiceSession {
    const session = this.get(sessionId);
    const next: VoiceSession = {
      ...session,
      state: "listening",
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, next);
    return voiceSessionSchema.parse(next);
  }
}
