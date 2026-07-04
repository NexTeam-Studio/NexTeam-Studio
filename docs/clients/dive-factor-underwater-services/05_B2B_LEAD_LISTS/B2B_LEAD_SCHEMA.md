# Dive Factor Underwater Services - B2B Lead Schema

## Purpose

This file defines the Google-Sheets-ready schema for future B2B lead building.

No outreach is approved from this lane yet.

## Required columns

| Column | Purpose |
| --- | --- |
| lead_id | stable row identifier |
| market | launch or expansion market |
| county_or_area | local area reference |
| business_name | operator or partner name |
| category | lead segment |
| website | public website |
| phone | public phone |
| email | public email only |
| address | public business address |
| contact_name | public contact if available |
| decision_maker_role | owner, manager, dockmaster, broker, etc. |
| service_footprint | area served or route coverage |
| asset_footprint | marina slips, fleet type, docks, listings, properties, etc. |
| fit_notes | why this lead matters |
| source_url | proof source |
| source_date | date source was captured |
| source_type | website, directory, map listing, tourism source, etc. |
| last_verified_date | internal verification date |
| status | research status |
| notes | freeform internal notes |

## Controlled values

### category

- marina
- rental_fleet
- boat_club
- dock_builder
- real_estate
- vacation_rental
- repair_shop
- broker
- hoa_poa
- guide_charter
- restaurant
- campground_resort
- marine_surveyor
- insurance_adjuster

### status

- unresearched
- researched
- shortlisted
- approved_for_future_outreach
- hold

### market

- hartwell
- keowee
- murray
- clarks_hill_thurmond
- coastal_sc
- coastal_ga

## Data rules

- every row needs a source URL
- no guessed emails
- no private data from gated systems
- keep rows clean for Google Sheets import and filtering
