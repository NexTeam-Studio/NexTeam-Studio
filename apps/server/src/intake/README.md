# Intake

M10 Intake is Nexi's tenant-onboarding rail. It turns a conversational interview into a `NexiBlueprint`, a native tenant draft, starter templates, calendar defaults, app-stack decisions, and owner-facing OAuth steps.

Provisioning is deliberately approval-gated. Nexi can draft the plan and place a `tenant_provisioning` item in the ApprovalQueue, but executing that approval writes only NexTeam-native tenant records. External OAuth, custom domains, publishing, emails, and third-party account setup stay parked for owner action.

Start here when something breaks:
- `service.ts` builds the blueprint and provisioning plan.
- `approvalExecutor.ts` is the only path that executes an approved tenant provisioning item.
- `nexiTools.ts` exposes the chat tools.
- `routes.ts` exposes the owner/admin API endpoints.
- `machine.ts` defines the XState intake interview phases.
