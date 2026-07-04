# Persistence Verification

This is the simplest safe way to verify session persistence for NexTeam Studio.

## What to verify

You want to confirm that:
- a new conversation creates a session record
- partial progress is saved during the conversation
- a completed conversation is marked completed
- the admin session view can see the saved record

## Local verification flow

1. Run the app locally.
2. Start a new Nexi conversation.
3. Send 2 or 3 messages so the session has partial progress.
4. Open the admin session view at `/admin/sessions`.
5. Confirm the new session appears.
6. Finish the conversation until the review step is reached.
7. Refresh the admin session view.
8. Confirm the same session now shows completed state and saved fields.

## Firestore verification flow

Check the `agentSessions` collection.

For the active session, confirm these fields are present:
- `sessionId`
- `agentId`
- `status`
- `stage`
- `updatedAt`
- partial structured fields such as business name, trade, service area, or priority agent

After completion, also confirm:
- `status: completed`
- `completedAt`

## Quick operator path

Use this operator path when Chris wants the fastest proof:

1. run a short conversation
2. open `/admin/sessions`
3. confirm the session card appears
4. open Firestore `agentSessions`
5. confirm timestamps and saved fields match

## Known limits

- Live production verification still depends on working production AI access.
- If Railway `ANTHROPIC_API_KEY` is exhausted, real production chat verification is blocked until that is restored.
- Local structure verification can still be done without crossing a protected boundary.
