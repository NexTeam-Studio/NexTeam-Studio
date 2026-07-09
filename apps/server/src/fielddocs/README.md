# Field Docs

Field Docs owns tenant-scoped media, checklists, report PDFs, report extraction, and the CompanyCam-to-native document bridge. It connects to Nexi through `nexiTools.ts`, native media storage through `mediaRepository.ts`, and owner/admin API surfaces through `routes.ts`.

The upload and report rails write only native NexTeam records. CompanyCam remains read-only, and browser/mobile clients must use same-origin media/report routes instead of provider URLs. Paid captioning remains behind `FIELD_DOCS_VISION_ENABLED=true`; receipt runs must log estimated spend and stop before owner-approved caps.

The vision survey MVP lives in `visionSurvey.ts`. It reviews selected photo batches against the Aquatrace leak-detection checklist vocabulary, stores structured tags on `media.aiTags`, and treats `INSUFFICIENT` as a correct answer when a photo cannot be confidently identified. Owner corrections are written back as human-confirmed tags so the taxonomy can improve without guessing.

When something breaks, start with `routes.ts` for request/AccessContext behavior, `mediaRepository.ts` for tenant-scoped reads/writes, `visionSurvey.ts` for batch/correction logic, `visionPipeline.ts` for paid captioning, `reportExtraction.ts` for checklist/Moasure/evap parsing, and `reportService.ts` for PDF output.
