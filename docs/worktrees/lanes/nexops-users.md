# NexOps - Users

Status: Ready for component worktree use.

## HOW

Owns team members, invitations, roles, and permission-management surfaces. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

Team membership uses the authoritative Platform `TenantUser` record. Fields added for capability roles are `customRoleName` and `capabilities`; a custom role retains its base role and grants only its listed capabilities. `POST /api/platform/tenants/:tenantId/users` records `member.upserted`; `POST /api/platform/tenants/:tenantId/users/:userId/custom-claims` records `member.claims_applied`; `GET /api/platform/tenants/:tenantId/users/audit` returns the tenant-scoped audit history. `team.manage` gates membership writes, `tenant.audit.read` gates the audit query, and a caller cannot grant a capability it does not hold.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
