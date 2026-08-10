# NexCommand Foundation Phase D Receipt

## Outcome

Phase D adds the approved platform role templates: Owner, Super Admin, Administrator, Developer, Developer Admin, Support, Sales & Onboarding, Marketing, Finance, and Read Only. Capabilities are explicit, aggregated only in `resolvePlatformCapabilities`, and can be granted or denied per persisted platform profile. This remains separate from tenant roles, tenant users, and tenant capabilities.

## Enforcement and proof

- The existing Firebase platform-operator gate remains the first server-side check.
- An active persisted platform profile resolves its template plus grant/deny overrides; a disabled profile is rejected.
- NexCommand area/sensitive routes require a mapped explicit capability after the operator gate.
- Only `platform.ownership.manage` can create, change, disable, or transfer an Owner. Lower templates do not include ownership or production management; production requires an explicit grant.
- Lists and non-manager reads retain Phase C contact/address redaction.
- `apps/server/test/platform-role-capabilities.test.mjs` proves templates, override aggregation, tenant denial, route denial, ownership protections, transfer, and audit-backed persistence. `apps/server/test/platform-team.test.mjs` proves redaction and immutable audit ordering.

## Green gate — 2026-08-10

- `npm test`: 513 passed, 0 failed, 3 skipped.
- Focused Team/role/platform suite: 24 passed, 0 failed.
- `npm run typecheck`, `npm run lint`, `npm run check:tenancy`, `npm run check:worktree-scope`, `npm run check:worktree-coverage`, `npm run check:secrets`, `npm run check:secret-history`, `npm run build`, and `git diff --check`: passed.

## Rollback evidence

Revert the Phase D platform Team schema, resolver, route guard, focused test, and contract/code-map together. The only durable records are platform-owned `platformUsers` and append-only `platformUserAudits`; they have no tenant ID and become inert without these routes. No Firebase identity, invitation, email, customer data, tenant data, payment, browser, production, or external change was made.
