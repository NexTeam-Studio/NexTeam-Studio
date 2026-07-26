# M11 Native Mobile Capture Local Verification

Date: 2026-07-20

## Command wall

### `npm exec tsc -- -p apps/mobile/tsconfig.json --noEmit`

```text
(no stdout/stderr, exit 0)
```

### `npm exec tsc -- -p apps/server/tsconfig.json --noEmit`

```text
(no stdout/stderr, exit 0)
```

### `npm run build --workspace @nexteam/core`

```text
> @nexteam/core@0.0.0 build
> tsc -b
```

### `npm run build --workspace @nexteam/mobile`

```text
> @nexteam/mobile@0.0.0 build
> tsc -b
```

### `npm run build --workspace @nexteam/server`

```text
> @nexteam/server@0.0.0 build
> tsc -b
```

### `node --test apps/mobile/test/offline-first.test.mjs apps/mobile/test/tap-to-pay.test.mjs apps/mobile/test/native-capture.test.mjs`

```text
[pass] M11 local session re-auth waits seven days and GPS suggestions prefer today's assigned visit (0.9457ms)
[pass] M11 syncCaptureSession creates the request route, uploads media, transcribes voice, and maps checklist photo ids (5.9582ms)
[pass] M11 syncQueuedSessions marks failed batches for retry and keeps the queue visibly failed until backoff clears (1.6338ms)
[pass] M11 airplane-mode job flow syncs after reconnect with conflict flags (11.7219ms)
[pass] M11 mobile rejects unassigned cached job writes (0.484ms)
[pass] Tap to Pay decline mapping stays staff-readable instead of surfacing raw Stripe jargon (0.8653ms)
[pass] Tap to Pay disconnect mapping calls out the reader drop explicitly (0.1714ms)
[pass] Tap to Pay finalize mapping explains the ledger handoff seam when Stripe succeeds first (0.1468ms)
[pass] Tap to Pay helper labels keep device metadata stable for the shared payment object (0.1212ms)
[info] tests 9
[info] suites 0
[info] pass 9
[info] fail 0
[info] cancelled 0
[info] skipped 0
[info] todo 0
[info] duration_ms 164.1158
```

### `node --test apps/server/test/mobile-routes.test.mjs apps/server/test/mobile-native-capture.test.mjs`

```text
[pass] M11 mobile session bootstrap returns tenant branding plus the reusable local staff profile registry (45.5505ms)
[pass] M11 day board stays technician-scoped while exposing GPS suggestions, gate notes, and visible queue state (16.7795ms)
[pass] M11 visit context returns checklist and before/after candidates, and unassigned technicians stay fenced out (25.2767ms)
[pass] M11 typed and voice narration both flow into the shared field report rail (13.8582ms)
[pass] M11 transcription blocks over-cap narration before provider fetch and writes a usage log record (6.9486ms)
[pass] M11 mobile day schedule returns assigned jobs for the requested field user (31.1053ms)
[pass] M11 mobile sync accepts airplane-mode checklist, photo, and close-out operations (20.3584ms)
[pass] M11 mobile push registration and approval review stay role-gated (12.7643ms)
[pass] M11 mobile access policy blocks cross-user and unscoped job-link access (1.4178ms)
[info] tests 9
[info] suites 0
[info] pass 9
[info] fail 0
[info] cancelled 0
[info] skipped 0
[info] todo 0
[info] duration_ms 1205.9092
```

## Honesty boundary

- Verified here: TypeScript, package builds, queue logic, route behavior, offline retry behavior, GPS suggestion logic, checklist sync semantics, typed plus voice narration on the shared field report rail, and transcription spend-cap enforcement.
- Not verified on physical hardware from this Codex runtime: real camera hardware, real microphone capture/playback, true airplane-mode behavior on-device, and final iOS/Android field ergonomics in sunlight or wet-hand conditions.
