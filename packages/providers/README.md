# Providers Package

This package contains external rail adapters and native rail adapters. M0 includes read-only Jobber and CompanyCam adapters, plus provider-safe fetch helpers. M2 adds the native CRM adapter with client, job, quote, and invoice reads plus native write methods for client creation, quote drafting, quote updates, and job status updates.

Provider adapters translate third-party APIs into `@nexteam/core` contracts. App and module code should call providers through their interfaces, not import provider internals across module boundaries.

When something breaks, start with `src/railFetch.ts` for HTTP/auth/retry behavior, `src/jobber/JobberAdapter.ts` for CRM reads, `src/companycam/CompanyCamAdapter.ts` for media reads and `/api/media` binary fetches, and `src/native/NativeAdapter.ts` for native CRM writes.
