# NEXTEAM FIELD DOCUMENTATION MASTER SPEC â€” "COMPANYCAM ON STEROIDS"
**Final module name: NexShot**
Companion to: NEXTEAM-PHASE1-MASTER-SPEC.md (the NexOps/Jobber-style module)
Owner: Chris Sears | Date: 2026-07-10 | Lane: M4 Field Docs (with M2/M3/M8 read integration)

---

## 1. THE VISION IN ONE PARAGRAPH

NexShot replaces CompanyCam for a trade business: every photo timestamped and organized by client/job/visit automatically, checklist-driven reports that convert to branded PDFs, and â€” the part CompanyCam never solved â€” **full native integration with the business engine (NexOps)** so photos and reports are visible from the client record, the job, the visit, and the client hub without any export/import shuffle. CompanyCam's known weaknesses get fixed, not copied: its flat client structure (no sub-property hierarchy), its multiple-visits-piled-into-one-profile mess, and its total disconnection from quoting/invoicing.

## 2. LANE OWNERSHIP

NexShot = **M4 Field Docs lane.** Owns: photos/media, checklists, checklist templates, completion reports, PDF generation. May be READ by: M2 (client record shows media), M3 (visit shows its photos), M8 (client hub displays), M5 (content engine pulls approved job photos), M1 (Nexi answers photo/report questions). No other lane edits M4's files; M4 edits no other lane's.

## 3. CORE CAPABILITIES

### 3.1 PHOTOS â€” every CompanyCam behavior, organized better
- **Every photo timestamped** (capture time + upload time) and GPS-tagged where available â€” non-negotiable, on every single photo
- Auto-organized to client â†’ job â†’ **visit** (CompanyCam's flat pile-up of repeat visits under one profile is explicitly fixed: each visit is its own dated container)
- All CompanyCam-style options: annotate/draw on photos, tag, comment, before/after pairing, gallery view per job and per visit
- Uploaded from: mobile capture (M11 native app when it lands; web Attach button now), or synced from existing CompanyCam during transition (import path already proven)
- AI caption/tag on upload (existing vision pipeline) â€” searchable by natural language via Nexi ("show me the skimmer shot from the Justice job")

### 3.2 VIEWABILITY â€” the integration CompanyCam never had
Photos and reports are viewable from every angle the business works in:
- **By client** â€” all media across all their jobs/visits (the overall view)
- **By visit** â€” just that dated visit's photos/checklist/report
- **By date** â€” date-range filtered across any client or all clients
- **From NexOps screens** â€” the client record, the job page, and the calendar visit each surface their own media inline (read-only calls into M4)
- **From the Client Hub** â€” the client sees their own job photos/reports (owner-controlled visibility toggle per job)

### 3.3 CHECKLIST TEMPLATES â€” configurable, reusable, transferable
- **Template library:** owner builds/edits checklist templates (the existing Aquatrace Leak Detection Checklist becomes template #1; the extraction schema R1â€“R10 already knows how to read it)
- Templates applied to a job and/or an individual visit as needed â€” one job can carry multiple checklists across multiple visits
- Every field type the current checklist uses: multi-select, counts, measurements, pass/fail sections, free text, photo-attach-to-line-item
- **REPEAT-CLIENT VARIABLE TRANSFER (the key feature):** when a client gets a new job/visit â€” this year or three years later â€” checklist fields that describe the PROPERTY (pool gallons, surface type, skimmer counts, equipment, system type) auto-fill from the most recent completed checklist for that property. Editable if something changed, but never re-entered from scratch. Fields that describe the VISIT (conditions on arrival, water temp, findings, results) always start blank. Template design must mark each field as PROPERTY-persistent or VISIT-fresh.
- Property-persistent data lives on the property record (M2's multi-site hierarchy) so it transfers across jobs automatically â€” this is the structural fix, not a copy-paste convenience

### 3.4 REPORTS â€” checklist to client-ready PDF
- Completed checklist converts to a branded PDF report automatically (existing report-service pattern)
- Callable/exportable by visit AND by date â€” "give me the report from the March visit" and "all reports for this client in 2026" both work
- Reports attach to: the closeout receipt (per NexOps spec 3.6), email sends (real attachments â€” the fake-stub bug fix applies here), and the client hub
- Export: PDF download, email, and (future) direct share link

## 4. "ON STEROIDS" â€” WHERE NEXSHOT BEATS COMPANYCAM

1. **Visit-based organization** â€” repeat clients get clean dated visit containers, not one endless photo pile (CompanyCam's known mess, confirmed by Chris's own Forrest Ferguson 2025-vs-2026 experience)
2. **Property hierarchy** â€” multi-site clients (contractors, property managers) get media organized under the right sub-property, matching NexOps's CRM structure; CompanyCam flattens this entirely
3. **Persistent property variables** â€” three years later, the pool's gallons and skimmer count are already filled in; CompanyCam re-enters everything every time
4. **Native business integration** â€” photo to report to receipt to review-request is ONE flow; CompanyCam requires the Dropbox-and-attach shuffle Chris does manually today
5. **Nexi on top of all of it** â€” "what did we find at X," "show me before/afters from the liner job," answered conversationally with sources
6. **AI vision** â€” captions, tags, natural-language search; CompanyCam has nothing equivalent

## 5. BUILD METHOD â€” SAME ASK-FIRST PROTOCOL AS NEXOPS

Before each numbered piece, Atlas posts the ASK LIST (same template as the Phase 1 master spec Â§5): what exists, what's new, what he needs from Chris â€” screenshots of CompanyCam screens worth referencing, decisions on open questions, assets. Chris answers; then the build starts.

**CompanyCam research rule:** their public help docs/feature pages are reference for flows and patterns â€” never verbatim, never their weaknesses (flat structure, visit pile-up). Where Chris's spec is silent, default to CompanyCam's pattern and flag it for confirm/override.

**Known open design questions to surface in the first ask list:**
A. Photo visibility default in Client Hub â€” all photos visible to client by default, or owner opts each job in?
B. Template field marking UI â€” how does Chris mark a field PROPERTY-persistent vs VISIT-fresh when building a template?
C. Transition plan â€” during the CompanyCam coexistence period (adapter still live), do new photos go to both, or native-only with CompanyCam frozen as archive?

## 6. BUILD ORDER (within M4 lane, sequenced against NexOps phases)

1. **3.3 Checklist template system** (foundation â€” templates + property-persistent field marking; the extraction schema already understands the data)
2. **3.1 Photo organization** (visit containers, timestamps, client/job/visit structure â€” import path from CompanyCam already exists)
3. **3.2 Viewability integration** (surface media in NexOps client/job/visit screens + client hub)
4. **3.4 Reports** (checklistâ†’PDF, export by visit/date, real attachments)
5. Repeat-client variable transfer proven live with a real returning client

DEPENDENCY NOTE: piece 3 (viewability) requires NexOps's client/job screens to exist â€” sequence M4's piece 3 after NexOps's 3.2 CRM foundation lands. Pieces 1â€“2 can build in parallel with NexOps work; they're M4-internal.

---
*Companion master spec. Lives in the repo beside PHASE1-MASTER-SPEC.md, referenced by the M4 lane file. Name is locked: NexShot.*


