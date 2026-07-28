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

The NexOps module manifest, route registrar, Nexi-tool registrar, and their current shared runtime contexts live under `apps/server/src/modules/nexops`. The CRM root contains compatibility exports only. Route validation and Nexi command input schemas live with their owning components. Contact owns its complete client-create command flow; Contact and Request consume canonical address parsing from shared Address/Location. Remaining cross-area service and command-orchestration helpers are still tracked for extraction.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Nexi input-contract extraction: Nexi runtime `1,390 -> 1,087` lines, exact ownership `465/465`, typecheck/lint clean, focused tests `55/55`, build `174` modules, all `780/780` component pairs disjoint, full non-browser suite `369/373` with the same three known reds and one emulator skip.
