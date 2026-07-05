# Voice

This folder owns the M12a voice rail for NexTeam Studio. It turns assistant text into browser-playable audio through ElevenLabs while keeping API keys server-side only.

It connects to `apps/web` through `POST /api/voice/tts`. The web chat controls browser speech recognition locally, sends normal authenticated Nexi messages, and asks this route for opt-in TTS after assistant replies. No outbound client/customer sends happen here.

When something breaks, start with `elevenLabs.ts` for provider/key/request issues, `routes.ts` for API behavior, then the web chat voice controls in `apps/web/src/main.tsx`.
