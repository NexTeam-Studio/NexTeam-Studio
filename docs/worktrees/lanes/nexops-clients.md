# NexOps - Clients

Status: Active and separated from Client Details.

## HOW

Owns client records, intake, directory, create/edit forms, and client-area composition. Detailed profile tabs, activity rails, and detail-screen presentation belong to NexOps - Client Details. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

The shared client-record helpers in `apps/web/src/features/clients/components/contact/domain/clientProfile.ts` are the current web contract consumed by Client Details. Internal roster, form, and controller files are not public contracts.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
