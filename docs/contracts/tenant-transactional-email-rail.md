# Tenant Transactional Email Rail

## Status

**Queued for NexComms. Not a current tenant-send implementation.**

The existing Gmail adapter is retained only for the locked NexTeam staging
owner-invitation rail. It is not a per-tenant OAuth model and must not become
one. No reusable tenant transactional provider is currently registered.

## Required Flow

```text
Tenant Event
  -> Tenant Email Configuration
  -> Branded Template
  -> Transactional Delivery Provider
  -> Delivery Result
  -> Immutable Communication and Audit Record
```

Platform events include account invitations, security/password events,
subscription notices, and system notifications. Tenant events include quotes,
approvals, jobs, visits, scheduling, invoices, payments, receipts, reminders,
and other tenant workflow events.

## Tenant Configuration Contract

Each tenant configuration must hold non-secret business data only:

- business name, logo, sender display name, reply-to address, and brand styling;
- custom sending-domain verification state when available;
- a platform fallback transactional domain when no custom domain is verified;
- staging/production environment binding; and
- template and provider selection metadata.

Credentials remain provider-scoped secrets. They are never stored in tenant
documents, templates, communication records, or audit data.

## Delivery and Audit Contract

Every delivery attempt must record a tenant-scoped immutable communication and
audit receipt with provider, environment, template/version, request context
(client/property/request/quote/job/invoice when applicable), accepted/failed
state, provider message identifier, bounce/failure state, and timestamps.

The provider adapter must support idempotency keys, explicit tenant isolation,
safe failure reporting, delivery/bounce webhooks, and no silent fallback to a
different sender or environment.

## Provider Decision Gate

NexComms must first evaluate the existing provider registry. The current Gmail
adapter is not eligible for per-tenant sending because it depends on one
platform mailbox OAuth connection. The selected transactional provider must
offer domain verification, tenant branding, delivery events, and separate
staging/production credentials before any tenant send is enabled.
