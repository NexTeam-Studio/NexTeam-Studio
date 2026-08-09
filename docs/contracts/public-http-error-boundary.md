# Public HTTP Error Boundary

## Scope

All product HTTP routes that use the shared error boundary return a stable,
non-sensitive error payload. This protects provider diagnostics, credentials,
and internal exception details from browser and mobile clients.

## Contract

`publicErrorResponse(error)` returns exactly:

- `status`: the `RailError` HTTP status when one is supplied; otherwise `500`.
- `message`: a fixed client-safe message selected by status.

No original exception message is included in the response. The original
message may remain in server-side structured logs for diagnosis.

| Status | Client message |
| --- | --- |
| 400 | The request could not be processed. |
| 401 | Sign in is required. |
| 403 | You do not have permission to perform that action. |
| 404 | The requested record was not found. |
| 409 | This record changed before the request could be completed. |
| 429 | Too many requests. Please try again shortly. |
| all other statuses | Something went wrong. Please try again. |

## Current adopters

- Shared server HTTP error sender (`apps/server/src/core/httpError.ts`)
- Mobile HTTP routes (`apps/server/src/mobile/routes.ts`)

## Verification

- `apps/server/test/public-error.test.mjs` proves raw exception text is not
  transformed into a client response.
- `apps/server/test/mobile-routes.test.mjs` proves a thrown provider failure
  reaches a mobile caller as the fixed 500 message with no internal detail.
