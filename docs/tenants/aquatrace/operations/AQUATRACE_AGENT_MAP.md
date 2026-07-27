# Aquatrace Agent & Automation Map
Reference roadmap for NexTeam's build-out of the Aquatrace workflow. DO NOT BUILD until the current target (Bragi GBP post generation) ships. This is the standing blueprint for what gets built next, in what order.

## Core principle
Most of the workflow is PLUMBING (fixed steps, no judgment - plain automation). Only a few steps are AGENTS (need real judgment - a brain). Build the fewest agents possible. Default every step to dumb plumbing unless it genuinely needs to think.

## The map (request -> paid receipt)

### 1. Intake front-door - PLUMBING (foundational)
- Problem: Jobber's customer-facing intake form collects pool type, pool size, and "more details," but Jobber does NOT transfer those fields into the job. It only carries name, address, phone, email.
- Fix (preferred): an EXTERNAL form becomes the real front door. It captures ALL customer detail into NexTeam's own system, then pushes only the slim fields Jobber needs into Jobber ("reverse flow"). Full rich data lives in NexTeam where agents can read it; Jobber is demoted to scheduling/invoicing backend.
- Why it matters: this is foundational - the Intake Screener agent (below) needs this rich data to work. Build this BEFORE the Screener.
- Bonus: reduces Jobber lock-in (long-term goal). Own the front door; vendor is swappable.

### 2. Mileage calculation - PLUMBING + human override
- Rule: serve 50-mile radius. Over 100 miles round trip = "extended mileage," charged at $2.50/mile.
- Plumbing part: client address into Maps + Chris's address into Maps -> distance -> apply formula. Fully automatable. Flag the result for one-click approval.
- Brain-spark (KEEP HUMAN): Chris sometimes waives, adjusts, reroutes, or applies zone exceptions. That override stays a human decision - do NOT automate it. Plumbing calculates the standard charge; Chris approves/overrides in one click.

### 3. Intake Screener - AGENT (the one true operational agent)
- Job: read each incoming request and decide: CLEAN job -> route straight to scheduling (plumbing). FLAGGED job -> kick to Chris with the reason.
- Flag triggers (judgment): missing/unclear info; commercial/VGB job (more complex); something off or unusually large.
- This is the only real operational brain-spark in the workflow. Build it AFTER the intake front-door exists (needs the rich data).
- Note: most jobs come in clean enough to schedule without a call, so the Screener mostly passes things through and only catches the ~10% that need Chris's eyes.

### 4. Schedule clean jobs - PLUMBING
- Clean jobs flow to scheduling automatically. No agent.

### 5. Dispatch / routing - PARKED (future agent, growth-triggered)
- Now: Chris dispatches. Techs are Chris + Logan. With 1-2 people, "who goes" is trivial - NOT an agent yet.
- Build a dispatch/routing agent ONLY when crew grows enough that assignment becomes a real puzzle. Building it sooner = over-engineering.
- Trigger to build: crew expansion, which depends on Aquatrace marketing producing organic traction (= why Bragi comes first).

### 6. Job close / invoice / payment / receipt - PLUMBING (already working)
- Close job + invoice in Jobber on site. Payment via card on file (sometimes cash/check). Jobber sends receipt, survey, and one Google review request. This works - leave it alone.

### 7. Document package - PLUMBING (high value)
- Same document set every job (confirmed - no judgment). Pure gather-and-attach.
- Sources: report (CompanyCam), measurements (Moasure), calculator PDF (the website evaporation/leak calculator), plus several standard docs.
- Current pain: Chris manually saves all to Dropbox and manually resends a zero-dollar invoice with reports/docs attached, on site, at end of job (where things slip).
- Fix: automate the gather -> Dropbox -> stage zero-invoice-with-attachments. No agent needed.

## Build order (after Bragi ships)
1. Bragi (marketing/content) - IN PROGRESS. Drives organic traction -> unlocks growth.
2. Intake front-door (plumbing) - must come before the Screener.
3. Intake Screener (the one agent) - needs the front-door data.
4. Plumbing automations: mileage calc + one-click override, document package.
5. Dispatch agent - only when crew growth makes it a real decision.

## Scaling note
This map is for Aquatrace (proven first client). The skeleton (front-door -> screen -> schedule -> dispatch -> complete -> document/bill) is the reusable template for future NexTeam clients. Build once for Aquatrace, then fill per client.

## Discipline reminder
One target at a time. Nothing here gets built until Bragi ships. Default to plumbing; reserve agents for genuine judgment. Don't spawn agents where a pipe will do.

## GBP Location & Service-Area Strategy (preserve - do not act without review)

### The governing rule
The profile follows the STAFF, not the plan. Google allows a separate Google Business Profile only for a location where someone is genuinely BASED/STATIONED (a real staffed branch). It does NOT allow separate profiles for cities you only TRAVEL to from an existing base - that is a spam pattern and risks suspension. Business structure (franchise vs. in-house branch) doesn't matter to Google; what matters is whether a person's work home-base is physically in that area. An in-house company branch with a local manager stationed there DOES qualify for its own profile.

### The test for any new location
Ask: "Is there a person whose work home-base is that location?"
- YES -> eligible for its own profile (staffed branch).
- NO, we drive there for jobs -> it's a SERVICE AREA on an existing profile, not a new profile.

### Current state (as of this session)
- Fair Play SC - real base, Chris operates from there. Legitimate profile.
- Gainesville FL - existing profile, several years old, stable, producing posts + reviews. DECISION: LEAVE IT UNDISTURBED. Do not edit, "fix," or re-verify it. A working profile flying under the radar is an asset; poking it can trigger a review. Do NOT treat Gainesville's success as proof the travel-city-profile model is safe to replicate.
- Myrtle Beach SC, Charleston SC - verified profiles under the account.

### Expansion plan (travel markets: Tallahassee, Panama City, Pensacola, Jacksonville, St. Augustine, Daytona, Cocoa Beach, Orlando)
- For now these are TRAVEL markets (Chris + Logan drive in as needed). Correct tool = SERVICE AREAS on existing profiles, NOT new profiles.
- Gainesville profile can carry the FL-east/central service areas (Jax, St. Augustine, Daytona, Cocoa, Orlando - within range).
- Far-west FL (Tallahassee, Panama City, Pensacola) - assign to closest base or flag as a stretch; don't over-spread.
- Google limit: 20 service areas per profile. List where work is ACTUALLY performed consistently, not a wishlist. Tighter = more defensible.
- A new BRANCH profile (e.g. Jax-to-Cocoa territory under Logan) is created ONLY when that staff presence is actually real - i.e., when Logan is physically based there running it. The profile is EARNED by the staffing existing, not created in advance to "set up the territory." 2026 verification often requires video showing branded materials, tools, vehicle, and presence in that area - which can't be produced for a territory nobody operates yet.

### Critical risk note
The danger is not Gainesville sitting quietly. The danger is that creating new profiles (or editing existing ones) draws Google's attention to the whole account and can trigger a sweep that exposes older technically-noncompliant profiles. Creating several new profiles in a burst also trips spam detection (too many verification requests at once). Therefore: fewer, realer profiles + service areas for travel. Each new profile must be genuinely defensible (real stationed staff) because adding it invites scrutiny.

### Sequencing
1. NOW (safe, anytime): add travel cities as SERVICE AREAS on existing profiles. Findable everywhere Aquatrace actually drives, zero suspension risk.
2. LATER: create a branch profile per new market ONLY when real local staff are stationed there. Give each a UNIQUE description + location-specific posts (never copy-paste - duplicate content suppresses all profiles).
3. This entire GBP expansion is downstream of the locked current target (Bragi -> organic traction). Organic traction is what makes staffed expansion possible. Do not build franchise/branch GBP structure ahead of the staffing being real.
