# Nexi - Runtime

Status: Ready for component worktree use.

## HOW

Owns agent reasoning, tool selection, and authorized component calls. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

### Integrated tenant tool contract

- `/api/nexi/message` resolves tenant access before assembling its deterministic tool set.
- `OWNER` and `OFFICE_ADMIN` receive tenant-bound real-record tools and approval-gated action tools.
- `TECHNICIAN` receives only tenant-bound read tools plus permitted field-documentation/context tools; approval, outbound communications, scheduling mutations, and CRM writes are not registered.
- CRM adapters are constructed with the authenticated request tenant ID, never the server bootstrap tenant.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
