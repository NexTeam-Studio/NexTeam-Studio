# Aquatrace NexOps CRM Lane

Last updated: 2026-07-10 by build/nightly-integration-20260709

## Scope

This lane owns the Aquatrace NexOps business-engine CRM foundation: client records, contacts, properties, multi-site hierarchy, client history, documents/photos surfaced on the client record, and the data model other NexOps lifecycle pieces build on.

## Always Read First

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXOPS-BUILD-BLUEPRINT.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md` when CRM work touches media, reports, property-persistent checklist fields, or client document/photo storage.

## Allowed Touches

- M2 CRM contracts, schemas, repositories, imports, and Nexi tools.
- NexOps client/property UI surfaces.
- Read-only calls to NexCam media/report interfaces for client record display.
- `BUILDSTATE.md`, `DECISIONS.md`, receipts, and this lane file when verified state changes.

## Do Not Touch

- Do not edit NexCam media/checklist/report logic from this lane.
- Do not edit M3 scheduling behavior beyond reading client/property identifiers.
- Do not assume a client has only one property, one contact, one phone, or one email.
- Do not build piece 3.2 until Chris answers the Section 5 ask list.

## Current State

Piece 3.2 Client CRM is the first Phase 1 foundation piece. The master spec requires ask-first, build-second. Existing code already has partial native CRM/read-side work and Jobber import/fallback behavior, and Chris has answered enough of the ask list to begin the CRM foundation build.

Nova's 2026-07-10 research packet confirmed useful real-world examples (Rachel Payne, Medallion Pool Company, Caliber Pools - Anthony Owens, L3 Campus - Statehouse Arena, Oleta Falls, Renaissance Downtown Asheville Hotel, The Flats at Carrs Hill), but it did not locate historical product decisions. Chris has now answered the NexOps 3.2 ask list: display defaults, property labels, billing/correspondence, fixed phone/email labels with SMS validation, hosted NexOps architecture, gate-code visibility, two-level contractor hierarchy, and screenshot sufficiency. The current Jobber screenshots are enough to start, with follow-up screenshots requested only for specific gaps.

Correspondence rule locked on 2026-07-10: each client/correspondence type can choose email, one-way SMS, or both independently. Phone numbers store SMS eligibility per number, NexOps prompts when a number appears landline/fax/invalid/unknown, and two-way SMS remains a later upgraded capability rather than implied v1 behavior.

The canonical build document for this lane is now `docs/specs/phase1/NEXOPS-BUILD-BLUEPRINT.md`. It converts the master spec, Nova research, Chris's decisions, and the latest UI corrections into the full build plan for NexOps CRM through closeout.

## Receipt Rules

- Ask-list answer captured before any build.
- Live staging receipt proves a multi-site client with separate billing contact/address, primary contact, and multiple properties can be created/read.
- Nexi can answer client/property questions without flattening contractor/sub-property tiers.
- Part 9 reality gate passes: Chris can reach the behavior through Nexi or the UI.

## Related Files

- `docs/specs/phase1/NEXTEAM-PHASE1-MASTER-SPEC.md`
- `docs/specs/phase1/NEXOPS-BUILD-BLUEPRINT.md`
- `docs/specs/phase1/NEXTEAM-FIELDDOCS-MASTER-SPEC.md`
- `docs/specs/phase1/ASK-LIST-RESEARCH-NOVA-20260710.md`
- `docs/specs/phase1/ASK-LIST-DECISIONS-CHRIS-20260710.md`
- `SESSION_HIERARCHY.md`
- `BUILDSTATE.md`
- `DECISIONS.md`
