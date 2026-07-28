# Provider Integrations

Status: Registered for physical worktree creation.

## HOW

Owns narrow adapters for external services such as CompanyCam, Gmail, Jobber, and native import rails. Product modules call interfaces rather than provider internals.

## WHY

External services change independently. Keeping adapters separate lets NexTeam replace a provider without rewriting Clients, Jobs, NexCam, NexComms, or Nexi.

## SUPPORT

Record connection health, permission scope, read/write limits, and safe failure behavior here. Never record credentials or copied provider data.

## CONTRACTS

Adapters expose the smallest capability needed by product modules. Secrets are read only by the adapter at runtime from a gitignored local environment or deployment secret manager.

## KNOWN GOOD

Initial registry checkpoint pending verification.
