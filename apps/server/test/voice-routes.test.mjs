import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeElevenLabsSpeech, resolveElevenLabsVoiceId } from "../dist/voice/elevenLabs.js";

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
  assert.equal(result.mime, "audio/mpeg");
  assert.equal(result.audio.toString("utf8"), "fake-mp3");
  assert.equal(capturedHeaders["xi-api-key"], "test_key");
  assert.equal(capturedBody.text, "Nexi voice receipt.");
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
