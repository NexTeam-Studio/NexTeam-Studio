# NexTeam Financial Visibility Service Line Design

_Status: research + design only_
_Date: 2026-06-28_
_Trigger: after Bragi ships and proves the first service line_

## Purpose

Define a connect-don't-rebuild service line that gives field-service clients visibility into the numbers that actually matter:

- net profit
- margin per job
- which jobs and service lines make money
- where margin leaks out
- a practical "does this make us money?" operating filter

This is not an accounting product. The point is to read from systems the client already uses, normalize the data, and surface the decisions clearly.

## Strategic fit

This is a strong NexTeam candidate because it fits the core thesis better than pure marketing:

- Bragi helps clients get found.
- Financial visibility helps them survive and grow.
- Owners usually know revenue because it lands in the bank.
- Many do not know margin, labor leakage, job profitability, or true net profit.

That gap is exactly the opportunity.

## What the APIs actually expose

### Jobber

Jobber's API is GraphQL and can access or modify account data. For this service line, the read-only value is in the operational and job-level data:

- `Client`
- `Request`
- `Job`
- `Quote`
- `Invoice`
- `Expense`
- `Property`
- `TimeSheetEntry`
- `ProductOrService`

Profitability-relevant fields visible in the official schema:

- `Job.jobCosting`
- `Job.expenses`
- `Job.invoices`
- `Job.lineItems`
- `Job.paymentRecords`
- `Job.timesheetEntries`
- `Job.total`
- `Expense.linkedJob`
- `Expense.total`
- `TimeSheetEntry.labourRate`
- `TimeSheetEntry.finalDuration`
- `ProductOrService.defaultUnitCost`
- `ProductOrService.internalUnitCost`
- `ProductOrService.markup`

What Jobber is good for:

- job-by-job operational truth
- estimates, jobs, visits, invoices, and collections context
- direct labor and expense signals tied to jobs
- service-line and crew workflow context

What Jobber is not by itself:

- full accounting truth
- reconciled bank/cash truth
- complete overhead allocation
- full-company net profit unless the business truly runs all financial truth there

Conclusion: Jobber is the operational spine and can support estimated or direct gross-margin views. It is usually not the final source for company-wide net profit.

### QuickBooks Online

QuickBooks Online is the strongest direct accounting source in this stack because the Reports API already exposes the accounting rollups owners care about.

Official report surfaces include:

- Profit and Loss
- Profit and Loss Detail
- Statement of Cash Flows
- Balance Sheet
- Sales by Customer Summary
- Sales by Product/Service Summary
- Sales by Department Summary
- Sales by Class Summary
- Income by Customer Summary
- A/R Aging Summary and Detail
- A/P Aging Summary and Detail
- Expenses by Vendor
- General Ledger

Useful accounting and related entity lanes also exist for:

- invoices
- purchases
- bills
- time activity
- customers and vendors
- items/products/services
- custom fields

Project-level job costing is possible, but there is an important caveat: the QuickBooks Projects API is premium and only available to higher Intuit partner tiers, and the client company must also have Projects enabled. That means per-job profitability in QuickBooks is best if the client already uses Projects, Classes, Departments, or disciplined custom fields.

What QuickBooks is good for:

- authoritative P and L and expense truth
- cash and accrual views
- aging and collections views
- vendor spend views
- class or department level splits
- general-ledger level auditability

What QuickBooks depends on:

- bookkeeping quality
- whether projects/classes/departments are used consistently
- whether labor, materials, and overhead are actually coded in usable ways

Conclusion: QuickBooks is the accounting truth layer. If the bookkeeping is messy, the API will expose the mess clearly, but it will not fix it for us.

### Xero

Xero's Accounting API exposes accounting and related functions of the main Xero application. Relevant read surfaces include:

- Profit and Loss reporting
- invoices
- bank transactions
- journals
- chart of accounts
- contacts
- tracking categories

Important Xero strengths:

- strong accounting truth
- clean reporting surfaces
- tracking-category splits in reports
- bank-transaction visibility

Important Xero constraint:

- an organization can have only two active tracking categories and four total

That tracking limit matters. Xero can support profitability insight well, but per-job or per-service slicing depends heavily on how disciplined the client is with tracking categories and invoice coding.

Conclusion: Xero can absolutely back a financial visibility service, but its native dimensional flexibility is tighter than an open-ended custom-field or project-based model.

## What the dashboard should actually show

The dashboard should not feel like bookkeeping software. It should feel like an owner operating screen.

### 1. Owner snapshot

Top-level answers:

- revenue this month
- gross profit this month
- net profit this month
- gross margin percent
- net margin percent
- cash collected
- open receivables
- open payables
- trend vs prior month

### 2. Job profitability board

Per-job or per-project view:

- job name / number
- client
- service type
- revenue
- direct labor cost
- direct material cost
- other direct expenses
- gross profit dollars
- gross margin percent
- status: complete / in progress / invoiced / collected
- confidence flag: exact / estimated / missing-cost-data

This is the view that answers "which jobs actually made money?"

### 3. Service-line and territory breakdown

Compare:

- leak detection vs repair vs inspection vs maintenance
- service area or branch
- lead source if available
- crew or technician

This is the view that answers "what kind of work should we want more of?"

### 4. Margin leakage board

Flag patterns like:

- jobs with high revenue but weak margin
- repeat trips or extra visits
- labor-heavy jobs with low realized margin
- underpriced services
- unpaid or slow-pay invoices
- estimates sent but not won
- vendor spend spikes

This is the "where is the money leaking out?" screen.

### 5. The "does this make us money?" filter

Every dashboard dimension should be filterable through one practical operating question:

- does this service type make money?
- does this territory make money?
- does this lead source make money?
- does this crew pattern make money?
- does this pricing model make money?

This is the real product, not raw reporting.

## Clean architecture: connect and surface, do not rebuild accounting

### Principles

- Read from systems the client already trusts.
- Keep the first version read-only.
- Normalize data into a NexTeam-owned read model.
- Compute derived metrics there.
- Surface insight without pretending to be the ledger of record.

### Recommended architecture

1. Connector layer

- Jobber connector for jobs, clients, quotes, invoices, expenses, timesheets, and job-costing signals
- QuickBooks or Xero connector for accounting truth
- optional bank-feed or finance-feed connection only if the accounting system is incomplete

2. Normalized financial read model

Store normalized facts such as:

- clients
- jobs/projects
- invoices
- payments
- expenses
- labor entries
- service lines
- vendors
- chart-of-accounts mappings

Important note: this should live in a relational analytics-friendly store, not just raw Firestore documents. Firestore is fine for app config and auth state, but a profitability layer will want joins, mappings, rollups, and auditable fact tables.

3. Matching and attribution layer

Map operational and accounting records together using:

- job IDs
- invoice numbers
- customer IDs
- dates
- custom fields
- class / department / project references

This layer is where "job margin" becomes trustworthy or clearly marked as estimated.

4. Metrics engine

Compute:

- gross profit
- net profit
- gross margin percent
- job margin
- service-line margin
- territory margin
- outstanding AR/AP
- estimate-to-booking value leakage

5. Dashboard and insight layer

Surface the owner screen, margin board, and leakage board in plain language.

### Trust model

The product must show confidence honestly:

- exact: revenue and cost line up cleanly
- estimated: some costs are inferred or mapped imperfectly
- incomplete: missing accounting or labor data

That honesty matters more than pretending every number is exact.

## Aquatrace as customer zero

Aquatrace is the correct proof case because the gap is real right now.

### What Chris would need connected

Minimum useful truth set:

1. Jobber

- jobs
- clients
- quotes
- invoices
- expenses
- timesheets
- job-costing fields if enabled and populated

2. One accounting source of truth

- QuickBooks Online or Xero, whichever Aquatrace actually uses

3. Optional bank-feed visibility

- only if the accounting package is not already fully reconciled or expense-complete

### What this would answer for Aquatrace

- Which job types are actually profitable?
- Is leak detection itself high-margin or just top-of-funnel?
- Which markets or travel patterns erode margin?
- Are labor-heavy calls or repeat visits killing profit?
- Are estimates converting into the right kind of work?
- Is cash collection lagging behind booked revenue?

### What would block clean visibility

- no accounting system connected
- labor not captured reliably
- materials not tied to jobs
- inconsistent invoicing sync
- no project/class/custom-field discipline

### Honest first-version expectation

If only Jobber is connected, NexTeam can still produce a useful estimated gross-margin board.

To show true net profit confidently, Aquatrace needs an accounting truth layer as well.

## Recommended first service shape

Phase 1 should be read-only and narrow:

- connect Jobber
- connect QuickBooks Online or Xero
- build owner snapshot
- build job profitability board
- build leakage board
- add confidence flags

Do not start with:

- bill pay
- bookkeeping automation
- writebacks into accounting
- bank reconciliation
- payroll automation

That would drift into accounting software territory, which is exactly what this service line should avoid.

## Risks and reality checks

### Data quality risk

Bad bookkeeping or inconsistent job coding will surface fast. That is not a NexTeam failure, but the product has to expose confidence levels clearly.

### Trust risk

This service handles more sensitive information than content. Security, auditability, permissions, and client trust matter more here than in Bragi.

### Scope risk

There is a strong temptation to become "light accounting software." Resist it. The value is interpretation and operator visibility, not replacing QuickBooks or Xero.

## Proposed next-step questions when this service line activates

For any pilot client, confirm:

1. What is the accounting source of truth: QuickBooks, Xero, or neither?
2. Are labor costs captured in Jobber, payroll, or nowhere usable?
3. Are materials and vendor costs tied to jobs or only booked generally?
4. Are projects, classes, departments, or custom fields already in use?
5. What does the owner currently use to judge "good work" or "bad work" financially?

## Official source links reviewed

- Jobber Developer Center: <https://developer.getjobber.com/docs/>
- Jobber Getting Started: <https://developer.getjobber.com/docs/getting_started/>
- Jobber App Authorization: <https://developer.getjobber.com/docs/building_your_app/app_authorization/>
- QuickBooks Online Reports API: <https://developer.intuit.com/app/developer/qbo/docs/workflows/run-reports>
- QuickBooks Online Projects API: <https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/get-started>
- QuickBooks Online Custom Fields: <https://developer.intuit.com/app/developer/qbo/docs/workflows/create-custom-fields>
- QuickBooks Online API overview: <https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api>
- Xero Accounting API overview: <https://developer.xero.com/documentation/api/accounting/overview>
- Xero Accounting API reports: <https://developer.xero.com/documentation/api/accounting/reports>
- Xero tracking categories: <https://developer.xero.com/documentation/api/accounting/trackingcategories>
- Xero invoices: <https://developer.xero.com/documentation/api/accounting/invoices>
- Xero bank transactions: <https://developer.xero.com/documentation/api/accounting/banktransactions>

## Bottom line

The clean NexTeam play is:

- Jobber for operational and job-level context
- QuickBooks Online or Xero for accounting truth
- NexTeam for normalization, attribution, and decision-driving visibility

Do not rebuild accounting. Make the owner finally see the numbers clearly enough to run the business through profit instead of gut feel.
