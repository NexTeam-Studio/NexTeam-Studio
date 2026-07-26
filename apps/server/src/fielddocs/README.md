# NexCam / NexDocs

NexCam owns tenant-scoped media, checklists, and report PDFs, while NexDocs owns the freeform client document library and the absorbed office-record rail. The module connects to Nexi through `nexiTools.ts`, native media storage through `mediaRepository.ts`, and owner/admin API surfaces through `routes.ts`.

The upload and report rails write only native NexTeam records. Legacy imported documents remain read-only, and browser/mobile clients must use same-origin media/report routes instead of provider URLs. Paid captioning is on by default whenever approved Anthropic credentials are present; `FIELD_DOCS_VISION_ENABLED=true` remains as a local/dev force-on switch, while `FIELD_DOCS_VISION_ENABLED=false` is the explicit force-off override. Receipt runs must log estimated spend and stop before owner-approved caps.

The vision survey MVP lives in `visionSurvey.ts`. It reviews selected photo batches against the Aquatrace leak-detection checklist vocabulary, stores structured tags on `media.aiTags`, and treats `INSUFFICIENT` as a correct answer when a photo cannot be confidently identified. Owner corrections are written back as human-confirmed tags so the taxonomy can improve without guessing.

When something breaks, start with `routes.ts` for request/AccessContext behavior, `mediaRepository.ts` for tenant-scoped reads/writes, `visionSurvey.ts` for batch/correction logic, `visionPipeline.ts` for paid captioning, `reportExtraction.ts` for checklist/Moasure/evap parsing, and `reportService.ts` for PDF output.
