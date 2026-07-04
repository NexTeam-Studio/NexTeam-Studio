# AQUATRACE BRAGI MEMORY
- version: 1.0
- status: active
- last_updated: 2026-05-03
- scope: Aquatrace Bragi operating memory

## Verified Status

- `docs/BRAGI_SOUL.md` is complete and remains the governing Bragi identity file.
- Bragi cron foundation exists and is dry-run safe by default.
- Bragi can create WordPress drafts through the existing draft-only execution path.
- First proof-of-life draft exists at `https://aquatraceleak.com/?p=3307` with post ID `3307`.
- Verified Buncombe County VGB draft exists at `https://aquatraceleak.com/?p=3320` with post ID `3320`.
- Verified replacement Buncombe County VGB draft exists at `https://aquatraceleak.com/?p=3332` with post ID `3332`.
- No live publish has occurred.

## Standing SEO Garden

- Daily topic and research check should happen every day at `6:30 AM` Eastern.
- Weekly draft creation target is every Monday at `7:00 AM` Eastern.
- Default weekly behavior is draft only.
- No publish or schedule without Chris approval.

## Current Bragi Operating Rules

- Write for Aquatrace authority around swimming pool leak detection.
- Use real Aquatrace service knowledge before generic pool content.
- Prefer internal links over external links.
- Build article packages that are ready for Yoast, Gutenberg, and email review.
- Email Chris the draft package after creation by default; email is not approval.
- On the same verified route, attempt Yoast field writes for:
  - focus keyphrase
  - SEO title
  - meta description
  - social title
  - social description

## Current Known Gaps

- Gmail reply reading and attachment ingestion are not wired.
- WordPress media upload helper exists only as a foundation until photo workflows are assigned.
- CompanyCam token is not currently present in local `.env`.
- CompanyCam -> Dropbox remains dry-run planning only.

## 2026-05-03 WordPress Route Repair

- Accepted article title:
  - `What Buncombe County Commercial Pool Operators Should Know About VGB Act Compliance and Underwater Inspection`
- Exact local failure cause:
  - the latest local article payload file failed JSON parsing before the route ran because `contentHtml` contained an unescaped quote inside a JSON string
- Secondary route fragility fixed:
  - local verification had been pointed at preview port `4173`, which can return HTML instead of the live Bragi JSON route
- Permanent fix:
  - the accepted article package now lives in `src/features/missioncontrol/services/bragiAcceptedArticlePayloads.js`
  - the Bragi execution client now resolves the direct server route safely and handles non-JSON error bodies clearly
  - end-to-end verification now posts directly to `http://127.0.0.1:3001/api/bragi/wordpress/execute`
- Verified proof requirements for every successful article request:
  - draft URL
  - post ID
  - `status=draft`
  - article title
  - confirmation not published
  - confirmation not scheduled
  - confirmation content inserted successfully
- Safe fallback rule:
  - if WordPress blocks edit-existing with a permission error such as `rest_cannot_edit`, Bragi must create a new replacement draft and treat article delivery as successful if that replacement draft is created and verified
- Edit-existing failure rule:
  - edit-existing failure is not total article delivery failure when create-new-draft succeeds
- Current credential truth:
  - named env vars `WORDPRESS_BASE_URL`, `WORDPRESS_USERNAME`, and `WORDPRESS_APP_PASSWORD` are now configured for this route
  - the current primary path is `named_env_vars`
  - the current editor path is `reference_editor_fallback` when explicit editor env vars are absent
  - `reference_files_fallback` remains emergency fallback only for full credential recovery
- Short inspection of post `3329`:
  - the earlier `rest_cannot_edit` failure does not reproduce on the current named-env route
  - this now appears more likely to have been credential-path, capability, or runtime-identity related than a total loss of WordPress access
- Default review workflow:
  - successful article draft -> review email to `chris@aquatraceleak.com`
  - email must include:
    - draft URL
    - post ID
    - WordPress status
    - not-published confirmation
    - not-scheduled confirmation
    - internal link recommendations
    - image recommendations
  - if email fails after draft creation, return the real blocker and keep the draft proof
- Yoast reliability truth:
  - the earlier blocker was mixed:
    - the named-env branch dropped wp-admin editor credentials even though approved editor login files already existed
    - the Yoast UI path also needed stronger selector waits to avoid false missing-selector failures
  - permanent fix:
    - named API env path now reuses the approved editor-login fallback when editor env vars are absent
    - the Yoast editor automation now waits and retries for field selectors before writing
  - verified result:
    - focus keyphrase write: yes
    - SEO title write: yes
    - meta description write: yes
    - social title write: yes
    - social description write: yes
  - screenshots proving Yoast editor writes:
    - `C:/Users/Peyto/NexTeam-Studio/tmp-proof/yoast-fields-before-save.png`
    - `C:/Users/Peyto/NexTeam-Studio/tmp-proof/yoast-fields-after-save.png`

## Permanent Aquatrace Tone Standard

- Aquatrace should sound like a real swimming pool leak detection specialist talking clearly to a busy pool owner, hotel manager, HOA manager, property manager, pool company owner, or commercial pool operator.
- Tone:
  - professional but casual
  - plain English
  - easy enough for a 3rd grader to understand
  - confident without sounding arrogant
  - expert without sounding like a lawyer
  - practical and field-based
  - helpful, clear, and direct
  - sales-aware without sounding pushy
  - calm but serious when safety, compliance, or property damage matters
  - written like Chris or Aquatrace is explaining what actually happens in the field
- Must not sound:
  - stiff
  - corporate
  - generic
  - overly legal
  - like a government memo
  - like a cheap sales pitch
  - like AI filler
  - like Aquatrace is begging for work
  - dramatic or fearmongering
  - arrogant or overhyped
- Reader reaction target:
  - These people know pools.
  - They know what happens in the real world.
  - They are explaining this clearly.
  - They are not guessing.
  - They are not trying to scare me.
  - They are the right specialist to call.
- Writing rules:
  - short clean sentences
  - simple words
  - plain-language explanations
  - field-based examples
  - avoid repeated phrasing
  - avoid long legal blocks
  - keep disclaimers light but clear
  - sell naturally by showing why it matters
  - position Aquatrace as the specialist without overclaiming
  - keep focus on the next practical step
- VGB and compliance guardrail:
  - Aquatrace does not certify compliance, provide legal advice, make engineering determinations, make regulatory determinations, guarantee approval, or replace drain covers as part of the documentation service.
- VGB and compliance service truth:
  - Aquatrace documents what is visible, what markings can be seen, what measurements are taken, what condition is observed, what photos were captured, and what the report shows.
- Preferred wording examples:
  - The problem is not always the drain cover itself. Sometimes the problem is that nobody can prove what is installed.
  - Two covers can look almost identical from the pool deck, but that does not mean they carry the same rating.
  - A pool may not need to be drained just to start gathering answers.
  - Aquatrace documents the facts. Your contractor, engineer, or reviewer can use those facts to decide the next step.
  - This is not a compliance certificate. It is a professional field documentation visit.
  - Good records make the next conversation easier.
  - Guessing at commercial pool drain covers is not a plan.
- Avoid overusing:
  - factual documentation of what is physically installed
  - regulatory reviewers
  - premier authority
  - documentation in every sentence
  - compliance language that sounds like certification
- This standard is permanent and governs all future Aquatrace articles, web copy, emails, landing pages, service pages, social posts, and campaign content.
