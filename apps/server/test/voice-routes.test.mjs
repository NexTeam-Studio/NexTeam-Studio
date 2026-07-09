import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { synthesizeElevenLabsSpeech, resolveElevenLabsVoiceId } from "../dist/voice/elevenLabs.js";
import { createVoiceRouter } from "../dist/voice/routes.js";
import { VoiceSessionStore } from "../dist/voice/fullDuplex.js";
import { MemoryUsageLogWriter } from "../dist/usageLog.js";

test("ElevenLabs voice id defaults to the NexTeam voice", () => {
  assert.equal(resolveElevenLabsVoiceId({}), "v6YipgeyiXn5cMqsg5oD");
  assert.equal(resolveElevenLabsVoiceId({ ELEVENLABS_VOICE_ID: "voice_custom" }), "voice_custom");
});

test("ElevenLabs TTS rail keeps the API key server-side and returns audio", async () => {
  let capturedHeaders = {};
  let capturedBody = {};
  const result = await synthesizeElevenLabsSpeech(
    { text: " Nexi voice receipt. " },
    { ELEVENLABS_API_KEY: "test_key", ELEVENLABS_VOICE_ID: "voice_test" },
    async (_url, init) => {
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/mpeg" }),
        async arrayBuffer() {
          return new TextEncoder().encode("fake-mp3").buffer;
        }
      };
    }
  );
  assert.equal(result.provider, "elevenlabs");
  assert.equal(result.voiceId, "voice_test");
  assert.equal(result.model, "eleven_multilingual_v2");
  assert.equal(result.mime, "audio/mpeg");
  assert.equal(result.audio.toString("utf8"), "fake-mp3");
  assert.equal(result.characterCount, 19);
  assert.equal(result.audioBytes, 8);
  assert.equal(result.estimatedCostUsd, 0.0057);
  assert.equal(capturedHeaders["xi-api-key"], "test_key");
  assert.equal(capturedBody.text, "Nexi voice receipt.");
});

test("Voice route writes ElevenLabs usageLog records with cost metadata", async () => {
  const usageLog = new MemoryUsageLogWriter();
  const app = express();
  app.use(express.json());
  app.use("/api/voice", createVoiceRouter(
    { ELEVENLABS_API_KEY: "test_key", TENANT_ID: "aquatrace", ELEVENLABS_COST_PER_1K_CHARS_USD: "0.20" },
    async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      async arrayBuffer() {
        return new TextEncoder().encode("fake-audio").buffer;
      }
    }),
    { usageLog }
  ));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/voice/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", text: "Read this aloud." })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-voice-provider"), "elevenlabs");
    assert.equal(response.headers.get("x-voice-character-count"), "16");
    assert.equal(response.headers.get("x-voice-audio-bytes"), "10");
    assert.equal(response.headers.get("x-voice-estimated-cost-usd"), "0.0032");
    assert.equal(response.headers.get("x-voice-first-audio-target-ms"), "1200");
    assert.equal(response.headers.get("x-voice-streaming-mode"), "interruptible_turn_audio");
    assert.equal(await response.text(), "fake-audio");
    assert.equal(usageLog.records.length, 1);
    assert.equal(usageLog.records[0].tenantId, "aquatrace");
    assert.equal(usageLog.records[0].provider, "elevenlabs");
    assert.equal(usageLog.records[0].usage.characters, 16);
    assert.equal(usageLog.records[0].usage.audioBytes, 10);
    assert.equal(usageLog.records[0].estimatedCostUsd, 0.0032);
    assert.equal(usageLog.records[0].ok, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Voice session rail tracks full-duplex state, latency, and interruption", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/voice", createVoiceRouter(
    { ELEVENLABS_API_KEY: "test_key", TENANT_ID: "aquatrace" },
    async () => {
      throw new Error("TTS should not be called for session state tests.");
    },
    { usageLog: new MemoryUsageLogWriter(), sessions: new VoiceSessionStore() }
  ));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const start = await fetch(`http://127.0.0.1:${port}/api/voice/session/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", tenantUserId: "owner-1" })
    }).then((response) => response.json());
    assert.equal(start.ok, true);
    assert.equal(start.session.tenantId, "aquatrace");
    assert.equal(start.session.tenantUserId, "owner-1");
    assert.equal(start.session.state, "listening");
    assert.equal(start.session.targetFirstAudioMs, 1200);
    assert.equal(start.session.avatarProviderSlot, "provider_agnostic");

    const turn = await fetch(`http://127.0.0.1:${port}/api/voice/session/${start.session.id}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstAudioLatencyMs: 875,
        estimatedCostUsd: 0.0042,
        characterCount: 21,
        audioBytes: 12345
      })
    }).then((response) => response.json());
    assert.equal(turn.ok, true);
    assert.equal(turn.session.state, "speaking");
    assert.equal(turn.session.turnCount, 1);
    assert.equal(turn.session.lastFirstAudioLatencyMs, 875);
    assert.equal(turn.session.lastEstimatedCostUsd, 0.0042);

    const interrupted = await fetch(`http://127.0.0.1:${port}/api/voice/session/${start.session.id}/interrupt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "operator_started_talking" })
    }).then((response) => response.json());
    assert.equal(interrupted.ok, true);
    assert.equal(interrupted.session.state, "interrupted");
    assert.equal(interrupted.session.interruptionCount, 1);

    const listening = await fetch(`http://127.0.0.1:${port}/api/voice/session/${start.session.id}/listen`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(listening.ok, true);
    assert.equal(listening.session.state, "listening");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("ElevenLabs TTS rail refuses missing credentials and oversized text", async () => {
  await assert.rejects(
    () => synthesizeElevenLabsSpeech({ text: "hello" }, {}),
    /ELEVENLABS_API_KEY/
  );
  await assert.rejects(
    () => synthesizeElevenLabsSpeech({ text: "x".repeat(1001) }, { ELEVENLABS_API_KEY: "test_key" }),
    /1000 characters/
  );
});
