# NexTeam Master Design Templates

This is the living inventory for NexTeam design architecture. It uses the terms defined in [DESIGN-HIERARCHY.md](./DESIGN-HIERARCHY.md): **Page**, **Page Template**, **Layout Part**, and **Component**.

It records what exists today, where its current source of truth lives, and whether it is global or Page-specific. A source location does not by itself make a part globally assigned; consumers determine where it is currently used.

## Page Templates

| Name | Purpose | Current source location | Current scope |
| --- | --- | --- | --- |
| `NexTeamApplicationShell` | The outer Page Template: Header area, Sidebar/navigation area, responsive drawer behavior, workspace frame, and optional first-element Hero slot. | `apps/web/src/shared/ui/NexTeamApplicationShell.tsx` | Shared foundation for NexCommand and NexSuite consumers. |
| `NexOpsRosterTemplate` | The archive/list Page Template for NexOps module roster Pages. Provides the approved Quotes-derived hero, Page action region, search/filter slot, result banner, expandable roster-record styling, and roster content region. | `apps/web/src/shared/ui/NexOpsBusinessTemplates.tsx` and `NexOpsBusinessTemplates.css` | Shared across current NexOps roster Pages; Quotes and Jobs are current consumers. |
| `NexOpsDetailTemplate` | The single-record Page Template for NexOps detail Pages. Provides back navigation, record heading, status/actions, navigation, and detail content region. | `apps/web/src/shared/ui/NexOpsBusinessTemplates.tsx` | Shared where a NexOps record-detail Page uses it. |

## Global Layout Parts

| Name | Purpose | Current source location | Current scope |
| --- | --- | --- | --- |
| `NexCommandHeader` | NexCommand’s independent global Header Layout Part: menu control, NexCommand branding, and Sign Out action. | `apps/web/src/shared/ui/NexCommandHeader.tsx` | NexCommand. |
| `NexSuiteHeader` | NexSuite’s independent global Header Layout Part: menu control, product branding, and Sign Out action. | `apps/web/src/shared/ui/NexSuiteHeader.tsx` | NexSuite consumers that use the shared product header. |
| `NexSuiteSidebar` | Shared navigation Layout Part with desktop navigation and mobile drawer behavior. | `apps/web/src/shared/ui/NexSuiteSidebar.tsx` | Assigned shared Sidebar for current NexSuite consumers; module navigation data is supplied by the consumer. |
| `ModuleHeroCard` | Reusable Page introduction Layout Part: icon, optional eyebrow, Page title, description, primary action, and optional secondary actions. | `apps/web/src/shared/ui/NexOpsBusinessTemplates.tsx` | Shared across multiple NexOps Pages and current NexCommand roster use. |

## Current Page-Owned Layout Parts

These are real visual parts of a Page, but are not yet separate shared files. They remain Page-owned until at least one additional genuine consumer needs the same behavior.

| Name | Page | Purpose | Current source location |
| --- | --- | --- | --- |
| Quote Search and Filter | Quotes Roster Page | Direct quote search, Filter accordion, multi-select status options, selected-status checks, and live result tally. | `apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx` and `quoteEngine.css` |
| Quote Results Roster | Quotes Roster Page | Centered result-count banner, white roster body, and filtered quote collection. | `apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx` and `quoteEngine.css` |
| Expandable Quote Roster Record | Quotes Roster Page | One quote banner with quote number and client; exposes title, updated time, status, amount, and Open Quote only when expanded. One record opens at a time. | `apps/web/src/features/quotes/components/quoteEngine/NexOpsQuotesPage.tsx` and `quoteEngine.css` |

## Supporting Components

Components are building blocks, not separate review-level templates unless a future request explicitly promotes one.

| Name | Purpose | Current source location |
| --- | --- | --- |
| `NexTeamProductHeader` | Generic header building block used by review and shell surfaces. | `apps/web/src/shared/ui/NexTeamProductHeader.tsx` |
| `NexOpsNavGlyph` | Standard module icon mapping, including icons supplied to Module Hero Card. | `apps/web/src/features/nexopsShell/workspaceSupport.tsx` |
| `NexOpsUiKit` | Shared buttons, banners, status pills, action rails, progress strips, and section-card primitives. | `apps/web/src/shared/ui/NexOpsUiKit.tsx` |

## Review Pages

Every new **Page Template** or **Layout Part** must receive a direct review Page in NexCommand at `Templates → Design → NexSuite → Global` before its task is complete.

| Review target | Direct route | Literal source file shown on the review Page |
| --- | --- | --- |
| Header Layout Parts | `/design-system/layout-parts/header` | `NexCommandHeader.tsx / NexSuiteHeader.tsx` |
| Sidebar Layout Part | `/design-system/layout-parts/sidebar` | `NexSuiteSidebar.tsx` |
| Module Hero Card Layout Part | `/design-system/layout-parts/module-hero-card` | `NexOpsBusinessTemplates.tsx` |
| Application Shell Page Template | `/design-system/page-templates/application-shell` | `NexTeamApplicationShell.tsx` |
| NexOps Roster Page Template | `/design-system/page-templates/nexops-roster-template` | `NexOpsBusinessTemplates.tsx` |
| NexOps Detail Page Template | `/design-system/page-templates/nexops-detail-template` | `NexOpsBusinessTemplates.tsx` |

## Naming Rule

- Use **Page** for one screen, such as the Quotes Roster Page or a single Quote Detail Page.
- Use **Page Template** for that Page’s skeleton.
- Use **Layout Part** for a reusable section placed inside a Page Template.
- Use **Component** for a smaller building block inside a Layout Part.
