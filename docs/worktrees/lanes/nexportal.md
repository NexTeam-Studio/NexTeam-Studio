# NexPortal

Status: Active with real portal implementation ownership.

## HOW

Owns the customer-facing portal, portal sessions, branded customer views, and customer actions such as approvals, uploads, and confirmations. Its real HTML, repository, and service implementations now live under Portal Core; the old `apps/server/src/crm/portalHub*` files are compatibility-only exports.

## WHY

Customers use a different security and presentation boundary than staff. Keeping NexPortal separate prevents staff workspace changes from silently changing the customer experience.

## SUPPORT

Record sign-in, link expiry, customer upload, approval, and recovery guidance here in plain language.

## CONTRACTS

NexPortal consumes tenant-scoped records through explicit server contracts. It never reads another tenant and does not import staff-workspace implementation.

## KNOWN GOOD

Physical lane baseline: `9b2132c`. Real Portal Core extraction is recorded in `receipts/architecture/nexportal-core-extraction.txt`.
