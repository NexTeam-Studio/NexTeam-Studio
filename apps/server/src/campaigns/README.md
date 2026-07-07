# Campaigns

This module is the M6 campaign engine. It builds tenant-scoped audiences, plans campaign steps, injects unsubscribe language, records tracking events, and parks every outbound item in the ApprovalQueue. It does not send bulk/list messages directly.

How it connects:

- Nexi tools in `nexiTools.ts` let Nexi preview an audience, draft a campaign, read campaign stats, suppress a contact, and queue transactional report/review emails.
- API routes in `routes.ts` expose the same campaign actions for receipts and admin screens.
- `service.ts` is the safest first place to look for campaign behavior because it owns queueing, suppression checks, and tracking writes.
- `compliance.ts` owns SPF/DKIM/DMARC and quiet-hours boundaries. Bulk/list execution stays blocked until those DNS checks are explicitly confirmed.
- `sequenceEngine.ts` owns the XState sequence lifecycle and planned send timing.
- `repository.ts` is currently in-memory for staging receipts, with a seeded VGB hotel-GM test template and Chris-owned test contacts.

When something breaks, check these first:

1. If contacts are missing, inspect `audience.ts` and the filter passed into `previewAudience`.
2. If an email would send instead of queueing, inspect `service.ts` and confirm `execute.service` is still `campaigns`.
3. If unsubscribes are ignored, inspect `repository.isSuppressed`, `unsubscribe`, and the second-step queue path.
4. If list execution is not blocked, inspect `complianceConfigFromEnv` and the DNS flags.
