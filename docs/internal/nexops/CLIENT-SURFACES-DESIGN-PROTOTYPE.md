# Client Surfaces Design Prototype

## Scope

This prototype began with the NexOps Client Roster and Client Details. Quotes are the first controlled proof that the resulting page architecture can be reused without creating a second visual system. Broader rollout remains subject to owner review.

## Research principles retained

- Jobber's official client guidance keeps the client as the stable starting point, places the most useful contact/action context near the top, and separates Client, Work, Notes, and Files into easy-to-learn areas.
- Jobber's request and quote workflows preserve client context and make workflow status easy to scan. NexOps retains that behavior through the existing client-context actions and relationship rails.
- ServiceTitan's customer/location material distinguishes the billing customer record from the service location and its historical work. NexOps retains its stronger Client → Property hierarchy rather than flattening property into client identity.
- ServiceTitan Field Mobile guidance favors a compact, high-signal operational header and direct field actions. The mobile Client Details summary keeps contact, directions, balance, and Create within immediate thumb reach.

Official sources reviewed:

- Jobber Help Center — Client Information in Jobber App
- Jobber Help Center — Requests in the Jobber App
- Jobber Help Center — Quotes in the Jobber App
- Jobber Help Center — Notes and Attachments
- ServiceTitan Help Center — Customer and Location Records Overview
- ServiceTitan Help Center — Manage Customer and Location Profiles in Contact Center Pro
- ServiceTitan Help Center — Explore Job Details and Actions in Field Mobile App

## NexTeam design decisions

- Use the dark navy/teal to green gradient only for identity headers and featured work surfaces.
- Use the lime to bright-green gradient only for clear primary actions and selected controls.
- Keep normal content surfaces light, spacious, and high contrast; do not gradient every record row.
- Use rounded cards, pill controls, and soft shadows as reusable NexTeam primitives.
- On mobile, replace wide data tables with labeled record cards instead of nested horizontal scrolling.
- Keep Client identity separate from Property/service location, and retain quick access to Work, Notes & Communications, and Files.
- Keep the highest-value communication history visible from the overview with a direct See all route to detailed history.

## Candidate Design Contract primitives

## Shared application shell

All first-party NexTeam application workspaces use the shared application-shell
contract. The contract owns the top header, primary sidebar, workspace frame,
content gutters, responsive collapse, and primary navigation treatment. Product
areas may supply their own identity, tenant context, navigation items, and
business content, but may not fork the shell without an owner-approved
architecture exception. `NexTeamApplicationShell` is the reusable React
structure; the shared header is supplied by `NexTeamProductHeader`.

1. Branded workspace header
2. Lime primary action
3. Soft secondary action
4. Rounded light data card
5. Labeled mobile record card
6. Status pill
7. Sticky, horizontally scrollable mobile section tabs without nested content scrolling
8. Communication spotlight card

Broader use of these primitives remains gated on Chris's visual review of this prototype.

## Owner-refinement rules

- Treat the dark navy/teal-to-green banner as a product-family surface, not a one-off page hero. It carries white secondary copy, lime headings, and restrained radial highlight only on major workspace headers and Create/review overlays.
- Use the lime-to-green gradient only for the primary action or selected control. Secondary actions stay white or translucent, rounded, and calm.
- Client tabs, mobile buckets, section cards, record rows, and empty states share the same rounded rhythm: dark navigation shell, clean light content, and a clear selected state.
- A Client Details workspace begins with a compact back bubble. The route determines its destination; the default is **Back to Client Roster**. The bubble is subordinate to Client identity and the Create action.
- Empty states are bordered, readable surfaces with a next-step explanation. Never leave an isolated line of faint text as the only state signal.
- NexOps headers follow the NexCommand family layout: platform and product identity form a compact lockup, tenant branding remains adjacent but subordinate, and account actions use evenly sized translucent bubble controls with lime focus feedback.
- Primary Client navigation and every subsection group follow one pattern: a dark rounded navigation shell, a short section label, and compact pill controls. Equivalent Client, Work, Notes, and Files structures must not receive bespoke visual treatments.
- Opening a different Client is a new workspace entry. It resets document scroll position to the Client identity header; back/refresh behavior otherwise remains browser-native and predictable.
- Create and Edit Client are part of the Client workspace, not standalone forms: they use the branded header/back bubble, rounded grouped form sections, clear labels, and the shared lime primary CTA.

## Owner-cleanup additions

- Desktop and mobile Client forms use the same workspace family: a branded entry header, one clear back bubble, light grouped form cards, and a dedicated action rail. Validation/help copy never shares a row with Save/Create controls.
- Disabled primary actions retain the approved rounded shape and readable contrast. A disabled state communicates what remains required; it must never resemble a broken or invisible control.
- Client Roster rows prioritize the Client name, primary contact/location, a compact status pill, and one quiet open affordance. Generic metadata such as “Native record” is not a primary visual destination.
- Section-pill navigation may wrap at narrow widths inside its dark navigation shell. It must not expose half-clipped controls or create a nested scroll trap.
- A floating Create/Nexi control is hidden while a full Client form or creation overlay is active. Content reserves safe-area spacing so persistent controls never cover the form action rail.
# Owner refinement: shared Client-workspace contracts

- **Header contract:** NexOps uses the same compact, dark NexCommand-family header structure: a grouped product lockup on the left, the authoritative tenant mark in its own bounded region, and evenly sized rounded utility bubbles on the right.
- **Tenant branding contract:** Product shells resolve the configured tenant logo through the same tenant-branding record and cache revision used by NexCommand; no product may introduce a second tenant logo setting.
- **Roster identity contract:** A roster record starts with one restrained dark teal-to-green identity banner, then presents operational detail in a clean light body.
- **Sub-rail header contract:** Primary Client subsection cards use the same dark branded section banner, lime eyebrow, high-contrast title, and readable contextual action where it improves orientation.
- **Overlay contract:** Create pickers and drawers reserve mobile safe-area space at both top and bottom so their identity, Close control, and first action are visible without an upward scroll.

## NexOps Roster and Detail Template Contract

- **Roster template:** Primary business rails use the same NexCommand-family hero, one obvious primary Create action, summary metrics when meaningful, search/filter controls, and a clean scan-first list or card body. Each record keeps a branded identity region separate from its light operational detail body.
- **Detail template:** Business-object details start with a contextual back bubble, a branded identity/status banner, focused primary actions, rounded navigation pills, and light related-record cards. It is the page architecture, not a demand for identical object fields.
- **Quote Builder contract:** Quote creation is a focused commercial workspace: Client context, Products & Services, pricing, deposit, message/terms, and Save Draft / Review & Send. Request intake remains linked but is not rendered as quote-builder clutter.
- **Catalog contract:** Products & Services are tenant catalog records with code, name, description, category, price, taxability, visibility, and source. A Quote Builder can add an authorized reusable catalog item or a quote-only custom line; neither path creates duplicate Client records.
- **Navigation and mobile contract:** Major template controls wrap or scroll intentionally inside their own labeled strip; content itself never depends on a nested horizontal scroll region. Major actions remain thumb reachable and clear mobile safe areas.
- **Reuse-first enforcement:** New major business-object roster/detail work must consume `NexOpsRosterTemplate` / `NexOpsDetailTemplate` or document a concrete architecture exception in its implementation and acceptance evidence. Splinter acceptance treats an undocumented bespoke header/card/back-navigation pattern as incomplete UI acceptance.
