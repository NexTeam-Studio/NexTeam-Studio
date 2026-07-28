# NexReach

Status: Ready for component worktree use.

## HOW

Owns reputation, consent, content, portfolio, campaigns, and the tenant-scoped review follow-up sequence. The review sequence repository and service live under `apps/server/src/reputation`; the former `apps/server/src/crm` paths are compatibility exports only. Its authoritative paths, branch, and worktree directory are recorded in `worktree-lanes.json`. Run `npm run check:worktree-scope` before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Review-sequence extraction: focused tests `12/12`, build `174` modules, full non-browser suite `369/373` with the same three known reds and one emulator skip.
