# Native Mobile Capture

Build piece: M11 native field capture app

## Session auth states

### States
- `sign_in`
- `ready`
- `reauth_required`

### Transitions
- `sign_in -> ready`
  Trigger: local dev profile bootstrap or Firebase staff sign-in succeeds against the existing tenant user registry.
- `ready -> reauth_required`
  Trigger: the saved mobile session ages past the seven-day local re-auth window.
- `reauth_required -> ready`
  Trigger: staff signs in again and the app refreshes `lastAuthenticatedAt`.

### Triggers
- `GET /api/mobile/session`
  Returns tenant-scoped staff access, branding, whether Firebase auth is required, and the local dev profile registry used by this workstation receipt path.

### Cascades
- Mobile auth does not create a second account system. The app reuses OWNER / OFFICE_ADMIN / TECHNICIAN identities and the same tenant scoping rules as web.

## Capture session lifecycle

### States
- `draft`
- `queued`
- `syncing`
- `synced`
- `failed`

### Transitions
- `draft -> queued`
  Trigger: the user captures media, adds narration, changes checklist answers, or finishes a routing choice while offline or before sync runs.
- `queued -> syncing`
  Trigger: reconnect or manual sync starts the append-only upload pass.
- `syncing -> synced`
  Trigger: batch creation, assignment, media upload, narration sync, and checklist writes all succeed.
- `syncing -> failed`
  Trigger: any upload, transcription, or checklist write fails.
- `failed -> syncing`
  Trigger: retry window expires and sync runs again.

### Triggers
- `POST /api/fielddocs/capture-batches`
- `POST /api/fielddocs/uploads`
- `POST /api/fielddocs/capture-batches/:id/assign`
- `PUT /api/mobile/visits/:visitId/narration`
- `PUT /api/fielddocs/checklists/:id`

### Cascades
- New-client routing creates the request first, then assigns the capture batch to that request context on the same sync pass.
- Local checklist `localPhotoIds` are translated to real remote media ids before the checklist write is sent, so photo-required enforcement still lands on the shared fielddocs model.
- Failed sync attempts stamp `failureCount`, `lastError`, and `nextRetryAt` so queue state stays visible instead of silently dropping work.

## GPS suggestion behavior

### States
- `no_suggestion`
- `suggested`
- `accepted`
- `declined`

### Transitions
- `no_suggestion -> suggested`
  Trigger: device GPS is available and a known location match falls inside the configured radius.
- `suggested -> accepted`
  Trigger: the tech accepts the prompt and the session pre-scopes to that visit/client/property.
- `suggested -> declined`
  Trigger: the tech rejects the suggestion and falls back to the normal three-way routing choice.

### Triggers
- Today’s assigned visits are checked first inside the tighter `150m` radius.
- Other known properties are checked second inside the broader `300m` radius.

### Cascades
- GPS suggestion is staff-only. No client-facing portal or reminder surface receives capture GPS from this module.
- Offline mode can still suggest from the locally cached day-board snapshot; if that cache is missing, capture continues unassigned.

## Narration behavior

### States
- `typed_ready`
- `voice_pending_sync`
- `voice_ready`
- `voice_failed`

### Transitions
- `voice_pending_sync -> voice_ready`
  Trigger: transcription succeeds inside the mobile spend cap.
- `voice_pending_sync -> voice_failed`
  Trigger: transcription provider failure or a cap block.

### Triggers
- `POST /api/mobile/transcribe`
- `PUT /api/mobile/visits/:visitId/narration`
- `PATCH /api/fielddocs/media/:id`

### Cascades
- Typed and voice narration both land as plain text on the shared fielddocs/report rail, so downstream report generation does not care which input method produced the note.
- Transcription follows the same estimated-spend cap pattern as other paid AI rails and writes a usage log record whether it runs or is blocked before the provider call.

## Checklist behavior

### States
- `draft`
- `completed`

### Transitions
- `draft -> completed`
  Trigger: the tech marks the checklist complete on mobile after required fields and photo-required fields are satisfied.

### Triggers
- `GET /api/mobile/visits/:visitId/context`
- `PUT /api/fielddocs/checklists/:id`

### Cascades
- Mobile checklist completion uses the exact same checklist objects and downstream completion semantics as web.
- Property-memory fields continue to prefill from prior completed checklist history because the mobile app consumes the existing fielddocs bundle and persistent-value model instead of a second checklist system.

## Hardware honesty and open items

- Local verification in this Codex runtime covers TypeScript/build, Node test suites, server route behavior, offline queue logic, and simulator/emulator-safe code paths.
- Real-device proof is still required for the final field receipt on:
  - camera hardware behavior under true airplane mode
  - on-device GPS accuracy/permission behavior
  - microphone recording and playback on field hardware
  - iOS and Android touch/camera ergonomics in sunlight/wet-hand conditions

## Explicitly deferred

- LiDAR measurement
- dual-video capture
- OS-level push delivery
- Nexi chat on mobile
