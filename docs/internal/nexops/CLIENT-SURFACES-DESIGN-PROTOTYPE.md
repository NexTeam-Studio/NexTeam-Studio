# Client Surfaces Design Prototype

## Scope

This prototype intentionally applies to the NexOps Client Roster and Client Details only. It is a reviewable direction, not a mandate to restyle the rest of NexOps.

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

1. Branded workspace header
2. Lime primary action
3. Soft secondary action
4. Rounded light data card
5. Labeled mobile record card
6. Status pill
7. Sticky, horizontally scrollable mobile section tabs without nested content scrolling
8. Communication spotlight card

Broader use of these primitives remains gated on Chris's visual review of this prototype.
