# NexTeam - Mobile

Status: Physical worktree created and scope-verified.

## HOW

Owns the installable mobile app, offline queue and sync behavior, device capture, and the matching server API boundary. Web-only presentation remains outside this lane.

## WHY

Mobile must be able to evolve around phones, offline work, and device permissions without changing the desktop product.

## SUPPORT

Record installation, offline recovery, sync-status, and device-permission guidance here without tenant secrets or copied customer data.

## CONTRACTS

Expose tenant-aware mobile session, schedule, capture, and synchronization contracts. Other lanes must not reach into mobile storage internals.

## KNOWN GOOD

Verified baseline: `9b2132c`. Worktree `nexteam-mobile`, branch `codex/lane/nexteam-mobile`; clean checkout and scope guard passed.
