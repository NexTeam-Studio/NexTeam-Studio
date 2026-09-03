# NexTeam Future Feature Ideas

Last updated: 2026-07-22

## Deferred: Canonical field library for forms and communications

- Build a tenant-facing reference library of canonical CRM/intake fields.
  Form builders must be able to browse approved fields, choose a canonical
  mapping for a form control, and see which fields create or update client,
  property, request, quote, job, and visit data.
- Communication-template editors must be able to browse and insert the
  template variables available for the selected lifecycle event, with plain
  language descriptions and a preview of the resolved value.
- Keep the canonical key separate from the tenant-facing field label. A tenant
  may rename a label (for example, "Best email"), while the underlying
  `email` mapping remains stable for client matching, CRM materialization, and
  template delivery.
- Custom/unmapped fields must remain saved on the intake record, but the UI
  must make clear that they do not automatically populate a standard CRM
  field or template variable until an explicit mapping is created.

## Deferred: Tier 2 subcontractor access

- A job-scoped external subcontractor tier is a locked fast-follow after the
  Owner / Office Admin / Technician model. It must use narrowly scoped job
  access, not a fourth broad tenant role, and remains out of this build pass.

## Deferred during Pieces 6+7

### Scheduling
- Bulk conflict/double-booking detection for multi-visit one-off create.
  Note: considered and deliberately deferred on 2026-07-16.
- Multi-visit sequence templates tied to quote templates.
  Note: considered and deliberately deferred on 2026-07-16.
- Route optimization.
  Note: explicitly out of scope for the schedule module on 2026-07-16.
- Map-based dispatch view.
  Note: explicitly out of scope for the schedule module on 2026-07-16.
- Timesheets and clock-in/clock-out.
  Note: reference screenshots showed this adjacent to scheduling, but it remains a separate future domain.

### Notifications
- OS-level push delivery adapter for Android/iPhone notification grouping.
  Note: in-app notification center is live; push infrastructure is intentionally deferred.

## Deferred during Pieces 8+9

### Marketing drop-in (master spec 3.8)
- Marketing drop-in remains deferred and was explicitly not built during the client hub / review follow-up pass.
  Note: log retained so this scope does not get silently folded into portal or review work later.

### Google Business Profile review detection
- Review sequence engine is live, but automatic review-detected completion through Google Business Profile is still deferred behind OAuth/provider wiring.
  Note: the current live seam is staff-side `mark reviewed`; GBP should plug into that same provider adapter path rather than inventing a parallel review-state system.

## Deferred during NexReach marketing-engine pass

### Campaign sending engine
- NexReach v1 now builds the consented audience pool plus CSV export, but not bulk outbound campaign sending.
  Note: any future email/SMS blast engine should inherit the existing transactional template, opt-out, approval, and compliance rails rather than inventing a second outbound system.

### Per-platform social formatting
- NexReach v1 generates platform-agnostic short and long social copy only.
  Note: platform-specific variants, channel lists, and formatting rules remain a Chris decision before expansion.

### Public portfolio custom domains
- The live portfolio surface stays under the shared NexPortal host path in v1.
  Note: custom domains remain deferred until tenant-domain provisioning and revocation rules are defined clearly.

### Live publishing adapters
- NexReach currently stops at approval, showcase assembly, and export bundles.
  Note: direct GBP/social publishing adapters remain deferred until real provider credentials exist and can be verified against live endpoints.

## Deferred during NexCam reconcile pass

### Client/share delivery
- Dedicated share-link delivery for NexCam reports or media packages is deferred.
  Note: current live delivery is PDF download, closeout receipt attachment, and client-hub visibility. A standalone share-link layer should plug into the same fielddocs/report records later rather than inventing a second document store.

## Deferred during NexCam v2 refinements

### Client photo uploads during active jobs
- Client-side photo uploads remain intake-only for now and were explicitly not expanded into active-job upload during the 2026-07-18 NexCam v2 refinement pass.
  Note: if this returns later, it should extend the existing fielddocs/media rail with explicit permission and moderation rules rather than creating a separate upload bucket.

### GPS auto-suggest at capture time
- Capture-time GPS suggestion is now part of the live M11 native mobile rail.
  Remaining follow-on scope: any future expansion beyond today-visit / known-property matching should extend the same staff-only suggestion model rather than creating a second assignment flow.

### Voice narration and manual text capture
- Voice narration plus typed field text now live together on the M11 native mobile rail and both feed the shared report path.
  Remaining follow-on scope: richer note editing, playback review, or mobile Nexi dictation should extend the same shared narration model rather than splitting voice into a parallel notes system.

### LiDAR measurement
- LiDAR-assisted measurement remains explicitly deferred out of M11.
  Note: if it returns later, it should plug into the same capture-session and media/report rails instead of creating a measurement-only capture app.

### Dual video mode
- Dual video capture remains explicitly deferred out of M11.
  Note: if it returns later, it should stay inside the same offline queue and capture-batch model as photos rather than inventing a separate transport rail.

### Nexi on mobile
- Nexi conversational mobile surfaces remain explicitly deferred out of M11.
  Note: the current mobile scope is field capture and checklist context only, not a full NexOps mobile client.

## Deferred: Production Data Safety Hardening
(parked 2026-07-22, not yet built — required before real tenant data
goes on the platform, not before)

Considered and deferred per Chris's explicit decision after Atlas's
diagnosis confirmed the client-list-resets-to-zero issue traces to
the local dev environment's in-memory storage fallback, not a
durable-database wipe. Four concrete gaps found, none built yet:

1. **Hard-fail on missing Firestore admin credentials.** The server
   currently falls back to in-memory storage silently when Firebase
   admin creds are absent, with no error and no warning. Production/
   staging must refuse to start in that state instead of silently
   running in a mode that can lose data.

2. **Scheduled automated backups.** Manual export/backup/list-backup
   routes exist and are tested, but nothing runs them on a recurring
   schedule today.

3. **A tested restore procedure.** Backup/export code exists; restore
   does not — no restore route, restore service, or restore test
   exists in the platform layer yet. Backup without a proven restore
   path is not a real safety net.

4. **Structural cleanup guardrails.** The live-verification cleanup
   convention that deletes proof-created test records is procedural
   today, not code-enforced — there is at least one live cleanup
   script that deletes by ID with no visible production-tenant
   allowlist. Needs a hard, structural boundary so test cleanup
   logic is provably incapable of touching real tenant data, not
   just "we'll be careful."

Priority order when this is picked back up: (1) hard-fail on missing
credentials — cheapest fix, closes the most dangerous silent-failure
mode; (2) structural cleanup guardrails; (3) scheduled backups; (4)
tested restore. Full diagnosis and file-level citations are in
Claude/Atlas's exchange dated 2026-07-22 — do not re-diagnose from
scratch, the root cause is already confirmed.

## Deferred: Nexi Contact-Card Delivery ("email me [client]'s
contact info")
(parked 2026-07-22, not yet built — waiting on tenant user-seat
profiles)

Considered and deferred per Chris's explicit decision. Nexi currently
mishandles "email me [client]'s contact card" / "send me [client]'s
contact information" — it returns a misleading "couldn't find an
email" message rather than an honest capability-gap message, and the
feature itself isn't built. Chris has decided to hold this
intentionally until tenant user-seat profiles exist (per the earlier
Unified Cross-Module Identity + Personal-Context Defaults work), since
that's the real database Nexi needs to pull from for this class of
request — not something to bolt on ahead of that foundation. Do not
re-diagnose from scratch when this is picked back up; the exact repro
is already on record from the 2026-07-22 Nexi test rounds.

---

## Deferred: Google Address Geocoding/Autocomplete — Extend to Nexi's
Conversational Client Creation, Not Just the NexOps Form
(parked 2026-07-22, extends an already-decided requirement)

This is not a new idea — it extends the existing Google address
autocomplete requirement already decided for the NexOps client-
creation form (real Google-integrated location autocomplete or
equivalent geocoding, storing standardized address data plus lat/
long for drive-time and scheduling logic, manual override always
available, never blocking save on an unrecognized address). Chris has
now confirmed this must also cover Nexi's own conversational client-
creation path — not just the manual NexOps UI form.

Rationale: repeated live testing has shown Nexi's freeform address
parsing is vulnerable to simple spelling variance (e.g. "Cate Lane"
vs. "Kate Lane"), and the natural-language "make changes" correction
flow for fixing such typos is itself unreliable today. Matching
against real geocoded address data at creation time — in both the
NexOps form AND Nexi's conversational flow — prevents this class of
error at the source rather than relying on conversational correction
to catch it after the fact.

When this is picked up: confirm current state of the original NexOps-
form requirement first (built, partially built, or not yet started),
then extend the same geocoding/matching service to Nexi's create-
client tool so both surfaces share one address-validation path rather
than implementing it twice.

## Deferred: Settings-Level Lead Sources Management
(parked 2026-07-23, not built in the mobile client intake pass)

The mobile client intake now uses a fixed "How They Found Us" list
plus a one-off "+ Add New" option that saves only to the current
client record. Chris confirmed that permanently managing the master
lead-source list belongs in Settings instead, not inside intake.

When this is picked back up, build a Settings surface where Chris or
Office Admin can deliberately add, rename, and remove master lead-
source options. That Settings workflow should be the only path that
changes the shared dropdown list for future clients; the intake-level
"+ Add New" path must remain client-only and must never silently
modify the master list.
