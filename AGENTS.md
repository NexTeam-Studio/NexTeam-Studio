# NexTeam-Studio Roadmap

## Vision
AI that builds AI agents — interviews users, decides agent count/type, acts as PM.
Deployable as multi-project platform or sold as white-label instance.
Hard rule: completely isolated from Aquatrace — no shared anything, ever.

## Stack
- React + Vite
- XState v5
- Firebase Firestore (nexteam-studio project, open dev rules)
- Anthropic Claude claude-sonnet-4-5 via Vite proxy
- @rive-app/react-canvas
- ElevenLabs TTS via Vite proxy

---

## Internal Guardrails
- No secrets in git. Never commit `.env`, tokens, API keys, refresh tokens, or credential files.
- No live publishing, scheduling, bulk sends, or campaign sends without explicit approval.
- CompanyCam must remain read-only from repo-controlled workflows.
- Do not mix unrelated dirty worktree files into a commit.
- Every completion claim must include a proof package.
- `SOUL.md` defines stable identity and boundaries.
- `MEMORY.md` defines current operating truth and can change as reality changes.
- Reusable agent templates must stay white-label ready and must not hardcode client-specific facts.
- See `docs/internal/CLAWDIA_COMPANYCAM_OPERATOR_RUNBOOK.md` and `docs/internal/tmnt/TMNT_AGENT_INDEX.md` for current internal operating guidance.

---

## Phase 1 — Firestore Save ✅ COMPLETE
Commit: 45bac44
- Firestore save wired into standalone-agent-demo
- agentSpecs collection live

## Phase 2 — agentArchitect Scaffold ✅ COMPLETE
Commit: 19f179c
- Full src/features/agentArchitect/ folder structure scaffolded
- XState machine stubbed
- React Router wired
Folders created:
- components/
- constants/
- hooks/
- machine/
- prompts/
- services/
- utils/

## Phase 3 — Live Claude Streaming ✅ COMPLETE
Commit: 1e8541b
- Live Claude conversation streaming working
- Interviewer + extractor dual-call pattern working
- Vite proxy for Anthropic API in place

## Phase 4 — Rive Animated Avatar ✅ COMPLETE
- Installed @rive-app/react-canvas
- Avatar file: src/assets/avatar.riv (aura talking-animation from Rive marketplace)
- Avatar driven by direct rive.play() — not useStateMachineInput
  (state machine inputs never resolved for this .riv asset)
- Animation names in .riv: ["Speaking", "Listening", "idle"]
- State machine name: "State Machine 1"
- Avatar state transitions:
  - idle → rive.play("idle")
  - thinking → rive.play("idle") as fallback
  - speaking → rive.play("Speaking")
  - listening → rive.play("Listening")
  - react_positive → rive.play("Speaking")
  - react_negative → rive.play("idle")
- Glow color changes with avatar state (CSS box-shadow)
- Avatar state derived from both XState context AND UI events:
  - assistant streaming → speaking
  - composer focus/typing → listening
  - otherwise → machine state fallback
- Avatar panel sits left of chat UI in AgentArchitectShell
Files created:
  - src/assets/avatar.riv
  - src/features/agentArchitect/constants/avatarStates.js
  - src/features/agentArchitect/hooks/useAvatarState.js
  - src/features/agentArchitect/components/AvatarPanel.jsx
Files modified:
  - src/features/agentArchitect/machine/agentArchitectMachine.js
  - src/features/agentArchitect/hooks/useAgentArchitectSession.js
  - src/features/agentArchitect/components/AgentArchitectShell.jsx

## Phase 5 — ElevenLabs TTS ✅ COMPLETE
- ElevenLabs proxy wired through Vite at /elevenlabs
- Voice ID: v6YipgeyiXn5cMqsg5oD (custom NexTeam voice, free tier)
- Rachel voice (21m00Tcm4TlvDq8ikWAM) blocked on free tier — do not use
- TTS triggered after Claude finishes streaming reply
- Graceful fallback implemented — app never crashes on TTS failure
- Browser autoplay policy handled:
  - First page load: visual animation only, no audio attempted
  - After first user interaction: audio works correctly
  - No AudioContext errors after fix
- Known latency: Claude finishes → ElevenLabs called → audio buffered → plays
  (sequential, not streaming sentence-by-sentence)
Files created:
  - src/features/agentArchitect/services/elevenLabsService.js
  - src/features/agentArchitect/hooks/useElevenLabs.js
Files modified:
  - src/features/agentArchitect/components/AvatarPanel.jsx
  - src/features/agentArchitect/components/AgentArchitectShell.jsx
  - src/features/agentArchitect/services/architectApi.js
  - vite.config.js

---

## Phase 6 — Avatar Conversational AI 🔜 PLANNED
Goal: Avatar can answer clarifying questions independently from the interview flow
Planned steps:
- Add separate input field on AvatarPanel for user questions
- Give avatar its own Claude system prompt (helpful explainer persona, not interviewer)
- Avatar responds via Claude + ElevenLabs speech
- Interview state machine pauses/resumes around side conversations
- Add "Enable Voice" button to pre-warm AudioContext on first load
- Pre-warm AudioContext on first user gesture to eliminate autoplay issue
Estimated effort: 2–3 hours

## Phase 7 — Custom Avatar Design 🔜 PLANNED
Goal: Replace aura marketplace character with a custom-designed NexTeam avatar
Options:
- Design custom avatar in Rive editor (free, browser-based)
- Commission custom .riv file from a Rive designer
Requirements for new avatar:
- Must have named animations matching: Speaking, Listening, idle
- Ideally has mouth/face that can be driven by amplitude for lip sync
- Single artboard preferred
- Transparent background
- Fits AI PM persona

## Phase 8 — Sentence-Level Streaming TTS 🔜 PLANNED
Goal: Reduce perceived TTS latency by streaming sentence by sentence
- Split Claude response into sentences as they stream
- Send each sentence to ElevenLabs immediately
- Queue and play audio chunks in order
- Avatar mouth sync driven by amplitude in real time
Estimated effort: 2–3 hours

---

## Pending Security Items
- [ ] Rotate Firebase API key — was exposed in chat session, not yet rotated
  Go to: Firebase Console → Project Settings → Service Accounts → Rotate key

## Technical Decisions Log
- useStateMachineInput never worked for the aura .riv — use rive.play() directly
- Avatar state derived from UI events + machine state, not machine state alone
- ElevenLabs free tier blocks library voices via API — must use account-owned voices
- Vite proxy required for both Anthropic and ElevenLabs to avoid CORS

---
