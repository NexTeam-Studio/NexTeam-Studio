# NexCommand Admin Console

NexCommand is the internal NexTeam platform console. It is available at `/nexcommand`; `/platform` remains a compatibility route to the same console.

## Access and environment

- NexCommand requires a NexTeam platform-operator session. Tenant ownership by itself is not sufficient.
- Staging: `https://nexstage.nexteam.studio`
- Production: `https://nexapp.nexteam.studio`
- NexCommand exposes no production controls from the staging console.

## Navigation and ownership

The console groups platform operations into Dashboard, Tenants, Prospects, Blueprints, Subscriptions, Onboarding, Migrations, Support, Modules, Integrations, Code & System, Releases, Usage, Billing, Security & Audit, and Settings.

Tenant onboarding uses the existing platform prospect, blueprint, subscription, activation, blocker, and migration records. NexCommand is a control surface; it does not create a parallel tenant data model.

## Providers and support boundary

Provider cards are external quick-access links only. They do not expose credentials, provider variables, or embedded provider control panels.

Tenant support access is not active. A future support session must be explicitly requested and approved by the tenant, constrained to a stated scope and duration, revocable, and recorded in audit history.

## Operator safety

The UI shows sanitized operator-facing errors. Detailed diagnostics remain in approved server logs and audit systems, not in the browser.

The console follows the shared NexTeam visual foundation and is responsive for desktop, tablet, and mobile operation.
