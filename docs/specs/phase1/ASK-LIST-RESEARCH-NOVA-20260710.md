# Phase 1 Ask-List Research - Nova Relay

Date received: 2026-07-10

This file captures the research packet relayed from Nova in response to the first Phase 1 ask lists. It is supporting evidence, not build approval. The master specs still require Chris's direct decisions before implementation begins.

## NexOps 3.2 Client CRM

### Confirmed Example Records

- Residential homeowner: Rachel Payne - 400 Jacobs Road, Bryson City, NC 28713.
- Contractor/client: Medallion Pool Company.
- Contractor to named homeowner/property: Caliber Pools - Anthony Owens.
- Contractor to named homeowner/property: Swim State Pool Service - Ebaugh Residence.
- Contractor to named homeowner/property: Gator Pool Builders - Todd Gregory.
- Commercial named facility: L3 Campus - Statehouse Arena.
- Corporate contact/property split: Windsor Hospitality - Renaissance Downtown Asheville Hotel.
- Community/HOA: Oleta Falls Community.
- Repeat/multiple-record candidate: The Flats at Carrs Hill.

### Findings

- The examples confirm Aquatrace needs to preserve both the paying/referring client and the actual service property/end customer.
- Nova did not confirm whether these are formal Jobber multi-property records or naming-convention workarounds.
- Requested Jobber screenshots were not found in available email/project records and must be captured directly from Jobber.
- Historical decisions were not found for display-name defaults, property labels, billing inheritance, phone/email labels, gate-code placement, gate-code visibility, or whether contractor relationships need one or two nested levels.

## NexCam 3.3 Checklist Templates

### Confirmed Asset

- Current Aquatrace Swimming Pool Leak Detection Checklist.
- Rachel Payne completed checklist.
- July 6, 2026.
- 15 pages.
- 38 of 38 tasks completed.

### Findings

- Repeated checklist exports from March-July 2026 confirm Aquatrace has a recurring base leak-detection checklist.
- Likely property-persistent fields include property identity, address, construction type, manufacturer/system, AquaGenie system, equipment configuration, unused vacuum line, and general pool-system arrangement.
- Visit-fresh fields include technician, inspection date/time, water condition, water-loss status, testing performed, pass/fail findings, defect description, diagnostic narrative, and visit photos.
- This persistent-vs-fresh split is an inference and requires Chris approval.
- CompanyCam checklist editor/template screenshots were not found and must be captured directly from CompanyCam.

## NexCam 3.1 Photo Organization

### Confirmed Seed Records

- Medallion Pool Company.
- L3 Campus.
- The Flats at Carrs Hill.
- Caliber Pools - Anthony Owens.
- Swim State Pool Service - Ebaugh Residence.
- Gator Pool Builders - Todd Gregory.
- Renaissance Downtown Asheville Hotel / Windsor Hospitality.
- Oleta Falls Community.

### Findings

- Records confirm repeat clients, contractors, and multi-site/commercial accounts need visit-level media organization.
- No screenshot or file directly proves a "bad CompanyCam pile" in a project feed.
- Product decisions were not found for CompanyCam coexistence/dual-write, default client visibility, visit naming format, or unresolved-photo review behavior.

## Remaining Blockers Before Build

- Chris must provide direct decisions for NexOps 3.2.
- Chris must provide or waive the requested Jobber screenshots.
- Chris must approve the inferred NexCam persistent-vs-fresh field split.
- Chris must provide direct decisions for NexCam photo visibility, visit naming, CompanyCam coexistence, and unresolved-photo handling.
- Chris must provide or waive the requested CompanyCam screenshots.
