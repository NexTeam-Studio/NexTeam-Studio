# Phase 1 Ask-List Decisions - Chris

Date started: 2026-07-10

This file records Chris's direct answers to the Phase 1 ask lists. These decisions unblock implementation only for the specific item answered; unanswered ask-list items remain blocked.

## NexOps 3.2 Client CRM

### Decision 1 - Client Display Name

When a client record has no company name, NexOps displays the person as `First name Last name`.

When a company name is added, NexOps defaults the forward-facing display name to the company name.

The entry person must be able to toggle the forward-facing display back to `First name Last name` while preserving the company name field on the record.

Implementation implication: store contact identity, company name, and display preference separately. Do not overwrite or discard company name when person-name display is selected.

### Decision 2 - Property Label Format

NexOps displays property labels as `Site Name - Street Address` when a site/property name exists.

If no site name exists, NexOps displays the street address alone.

The property UI must allow the entry person to add a site name later at that property/location.

Implementation implication: store `siteName`/`propertyName` separately from the address. Do not bake site names into address fields or rely on address text parsing to recover them later.

### Decision 3 - Billing Address and Correspondence

New client/property entry defaults to a checked option: `Billing address is the same as property address`.

If the box is unchecked, NexOps allows a separate billing address to be added.

For multi-site clients and contractors, the parent client has one billing address. Billing correspondence goes to the parent client email/contact, not the property/site contact email.

Example: Mulberry Farms may have its own site email/contact, but Aquatrace billing and ordinary client correspondence for the contractor account should still go to the parent client contact email unless explicitly changed later.

Implementation implication: model parent-client billing contact/address separately from property/site contacts. Property contacts can exist for access/on-site coordination without becoming the billing/correspondence destination.

### Decision 4 - Phone and Email Labels, SMS Eligibility

For now, NexOps uses fixed communication labels instead of fully custom labels.

Phone labels should follow the Jobber-style fixed list shown in the screenshots: `Main`, `Work`, `Mobile`, `Home`, `Fax`, `Other`.

Email labels should follow the fixed list shown in the screenshots: `Main`, `Work`, `Personal`, `Other`.

Phone numbers may be allowed to receive text messages, but NexOps must recognize whether a number appears to be a valid cell/SMS-capable number versus a landline or fax and prompt the entry person accordingly.

Each automated correspondence can use email, text message, or both. The entry person can choose the channels independently per client/correspondence type.

NexOps v1 SMS behavior follows Jobber's current model: outbound one-way SMS by default. Two-way SMS can be supported later as an upgraded capability, but v1 must not imply that inbound replies are being read unless that tier is explicitly enabled.

Implementation implication: store `receivesMessages` per phone number, not just per client. Store channel preferences as `email`, `sms`, or `both` at the contact/client communication-settings level. Validate and normalize phone numbers before enabling SMS. If a number looks like a landline, fax, invalid number, or unknown type, show a plain-language prompt before allowing SMS messaging to be enabled. Mark SMS as one-way unless the tenant later enables a two-way SMS provider/tier.

### Decision 5 - NexOps Hosting Location

NexOps is part of the hosted NexTeam product, not a local-only server.

Development runs locally when building. Owner/team access runs through the hosted NexTeam web app/API environment, currently Railway staging with Firebase services behind it. Future production remains a hosted web service, with native mobile support later through M11.

### Decision 6 - Gate Code and Site Access Visibility

Gate codes and site access notes are visible to OWNER and OFFICE_ADMIN roles at any time.

TECHNICIAN users can see gate codes and site access notes only when they are assigned to the relevant job/property/visit.

Implementation implication: store gate/access fields on the property/site record, but gate their read access through AccessContext. Do not expose these fields in broad tenant client lists or unassigned technician caches.

### Decision 7 - Contractor and Multi-Site Hierarchy Depth

NexOps supports a two-level hierarchy now: parent client -> named site/facility -> address/location.

Examples:

- `L3 Campus -> Statehouse Arena -> address/location`
- `Medallion Pool Company -> Mulberry Farms -> 1126 Upper Thomas Branch Road`

Implementation implication: do not model properties as only a flat list under a client. The data model must allow a parent client to own named sites/facilities, with one or more concrete service locations/addresses under that site where needed. Simple homeowner clients can still collapse to one site/location without forcing extra UI complexity.

### Decision 8 - Jobber Screenshot Sufficiency

The Jobber screenshots already provided by Chris are sufficient to start the NexOps 3.2 Client CRM foundation build.

If implementation uncovers a specific missing visual/reference gap, Atlas may ask for that exact screenshot later, but the initial build is no longer blocked on more screenshots.

Implementation implication: treat the supplied screenshots as the v1 UI reference set for client overview, properties, billing, payment methods, client schedule, files/media, new-client entry, communication settings, and contact editing.

## NexOps 3.2 Ask List Status

Status: answered enough to begin implementation.
