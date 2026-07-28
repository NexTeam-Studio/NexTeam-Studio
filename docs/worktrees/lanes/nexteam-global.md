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

The NexOps module manifest, route registrar, Nexi-tool registrar, and their current shared runtime contexts live under `apps/server/src/modules/nexops`. The CRM root contains compatibility exports only. Route validation now lives with Contact, Quote Engine, Job Core, Visit Core, Invoice Structure, Payment Rails, Request Core, Operations Home, Portal Core, and NexReach. Cross-area service helpers still present in the route runtime and component-specific schemas/helpers still present in the Nexi runtime remain tracked for extraction.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Route-contract extraction: route runtime `1,218 -> 767` lines, exact ownership `455/455`, typecheck/lint clean, focused tests `63/63`, build `174` modules, all `780/780` component pairs disjoint, full non-browser suite `369/373` with the same three known reds and one emulator skip.
