# Web App

This is the Vite/React browser app for NexTeam Studio. It provides the human-facing UI for operators and, in M1, the mobile-first Nexi Job Desk chat surface. The Nexi chat is Firebase email/password gated and sends the signed-in user's ID token to the server on each chat request.

It connects to `apps/server` through relative `/api/*` calls so staging and production can serve the same build without hardcoded hostnames. Firebase web config is read from Vite build variables when available, then falls back to `/api/public/runtime-config` for Railway file-upload deploys. It should display sourced data only through server APIs and media only through `/api/media/:id`; CompanyCam photo sources render as tappable thumbnails with full-size and save/download actions.

When something breaks, start with `src/main.tsx` for app wiring, Firebase auth state, and photo lightbox behavior; `src/styles.css` for layout issues; `public/manifest.webmanifest` for PWA behavior; and browser network logs for API or `/api/media/:id` failures.
