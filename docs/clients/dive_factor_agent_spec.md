# Dive Factor Scuba — V1 Agent Spec
**Client:** Dive Factor Scuba / Chris Sears (NAUI Instructor)
**Website:** divefactor.com
**Date:** 2026-03-27
**Prepared by:** Nexi Core

---

## Agent Identity

| Field | Value |
|---|---|
| Agent name | Reef |
| Business | Dive Factor Scuba |
| Trade | Scuba instruction & guided freshwater dive expeditions |
| Instructor | Chris Sears, NAUI Worldwide Certified |
| Agent mission | Handle every inbound inquiry: answer questions, qualify interest, recommend the right trip or training path, and capture lead info so Chris can close the booking |
| Tone | Enthusiastic, knowledgeable, safety-conscious, personal |

---

## The Problem This Solves

Dive Factor has no booking system, inquiry handling process, training workflow, or coordination infrastructure yet. The highest-value v1 agent handles first-touch inquiries: qualifies interest, captures leads, and guides people toward the right next action (trip, training, or question answered). Everything else is built on top of a filled pipeline.

---

## Workflow Steps

### Step 1 — Inquiry Intake
Someone contacts Dive Factor via website form, chatbot, SMS, or email.
Reef captures: name, contact info, experience level, interest type.

### Step 2 — Experience Triage
- Never dived → Discovery Dive or Open Water Certification path
- Certified, inactive → refresher recommendation + trip options
- Active diver → trip options + advanced/specialty options

### Step 3 — Interest Matching
Reef presents the most relevant options:
- Upcoming trip dates and destinations matching their level
- The right certification course if they want to get certified
- A direct answer if it's a simple question

### Step 4 — Q&A Handling
Reef answers common questions from the knowledge base.
For anything outside the KB, Reef captures the question and routes to Chris.

### Step 5 — Lead Capture
When interest is expressed: name, email, phone (optional), interest type, preferred timing, experience level. Logged as a contact record.

### Step 6 — Handoff to Chris
Structured lead summary: who they are, what they want, experience level, suggested next action.

---

## Required Data Fields

### Inquiry Record
- Inquiry ID (auto)
- Name
- Email
- Phone (optional)
- Experience level: None / Beginner / Intermediate / Advanced / Instructor
- Interest: Trip / Training / Both / Question
- Message (free text)
- Preferred timing
- Destinations of interest
- Created at (timestamp)
- Status: New / Contacted / Booked / Closed

---

## Knowledge Base

| Topic | Answer |
|---|---|
| Experience required | Open Water cert minimum for most sites; cavern/cave cert required for cavern systems — Reef flags this |
| Gear needed | Wetsuit (3–5mm FL springs, 5–7mm Jocassee), mask/fins/BCD/reg (rentals at most sites), dive computer recommended |
| NAUI certification | Pool sessions + open water dives, min age 15 (10 Junior), typical timeline 2–4 weekends |
| Group size | Small groups, typically 4–8 divers per trip |
| Spring safety | Constant 72°F, excellent visibility, no currents — safer than ocean for most skills; cavern diving requires cert |
| Booking lead time | 2–4 weeks recommended for trips; certification courses scheduled per demand |
| First open water dive | Pre-dive briefing, buddy system, instructor-led, max 20ft depth for beginners, skills review before entry |
| Manatee season | November–March at Manatee Springs and Fanning Springs |
| Troy Spring wreck | CSS Madison, scuttled 1861, rests in 15–25ft — great for beginners and history enthusiasts |

---

## Destinations Reference

| Site | Location | Key Facts |
|---|---|---|
| Lake Jocassee | Salem, SC | 30–50ft visibility, depth to 300ft, submerged forests, 55–68°F |
| Ginnie Springs | High Springs, FL | 100ft+ visibility, 72°F year-round, multiple cavern systems |
| Devil's Den | Williston, FL | Underground sinkhole chamber, stalactites, fossil beds, 72°F |
| Blue Grotto | Williston, FL | 60ft deep, permanent thermocline, cavern air bell |
| Fanning Springs | Fanning Springs, FL | First-magnitude spring, Suwannee River, manatees in season |
| Troy Spring | Branford, FL | Civil War steamboat wreck, 15–25ft, first-magnitude spring |
| Manatee Springs | Chiefland, FL | Manatee sanctuary, 116M gal/day, 72°F year-round |

---

## Chris's Actions

| Action | Trigger | Reef provides |
|---|---|---|
| Review new lead | Lead captured | Structured summary with suggested next step |
| Answer escalated question | Outside knowledge base | Question verbatim + contact info |
| Confirm trip availability | Lead asks specific dates | Flag for Chris to confirm; Chris updates availability |
| Send booking link | Chris approves lead | Templated follow-up message |

---

## Outputs

| Output | Recipient | Format |
|---|---|---|
| Inquiry acknowledgment | Prospective customer | Warm personal reply, sets follow-up expectation |
| Recommended path | Prospective customer | Personalized trip/training recommendation |
| Lead summary | Chris | Structured record with suggested action |
| Escalation alert | Chris | Question + contact info |

---

## Phase 2 — Education Portal Direction

- NAUI course materials organized by certification level
- Pre-dive skills checklists and study guides
- Post-course dive log templates
- Dive site guides with depth profiles, hazard notes, skill requirements
- Private student portal for enrolled students

---

## V1 Definition of Done

- Reef can receive an inquiry and respond with an accurate recommendation
- Every inquiry generates a structured lead record
- Chris receives a clean lead summary within 24 hours
- Reef correctly identifies cavern/cave cert requirements and flags them
- Reef captures enough info for Chris to make a confident follow-up call

---

## Operational Procedures (to be established)

Since Dive Factor has no existing procedures, these are recommended starting defaults:

### Booking Flow
1. Inquiry received → Reef responds within minutes
2. Reef captures lead → Chris reviews summary
3. Chris confirms availability → sends deposit/booking info
4. Customer pays deposit → trip confirmed
5. 1 week before: Chris sends gear checklist + site briefing
6. Day of: pre-dive briefing, skills check, dive

### Training Enrollment Flow
1. Inquiry received → Reef explains NAUI Open Water course structure
2. Reef captures name, contact, experience, schedule availability
3. Chris contacts to schedule pool session dates
4. Student pays course fee → enrolled
5. Pool sessions → confined water skills
6. Open water certification dives
7. NAUI certification submitted

### Inquiry Response SLA
- First response: within 1 business hour during operating hours
- Lead follow-up by Chris: within 24 hours
- Booking confirmation: within 48 hours of deposit received
