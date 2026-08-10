# NexCommand Foundation Phase F Relay Packet

JOB_ID: `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-F-20260810`

## Authorized bounded objective

Review the completed Phase E session-security/audit implementation and add only the next justified NexCommand audit-read presentation or retention-contract improvement. Reuse the existing platform session, platform-user, platform security-audit, route, and UI boundaries. Do not create a second auth model or audit store.

## Preconditions

- Phase E is GREEN and committed.
- Read `docs/knowledge/checkpoints/NEXCOMMAND_FOUNDATION_IMPLEMENTATION_LEDGER.md`, `docs/knowledge/code-maps/2026-08-10-nexcommand-foundation-phase-e.md`, and the Phase E receipt first.
- Preserve existing clean/legitimate work; inspect Git state before editing.

## Hard boundaries

- Keep the 15-minute server-enforced timeout, browser-session-only credential, explicit invalidation, redaction, and append-only audit semantics.
- Preserve Firebase platform-operator gate and all tenant authentication/roles/capabilities unchanged.
- No browser automation, deployment, live customer data, email, payment, secret output, push, merge, rebase, reset, amend, or deletion.
- Public/platform-admin audit history must remain non-mutable.

## Required proof

Run focused new/affected session, immutable-audit, capability, and tenant-auth tests; then targeted tests, full non-browser suite, typecheck, lint, build, tenancy, worktree scope/coverage, secret and secret-history scans, and `git diff --check`. Record a receipt and commit only focused verified work.
