# Aquatrace NexCam Field Docs Lane

Last updated: 2026-07-10 by build/nightly-integration-20260709

## Scope

This lane owns Aquatrace NexCam field documentation: photos/media, timestamps/GPS, visit-based photo organization, checklist templates, property-persistent checklist variables, completion reports, PDF generation, and report/photo visibility through other lanes.

## Always Read First

- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md` when field-doc work touches NexOps client/job/visit screens, NexPortal, receipts, closeout, email attachments, or review/content flows.

## Allowed Touches

- M4/NexCam contracts, schemas, media, checklist, report, and PDF-generation code.
- NexCam UI surfaces for photo/checklist/report work.
- Read-only integration points that expose NexCam media in NexOps/NexPortal screens.
- Receipts for checklist, photo organization, report generation, and upload/retrieval flows.

## Do Not Touch

- Do not change NexOps CRM ownership of clients/properties/jobs.
- Do not flatten repeat client visits into a CompanyCam-style pile.
- Do not guess whether photos are client-visible by default; Chris must answer the ask list.
- Do not build pieces 3.3 or 3.1 until Chris answers the Section 5 ask lists.

## Current State

NexCam pieces 1 and 2 can prepare in parallel with NexOps 3.2, but build still waits on ask-list answers. The existing extraction schema and CompanyCam import path are useful inputs, not permission to skip the template/photo-organization decisions.

Nova's 2026-07-10 research packet confirmed the Rachel Payne completed checklist as a strong seed asset and identified repeat-client/photo-organization candidates, but it did not locate CompanyCam screenshots or historical product decisions. The proposed property-persistent vs visit-fresh field split is an inference that requires Chris approval before implementation.

## Receipt Rules

- Ask-list answer captured before build.
- Template receipt proves fields can be marked property-persistent vs visit-fresh.
- Photo organization receipt proves client -> job -> visit containers, timestamp/upload timestamp, GPS where available, and no repeat-visit pile-up.
- Part 9 reality gate passes: Chris can use or verify the behavior through Nexi or the UI.

## Related Files

- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/ASK-LIST-RESEARCH-NOVA-20260710.md`
- `SESSION_HIERARCHY.md`
- `BUILDSTATE.md`
- `DECISIONS.md`
