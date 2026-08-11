# Day 1 reliability hardening — continuation proof

Job ID: `NEXTEAM-DAY1-RELIABILITY-HARDENING-CONTINUE-20260811`  
Worktree: `target-architecture-integration`  
Scope: staging-only controls; production unchanged.

## Delivered controls

- `scripts/reliability/globalControl.mjs`: append-only JSONL authoritative job journal, legal-state projection, lease-expiry reconciliation, automatic next-queued dispatch, completion, and status polling. There is no second controller or mutable authoritative status file.
- `scripts/reliability/stagingReliability.mjs`: typed, non-person-specific identity-purpose registry; staging/GitHub Actions rail validation; source/deployment/live SHA equality model; idempotent, audited check-only bootstrap runner; read-only deployed browser/mobile auth regression; and green/fixed evidence gate.
- `scripts/run-staging-auth-regression.mjs`: deployment-facing harness that requires a staging hostname and expected live SHA, rejects every other target, and performs no writes.
- `docs/contracts/day1-reliability-control-plane.md`: fields, commands, events, safety boundaries, and invocation contract.

## Verification

Executed in this worktree on 2026-08-11:

```text
$ npm run test:reliability
tests 2; pass 2; fail 0

$ npm run lint
exit 0

$ npm run typecheck
exit 0

$ npm run build
exit 0

$ npm run verify
exit 0
```

The full verification gate included the default no-browser suite, reliability suite, tenancy and authorization checks, indexes, collision checks, worktree scope/coverage, current/history secret scans, provider-boundary checks, and blueprint checks.

## Safety evidence

- The focused tests prove queued dispatch, next-job advancement, expired-lease restart/reconciliation, status polling, and fail-closed deployment/evidence behavior.
- `npm run verify` passed with current/history secret scans. No credential material was added or printed.
- The verified commit was fast-forward promoted to GitHub branch `codex/staging-current` (`f508353..468b353`). That is the only deployment rail action taken. No Railway command, DPAPI access, production access, production change, Firebase change, or browser/mobile live request was made.
- The prior dashboard routing repair at `f508353` was left intact; this job does not modify its files.

## Remaining acceptance

The remaining step is genuine Chris live acceptance: confirm the GitHub staging deployment of commit `468b353`, then run `npm run test:staging-auth:readonly` with its staging URL and deployed SHA and retain the resulting green receipt. This is intentionally not inferred from local verification.
