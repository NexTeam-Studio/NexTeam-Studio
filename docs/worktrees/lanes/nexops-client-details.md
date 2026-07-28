# NexOps - Client Details

Status: Active with real extracted implementation.

## HOW

Owns the real desktop/mobile client profile, its 13 sections and tabs, client activity/data rails, detail mutations, and detail-only presentation. The NexOps workspace composes this surface but does not own its implementation. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

`ClientDetailsSurface` exposes one typed `ClientDetailsBindings` composition contract. `useClientDetailsRails` owns the tenant-aware HTTP rail used by that surface. Client-record field helpers are consumed from the Clients contract; internal Client Details files are not public contracts.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
