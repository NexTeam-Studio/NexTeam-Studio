# NexTeam Day 1 auth staging deploy proof

Job: `NEXTEAM-DAY1-AUTH-STAGING-DEPLOY-20260810`.

## Authorized scope

- GitHub branch: `codex/staging-current` only.
- Railway target: GitHub-connected staging rail only.
- Production/main: not modified, pushed, merged, or deployed.
- Auth implementation SHA: `7b4a683` (`Enforce authoritative tenant auth resolution`).
- Auth verification/proof SHA: `5572309` (`Capture Day 1 auth repair verification`).

## GitHub staging rail

`codex/staging-current` fast-forwarded from `7e63d05` to `5572309` on 2026-08-10. GitHub's Railway deployment status for `5572309` accepted the staging-only deploy and completed successfully. The corresponding GitHub deployment is marked non-production.

The first live version check exposed a build-identity discrepancy: the healthy staging service reported an earlier SHA while Railway reported the GitHub deployment successful. The cause is a stale local upload stamp being preferred over GitHub/Railway's source-commit identifier. `apps/server/src/buildInfo.ts` now prefers the explicit deploy SHA and Railway/Vercel Git commit SHA before local upload stamps. This preserves upload fallback behavior while making connected GitHub deployments observable by their actual revision.

The old local DPAPI deployment-vault/upload path is an obsolete, non-operational dependency for staging deployment. It was neither read nor used. GitHub is the staging deployment trigger and Railway's GitHub status plus the staging version endpoint are the deployment evidence rails.

## Pre-deploy regression evidence

On the auth proof SHA, all of the following passed:

- `npm run typecheck`
- Focused auth suite: 9 passed, 0 failed
- `npm run check:tenancy` (485 files)
- `npm run check:worktree-scope`
- `npm run check:worktree-coverage` (536/536 implementation files)
- `npm run check:secrets` (1,812 tracked non-document files)

After the build-identity correction, the runtime configuration and focused auth suite passed: 14 passed, 0 failed; `npm run typecheck` passed.

## User acceptance boundary

The onboarding recipient is `nexteamai@gmail.com`; the locked staging sender is `nexteamstudioai@gmail.com`. They are distinct identities. No password, reset link, token, or credential is recorded here. Inbox delivery and account acceptance require Chris to open the email, create the password, and complete final acceptance.
