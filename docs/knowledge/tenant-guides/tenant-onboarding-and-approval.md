DOCUMENT_ID: TENANT-GUIDE-ONBOARDING-2026-10-23
TITLE: Tenant Onboarding and Approval Guide
DOCUMENT_TYPE: TENANT_GUIDE
STATUS: VERIFIED_LOCAL_CONTRACT
CREATED_AT: 2026-10-23
UPDATED_AT: 2026-10-23
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Codex
PRODUCT_AREA: Platform
MODULES: intake, approval-queue, tenancy
TENANTS: all
AUDIENCES: developer, operator, tenant administrator, support, future AI
RELATED_COMMITS: pending
RELATED_TESTS: node --import ./tests/setup.mjs --import tsx --test apps/server/test/intake.test.mjs
RELATED_DOCUMENTS: docs/knowledge/code-maps/2026-10-23-tenant-intake-and-approval.md; apps/server/src/intake/README.md
RELATED_LLM_ARTIFACTS: LLM-JOB-NEXTEAM-CALENDAR-20261023
TAGS: tenant-guide, onboarding, approval, native-provisioning

# Tenant Onboarding and Approval Guide

## What this guide covers

This guide describes the locally verified NexTeam tenant-onboarding workflow. It is a guide to the current product contract, not an authorization to publish a site, connect an external account, send messages, or make any other external change.

## Who can use it

Tenant onboarding routes are intended for an owner or administrator. The verified server route contract creates an intake session for the configured tenant and records the acting user. If access is missing or insufficient, contact a NexTeam platform administrator rather than attempting to bypass the approval flow.

## Workflow

1. Start an intake for the proposed business. Capture the business name and, where available, its industry pack, plan, and timezone.
2. Answer the onboarding questions for services, service area, pricing notes, brand voice, and the current app stack.
3. Review the resulting tenant plan. The plan can include a Nexi blueprint and an external-connection checklist, but it does not activate third-party services.
4. Finalize the intake. Finalizing places a `tenant_provisioning` item in the ApprovalQueue; it does not create the new tenant yet.
5. An authorized owner reviews and approves that queue item. Only then can NexTeam create the native tenant record.

## What remains intentionally deferred

The verified workflow does not perform external OAuth setup, domain or site publishing, email sends, third-party account setup, or other external provisioning. These actions require their own owner-directed process and approval.

## If something looks wrong

- If the plan is incomplete, return to the interview and correct the relevant answer before finalizing.
- If the intake is already finalized, locate its pending approval rather than starting an untracked duplicate.
- If an approval targets a different tenant or has mismatched plan details, do not execute it; raise it with a NexTeam platform administrator.

## Verification boundary

This guide is supported by the local automated onboarding contract named in `RELATED_TESTS`. It does not claim that an external integration, browser flow, production service, or customer record was exercised.

## Risks and rollback

The primary operational risk is treating a queued plan as externally provisioned. The mitigation is the approval gate and the explicit deferral of external actions. This documentation-only change can be rolled back with `git revert <documentation-commit>`; no tenant data or external system state is changed by that rollback.
