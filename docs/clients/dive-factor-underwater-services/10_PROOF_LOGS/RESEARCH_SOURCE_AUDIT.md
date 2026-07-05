# Dive Factor Underwater Services - Research Source Audit

## Purpose

Audit the current Dive Factor research and B2B lead files before presenting them to Chris as decision-ready internal planning materials.

## Audit scope

- market memos
- starter B2B CSVs
- package and pricing guidance affecting launch recommendations
- safety and compliance guidance affecting launch recommendations

## Overall audit result

- Hartwell and Keowee remain the strongest source-backed phase-one markets.
- Most marina/operator business rows are based on real public URLs and are usable for internal planning.
- Some rows are not true direct B2B targets and should not be treated as equivalent to a verified marina, rental fleet, or broker business.
- Several claims are reasonable inferences from lake size, marina activity, rental activity, or luxury-waterfront context, but they are still inferences and should stay labeled as such.

## Source quality scale

- Verified: direct official business site or official government/tourism/regulatory source with a real URL
- Needs Verification: real URL exists, but the row or claim relies on an indirect page, secondary source, or contextual source rather than a direct business page
- Weak Lead: real URL exists, but the item is not a direct target business or the source is too indirect to treat as a reliable B2B target without human cleanup

## URL-status spot check

The audit used HTTP checks plus manual source review.

- Direct official marina/operator sites mostly returned usable live URLs.
- Some government or major-enterprise sources returned `403` to automated HEAD requests while still appearing to be valid public pages.
- A `403` result here is treated as "manual review needed," not automatic failure.

## Market-claim audit

### Hartwell

Strongly sourced:

- Lake scale, shoreline, and boating footprint from USACE and South Carolina DNR
- Marina footprint from USACE marina list
- Portman, Big Water, Harbor Light, and Sun Life as real marina businesses from direct business sites

Inference / assumption:

- recurring below-waterline need is inferred from marina/rental/slip activity, not directly proven by a customer-demand dataset
- premium homeowner response to bundled inspection offers is an assumption

### Keowee

Strongly sourced:

- Keowee Marina and Sunset Marina as real operating marinas from direct sites
- Visit Oconee boat-show listing as a boating-activity signal
- Duke shoreline-management page as evidence that dock/shoreline scope must stay precise

Inference / assumption:

- stronger average-ticket potential is an inference from premium-waterfront context
- second-home and luxury-owner behavior is an assumption, not a measured conversion result
- the Keowee luxury-home blog source is a contextual market signal, not an official market-study source

### Expansion markets

Usable for internal expansion mapping:

- Lake Murray, Clarks Hill / Thurmond, Coastal South Carolina, and Coastal Georgia all have real source URLs and legitimate business/activity signals

Needs human verification before being treated as strong launch-priority evidence:

- coastal markets are more operationally complex and more compliance-sensitive than the lake markets
- some coastal context rows use program/listing pages rather than direct partner businesses

## B2B CSV audit summary

### Verified target rows

Examples:

- Portman Marina
- Big Water Marina
- Harbor Light Marina
- Sun Life Hartwell Marina
- Clemson Marina
- Keowee Marina
- Sunset Marina
- Putnam's Harbor
- Timberlake Marina
- Better Boating
- Clarks Hill Marina
- Savannah Lakes Marina
- Soap Creek Marina
- Dataw Island Marina
- Jekyll Harbor Marina
- Brunswick Landing Marina

### Needs Verification rows

Examples:

- Carefree Boat Club Lake Hartwell
- Freedom Boat Club Lake Clarks Hill
- Keowee Marina Boat Rentals
- Beaufort Downtown Marina
- Lake Murray Boat Rentals

Reasons:

- indirect source page
- franchise or rental subpage rather than a direct local company profile
- state list page rather than direct operator site

### Weak Lead rows

Examples:

- Visit Oconee boating event channel
- Keowee luxury waterfront referral lane
- South Carolina Clean Marina list
- Georgia Clean Marina Program

Reasons:

- contextual partner ecosystem source rather than a direct target business
- useful for research, not strong enough as a direct outreach target without cleanup

## Duplicate and overlap findings

- `Keowee Marina` and `Keowee Marina Boat Rentals` are the same organization family and should not be treated as fully separate partner accounts.
- `Carefree Boat Club Lake Hartwell` and `Freedom Boat Club Lake Clarks Hill` are different brands, not duplicates.
- Clean-marina program/list pages are not direct business duplicates, but they are list sources rather than direct targets.

## Canonical vs supporting docs

### Canonical for Chris review

- `01_MASTER_PLAN/CHRIS_REVIEW_PACKET.md`
- `01_MASTER_PLAN/TOP_DECISIONS_NEEDED_FROM_CHRIS.md`
- `03_SERVICE_MENU_PRICING/RECOMMENDED_PHASE_ONE_SERVICE_MENU.md`
- `07_WEBSITE_SEO/RECOMMENDED_PHASE_ONE_WEBSITE_PAGES.md`
- `05_B2B_LEAD_LISTS/TOP_25_PRIORITY_B2B_TARGETS.csv`
- `11_CODEX_BUILD_QUEUE/CODEX_APPROVAL_GATE.md`
- this audit file

### Canonical planning base

- `00_CLIENT_PROFILE/CLIENT_PROFILE.md`
- `01_MASTER_PLAN/MASTER_PLAN.md`
- `01_MASTER_PLAN/SERVICE_POSITIONING.md`
- `02_MARKET_RESEARCH/RESEARCH_QUEUE.md`
- `03_SERVICE_MENU_PRICING/SERVICE_READINESS_MATRIX.md`
- `03_SERVICE_MENU_PRICING/PRICING_FRAMEWORK.md`
- `04_SOP_SAFETY_COMPLIANCE/SAFETY_BOUNDARY.md`
- `04_SOP_SAFETY_COMPLIANCE/COMPLIANCE_REVIEW_QUEUE.md`
- `05_B2B_LEAD_LISTS/B2B_LEAD_SCHEMA.md`
- `06_B2C_MARKETING/B2C_DEMOGRAPHIC_STRATEGY.md`
- `07_WEBSITE_SEO/WEBSITE_SITEMAP_PLANNING.md`
- `07_WEBSITE_SEO/SEO_KEYWORD_PLAN.md`
- `09_FORMS_CHECKLISTS/INTAKE_AND_REPORTING_NEEDS.md`

### Supporting only

- `README.md`
- `SERVICE_MENU_AND_PRICING_FRAMEWORK.md`
- `SAFETY_BOUNDARY_AND_COMPLIANCE_CHECKLIST.md`
- `B2B_LEAD_LIST_REQUIREMENTS.md`
- `B2C_STRATEGY.md`
- `WEBSITE_SITEMAP_AND_SEO_PLAN.md`
- `INTAKE_FORMS_AND_CHECKLISTS.md`
- milestone summary files
- autonomous run logs
- Codex spec files

## Conflicting or cautionary guidance found

- Lost item recovery is marked as likely ready for planning in the readiness matrix, but `OFFER_REFINEMENT_NOTES.md` positions it more as a secondary or situational offer. This is not a hard contradiction, but Chris should decide whether it is front-line or secondary.
- Marina and fleet plans have package drafts, but both the readiness matrix and safety/compliance docs keep them behind staged review. They should remain draft-only.
- Pricing anchors are internally consistent across package docs and `INTERNAL_PRICE_MENU_DRAFT.md`.
- Safety guidance is materially consistent across `SAFETY_BOUNDARY.md` and the older supporting checklist file.

## Audit conclusion

The lane is usable for Chris review if:

- Hartwell and Keowee are treated as the most trustworthy launch markets
- weak/contextual lead rows are not treated as equal to verified operator businesses
- inferred demand statements remain labeled as assumptions
- compliance-sensitive services remain held for review
