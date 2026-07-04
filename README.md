# NexTeam Studio

**Live:** https://nexteam-studio-production.up.railway.app  
**Admin:** https://nexteam-studio-production.up.railway.app/admin/sessions

NexTeam Studio is a conversational AI intake and operations platform for field service businesses. A business owner can talk with **Nexi** to define what they need, review a structured plan, and move toward setup with a clear handoff.

---

## What It Does Today

### Public-facing product
1. A visitor lands on the main experience and starts a conversation.
2. Nexi greets them with avatar + voice support and runs a guided intake.
3. The conversation collects the business details needed to shape an agent setup plan.
4. A structured spec is extracted and saved as the conversation progresses.
5. The user reaches a review step with a clear next action.

### Aquatrace workspace
1. `/mission-control/aquatrace` opens the client-facing Aquatrace dashboard.
2. `/mission-control/aquatrace/workspace` opens the Njord workspace.
3. The workspace gives quick access to:
   - Chat with Njord
   - Conversation History
   - Playbooks
   - Agent Setup Templates
   - Setup Progress
4. The Aquatrace workspace is now written in plain business language and designed to feel client-ready instead of internal.

---

## Current Product Surfaces

### Main app
- Nexi conversation flow
- structured spec extraction
- Firestore-backed session persistence
- spec review and success flow
- admin session review screen

### Aquatrace operations workspace
- client-facing dashboard
- Njord operations workspace
- playbook library and editor
- agent setup template library
- onboarding / setup progress checklist
- conversation history view

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v7 |
| State machine | XState v5 |
| Avatar | Rive animation |
| AI | Anthropic Claude via Express proxy |
| Voice | ElevenLabs TTS |
| Database | Firebase Firestore |
| Server | Express |
| Hosting | Railway |

---

## What Is Working

- Guided Nexi intake flow
- Structured spec extraction and persistence
- Firestore-backed session saving
- Admin session review page
- Aquatrace client dashboard and workspace routing
- Plain-language playbooks, templates, onboarding, and conversation history
- Persistent dashboard entry points into the Aquatrace workspace
- Production build passes locally

---

## Current Known Blockers

- Railway `ANTHROPIC_API_KEY` is exhausted and must be restored to recover live AI responses.
- Test-email checkpoint still requires:
  - `RESEND_API_KEY`
  - `VITE_NJORD_TEST_EMAIL`
  - `RESEND_FROM_EMAIL`
- Custom Aquatrace branding / avatar assets have not been provided yet.

---

## What Is Intentionally Not Done Yet

- Real outbound campaign sending without approval
- Fully automated post-purchase agent deployment
- Public multi-tenant runtime routing by URL/subdomain
- Final branded asset pass for Aquatrace

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

Core variables include:
- `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`
- `VITE_FIREBASE_*`
- `VITE_APP_URL`
- `VITE_BOOKING_LINK`
- `VITE_STRIPE_PAYMENT_LINK`
- `VITE_TENANT_ID`

Aquatrace email checkpoint variables:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `VITE_NJORD_TEST_EMAIL`

---

## Local Development

```bash
npm install
npm run dev
```

Production build test:

```bash
npm run build
```

Run the Express server locally:

```bash
npm run start
```

---

## Aquatrace Website Agents

Two Aquatrace website agents are now the next build lane after workspace closure:

- **Brokk** — Donatello-style WordPress builder/operator for the existing Aquatrace site inside **Themify Ultra** and **Themify Builder / Pro Builder**
- **Bragi** — article, SEO, metadata, internal-linking, and publish-prep specialist

Brokk improves the current machine in place. Bragi prepares the content and search structure that feeds it.

---

## Notes

- Client-facing Aquatrace language should stay plain and non-technical.
- Avoid internal labels like tenant, Firestore, seed, sandbox, case-study, raw session IDs, or routing jargon in customer-visible UI.
- Protected actions still require approval: real outbound sends, live env / credential changes, destructive irreversible actions, and external billing/account work.
