# NexTeam Client Onboarding Automation Playbook

_Status: design only_
_Date: 2026-06-28_
_Trigger: client #2-3, when manual onboarding becomes the bottleneck_

## Purpose

Document the ideal sequence for spinning up a new NexTeam client and mark each step as:

- API-automatable
- requires-human
- requires-Chris-decision

This is a playbook for later automation, not a build spec to execute right now.

## Core principle

Automate the rails, not the judgment.

- Rail work: account creation, config scaffolding, DNS/API setup, WordPress setup, OAuth connections, test calls, record creation.
- Human work: access handoff, brand review, design review, legal/compliance review, approval of live changes.
- Chris-decision work: offer/package choice, service priority, positioning, branch/location choices, launch order.

## Success definition

A client is "onboarded" when:

- the digital foundation exists
- the right source systems are connected
- Bragi knows what it is allowed to say and do
- the approval path is defined
- the first live-safe workflow can run without improvisation

## Ideal sequence

### Phase 0 - close, scope, and authority

1. Confirm the client package and first priority use case.
   - Lane: requires-Chris-decision
   - Notes: choose what goes live first: Bragi article lane, GBP lane, intake, follow-up, or another agent.

2. Collect the canonical onboarding inputs.
   - Lane: requires-human
   - Notes: use the existing checklist in `nexteam-client-onboarding-input-checklist.md`.

3. Confirm who can approve content, integrations, DNS, hosting, and billing.
   - Lane: requires-human
   - Notes: do not start setup work without a real authority map.

4. Confirm whether NexTeam is using the client's existing web stack or provisioning a new one.
   - Lane: requires-Chris-decision

### Phase 1 - identity, brand, and boundaries

5. Gather business identity basics.
   - Lane: requires-human
   - Includes: business name, domain, service area, locations, phone, email, office address.

6. Gather brand and claims boundaries.
   - Lane: requires-human
   - Includes: tone, regulated claims, forbidden promises, proof points, approval sensitivity.

7. Gather service catalog and service-area truth.
   - Lane: requires-human
   - Includes: what they really do, where they really operate, what they do not want pushed.

8. Decide which channels go live first.
   - Lane: requires-Chris-decision
   - Examples: WordPress only, GBP only, both, or content draft-only first.

### Phase 2 - domain, DNS, Cloudflare, and hosting

9. Decide domain strategy.
   - Lane: requires-Chris-decision
   - Options: keep existing domain, add subdomain, buy new domain, or stage on temporary domain.

10. Obtain registrar access or delegate DNS authority.
   - Lane: requires-human

11. Create or connect the Cloudflare zone.
   - Lane: API-automatable once access exists
   - Future automation: zone creation, record import, cache/security defaults.

12. Point nameservers if moving DNS to Cloudflare.
   - Lane: requires-human
   - Notes: registrar control is the usual blocker.

13. Choose hosting lane.
   - Lane: requires-Chris-decision
   - Options: existing host, new shared host, VPS, managed WordPress.

14. Provision hosting account, site container, SSL, and server access.
   - Lane: mixed
   - API-automatable if host supports it cleanly
   - requires-human on many commodity hosts

15. Create a staging path if the live site should not be touched directly.
   - Lane: mixed
   - Chris-decision on whether staging is mandatory
   - technical setup can be automated depending on host

### Phase 3 - WordPress foundation

16. Install WordPress or verify the existing WordPress baseline.
   - Lane: mixed
   - Automatable on standardized hosts

17. Install theme, child theme, and baseline plugin set.
   - Lane: mixed
   - Automatable if the plugin/theme inventory is standardized

18. Configure core WordPress settings.
   - Lane: API-automatable
   - Includes: permalinks, timezone, admin email, discussion defaults, uploads, caching baseline.

19. Create the NexTeam service user and application password/auth lane.
   - Lane: API-automatable after admin access exists

20. Confirm backup, update, and rollback posture.
   - Lane: requires-human
   - Notes: before any live automation, know how the site is recovered.

21. Verify the site can accept the rail's key WordPress operations.
   - Lane: API-automatable
   - Checks: create draft, update Yoast fields, upload media, set featured image, delete test artifacts.

### Phase 4 - client knowledge and content operating truth

22. Create the client's content knowledge pack.
   - Lane: mixed
   - Automatable scaffolding
   - human input for facts and claims

23. Create claims boundaries and approval expectations.
   - Lane: mixed
   - human-supplied truth plus templated doc structure

24. Create topic bank and internal-link map.
   - Lane: mixed
   - scaffolding can be automated
   - judgment still needs a human or agent review

25. Confirm media sources and permissions.
   - Lane: requires-human
   - Includes: CompanyCam, owned photography, stock policy, forbidden images.

### Phase 5 - external system connections

26. Connect WordPress auth for publishing.
   - Lane: API-automatable after credentials exist

27. Connect CompanyCam read-only access.
   - Lane: mixed
   - OAuth or token entry is human-assisted
   - storage, verification, and test reads are automatable

28. Connect Jobber if the client uses it.
   - Lane: mixed
   - OAuth authorization is human-assisted
   - connection health checks and data pulls are automatable

29. Connect GBP if the client will use Mode A.
   - Lane: mixed
   - OAuth is human-assisted
   - Google project/API approval may be a long external blocker

30. Record the status of every integration.
   - Lane: API-automatable
   - States: connected, pending, blocked, not needed.

### Phase 6 - Bragi client config

31. Scaffold the client config and document set.
   - Lane: API-automatable
   - Includes: memory, knowledge, claims, topic bank, link map, rail config placeholders.

32. Map connected systems into client config.
   - Lane: API-automatable
   - Includes: site URL, auth source names, CompanyCam status, Jobber status, GBP status, location IDs when available.

33. Set the client's approval mode.
   - Lane: requires-Chris-decision
   - Examples: draft-only, email approval, publish-now disabled, schedule allowed or not.

34. Set the client's launch sequence.
   - Lane: requires-Chris-decision
   - Example: article drafts first, then article publishing, then GBP, then social later.

35. Confirm no client-specific facts are hardcoded into shared engine files.
   - Lane: requires-human
   - Notes: white-label readiness check.

### Phase 7 - dry run and readiness gate

36. Run safe integration smoke tests.
   - Lane: API-automatable
   - WordPress draft/media tests
   - CompanyCam read tests
   - Jobber read tests
   - GBP read-only checks if approved

37. Generate one proof package for review.
   - Lane: mixed
   - content generation can be automated
   - approval is human

38. Review proof output for voice, compliance, and fit.
   - Lane: requires-human

39. Confirm go-live guardrails.
   - Lane: requires-Chris-decision
   - Includes: what can auto-publish, what always requires approval, what channels stay dark.

### Phase 8 - launch and early monitoring

40. Activate the chosen first workflow.
   - Lane: mixed
   - guarded automation plus human approval

41. Monitor the first week closely.
   - Lane: requires-human
   - Watch: auth failures, poor content fit, blocked integrations, approval confusion, client feedback.

42. Capture post-launch adjustments into the client's permanent docs.
   - Lane: mixed
   - human judgment plus automated doc scaffolding if desired

## What can eventually be automated cleanly

### High-confidence automation candidates

- client config scaffolding
- knowledge-doc templates
- Cloudflare zone defaults after access is granted
- WordPress baseline configuration
- WordPress app-password verification and smoke tests
- CompanyCam, Jobber, and GBP connection-state checks
- checklist/status tracking inside Mission Control
- go/no-go readiness reporting

### Partial automation candidates

- host provisioning, depending on provider
- domain registration, depending on registrar standardization
- theme/plugin installation, if the approved stack is standardized
- topic-bank starting drafts, if human review remains mandatory

### Poor automation candidates

- brand-positioning judgment
- claims/compliance judgment
- final design acceptance
- live publish permission
- choosing service areas, profile boundaries, or product positioning

## Recommended automation order

When this work is actually prioritized, automate in this order:

1. Intake and checklist tracking
2. Client config/doc scaffolding
3. WordPress baseline + rail smoke tests
4. External connection health checks
5. Cloudflare/DNS helpers
6. Host-specific provisioning only after the host stack is standardized

That order creates leverage without putting risky judgment behind automation too early.

## Practical future architecture

### Inputs

- onboarding checklist answers
- account credentials and access grants
- brand/content documents
- client launch decisions

### Orchestration

- one onboarding state machine per client
- explicit statuses per phase: waiting on client, waiting on Chris, automatable, blocked, complete
- proof package at each major checkpoint

### Outputs

- connected system inventory
- client config
- permanent client docs
- verified rail readiness
- first-launch recommendation

## Aquatrace-informed reality check

Aquatrace exposed the main truth already:

- the rail work can be automated well
- auth and API plumbing are real leverage
- host quirks, ModSecurity, Google approvals, and permission ownership still create external blockers
- human approval and business truth collection remain non-optional

That is exactly why the right design is "automation playbook plus state machine," not "one click and hope."

## Related references

- [NexTeam Client Onboarding Input Checklist](../../../.openclaw/workspace/nexteam-client-onboarding-input-checklist.md)
- [NexTeam Blueprint Readiness Gap Map](../../../.openclaw/workspace/nexteam-blueprint-readiness-gap-map.md)
- [NEXTEAM_FINANCIAL_VISIBILITY_SERVICE_LINE_DESIGN.md](./NEXTEAM_FINANCIAL_VISIBILITY_SERVICE_LINE_DESIGN.md)

## Bottom line

The future onboarding system should:

- collect the right truth once
- separate rail automation from business judgment
- standardize repeatable setup
- expose blockers early
- leave human approval in the places where mistakes are expensive

Build it when client #2-3 makes manual onboarding the bottleneck, not before.
