# Phase Q automated acceptance contract

`NEXTEAM-PHASE-Q-AUTOMATED-ACCEPTANCE-V1`

The automated acceptance path is deliberately local and isolated. It uses only named `phase_q_isolated` fixture data and in-memory repositories; it must never load a customer tenant, call a provider, send a communication, or depend on a deployed endpoint.

The executable contract is `apps/server/test/phase-q-automated-acceptance.test.mjs`. It proves one tenant-bound path across these persisted boundaries:

- tenant settings and catalog, queried through the Nexi assistant registry;
- capability denial for a technician and an owner-equivalent property-asset write;
- agreement activation and cross-tenant non-disclosure;
- submitted NexForms evidence and immutable audit history;
- job costing based on a real invoice fact;
- communication drafting that remains pending and performs no delivery;
- NexPortal magic-link consumption, property scope, hidden non-portal invoice, and foreign-tenant cookie rejection.

This is automated non-production acceptance preparation, not a claim of live customer or production acceptance. A successful run is required to remain network-neutral outside its loopback test process.
