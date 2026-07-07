# Firestore RESOURCE_EXHAUSTED Analysis

## Incident

The live regression wall initially failed before completion with:

`8 RESOURCE_EXHAUSTED: Quota exceeded`

Firebase was still on the free quota at the time. After the project moved to Blaze, the same wall no longer hit quota, but the code path still had a query-efficiency defect that would have made every wall run and every live Nexi turn unnecessarily expensive.

## Exact Application Operation

The application operation was the first Firestore read in `/api/nexi/message`:

`FirestoreNexiRepository.loadRecentConversations(tenantId, conversationId, 8)`

Old query:

```ts
this.db
  .collection("conversations")
  .where("tenantId", "==", tenantId)
  .get();
```

That read ran before Nexi intent routing, direct replies, capability-gap checks, and tool selection. It read every `conversations` document for tenant `aquatrace`, then filtered the requested `conversationId` in memory.

## Call Count

The regression wall has 170 live cases. On the old code path, that meant 170 unbounded tenant-wide `conversations` reads.

Document-read count was:

`170 * all conversations documents for tenant aquatrace`

The exact document count at the moment of the pre-Blaze failure was not available from the lagging Firebase billing dashboard, but the application operation and call multiplier were identified from code-path ordering and the one-case live readiness failure.

## Root Cause

This was a query-efficiency issue, not just a quota-tier issue:

- `loadRecentConversations` was scoped only by `tenantId`.
- `conversationId` filtering happened after Firestore returned the tenant-wide snapshot.
- `/api/nexi/message` called this read on every turn.
- The API returned Firestore document ids as `conversationId`, which broke conversation continuity and made follow-up turns lose history.

## Fix

Current behavior:

- If there is no `conversationId`, `loadRecentConversations` returns `[]` and does not query Firestore.
- If there is a `conversationId`, Firestore is queried by both `tenantId` and `conversationId`.
- `/api/nexi/message` now returns the stable conversation id, not the Firestore record id.
- Regression tests now assert the scoped Firestore query and stable conversation id behavior.

Current query:

```ts
this.db
  .collection("conversations")
  .where("tenantId", "==", tenantId)
  .where("conversationId", "==", conversationId)
  .get();
```

## Verification

- Local: `npm run build`
- Local: `npm test -- --runInBand` -> `101/101`
- Local: `npm run lint`
- Local: `npm run typecheck`
- Local: `npm run check:secrets`
- Live staging `/api/version` matched commit `ebcb8e135f30a27916cf6732727d3cd77a6ebc16`
- Live staging `/api/health` green
- Full live regression wall: `170/170`
