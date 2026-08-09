# NexOps Agreements

Owner: NexTeam Global (`apps/server/src/modules/nexops/shared/agreements/**`).

`serviceAgreements` is the tenant-scoped durable agreement record for recurring services, memberships, maintenance plans, and commercial agreements. It records client/property references, cadence, scope line items, terms, lifecycle status, and a versioned audit event trail in `serviceAgreementEvents`.

Commands are `created`, `updated`, `activated`, `paused`, `resumed`, and `cancelled`. Only OWNER and OFFICE_ADMIN may read or mutate them through `/api/crm/agreements`. Tenant lookup is always constrained by `tenantId`; an out-of-tenant id returns not found.

The agreement boundary deliberately has `billingMode: "manual_invoice_only"`. It does not create invoices, collect payment, create a subscription, or charge a saved card. `nextServiceAt` is an operational planning cue only. Any future accounting automation must be owned and approved by the invoice/payment domains before it can be connected.
