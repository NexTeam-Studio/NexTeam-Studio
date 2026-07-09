# Voice

This folder owns the M12 voice rail for NexTeam Studio. It turns assistant text into browser-playable audio through ElevenLabs while keeping API keys server-side only. Each TTS call writes a `usageLog` row with provider `elevenlabs`, character count, audio byte count, and estimated cost so voice spend is visible beside LLM spend.

It connects to `apps/web` through `POST /api/voice/tts`. The web chat controls browser speech recognition locally, sends normal authenticated Nexi messages, and asks this route for opt-in TTS after assistant replies. No outbound client/customer sends happen here.

M12b full-duplex support is tracked through `fullDuplex.ts` and the `/api/voice/session/*` routes. A browser session can start a provider-agnostic voice session, record first-audio latency/cost metrics after each TTS turn, interrupt active playback, and return to listening. The avatar slot is deliberately `provider_agnostic` until the owner chooses HeyGen or D-ID.

When something breaks, start with `elevenLabs.ts` for provider/key/request/cost-estimate issues, `routes.ts` for API behavior and `usageLog` persistence, `fullDuplex.ts` for session/interrupt state, then the web chat voice controls in `apps/web/src/main.tsx`. `ELEVENLABS_COST_PER_1K_CHARS_USD` can override the default estimate without changing code.
