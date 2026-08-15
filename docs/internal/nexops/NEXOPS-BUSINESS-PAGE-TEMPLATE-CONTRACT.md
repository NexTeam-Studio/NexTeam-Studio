# NexOps Business Page Template Contract

## Purpose

Major NexOps business-object rails use one recognizable page architecture. The approved Client workspace is the visual and interaction reference; Quotes is the first non-Client implementation. A new rail must reuse these primitives or record a narrowly scoped architecture exception.

## Roster template

A roster provides the NexCommand-family product header, authoritative tenant brand mark, branded object banner, primary create action, optional metrics, search/filter/sort controls, readable identity-first cards or rows, status and secondary metadata, open action, and intentional loading, empty, and error states. Identity is branded; the detail body stays light and scan-friendly.

## Detail template

A detail provides the contextual back bubble, NexCommand-family header and tenant branding, object identity/status banner, primary action area, main navigation pills, grouped subsection navigation, branded subsection banner, light content cards, related history, communications, and files. Opening a newly selected record resets the workspace entry position to its identity region.

## Shared visual rules

- Use dark navy/teal-to-green gradients for significant identity or section headers, not every card.
- Use lime-to-green gradients for the primary CTA, with rounded bubbles and pills for equivalent controls.
- Resolve tenant logo and brand assets from the same authoritative tenant configuration used by NexCommand.
- Keep strong headings, high contrast white/soft-gray text on dark surfaces, and clean light content bodies.
- Reuse the shared `NexOpsRosterTemplate` and `NexOpsDetailTemplate` primitives before adding page-specific layout CSS.
- Major subsection cards use a branded header/banner only where it improves hierarchy; their actions remain readable and reachable.
- Mobile must honor safe areas, wrap or deliberately scroll navigation without clipped controls, avoid nested-scroll traps, and retain reachable actions.

## Quote Builder specialization

Quote creation is a focused builder: selected Client and service location, products/services, pricing, deposits, message/terms, Save Draft, and Review & Send. Request/intake relationships remain authoritative but unrelated intake fields do not clutter the builder. The Products & Services picker is backed by the tenant catalog; newly created catalog entries are tenant settings records rather than quote-only data.

## Splinter governance

Work for a major NexOps business object (Clients, Requests, Quotes, Jobs, Visits, Invoices, Payments, or Tasks) is not eligible for selection unless its source requirements reference this contract or a documented `architecture-exception:nexops-business-page-template`. This is a reuse-first design gate, not a second controller.
