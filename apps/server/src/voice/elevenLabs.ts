import { RailError } from "@nexteam/core";

const DEFAULT_VOICE_ID = "v6YipgeyiXn5cMqsg5oD";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const MAX_TTS_CHARS = 1000;

export interface VoiceSynthesisInput {
  text: string;
  voiceId?: string | undefined;
}

export interface VoiceSynthesisResult {
  audio: Buffer;
  mime: string;
  provider: "elevenlabs";
  voiceId: string;
}

export function resolveElevenLabsVoiceId(env: NodeJS.ProcessEnv): string {
  return env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}

function requireElevenLabsKey(env: NodeJS.ProcessEnv): string {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new RailError("ELEVENLABS_API_KEY is not configured in this runtime.", { provider: "elevenlabs", op: "tts", status: 503 });
  }
  return key;
}

function normalizeSpeechText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new RailError("Voice text is required.", { provider: "elevenlabs", op: "tts", status: 400 });
  }
  if (normalized.length > MAX_TTS_CHARS) {
    throw new RailError(`Voice text must be ${MAX_TTS_CHARS} characters or fewer.`, { provider: "elevenlabs", op: "tts", status: 400 });
  }
  return normalized;
}

export async function synthesizeElevenLabsSpeech(
  input: VoiceSynthesisInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceSynthesisResult> {
  const text = normalizeSpeechText(input.text);
  const apiKey = requireElevenLabsKey(env);
  const voiceId = input.voiceId?.trim() || resolveElevenLabsVoiceId(env);
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text,
      model_id: env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.72,
        style: 0.12,
        use_speaker_boost: true
      }
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new RailError(detail || `ElevenLabs TTS failed with status ${response.status}.`, {
      provider: "elevenlabs",
      op: "tts",
      status: response.status
    });
  }
  return {
    audio: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get("content-type") || "audio/mpeg",
    provider: "elevenlabs",
    voiceId
  };
}
