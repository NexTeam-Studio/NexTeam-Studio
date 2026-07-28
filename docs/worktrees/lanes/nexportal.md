# NexPortal

Status: Physical worktree created and scope-verified.

## HOW

Owns the customer-facing portal, portal sessions, branded customer views, and customer actions such as approvals, uploads, and confirmations.

## WHY

Customers use a different security and presentation boundary than staff. Keeping NexPortal separate prevents staff workspace changes from silently changing the customer experience.

## SUPPORT

Record sign-in, link expiry, customer upload, approval, and recovery guidance here in plain language.

## CONTRACTS

NexPortal consumes tenant-scoped records through explicit server contracts. It never reads another tenant and does not import staff-workspace implementation.

## KNOWN GOOD

Verified baseline: `9b2132c`. Worktree `nexportal`, branch `codex/lane/nexportal`; clean checkout and scope guard passed.
