# NexSuite Design

Status: Ready for component worktree use.

## HOW

Provides reusable visual design and presentation without owning business rules. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

## Shared page-opening rule

Every NexTeam product page opens with its page name and a matching icon immediately to the left of that name. The NexOps Home title is the visual standard: the same title scale, weight, color, left alignment, and opening spacing apply across pages. Each feature lane owns applying the rule within its pages; Global owns the shared rule, shell, and icon vocabulary.

- Use the page's existing navigation icon whenever one exists.
- When a page has no associated icon, its feature lane must add a clear, simple icon that describes that page before implementing the heading.
- The heading icon and page name describe the page itself, not the tenant or product brand.
- This rule applies to every new page immediately. Existing pages are a required migration, not an optional future refinement; Integration verifies the combined result.

### Rollout instruction to every UI lane

Before returning an existing page for review, its owning lane must replace its opening title treatment with this shared standard. This instruction applies to Platform Tenants; Clients; Client Details; Requests; Quotes; Jobs; Visits; Schedule; Invoices; Payments; Receipts; Settings; Users; NexCam; NexDocs; NexReach; NexPortal; Nexi Chat; Nexi Voice; and NexTeam Mobile. If the lane exposes more than one page, apply the standard to each page it owns.

## Shared interface capitalization rule

Every named interface area uses standard title capitalization. This applies to page names, page-opening headings, card and panel names, tabs, menu items, buttons, filters, and labels that name a distinct NexTeam area or action.

- Capitalize meaningful words: `Job Value This Week`, `Handle the Next Few Hours`, `Build a Quote`, `Job Roster`, `Ready to Place`, `Day`, `Week`, `Month`, `List`, `All`, `Today`, and `Upcoming`.
- Keep short joining words lowercase unless they are the first or last word: `a`, `an`, `the`, `and`, `as`, `at`, `but`, `by`, `for`, `from`, `in`, `of`, `on`, `or`, `to`, `with`.
- Keep ordinary explanatory copy in sentence capitalization: `No new intake is waiting right now.`
- Product names retain their locked spelling: NexTeam, NexOps, NexCam, NexDocs, NexPortal, NexReach, Nexi, and NexSuite.
- Each feature lane applies the rule to its current screens. Every new screen must follow it before review; Integration verifies the combined result.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
