# Web App

This is the Vite/React browser app for NexTeam Studio. It provides the human-facing UI for operators and, in M1, the mobile-first Nexi Job Desk chat surface. The Nexi chat is Firebase email/password gated and sends the signed-in user's ID token to the server on each chat request.

It connects to `apps/server` through relative `/api/*` calls so staging and production can serve the same build without hardcoded hostnames. It should display sourced data only through server APIs and media only through `/api/media/:id`.

When something breaks, start with `src/main.tsx` for app wiring and Firebase auth state, `src/styles.css` for layout issues, `public/manifest.webmanifest` for PWA behavior, and browser network logs for API failures.
