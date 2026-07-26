## NexOps Density Pass Audit

Date: 2026-07-14

Scope:
- Requests
- Quotes
- Jobs
- Invoices
- Home

Method:
- Counted top-level visible work blocks in the main content area.
- Sidebar and top nav were excluded.
- Inline fact strips count as one block.
- Collapsed disclosures count as one block when visible closed.

Results:

| Screen | Before | After | Notes |
| --- | ---: | ---: | --- |
| Home | 6 | 5 | Removed embedded Clients workspace and compacted business overview into one lighter list block. |
| Requests | 8 | 6 | Moved office intake + form library behind disclosures and merged review/notification/link/address detail into one fact strip. |
| Quotes | 9 | 7 | Reduced selected-quote decision rail from 5 visible blocks to 3 by merging state + action and collapsing proof/billing + office controls. |
| Jobs | 10 | 7 | Folded payment schedule, reminders, package preview, and history into one disclosure; merged action into the next-move rail. |
| Invoices | 11 | 8 | Folded lifecycle, package, send, and collection sections into disclosures; kept receipt review visible as the current action. |

Quote detail sub-audit:
- Before: Commercial state, Dominant action, Approval proof, Billing rail, Manual overrides/downstream = 5
- After: State + dominant action merged, Approval + billing details collapsed, Delivery + office controls collapsed = 3

Verification:

```text
> npm run typecheck
> tsc -b
```

```text
> build
> npm --workspace @nexteam/server run build && npm --workspace @nexteam/web run build

> @nexteam/server@0.0.0 build
> tsc -b

> @nexteam/web@0.0.0 build
> vite build

vite v5.4.11 building for production...
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                  0.34 kB │ gzip:   0.24 kB
dist/assets/index-KjISgwbE.css                  59.28 kB │ gzip:  11.15 kB
dist/assets/nexopsPaymentSchedule-CjrOuVm4.js    3.57 kB │ gzip:   1.20 kB
dist/assets/nexopsPatternLibrary-Cu0jev7W.js     8.17 kB │ gzip:   2.86 kB
dist/assets/nexopsJobs-CQopnQZO.js              16.84 kB │ gzip:   4.62 kB
dist/assets/nexopsRequests-BntkEiEi.js          25.18 kB │ gzip:   6.80 kB
dist/assets/nexopsInvoices-B1S8QjRp.js          48.57 kB │ gzip:  10.37 kB
dist/assets/nexopsQuotes-Cut9epQx.js            89.73 kB │ gzip:  17.83 kB
dist/assets/index-vtqhqM3Q.js                  463.84 kB │ gzip: 119.73 kB
✓ built in 1.73s
```

```text
✔ quote dominant action changes across core pre-approval states (1.9214ms)
✔ quote dominant action changes after approval based on whether a job snapshot already exists (0.2087ms)
✔ blocked delivery state disables send and exposes the reason on approved quotes (0.2023ms)
✔ downstream buttons stay gated with explicit reasons (1.2752ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 240.0416
```

```text
✔ request helpers treat an unreviewed intake as review-first work (0.8144ms)
✔ reviewed requests move onto the conversion rail (0.2321ms)
✔ converted requests stay read-only as intake source records (0.1952ms)
✔ request queue summary breaks out review, conversion, and archive counts (0.9899ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 217.2209
```

```text
✔ draft invoices surface send as the dominant next move (0.8902ms)
✔ open balances keep payment collection as the next move (11.7939ms)
✔ failed payment attempts switch the rail into recovery mode (0.188ms)
✔ paid invoices stop at receipt review until the package is sent (0.1493ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 227.1331
```

```text
✔ home now card prioritizes office-action jobs ahead of other queues (1.1397ms)
✔ home surfaces receipt review when money is in but customer delivery is paused (0.2144ms)
✔ home needs-attention card prioritizes failed payments before quote drift (0.2325ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 109.7241
```

Artifacts:
- `before/quotes.png`
- `after/quotes.png`
- `before/requests.png`
- `after/requests.png`
- `before/invoices.png`
- `after/invoices.png`
- `before/jobs.png`
- `after/jobs.png`
- `before/home.png`
- `after/home.png`
