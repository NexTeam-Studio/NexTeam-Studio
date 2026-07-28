# NexTeam Global

Status: Ready for component worktree use.

## HOW

Provides shared auth, routing, shell, telemetry, global contracts, NexOps approval dispatch, lifecycle policy, and repository composition. Its authoritative paths, branch, and worktree directory are recorded in `worktree-lanes.json`. Run `npm run check:worktree-scope` before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

Operations Home is a global NexOps composition area. Its real service and notification-state repository live under `apps/server/src/modules/nexops/areas/home/components/operationsHub/server`; the legacy CRM paths are compatibility-only exports.

Cross-component approval contracts, lifecycle policy, tenant-scoped Firestore helpers, and the native CRM repository composer live under `apps/server/src/modules/nexops/shared`. Area components own their handlers and repositories; the global layer only defines contracts and combines them. Former CRM-root paths are compatibility exports only.

The NexOps module manifest, route registrar, Nexi-tool registrar, and their current shared runtime contexts live under `apps/server/src/modules/nexops`. The CRM root contains compatibility exports only. Component-specific validation and helper code still present in the two runtime contexts is tracked for extraction into the existing component owners; relocation alone is not treated as that decomposition.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. NexOps composition relocation: exact ownership `450/450`, zero CRM-root implementation debt, typecheck/lint clean, focused tests `48/48`, build `174` modules, full non-browser suite `369/373` with the same three known reds and one emulator skip.
