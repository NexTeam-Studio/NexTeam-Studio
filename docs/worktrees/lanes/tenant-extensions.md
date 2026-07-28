# Tenant Extensions

Status: Registered for physical worktree creation.

## HOW

Owns optional tenant tools and reusable industry packs, including the evaporation calculator. Core NexTeam modules call these tools only when a tenant has the matching entitlement.

## WHY

A tenant can receive a special tool without hardcoding that tenant into the shared product. A useful extension can later be enabled for other tenants without copying its implementation.

## SUPPORT

Record what each extension does, who can enable it, required inputs, expected outputs, and safe recovery steps. Never store tenant credentials or private production data here.

## CONTRACTS

Each extension exposes a tenant-aware command/query contract and entitlement metadata. Core modules must not import an extension's internal repository or provider code.

## KNOWN GOOD

Initial registry checkpoint pending verification.
